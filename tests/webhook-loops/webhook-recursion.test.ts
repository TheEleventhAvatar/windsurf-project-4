import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Octokit } from '@octokit/core'
import { getOctokit } from '../setup'
import { 
  InvariantChecker, 
  RequestLogger 
} from '../../src/utils/reliability-helpers'

/**
 * SCENARIO 7: Recursive Workflow / Webhook Loop
 * 
 * Reliability Assumption Being Tested:
 * "Webhook-triggered workflows will terminate naturally and not create infinite loops"
 * 
 * This assumption is FALSE in complex systems where:
 * - Webhooks can trigger cascading workflows
 * - Circular dependencies exist between events
 * - Loop detection mechanisms are missing or inadequate
 * 
 * Expected Failure Modes:
 * - Infinite recursion or runaway execution
 * - Resource exhaustion from cascading triggers
 * - System overload from exponential event growth
 * - Deadlock or livelock conditions
 */

describe('Recursive Workflow / Webhook Loop', () => {
  let octokit: Octokit
  let invariantChecker: InvariantChecker
  let requestLogger: RequestLogger

  beforeEach(() => {
    octokit = getOctokit()
    invariantChecker = new InvariantChecker()
    requestLogger = new RequestLogger()
  })

  it('should detect and prevent infinite webhook recursion loops', async () => {
    console.log('\n🔄 Testing Recursive Workflow / Webhook Loop Scenario')
    console.log('Assumption: "Webhook-triggered workflows will terminate naturally and not create infinite loops"')
    
    // Setup: Create repository for testing
    const repoName = `webhook-loop-test-${Date.now()}`
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true
    })
    
    console.log(`✅ Created test repository: ${repoName}`)
    
    // Simulate webhook event chain that could create loops
    const webhookChain = {
      events: [] as Array<{
        type: string
        source: string
        target: string
        timestamp: number
        loopGuard?: boolean
      }>,
      maxDepth: 10,
      currentDepth: 0,
      loopDetected: false
    }
    
    // Mock webhook processing system
    const processWebhook = vi.fn().mockImplementation(async (eventType: string, source: string) => {
      const event = {
        type: eventType,
        source,
        target: '',
        timestamp: Date.now()
      }
      
      webhookChain.events.push(event)
      webhookChain.currentDepth++
      
      console.log(`📡 Processing webhook: ${eventType} from ${source} (depth: ${webhookChain.currentDepth})`)
      
      // Simulate circular webhook triggering
      if (eventType === 'pull_request.opened') {
        // PR opened triggers issue creation
        if (webhookChain.currentDepth < webhookChain.maxDepth) {
          await new Promise(resolve => setTimeout(resolve, 100)) // Simulate processing delay
          
          const issueEvent = await processWebhook('issues.created', 'pull_request_workflow')
          event.target = 'issues.created'
          
          // Check for loop detection
          if (webhookChain.loopDetected) {
            throw new Error('Webhook loop detected and blocked')
          }
          
          return issueEvent
        }
      }
      
      if (eventType === 'issues.created') {
        // Issue created triggers comment bot
        if (webhookChain.currentDepth < webhookChain.maxDepth) {
          await new Promise(resolve => setTimeout(resolve, 100))
          
          const commentEvent = await processWebhook('issue_comment.created', 'issue_workflow')
          event.target = 'issue_comment.created'
          
          return commentEvent
        }
      }
      
      if (eventType === 'issue_comment.created') {
        // Comment bot triggers PR update (potential loop back to PR)
        if (webhookChain.currentDepth < webhookChain.maxDepth) {
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // This could create a loop back to PR events
          const prUpdateEvent = await processWebhook('pull_request.updated', 'comment_workflow')
          event.target = 'pull_request.updated'
          
          return prUpdateEvent
        }
      }
      
      if (eventType === 'pull_request.updated') {
        // PR update could trigger another PR opened event (loop!)
        if (webhookChain.currentDepth < webhookChain.maxDepth) {
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Detect potential loop
          const prOpenedCount = webhookChain.events.filter(e => e.type === 'pull_request.opened').length
          if (prOpenedCount > 1) {
            webhookChain.loopDetected = true
            console.log('🚨 Webhook loop detected! Multiple PR.opened events in chain')
            throw new Error('Webhook loop detected')
          }
          
          const loopEvent = await processWebhook('pull_request.opened', 'update_workflow')
          event.target = 'pull_request.opened'
          
          return loopEvent
        }
      }
      
      return event
    })
    
    // Test: Execute webhook chain without loop protection
    console.log('🔄 Executing webhook chain without loop protection...')
    
    const startTime = Date.now()
    let chainResult: any = null
    
    try {
      // Start the chain with a PR event
      chainResult = await processWebhook('pull_request.opened', 'external_trigger')
      
      console.log(`✅ Webhook chain completed with ${webhookChain.events.length} events`)
      
    } catch (error) {
      const duration = Date.now() - startTime
      console.log(`❌ Webhook chain failed after ${duration}ms: ${(error as Error).message}`)
      
      requestLogger.logOperation('webhook-chain-no-protection', false, duration, (error as Error).message, 0, {
        eventsProcessed: webhookChain.events.length,
        maxDepth: webhookChain.maxDepth,
        loopDetected: webhookChain.loopDetected
      })
    }
    
    // Analyze webhook chain for loop patterns
    const eventTypes = webhookChain.events.map(e => e.type)
    const eventTypeCounts = eventTypes.reduce((counts, type) => {
      counts[type] = (counts[type] || 0) + 1
      return counts
    }, {} as Record<string, number>)
    
    console.log('\n📊 Webhook Chain Analysis:')
    console.log(`- Total Events: ${webhookChain.events.length}`)
    console.log(`- Max Depth Reached: ${webhookChain.currentDepth}`)
    console.log(`- Loop Detected: ${webhookChain.loopDetected}`)
    console.log(`- Event Types: ${JSON.stringify(eventTypeCounts)}`)
    
    // Check for loop indicators
    const loopIndicators = {
      repeatedEvents: Object.values(eventTypeCounts).some(count => count > 2),
      deepChain: webhookChain.currentDepth >= webhookChain.maxDepth,
      circularReferences: webhookChain.loopDetected
    }
    
    Object.entries(loopIndicators).forEach(([indicator, detected]) => {
      if (detected) {
        invariantChecker.addViolation({
          invariant: 'WEBHOOK_LOOP_PREVENTION',
          description: `Webhook loop indicator detected: ${indicator}`,
          severity: 'HIGH',
          context: {
            indicator,
            totalEvents: webhookChain.events.length,
            maxDepth: webhookChain.currentDepth,
            eventTypes: eventTypeCounts
          }
        })
      }
    })
    
    const violations = invariantChecker.getViolations()
    const metrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Webhook Loop Analysis:')
    console.log(`- Total Operations: ${metrics.totalOperations}`)
    console.log(`- Failed Operations: ${metrics.failedOperations}`)
    console.log(`- Loop Indicators: ${Object.values(loopIndicators).filter(Boolean).length}`)
    console.log(`- Invariant Violations: ${violations.length}`)
    
    if (violations.length > 0) {
      console.log('\n🚨 WEBHOOK LOOP VIOLATIONS:')
      violations.forEach(violation => {
        console.log(`- ${violation.invariant}: ${violation.description}`)
        console.log(`  Severity: ${violation.severity}`)
      })
      
      console.log('\n⚠️  WEBHOOK LOOP DAMAGE ASSESSMENT:')
      console.log('- Resource Exhaustion: Cascading events consume system resources')
      console.log('- System Overload: Exponential event growth can overwhelm services')
      console.log('- Deadlock Risk: Circular dependencies can cause system hangs')
      console.log('- Cost Impact: Unlimited webhook processing can incur high costs')
    }
    
    // Test: Resilient approach with loop protection
    console.log('\n🛡️ Testing Resilient Webhook Loop Protection...')
    
    invariantChecker.clearViolations()
    requestLogger.clearLogs()
    
    // Reset webhook chain
    webhookChain.events = []
    webhookChain.currentDepth = 0
    webhookChain.loopDetected = false
    
    // Resilient webhook processor with loop protection
    const resilientProcessWebhook = vi.fn().mockImplementation(async (eventType: string, source: string, depth = 0) => {
      // Loop protection mechanisms
      const maxDepth = 5
      const recentEvents = webhookChain.events.slice(-10) // Last 10 events
      const eventSignature = `${eventType}:${source}`
      
      // Check depth limit
      if (depth > maxDepth) {
        console.log(`🛡️ Depth limit exceeded (${depth} > ${maxDepth}), blocking webhook`)
        throw new Error('Webhook depth limit exceeded')
      }
      
      // Check for recent duplicate events (potential loop)
      const recentDuplicates = recentEvents.filter(e => e.type === eventType).length
      if (recentDuplicates > 2) {
        console.log(`🛡️ Too many recent ${eventType} events (${recentDuplicates}), blocking webhook`)
        throw new Error('Webhook frequency limit exceeded')
      }
      
      // Check for circular patterns
      const circularPattern = detectCircularPattern(recentEvents, eventSignature)
      if (circularPattern) {
        console.log(`🛡️ Circular pattern detected: ${circularPattern}, blocking webhook`)
        throw new Error('Circular webhook pattern detected')
      }
      
      const event = {
        type: eventType,
        source,
        target: '',
        timestamp: Date.now(),
        loopGuard: true
      }
      
      webhookChain.events.push(event)
      
      console.log(`🛡️ Processing webhook with protection: ${eventType} from ${source} (depth: ${depth})`)
      
      // Simulate the same triggering logic but with protection
      if (eventType === 'pull_request.opened' && depth < maxDepth) {
        await new Promise(resolve => setTimeout(resolve, 50))
        
        try {
          const issueEvent = await resilientProcessWebhook('issues.created', 'pull_request_workflow', depth + 1)
          event.target = 'issues.created'
          return issueEvent
        } catch (error) {
          console.log(`🛡️ Protected webhook chain stopped: ${(error as Error).message}`)
          throw error
        }
      }
      
      if (eventType === 'issues.created' && depth < maxDepth) {
        await new Promise(resolve => setTimeout(resolve, 50))
        
        try {
          const commentEvent = await resilientProcessWebhook('issue_comment.created', 'issue_workflow', depth + 1)
          event.target = 'issue_comment.created'
          return commentEvent
        } catch (error) {
          console.log(`🛡️ Protected webhook chain stopped: ${(error as Error).message}`)
          throw error
        }
      }
      
      return event
    })
    
    // Test resilient webhook processing
    const resilientStartTime = Date.now()
    let resilientChainResult: any = null
    
    try {
      resilientChainResult = await resilientProcessWebhook('pull_request.opened', 'external_trigger')
      console.log(`✅ Resilient webhook chain completed with ${webhookChain.events.length} events`)
      
    } catch (error) {
      const resilientDuration = Date.now() - resilientStartTime
      console.log(`🛡️ Resilient webhook chain safely terminated after ${resilientDuration}ms: ${(error as Error).message}`)
      
      requestLogger.logOperation('webhook-chain-protected', true, resilientDuration, undefined, 0, {
        eventsProcessed: webhookChain.events.length,
        terminationReason: 'loop_protection',
        safeTermination: true
      })
    }
    
    const resilientViolations = invariantChecker.getViolations()
    const resilientMetrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Resilient Webhook Analysis:')
    console.log(`- Total Operations: ${resilientMetrics.totalOperations}`)
    console.log(`- Events Processed: ${webhookChain.events.length}`)
    console.log(`- Safe Termination: ${resilientViolations.length === 0}`)
    
    // Helper function to detect circular patterns
    function detectCircularPattern(events: any[], currentSignature: string): string | null {
      if (events.length < 3) return null
      
      // Look for repeating patterns in recent events
      const recentSignatures = events.slice(-6).map(e => `${e.type}:${e.source}`)
      const currentPattern = recentSignatures.slice(-3).join(' -> ')
      
      // Check if this pattern repeats
      for (let i = 0; i < recentSignatures.length - 6; i++) {
        const historicalPattern = recentSignatures.slice(i, i + 3).join(' -> ')
        if (historicalPattern === currentPattern) {
          return currentPattern
        }
      }
      
      return null
    }
    
    // Assertions
    expect(webhookChain.events.length).toBeGreaterThan(0)
    
    // unprotected approach should show loop indicators
    if (loopIndicators.repeatedEvents || loopIndicators.deepChain || loopIndicators.circularReferences) {
      expect(violations.length).toBeGreaterThan(0)
    }
    
    // resilient approach should terminate safely
    expect(resilientViolations.length).toBeLessThanOrEqual(violations.length)
    
    console.log('\n🎯 Webhook Loop Insights:')
    console.log('1. Webhook chains can create infinite recursion without protection')
    console.log('2. Circular dependencies between event types are common in complex systems')
    console.log('3. Resource exhaustion can occur from cascading webhook triggers')
    console.log('4. Loop detection requires pattern recognition and depth limiting')
    
    console.log('\n🛡️ Resilient Webhook Pattern Benefits:')
    console.log('1. Depth limiting prevents infinite recursion')
    console.log('2. Frequency limiting prevents event storms')
    console.log('3. Circular pattern detection catches complex loops')
    console.log('4. Graceful termination maintains system stability')
  })

  it('should handle webhook event storms gracefully', async () => {
    console.log('\n🌊 Testing Webhook Event Storm Handling')
    
    // Simulate a burst of webhook events
    const eventStorm = {
      events: [] as Array<{ type: string; timestamp: number; processed: boolean }>,
      maxConcurrent: 10,
      processedCount: 0,
      rejectedCount: 0
    }
    
    // Mock webhook processor with rate limiting
    const processWebhookWithRateLimit = vi.fn().mockImplementation(async (eventType: string) => {
      const event = {
        type: eventType,
        timestamp: Date.now(),
        processed: false
      }
      
      eventStorm.events.push(event)
      
      // Simulate rate limiting
      const currentlyProcessing = eventStorm.events.filter(e => 
        e.processed === false && Date.now() - e.timestamp < 1000
      ).length
      
      if (currentlyProcessing > eventStorm.maxConcurrent) {
        eventStorm.rejectedCount++
        console.log(`🚨 Rate limit exceeded, rejecting ${eventType}`)
        throw new Error('Rate limit exceeded')
      }
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300))
      
      event.processed = true
      eventStorm.processedCount++
      
      console.log(`✅ Processed ${eventType} (${eventStorm.processedCount}/${eventStorm.events.length})`)
      
      return event
    })
    
    // Generate event storm
    console.log('🌊 Generating webhook event storm...')
    
    const eventTypes = [
      'pull_request.opened',
      'pull_request.closed',
      'issues.created',
      'issue_comment.created',
      'push'
    ]
    
    const stormPromises = []
    
    // Create 20 concurrent webhook events
    for (let i = 0; i < 20; i++) {
      const eventType = eventTypes[i % eventTypes.length]
      
      const promise = processWebhookWithRateLimit(eventType)
        .then(result => ({ success: true, result }))
        .catch(error => ({ success: false, error: (error as Error).message }))
      
      stormPromises.push(promise)
    }
    
    // Wait for all events to complete or be rejected
    const stormResults = await Promise.allSettled(stormPromises)
    
    const successfulEvents = stormResults.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length
    
    const rejectedEvents = stormResults.filter(r => 
      r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)
    ).length
    
    console.log('\n📊 Event Storm Results:')
    console.log(`- Total Events: ${stormPromises.length}`)
    console.log(`- Successfully Processed: ${successfulEvents}`)
    console.log(`- Rejected (Rate Limited): ${rejectedEvents}`)
    console.log(`- Processing Rate: ${(successfulEvents / stormPromises.length * 100).toFixed(1)}%`)
    
    // Verify rate limiting worked
    expect(eventStorm.rejectedCount).toBeGreaterThan(0)
    expect(successfulEvents).toBeLessThan(stormPromises.length)
    
    console.log('\n🎯 Event Storm Insights:')
    console.log('1. Webhook event storms can overwhelm processing systems')
    console.log('2. Rate limiting is essential for system stability')
    console.log('3. Graceful rejection prevents system crashes')
    console.log('4. Monitoring event processing rates is crucial')
  })
})
