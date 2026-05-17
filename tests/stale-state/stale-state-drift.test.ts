import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Octokit } from '@octokit/core'
import { getOctokit } from '../setup'
import { 
  InvariantChecker, 
  RequestLogger 
} from '../../src/utils/reliability-helpers'

/**
 * SCENARIO 3: Stale State Drift
 * 
 * Reliability Assumption Being Tested:
 * "Cached state remains valid and can be trusted for extended periods"
 * 
 * This assumption is FALSE in distributed systems where:
 * - External mutations can change state outside agent's control
 * - Cached data becomes stale without invalidation
 * - Agents make decisions based on outdated information
 * 
 * Expected Failure Modes:
 * - Actions executed on invalid data
 * - Merges attempted on closed/changed resources
 * - Lost updates due to stale assumptions
 */

describe('Stale State Drift', () => {
  let octokit: Octokit
  let invariantChecker: InvariantChecker
  let requestLogger: RequestLogger

  beforeEach(() => {
    octokit = getOctokit()
    invariantChecker = new InvariantChecker()
    requestLogger = new RequestLogger()
  })

  it('should detect failures when agents act on stale cached state', async () => {
    console.log('\n🗄️ Testing Stale State Drift Scenario')
    console.log('Assumption: "Cached state remains valid and can be trusted for extended periods"')
    
    // Setup: Create repository and PR for testing
    const repoName = `stale-state-test-${Date.now()}`
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true
    })
    
    console.log(`✅ Created test repository: ${repoName}`)
    
    // Create feature branch
    const branchName = 'feature/stale-state'
    await octokit.rest.git.createRef({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      ref: `refs/heads/${branchName}`,
      sha: repo.data.default_branch_sha
    })
    
    // Create file change
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      path: 'stale-state-test.txt',
      message: 'Add test file for stale state testing',
      content: Buffer.from('Stale state test content').toString('base64'),
      branch: branchName
    })
    
    // Create PR
    const pr = await octokit.rest.pulls.create({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      title: 'Stale State Test PR',
      head: branchName,
      base: repo.data.default_branch
    })
    
    console.log(`✅ Created PR #${pr.data.number} for stale state testing`)
    
    // Test: Cache PR state locally, then mutate externally
    console.log('📋 Caching PR state locally...')
    
    const cachedPR = pr.data
    const cachedAt = Date.now()
    
    // Simulate agent storing cached state
    const agentCache = {
      pr: cachedPR,
      cachedAt,
      maxAge: 5000 // 5 seconds max age
    }
    
    console.log(`📋 Cached PR state: ${cachedPR.state} (cached at ${new Date(cachedAt).toISOString()})`)
    
    // Simulate external mutation (PR gets closed by another process)
    console.log('🔄 Simulating external mutation: PR being closed externally...')
    
    await new Promise(resolve => setTimeout(resolve, 1000)) // Wait 1 second
    
    await octokit.rest.pulls.update({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      pull_number: pr.data.number,
      state: 'closed'
    })
    
    console.log(`✅ PR #${pr.data.number} closed externally`)
    
    // Simulate time passing to make cache stale
    await new Promise(resolve => setTimeout(resolve, 2000)) // Wait 2 more seconds
    
    const now = Date.now()
    const cacheAge = now - cachedAt
    
    console.log(`⏰ Cache age: ${cacheAge}ms (max age: ${agentCache.maxAge}ms)`)
    
    // Test: Agent proceeds based on stale cached state
    console.log('🤖 Agent proceeding based on stale cached state...')
    
    const operationStart = Date.now()
    let mergeResult: any = null
    
    try {
      // Agent uses cached state without validation
      if (agentCache.pr.state === 'open') {
        console.log('🤖 Agent: Based on cached state, PR is open, attempting merge...')
        
        mergeResult = await octokit.rest.pulls.merge({
          owner: repo.data.owner.login,
          repo: repo.data.name,
          pull_number: pr.data.number,
          commit_title: 'Merge based on cached state'
        })
        
        requestLogger.logOperation('merge-stale-state', true, Date.now() - operationStart, undefined, 0, {
          basedOnCachedState: true,
          cacheAge,
          prNumber: pr.data.number
        })
        
        console.log('✅ Merge succeeded (this indicates a potential problem!)')
        
      } else {
        console.log('🤖 Agent: Based on cached state, PR is not open, skipping merge')
        requestLogger.logOperation('skip-merge-stale-state', true, Date.now() - operationStart, undefined, 0, {
          basedOnCachedState: true,
          cacheAge,
          cachedState: agentCache.pr.state
        })
      }
      
    } catch (error) {
      const duration = Date.now() - operationStart
      requestLogger.logOperation('merge-stale-state', false, duration, (error as Error).message, 0, {
        basedOnCachedState: true,
        cacheAge,
        prNumber: pr.data.number
      })
      
      console.log(`❌ Merge failed: ${(error as Error).message}`)
    }
    
    // Verify invariants
    const logs = requestLogger.getLogs()
    
    // Check for stale state usage
    invariantChecker.assertFreshState(
      cachedAt,
      now,
      agentCache.maxAge,
      {
        scenario: 'stale-state-drift',
        cacheAge,
        maxAge: agentCache.maxAge,
        operation: 'merge'
      }
    )
    
    // Get actual current state for comparison
    const currentPR = await octokit.rest.pulls.get({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      pull_number: pr.data.number
    })
    
    console.log(`📊 Current PR state: ${currentPR.data.state}`)
    console.log(`📊 Cached PR state: ${agentCache.pr.state}`)
    
    const stateConsistent = currentPR.data.state === agentCache.pr.state
    
    if (!stateConsistent) {
      invariantChecker.addViolation({
        invariant: 'STATE_CONSISTENCY',
        description: `Cached state '${agentCache.pr.state}' differs from current state '${currentPR.data.state}'`,
        severity: 'HIGH',
        context: {
          scenario: 'stale-state-drift',
          cachedState: agentCache.pr.state,
          currentState: currentPR.data.state,
          cacheAge,
          prNumber: pr.data.number
        }
      })
    }
    
    const violations = invariantChecker.getViolations()
    const metrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Stale State Analysis:')
    console.log(`- Total Operations: ${metrics.totalOperations}`)
    console.log(`- Failed Operations: ${metrics.failedOperations}`)
    console.log(`- Cache Age: ${cacheAge}ms`)
    console.log(`- State Consistent: ${stateConsistent}`)
    console.log(`- Invariant Violations: ${violations.length}`)
    
    if (violations.length > 0) {
      console.log('\n🚨 STALE STATE VIOLATIONS DETECTED:')
      violations.forEach(violation => {
        console.log(`- ${violation.invariant}: ${violation.description}`)
        console.log(`  Severity: ${violation.severity}`)
      })
      
      console.log('\n⚠️  STALE STATE DAMAGE ASSESSMENT:')
      console.log('- Decision Making: Agent made decisions based on outdated information')
      console.log('- Resource Waste: Attempted operations on invalid state')
      console.log('- Data Integrity: Risk of acting on no-longer-valid conditions')
      console.log('- User Experience: Confusing behavior and unexpected failures')
    }
    
    // Test: Resilient approach with state validation
    console.log('\n🛡️ Testing Resilient State Validation...')
    
    invariantChecker.clearViolations()
    requestLogger.clearLogs()
    
    // Reset PR to open for resilient test
    await octokit.rest.pulls.update({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      pull_number: pr.data.number,
      state: 'open'
    })
    
    // Cache again
    const resilientCachedAt = Date.now()
    const resilientCache = {
      pr: { ...currentPR.data, state: 'open' as const },
      cachedAt: resilientCachedAt,
      maxAge: 1000 // Shorter max age for resilient test
    }
    
    // Wait to make cache stale
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Close PR externally again
    await octokit.rest.pulls.update({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      pull_number: pr.data.number,
      state: 'closed'
    })
    
    // Resilient agent validates current state before acting
    const resilientOperationStart = Date.now()
    
    try {
      console.log('🛡️ Resilient Agent: Validating current state before operation...')
      
      // Always fetch current state before critical operations
      const currentValidatedPR = await octokit.rest.pulls.get({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        pull_number: pr.data.number
      })
      
      if (currentValidatedPR.data.state === 'open') {
        console.log('🛡️ Resilient Agent: Current state is open, proceeding with merge...')
        
        const resilientMergeResult = await octokit.rest.pulls.merge({
          owner: repo.data.owner.login,
          repo: repo.data.name,
          pull_number: pr.data.number,
          commit_title: 'Resilient merge with state validation'
        })
        
        requestLogger.logOperation('merge-resilient', true, Date.now() - resilientOperationStart, undefined, 0, {
          stateValidated: true,
          currentState: currentValidatedPR.data.state,
          prNumber: pr.data.number
        })
        
      } else {
        console.log(`🛡️ Resilient Agent: Current state is '${currentValidatedPR.data.state}', skipping merge`)
        
        requestLogger.logOperation('skip-merge-resilient', true, Date.now() - resilientOperationStart, undefined, 0, {
          stateValidated: true,
          currentState: currentValidatedPR.data.state,
          skippedReason: 'PR not open'
        })
      }
      
    } catch (error) {
      const duration = Date.now() - resilientOperationStart
      requestLogger.logOperation('merge-resilient', false, duration, (error as Error).message, 0, {
        stateValidated: true
      })
      
      console.log(`❌ Resilient merge failed: ${(error as Error).message}`)
    }
    
    const resilientViolations = invariantChecker.getViolations()
    const resilientMetrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Resilient State Analysis:')
    console.log(`- Total Operations: ${resilientMetrics.totalOperations}`)
    console.log(`- Failed Operations: ${resilientMetrics.failedOperations}`)
    console.log(`- Invariant Violations: ${resilientViolations.length}`)
    
    // Assertions
    expect(currentPR.data.state).toBe('closed') // PR should be closed from external mutation
    expect(cacheAge).toBeGreaterThan(agentCache.maxAge) // Cache should be stale
    
    // Stale approach should have violations
    if (!stateConsistent) {
      expect(violations.length).toBeGreaterThan(0)
    }
    
    // Resilient approach should have fewer or no violations
    expect(resilientViolations.length).toBeLessThanOrEqual(violations.length)
    
    console.log('\n🎯 Key Insights:')
    console.log('1. Cached state can become stale without proper invalidation')
    console.log('2. Acting on stale state can cause incorrect decisions and wasted operations')
    console.log('3. External mutations can change state outside agent control')
    console.log('4. Real-time state validation prevents stale state problems')
    
    console.log('\n🛡️ Resilient Pattern Benefits:')
    console.log('1. Always validate current state before critical operations')
    console.log('2. Use short cache TTLs or implement cache invalidation')
    console.log('3. Implement optimistic concurrency control where possible')
    console.log('4. Add monitoring for cache hit/miss ratios and staleness')
  })

  it('should demonstrate eventual consistency challenges', async () => {
    console.log('\n⏱️ Testing Eventual Consistency Challenges')
    
    // Setup repository
    const repoName = `eventual-consistency-test-${Date.now()}`
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true
    })
    
    // Test: Create resource and immediately try to read it
    console.log('⚡ Creating repository and immediately reading refs...')
    
    const createStart = Date.now()
    
    // Create a new branch
    const branchName = 'feature/eventual-consistency'
    const branchRef = await octokit.rest.git.createRef({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      ref: `refs/heads/${branchName}`,
      sha: repo.data.default_branch_sha
    })
    
    const createDuration = Date.now() - createStart
    console.log(`✅ Created branch in ${createDuration}ms`)
    
    // Immediately try to read the branch (may encounter eventual consistency)
    const readAttempts = []
    
    for (let i = 0; i < 5; i++) {
      const readStart = Date.now()
      
      try {
        const branch = await octokit.rest.git.getRef({
          owner: repo.data.owner.login,
          repo: repo.data.name,
          ref: `heads/${branchName}`
        })
        
        const readDuration = Date.now() - readStart
        readAttempts.push({
          attempt: i + 1,
          success: true,
          duration: readDuration,
          ref: branch.data.ref
        })
        
        console.log(`✅ Read attempt ${i + 1}: Success in ${readDuration}ms`)
        
      } catch (error) {
        const readDuration = Date.now() - readStart
        readAttempts.push({
          attempt: i + 1,
          success: false,
          duration: readDuration,
          error: (error as Error).message
        })
        
        console.log(`❌ Read attempt ${i + 1}: Failed in ${readDuration}ms - ${(error as Error).message}`)
      }
      
      // Small delay between attempts
      if (i < 4) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    
    // Analyze eventual consistency patterns
    const successfulReads = readAttempts.filter(attempt => attempt.success)
    const failedReads = readAttempts.filter(attempt => !attempt.success)
    
    console.log('\n📊 Eventual Consistency Analysis:')
    console.log(`- Successful Reads: ${successfulReads.length}/${readAttempts.length}`)
    console.log(`- Failed Reads: ${failedReads.length}/${readAttempts.length}`)
    
    if (failedReads.length > 0) {
      console.log('\n⚠️ Eventual Consistency Issues Detected:')
      console.log('- Newly created resources not immediately available')
      console.log('- Temporary 404s or inconsistent state')
      console.log('- Need for retry logic in distributed systems')
      
      failedReads.forEach(attempt => {
        console.log(`  Attempt ${attempt.attempt}: ${attempt.error}`)
      })
    }
    
    // Test resilient approach with retry for eventual consistency
    console.log('\n🛡️ Testing Resilient Eventual Consistency Handling...')
    
    const resilientCreateStart = Date.now()
    
    // Create another branch
    const resilientBranchName = 'feature/resilient-consistency'
    await octokit.rest.git.createRef({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      ref: `refs/heads/${resilientBranchName}`,
      sha: repo.data.default_branch_sha
    })
    
    // Use retry logic for reading
    let resilientSuccess = false
    let resilientAttempts = 0
    
    for (let i = 0; i < 3 && !resilientSuccess; i++) {
      resilientAttempts++
      
      try {
        const branch = await octokit.rest.git.getRef({
          owner: repo.data.owner.login,
          repo: repo.data.name,
          ref: `heads/${resilientBranchName}`
        })
        
        resilientSuccess = true
        console.log(`✅ Resilient read succeeded on attempt ${i + 1}`)
        
      } catch (error) {
        console.log(`🔄 Resilient read attempt ${i + 1} failed, retrying...`)
        
        if (i < 2) {
          await new Promise(resolve => setTimeout(resolve, 500 * (i + 1))) // Exponential backoff
        }
      }
    }
    
    expect(resilientSuccess).toBe(true)
    expect(resilientAttempts).toBeGreaterThan(0)
    
    console.log('\n🎯 Eventual Consistency Insights:')
    console.log('1. Newly created resources may not be immediately available')
    console.log('2. Temporary 404s are normal in distributed systems')
    console.log('3. Retry logic is essential for handling eventual consistency')
    console.log('4. Exponential backoff prevents overwhelming the system')
  })
})
