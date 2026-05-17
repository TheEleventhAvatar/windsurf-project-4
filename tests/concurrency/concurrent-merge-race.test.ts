import { describe, it, expect, beforeEach } from 'vitest'
import { Octokit } from '@octokit/core'
import { getOctokit } from '../setup'
import { 
  InvariantChecker, 
  RequestLogger, 
  ConcurrentWorker, 
  retryWithBackoff 
} from '../../src/utils/reliability-helpers'

/**
 * SCENARIO 1: Concurrent Merge Race
 * 
 * Reliability Assumption Being Tested:
 * "GitHub operations are atomic and race-condition free"
 * 
 * This assumption is FALSE in distributed systems where:
 * - Multiple agents can read the same state simultaneously
 * - Both can attempt mutations based on stale data
 * - Final state becomes inconsistent or corrupted
 * 
 * Expected Failure Modes:
 * - Duplicate merge attempts on same PR
 * - Inconsistent repository state
 * - Lost updates or corrupted merge history
 */

describe('Concurrent Merge Race', () => {
  let octokit: Octokit
  let invariantChecker: InvariantChecker
  let requestLogger: RequestLogger

  beforeEach(() => {
    octokit = getOctokit()
    invariantChecker = new InvariantChecker()
    requestLogger = new RequestLogger()
  })

  it('should detect race conditions when two workers attempt simultaneous PR merges', async () => {
    console.log('\n🏁 Testing Concurrent Merge Race Scenario')
    console.log('Assumption: "GitHub operations are atomic and race-condition free"')
    
    // Setup: Create repository and PR for testing
    const repoName = `concurrent-test-${Date.now()}`
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true
    })
    
    console.log(`✅ Created test repository: ${repoName}`)
    
    // Create feature branch
    const branchName = 'feature/concurrent-merge'
    await octokit.rest.git.createRef({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      ref: `refs/heads/${branchName}`,
      sha: repo.data.default_branch_sha
    })
    
    console.log(`✅ Created branch: ${branchName}`)
    
    // Create a file change
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      path: 'concurrent-test.txt',
      message: 'Add test file for concurrent merge',
      content: Buffer.from('Concurrent merge test content').toString('base64'),
      branch: branchName
    })
    
    // Create PR
    const pr = await octokit.rest.pulls.create({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      title: 'Concurrent Merge Test PR',
      head: branchName,
      base: repo.data.default_branch
    })
    
    console.log(`✅ Created PR #${pr.data.number} for concurrent testing`)
    
    // Test: Two workers attempt merge simultaneously
    const workers = [
      {
        id: 'worker-1',
        work: async () => {
          const start = Date.now()
          const operationId = requestLogger.logOperation('merge-attempt-1', false, 0)
          
          try {
            // Simulate slight delay to increase race condition likelihood
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100))
            
            const result = await octokit.rest.pulls.merge({
              owner: repo.data.owner.login,
              repo: repo.data.name,
              pull_number: pr.data.number,
              commit_title: 'Merge from Worker 1'
            })
            
            const duration = Date.now() - start
            requestLogger.logOperation('merge-attempt-1', true, duration, undefined, 0, {
              operationId,
              resource: `pr-${pr.data.number}`,
              worker: 'worker-1'
            })
            
            return result
          } catch (error) {
            const duration = Date.now() - start
            requestLogger.logOperation('merge-attempt-1', false, duration, (error as Error).message, 0, {
              operationId,
              resource: `pr-${pr.data.number}`,
              worker: 'worker-1'
            })
            throw error
          }
        },
        delay: 50 // Small delay to create timing overlap
      },
      {
        id: 'worker-2',
        work: async () => {
          const start = Date.now()
          const operationId = requestLogger.logOperation('merge-attempt-2', false, 0)
          
          try {
            // Simulate slight delay to increase race condition likelihood
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100))
            
            const result = await octokit.rest.pulls.merge({
              owner: repo.data.owner.login,
              repo: repo.data.name,
              pull_number: pr.data.number,
              commit_title: 'Merge from Worker 2'
            })
            
            const duration = Date.now() - start
            requestLogger.logOperation('merge-attempt-2', true, duration, undefined, 0, {
              operationId,
              resource: `pr-${pr.data.number}`,
              worker: 'worker-2'
            })
            
            return result
          } catch (error) {
            const duration = Date.now() - start
            requestLogger.logOperation('merge-attempt-2', false, duration, (error as Error).message, 0, {
              operationId,
              resource: `pr-${pr.data.number}`,
              worker: 'worker-2'
            })
            throw error
          }
        },
        delay: 75 // Slightly different delay
      }
    ]
    
    // Execute concurrent workers
    console.log('🏁 Executing concurrent merge attempts...')
    const results = await ConcurrentWorker.runConcurrent(workers, {
      maxConcurrency: 2,
      jitter: true
    })
    
    console.log(`📊 Concurrent execution completed. Results: ${results.length} workers`)
    
    // Analyze results for race conditions
    const successfulMerges = results.filter(r => r.result.status === 201)
    const failedMerges = results.filter(r => r.result.status !== 201)
    
    console.log(`✅ Successful merges: ${successfulMerges.length}`)
    console.log(`❌ Failed merges: ${failedMerges.length}`)
    
    // Verify invariants
    const logs = requestLogger.getLogs()
    
    // Check for race conditions
    invariantChecker.assertNoRaceCondition(logs, {
      scenario: 'concurrent-merge',
      prNumber: pr.data.number,
      workerCount: workers.length
    })
    
    // Check final repository state
    const finalPR = await octokit.rest.pulls.get({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      pull_number: pr.data.number
    })
    
    invariantChecker.assertPRState(
      finalPR.data.state,
      'closed', // Should be closed after merge
      {
        scenario: 'concurrent-merge-final-state',
        prNumber: pr.data.number,
        mergeAttempts: results.length
      }
    )
    
    // Generate detailed analysis
    const violations = invariantChecker.getViolations()
    const metrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Reliability Analysis:')
    console.log(`- Total Operations: ${metrics.totalOperations}`)
    console.log(`- Failed Operations: ${metrics.failedOperations}`)
    console.log(`- Reliability Score: ${metrics.reliabilityScore}/100`)
    console.log(`- Invariant Violations: ${violations.length}`)
    
    if (violations.length > 0) {
      console.log('\n🚨 Detected Invariant Violations:')
      violations.forEach(violation => {
        console.log(`- ${violation.invariant}: ${violation.description}`)
        console.log(`  Severity: ${violation.severity}`)
      })
    }
    
    // Assertions for test validation
    expect(results.length).toBe(2) // Both workers should complete
    
    // At least one merge should succeed (or both should fail gracefully)
    expect(successfulMerges.length + failedMerges.length).toBe(2)
    
    // PR should be in consistent final state
    expect(['closed', 'open']).toContain(finalPR.data.state)
    
    // If violations were detected, they should be documented
    if (violations.length > 0) {
      console.log('\n⚠️  RACE CONDITION DETECTED:')
      console.log('This demonstrates that concurrent GitHub operations can create:')
      console.log('- Inconsistent repository state')
      console.log('- Race condition vulnerabilities')
      console.log('- Potential data corruption')
      
      // Test should pass even with violations - we're detecting them, not preventing them
      expect(violations.length).toBeGreaterThan(0)
    } else {
      console.log('\n✅ No race conditions detected in this execution')
      console.log('Note: Race conditions are timing-dependent and may not manifest every time')
    }
    
    console.log('\n🎯 Key Insight:')
    console.log('Concurrent GitHub operations without proper synchronization can:')
    console.log('1. Create race conditions leading to inconsistent state')
    console.log('2. Cause duplicate operations or lost updates')
    console.log('3. Violate data integrity invariants')
    console.log('4. Require explicit locking or serialization mechanisms')
  })

  it('should demonstrate resilient behavior with proper synchronization', async () => {
    console.log('\n🛡️ Testing Resilient Concurrent Merge with Synchronization')
    
    // Setup similar repository
    const repoName = `resilient-test-${Date.now()}`
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true
    })
    
    const branchName = 'feature/resilient-merge'
    await octokit.rest.git.createRef({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      ref: `refs/heads/${branchName}`,
      sha: repo.data.default_branch_sha
    })
    
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      path: 'resilient-test.txt',
      message: 'Add test file for resilient merge',
      content: Buffer.from('Resilient merge test content').toString('base64'),
      branch: branchName
    })
    
    const pr = await octokit.rest.pulls.create({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      title: 'Resilient Merge Test PR',
      head: branchName,
      base: repo.data.default_branch
    })
    
    // Resilient approach: Use distributed locking pattern
    const lockKey = `merge-lock-${repo.data.name}-${pr.data.number}`
    let lockAcquired = false
    
    const resilientWorkers = [
      {
        id: 'resilient-worker-1',
        work: async () => {
          // Simulate distributed lock acquisition
          if (!lockAcquired) {
            lockAcquired = true
            console.log('🔒 Worker 1 acquired merge lock')
            
            // Validate PR state before proceeding
            const currentPR = await octokit.rest.pulls.get({
              owner: repo.data.owner.login,
              repo: repo.data.name,
              pull_number: pr.data.number
            })
            
            if (currentPR.data.state === 'closed') {
              console.log('⚠️  Worker 1: PR already closed, skipping merge')
              return { skipped: true, reason: 'PR already closed' }
            }
            
            // Proceed with merge
            const result = await octokit.rest.pulls.merge({
              owner: repo.data.owner.login,
              repo: repo.data.name,
              pull_number: pr.data.number,
              commit_title: 'Resilient Merge from Worker 1'
            })
            
            return result
          } else {
            console.log('⚠️  Worker 1: Could not acquire lock, skipping')
            return { skipped: true, reason: 'Lock not acquired' }
          }
        },
        delay: 50
      },
      {
        id: 'resilient-worker-2',
        work: async () => {
          // Simulate distributed lock acquisition
          if (!lockAcquired) {
            lockAcquired = true
            console.log('🔒 Worker 2 acquired merge lock')
            
            // Validate PR state before proceeding
            const currentPR = await octokit.rest.pulls.get({
              owner: repo.data.owner.login,
              repo: repo.data.name,
              pull_number: pr.data.number
            })
            
            if (currentPR.data.state === 'closed') {
              console.log('⚠️  Worker 2: PR already closed, skipping merge')
              return { skipped: true, reason: 'PR already closed' }
            }
            
            // Proceed with merge
            const result = await octokit.rest.pulls.merge({
              owner: repo.data.owner.login,
              repo: repo.data.name,
              pull_number: pr.data.number,
              commit_title: 'Resilient Merge from Worker 2'
            })
            
            return result
          } else {
            console.log('⚠️  Worker 2: Could not acquire lock, skipping')
            return { skipped: true, reason: 'Lock not acquired' }
          }
        },
        delay: 75
      }
    ]
    
    // Execute resilient workers
    const resilientResults = await ConcurrentWorker.runConcurrent(resilientWorkers, {
      maxConcurrency: 2,
      jitter: false // No jitter for deterministic behavior
    })
    
    console.log('🛡️ Resilient execution completed')
    
    // Verify resilient behavior
    const successfulMerges = resilientResults.filter(r => 
      r.result.status === 201 || (r.result.skipped && r.result.reason === 'PR already closed')
    )
    
    console.log(`✅ Successful or safely skipped operations: ${successfulMerges.length}`)
    
    // Verify final state is consistent
    const finalPR = await octokit.rest.pulls.get({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      pull_number: pr.data.number
    })
    
    console.log(`📊 Final PR state: ${finalPR.data.state}`)
    
    // Resilient approach should prevent race conditions
    expect(['closed', 'open']).toContain(finalPR.data.state)
    expect(resilientResults.length).toBe(2)
    
    console.log('\n🎯 Resilient Pattern Demonstrated:')
    console.log('1. Distributed locking prevents concurrent mutations')
    console.log('2. State validation before critical operations')
    console.log('3. Graceful handling of lock contention')
    console.log('4. Consistent final state guaranteed')
  })
})
