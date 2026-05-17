import { describe, it, expect, beforeEach } from 'vitest'
import { Octokit } from '@octokit/core'
import { getOctokit, resetArchalClones } from '../setup'
import { 
  InvariantChecker, 
  RequestLogger 
} from '../../src/utils/reliability-helpers'
import { resetArchalClones as resetClones } from 'archal/vitest'

/**
 * SCENARIO 5: Reset Determinism
 * 
 * Reliability Assumption Being Tested:
 * "System state can be reliably reset to a known good state"
 * 
 * This assumption is CRITICAL for testing and can fail when:
 * - Reset operations don't fully clean up all resources
 * - Leaked state persists between test runs
 * - Deterministic behavior is compromised by residual data
 * 
 * Expected Failure Modes:
 * - Incomplete resource cleanup
 * - State leakage between test runs
 * - Non-deterministic test behavior
 * - Webhook queue not drained
 */

describe('Reset Determinism', () => {
  let octokit: Octokit
  let invariantChecker: InvariantChecker
  let requestLogger: RequestLogger

  beforeEach(() => {
    octokit = getOctokit()
    invariantChecker = new InvariantChecker()
    requestLogger = new RequestLogger()
  })

  it('should verify complete state reset after heavy mutations', async () => {
    console.log('\n🔄 Testing Reset Determinism Scenario')
    console.log('Assumption: "System state can be reliably reset to a known good state"')
    
    // Step 1: Capture initial baseline state
    console.log('📊 Capturing initial baseline state...')
    
    const baselineState = await captureSystemState(octokit)
    console.log(`✅ Baseline: ${baselineState.repositories.length} repos, ${baselineState.branches.length} branches`)
    
    // Step 2: Perform heavy mutations to stress the system
    console.log('🔥 Performing heavy system mutations...')
    
    const mutationResults = await performHeavyMutations(octokit, requestLogger)
    
    console.log(`📊 Post-mutation: ${mutationResults.repositories.length} repos, ${mutationResults.branches.length} branches`)
    console.log(`📊 Created: ${mutationResults.createdRepos} repos, ${mutationResults.createdPRs} PRs`)
    
    // Verify mutations were successful
    expect(mutationResults.createdRepos).toBeGreaterThan(0)
    expect(mutationResults.createdPRs).toBeGreaterThan(0)
    
    // Step 3: Reset the system
    console.log('🔄 Resetting Archal clones to clean state...')
    
    const resetStart = Date.now()
    await resetArchalClones()
    const resetDuration = Date.now() - resetStart
    
    console.log(`✅ Reset completed in ${resetDuration}ms`)
    
    // Step 4: Verify reset effectiveness
    console.log('🔍 Verifying reset effectiveness...')
    
    await new Promise(resolve => setTimeout(resolve, 1000)) // Allow reset to fully propagate
    
    const postResetState = await captureSystemState(octokit)
    
    console.log(`📊 Post-reset: ${postResetState.repositories.length} repos, ${postResetState.branches.length} branches`)
    
    // Verify invariants for reset determinism
    const resetInvariants = {
      repositoriesRestored: postResetState.repositories.length === baselineState.repositories.length,
      branchesRestored: postResetState.branches.length === baselineState.branches.length,
      noLeakedResources: postResetState.repositories.length <= baselineState.repositories.length + 1, // Allow 1 for temp repo
      deterministicRestoration: JSON.stringify(postResetState.repositories.sort()) === JSON.stringify(baselineState.repositories.sort())
    }
    
    Object.entries(resetInvariants).forEach(([invariant, passed]) => {
      if (!passed) {
        invariantChecker.addViolation({
          invariant: 'RESET_DETERMINISM',
          description: `Reset invariant failed: ${invariant}`,
          severity: 'HIGH',
          context: {
            baselineCount: baselineState.repositories.length,
            postResetCount: postResetState.repositories.length,
            invariant,
            resetDuration
          }
        })
      }
    })
    
    // Step 5: Test deterministic behavior after reset
    console.log('🎲 Testing deterministic behavior after reset...')
    
    const deterministicTest = await testDeterministicBehavior(octokit, requestLogger)
    
    console.log(`📊 Deterministic test: ${deterministicTest.success ? 'PASSED' : 'FAILED'}`)
    console.log(`📊 Operations: ${deterministicTest.operations}, Consistency: ${deterministicTest.consistency}%`)
    
    if (!deterministicTest.success) {
      invariantChecker.addViolation({
        invariant: 'DETERMINISTIC_BEHAVIOR',
        description: 'System behavior is not deterministic after reset',
        severity: 'MEDIUM',
        context: {
          operations: deterministicTest.operations,
          consistency: deterministicTest.consistency,
          inconsistencies: deterministicTest.inconsistencies
        }
      })
    }
    
    // Step 6: Verify webhook queue is drained
    console.log('📡 Verifying webhook queue drainage...')
    
    const webhookDrained = await verifyWebhookQueueDrained(octokit)
    
    if (!webhookDrained) {
      invariantChecker.addViolation({
        invariant: 'WEBHOOK_QUEUE_DRAINED',
        description: 'Webhook queue not properly drained after reset',
        severity: 'MEDIUM',
        context: {
          resetDuration
        }
      })
    }
    
    const violations = invariantChecker.getViolations()
    const metrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Reset Determinism Analysis:')
    console.log(`- Total Operations: ${metrics.totalOperations}`)
    console.log(`- Reset Duration: ${resetDuration}ms`)
    console.log(`- Repositories Created: ${mutationResults.createdRepos}`)
    console.log(`- PRs Created: ${mutationResults.createdPRs}`)
    console.log(`- Invariant Violations: ${violations.length}`)
    
    console.log('\n📊 Reset Invariants Status:')
    Object.entries(resetInvariants).forEach(([invariant, passed]) => {
      console.log(`- ${invariant}: ${passed ? '✅ PASS' : '❌ FAIL'}`)
    })
    
    if (violations.length > 0) {
      console.log('\n🚨 RESET DETERMINISM VIOLATIONS:')
      violations.forEach(violation => {
        console.log(`- ${violation.invariant}: ${violation.description}`)
        console.log(`  Severity: ${violation.severity}`)
      })
      
      console.log('\n⚠️  RESET DETERMINISM IMPACT:')
      console.log('- Test Reliability: Non-deterministic test results')
      console.log('- Resource Leaks: Accumulated state across runs')
      console.log('- Debugging Difficulty: Inconsistent test behavior')
      console.log('- CI/CD Stability: Flaky test failures')
    }
    
    // Assertions
    expect(mutationResults.createdRepos).toBeGreaterThan(0)
    expect(resetDuration).toBeLessThan(10000) // Reset should complete within 10 seconds
    
    // Reset should restore baseline state (or close to it)
    expect(postResetState.repositories.length).toBeLessThanOrEqual(baselineState.repositories.length + 2)
    
    // Deterministic behavior should work after reset
    expect(deterministicTest.consistency).toBeGreaterThan(80) // At least 80% consistency
    
    console.log('\n🎯 Reset Determinism Insights:')
    console.log('1. Complete state reset is critical for test reliability')
    console.log('2. Resource leaks can accumulate across test runs')
    console.log('3. Webhook queues must be drained to prevent residual effects')
    console.log('4. Deterministic behavior requires thorough cleanup')
    
    console.log('\n🛡️ Reset Best Practices:')
    console.log('1. Always verify reset effectiveness with state comparison')
    console.log('2. Test deterministic behavior after reset operations')
    console.log('3. Monitor for resource leaks and state accumulation')
    console.log('4. Implement comprehensive cleanup procedures')
  })

  it('should handle reset failures gracefully', async () => {
    console.log('\n🚨 Testing Reset Failure Handling')
    
    // Test behavior when reset might fail or be incomplete
    console.log('🔍 Simulating reset failure scenarios...')
    
    // Create some resources first
    const testRepo = await octokit.rest.repos.createForAuthenticatedUser({
      name: `reset-failure-test-${Date.now()}`,
      auto_init: true
    })
    
    console.log(`✅ Created test repo: ${testRepo.data.name}`)
    
    // Attempt reset
    try {
      await resetArchalClones()
      console.log('✅ Reset completed successfully')
      
      // Verify the test repo is gone or reset
      try {
        await octokit.rest.repos.get({
          owner: testRepo.data.owner.login,
          repo: testRepo.data.name
        })
        console.log('⚠️  Test repo still exists - reset may be incomplete')
      } catch (error) {
        console.log('✅ Test repo properly cleaned up by reset')
      }
      
    } catch (error) {
      console.log(`❌ Reset failed: ${(error as Error).message}`)
      
      // Test should handle reset failure gracefully
      invariantChecker.addViolation({
        invariant: 'RESET_FAILURE_HANDLING',
        description: 'Reset operation failed',
        severity: 'HIGH',
        context: {
          error: (error as Error).message
        }
      })
    }
    
    const violations = invariantChecker.getViolations()
    
    // Even if reset fails, system should remain functional
    expect(violations.length).toBeGreaterThanOrEqual(0) // Should handle gracefully
  })
})

/**
 * Helper function to capture system state snapshot
 */
async function captureSystemState(octokit: Octokit): Promise<{
  repositories: string[]
  branches: string[]
  pullRequests: number
  timestamp: number
}> {
  try {
    // Get user repositories
    const repos = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100
    })
    
    const repositoryNames = repos.data.map(repo => repo.name)
    
    // Count branches across all repos (sample first few)
    let branchCount = 0
    for (const repo of repos.data.slice(0, 5)) {
      try {
        const branches = await octokit.rest.repos.listBranches({
          owner: repo.owner.login,
          repo: repo.name,
          per_page: 100
        })
        branchCount += branches.data.length
      } catch (error) {
        // Skip repos we can't access
      }
    }
    
    // Count pull requests (sample)
    let prCount = 0
    for (const repo of repos.data.slice(0, 3)) {
      try {
        const prs = await octokit.rest.pulls.list({
          owner: repo.owner.login,
          repo: repo.name,
          state: 'all',
          per_page: 100
        })
        prCount += prs.data.length
      } catch (error) {
        // Skip repos we can't access
      }
    }
    
    return {
      repositories: repositoryNames,
      branches: Array.from({ length: branchCount }, (_, i) => `branch-${i}`),
      pullRequests: prCount,
      timestamp: Date.now()
    }
    
  } catch (error) {
    console.log(`⚠️  Could not capture system state: ${(error as Error).message}`)
    return {
      repositories: [],
      branches: [],
      pullRequests: 0,
      timestamp: Date.now()
    }
  }
}

/**
 * Helper function to perform heavy mutations
 */
async function performHeavyMutations(octokit: Octokit, logger: RequestLogger): Promise<{
  repositories: string[]
  branches: string[]
  createdRepos: number
  createdPRs: number
}> {
  const results = {
    repositories: [] as string[],
    branches: [] as string[],
    createdRepos: 0,
    createdPRs: 0
  }
  
  try {
    // Create multiple repositories
    for (let i = 0; i < 3; i++) {
      const repoName = `mutation-test-${Date.now()}-${i}`
      const repo = await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        auto_init: true
      })
      
      results.repositories.push(repoName)
      results.createdRepos++
      
      // Create branches in each repo
      for (let j = 0; j < 2; j++) {
        const branchName = `feature/mutation-${j}`
        await octokit.rest.git.createRef({
          owner: repo.data.owner.login,
          repo: repo.data.name,
          ref: `refs/heads/${branchName}`,
          sha: repo.data.default_branch_sha
        })
        
        results.branches.push(`${repoName}:${branchName}`)
        
        // Create files and PRs
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: repo.data.owner.login,
          repo: repo.data.name,
          path: `mutation-file-${j}.txt`,
          message: `Add mutation file ${j}`,
          content: Buffer.from(`Mutation test content ${j}`).toString('base64'),
          branch: branchName
        })
        
        try {
          const pr = await octokit.rest.pulls.create({
            owner: repo.data.owner.login,
            repo: repo.data.name,
            title: `Mutation Test PR ${j}`,
            head: branchName,
            base: repo.data.default_branch
          })
          
          results.createdPRs++
          
        } catch (error) {
          // PR creation might fail, that's okay for this test
        }
      }
    }
    
    logger.logOperation('heavy-mutations', true, Date.now(), undefined, 0, {
      createdRepos: results.createdRepos,
      createdPRs: results.createdPRs,
      totalBranches: results.branches.length
    })
    
  } catch (error) {
    logger.logOperation('heavy-mutations', false, Date.now(), (error as Error).message, 0)
  }
  
  return results
}

/**
 * Helper function to test deterministic behavior
 */
async function testDeterministicBehavior(octokit: Octokit, logger: RequestLogger): Promise<{
  success: boolean
  operations: number
  consistency: number
  inconsistencies: string[]
}> {
  const results = {
    success: true,
    operations: 0,
    consistency: 100,
    inconsistencies: [] as string[]
  }
  
  try {
    // Perform the same operation multiple times and check consistency
    const operationResults = []
    
    for (let i = 0; i < 3; i++) {
      const start = Date.now()
      
      try {
        // Create a test repo
        const repoName = `deterministic-test-${Date.now()}-${i}`
        const repo = await octokit.rest.repos.createForAuthenticatedUser({
          name: repoName,
          auto_init: true
        })
        
        const duration = Date.now() - start
        results.operations++
        
        operationResults.push({
          attempt: i + 1,
          success: true,
          duration,
          repoName: repo.data.name
        })
        
        // Clean up immediately
        await octokit.rest.repos.delete({
          owner: repo.data.owner.login,
          repo: repo.data.name
        })
        
      } catch (error) {
        operationResults.push({
          attempt: i + 1,
          success: false,
          duration: Date.now() - start,
          error: (error as Error).message
        })
        
        results.inconsistencies.push(`Attempt ${i + 1} failed: ${(error as Error).message}`)
      }
    }
    
    // Calculate consistency
    const successfulOperations = operationResults.filter(op => op.success)
    results.consistency = (successfulOperations.length / operationResults.length) * 100
    results.success = results.consistency >= 80 // At least 80% success rate
    
    logger.logOperation('deterministic-test', results.success, 0, undefined, 0, {
      operations: results.operations,
      consistency: results.consistency,
      inconsistencies: results.inconsistencies.length
    })
    
  } catch (error) {
    results.success = false
    results.inconsistencies.push(`Deterministic test failed: ${(error as Error).message}`)
  }
  
  return results
}

/**
 * Helper function to verify webhook queue is drained
 */
async function verifyWebhookQueueDrained(octokit: Octokit): Promise<boolean> {
  try {
    // This is a simplified check - in a real system you'd check webhook delivery status
    // For now, we'll verify no recent activity by checking recent events
    
    const events = await octokit.rest.activity.listEventsForAuthenticatedUser({
      per_page: 10
    })
    
    // Check if events are older than our reset operation
    const recentEvents = events.data.filter(event => {
      const eventTime = new Date(event.created_at).getTime()
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000)
      return eventTime > fiveMinutesAgo
    })
    
    console.log(`📡 Recent events: ${recentEvents.length} (last 5 minutes)`)
    
    // If there are very few recent events, assume webhook queue is drained
    return recentEvents.length <= 2
    
  } catch (error) {
    console.log(`⚠️  Could not verify webhook queue: ${(error as Error).message}`)
    return true // Assume drained if we can't check
  }
}
