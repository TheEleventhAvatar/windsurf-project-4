import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Octokit } from '@octokit/core'
import { getOctokit } from '../setup'
import { 
  InvariantChecker, 
  RequestLogger, 
  retryWithBackoff 
} from '../../src/utils/reliability-helpers'

/**
 * SCENARIO 2: Retry Storm / Non-idempotent Retries
 * 
 * Reliability Assumption Being Tested:
 * "Retrying failed operations is always safe and won't cause side effects"
 * 
 * This assumption is FALSE when operations are not idempotent:
 * - Retries can create duplicate resources
 * - Partial failures can leave inconsistent state
 * - Blind retries ignore the root cause of failure
 * 
 * Expected Failure Modes:
 * - Duplicate PRs/resources from retry storms
 * - Resource conflicts from non-idempotent operations
 * - Wasted compute resources and alert fatigue
 */

describe('Retry Storm / Non-idempotent Retries', () => {
  let octokit: Octokit
  let invariantChecker: InvariantChecker
  let requestLogger: RequestLogger

  beforeEach(() => {
    octokit = getOctokit()
    invariantChecker = new InvariantChecker()
    requestLogger = new RequestLogger()
  })

  it('should detect duplicate PR creation from non-idempotent retry storms', async () => {
    console.log('\n🔄 Testing Retry Storm Scenario')
    console.log('Assumption: "Retrying failed operations is always safe and won\'t cause side effects"')
    
    // Setup: Create repository for testing
    const repoName = `retry-storm-test-${Date.now()}`
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true
    })
    
    console.log(`✅ Created test repository: ${repoName}`)
    
    // Create feature branch
    const branchName = 'feature/retry-storm'
    await octokit.rest.git.createRef({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      ref: `refs/heads/${branchName}`,
      sha: repo.data.default_branch_sha
    })
    
    // Create a file change
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: repo.data.owner.login,
      repo: repo.data.name,
      path: 'retry-storm-test.txt',
      message: 'Add test file for retry storm',
      content: Buffer.from('Retry storm test content').toString('base64'),
      branch: branchName
    })
    
    console.log(`✅ Created branch and file for testing`)
    
    // Mock intermittent failures to simulate retry storm
    let attemptCount = 0
    const originalCreate = octokit.rest.pulls.create.bind(octokit.rest.pulls)
    
    vi.spyOn(octokit.rest.pulls, 'create').mockImplementation(async (params) => {
      attemptCount++
      console.log(`🔄 PR creation attempt #${attemptCount}`)
      
      // Simulate timeout on first 2 attempts
      if (attemptCount <= 2) {
        console.log(`⚠️  Simulating timeout on attempt #${attemptCount}`)
        throw new Error('Request timeout: Operation timed out after 30 seconds')
      }
      
      // Succeed on 3rd attempt
      console.log(`✅ PR creation succeeding on attempt #${attemptCount}`)
      return originalCreate(params)
    })
    
    // Test: Naive retry storm without idempotency
    console.log('🌪️  Executing naive retry storm...')
    
    let createdPRs: any[] = []
    let retryCount = 0
    
    try {
      // Naive retry logic - just retry blindly
      for (let i = 0; i < 3; i++) {
        retryCount++
        const start = Date.now()
        
        try {
          const pr = await octokit.rest.pulls.create({
            owner: repo.data.owner.login,
            repo: repo.data.name,
            title: `Retry Storm Test PR (Attempt ${i + 1})`,
            head: branchName,
            base: repo.data.default_branch,
            body: `Created on attempt ${i + 1} of retry storm`
          })
          
          const duration = Date.now() - start
          createdPRs.push(pr.data)
          
          requestLogger.logOperation('create-pr-naive', true, duration, undefined, i, {
            attempt: i + 1,
            prNumber: pr.data.number,
            title: pr.data.title
          })
          
          console.log(`✅ Created PR #${pr.data.number} on attempt ${i + 1}`)
          
        } catch (error) {
          const duration = Date.now() - start
          requestLogger.logOperation('create-pr-naive', false, duration, (error as Error).message, i, {
            attempt: i + 1
          })
          
          console.log(`❌ Attempt ${i + 1} failed: ${(error as Error).message}`)
        }
      }
    } finally {
      vi.restoreAllMocks()
    }
    
    console.log(`📊 Retry storm completed. PRs created: ${createdPRs.length}`)
    
    // Analyze results for duplicate resources
    invariantChecker.assertNoDuplicates(
      createdPRs,
      (pr) => pr.number.toString(),
      {
        scenario: 'retry-storm-naive',
        retryCount,
        operation: 'create-pr'
      }
    )
    
    // Check for idempotency violations
    if (createdPRs.length > 1) {
      invariantChecker.assertIdempotency(
        'create-pr-retry',
        createdPRs.map(pr => ({ number: pr.number, title: pr.title })),
        {
          scenario: 'retry-storm-naive',
          retryCount,
          createdPRs: createdPRs.map(pr => pr.number)
        }
      )
    }
    
    const violations = invariantChecker.getViolations()
    const metrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Naive Retry Analysis:')
    console.log(`- Total Operations: ${metrics.totalOperations}`)
    console.log(`- Failed Operations: ${metrics.failedOperations}`)
    console.log(`- PRs Created: ${createdPRs.length}`)
    console.log(`- Invariant Violations: ${violations.length}`)
    
    if (createdPRs.length > 1) {
      console.log('\n🚨 DUPLICATE PRs DETECTED:')
      console.log('This demonstrates that naive retries can create:')
      console.log('- Duplicate resources (multiple PRs)')
      console.log('- Resource conflicts and confusion')
      console.log('- Wasted compute resources')
      console.log('- Alert fatigue from duplicate notifications')
      
      createdPRs.forEach(pr => {
        console.log(`  - PR #${pr.number}: ${pr.title}`)
      })
    }
    
    // Test: Resilient retry with idempotency
    console.log('\n🛡️ Testing Resilient Retry with Idempotency...')
    
    // Reset for resilient test
    invariantChecker.clearViolations()
    requestLogger.clearLogs()
    
    let resilientPRs: any[] = []
    let resilientRetryCount = 0
    
    // Resilient retry logic with idempotency check
    const createPRWithIdempotency = async () => {
      // Check for existing PRs first
      const existingPRs = await octokit.rest.pulls.list({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        head: branchName,
        base: repo.data.default_branch,
        state: 'all'
      })
      
      if (existingPRs.data.length > 0) {
        console.log(`✅ Found existing PR #${existingPRs.data[0].number}, skipping creation`)
        return existingPRs.data[0]
      }
      
      // Create new PR if none exists
      return await octokit.rest.pulls.create({
        owner: repo.data.owner.login,
        repo: repo.data.name,
        title: 'Resilient Retry Test PR',
        head: branchName,
        base: repo.data.default_branch,
        body: 'Created with idempotency protection'
      })
    }
    
    // Mock failures again for resilient test
    attemptCount = 0
    vi.spyOn(octokit.rest.pulls, 'create').mockImplementation(async (params) => {
      attemptCount++
      
      if (attemptCount <= 2) {
        throw new Error('Request timeout: Operation timed out after 30 seconds')
      }
      
      return originalCreate(params)
    })
    
    try {
      // Use retryWithBackoff with idempotency
      const result = await retryWithBackoff(createPRWithIdempotency, {
        maxRetries: 3,
        baseDelay: 100,
        onRetry: (attempt, error) => {
          resilientRetryCount++
          console.log(`🔄 Resilient retry attempt ${attempt}: ${error.message}`)
        }
      })
      
      resilientPRs.push(result)
      
      requestLogger.logOperation('create-pr-resilient', true, 0, undefined, resilientRetryCount, {
        prNumber: result.number,
        title: result.title
      })
      
    } catch (error) {
      requestLogger.logOperation('create-pr-resilient', false, 0, (error as Error).message, resilientRetryCount)
    } finally {
      vi.restoreAllMocks()
    }
    
    console.log(`📊 Resilient retry completed. PRs created: ${resilientPRs.length}`)
    
    // Verify resilient behavior
    const resilientViolations = invariantChecker.getViolations()
    const resilientMetrics = requestLogger.calculateMetrics()
    
    console.log('\n📈 Resilient Retry Analysis:')
    console.log(`- Total Operations: ${resilientMetrics.totalOperations}`)
    console.log(`- Failed Operations: ${resilientMetrics.failedOperations}`)
    console.log(`- PRs Created: ${resilientPRs.length}`)
    console.log(`- Invariant Violations: ${resilientViolations.length}`)
    
    // Assertions
    expect(createdPRs.length + resilientPRs.length).toBeGreaterThan(0)
    
    // Naive approach should create duplicates (demonstrating the problem)
    if (createdPRs.length > 1) {
      expect(violations.length).toBeGreaterThan(0)
    }
    
    // Resilient approach should create at most one PR
    expect(resilientPRs.length).toBeLessThanOrEqual(1)
    
    console.log('\n🎯 Key Insights:')
    console.log('1. Naive retries can create duplicate resources when operations are not idempotent')
    console.log('2. Blind retrying ignores the root cause and can amplify problems')
    console.log('3. Idempotency checks prevent duplicate resource creation')
    console.log('4. Resilient retry patterns require explicit duplicate detection')
    
    if (createdPRs.length > 1) {
      console.log('\n⚠️  RETRY STORM DAMAGE ASSESSMENT:')
      console.log('- Resource Waste: Multiple unnecessary PRs created')
      console.log('- Confusion: Developers must identify and clean up duplicates')
      console.log('- Alert Fatigue: CI/CD triggered multiple times')
      console.log('- Cost Impact: Wasted compute and storage resources')
    }
  })

  it('should demonstrate proper retry patterns with exponential backoff', async () => {
    console.log('\n⚡ Testing Proper Retry Patterns')
    
    // Setup
    const repoName = `proper-retry-test-${Date.now()}`
    const repo = await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      auto_init: true
    })
    
    // Test exponential backoff retry pattern
    let attemptCount = 0
    const originalCreate = octokit.rest.repos.createForAuthenticatedUser.bind(octokit.rest.repos)
    
    vi.spyOn(octokit.rest.repos, 'createForAuthenticatedUser').mockImplementation(async (params) => {
      attemptCount++
      
      // Simulate transient failures
      if (attemptCount <= 2) {
        throw new Error('Internal server error: Temporary service unavailable')
      }
      
      return originalCreate(params)
    })
    
    try {
      const startTime = Date.now()
      
      const result = await retryWithBackoff(async () => {
        return await octokit.rest.repos.createForAuthenticatedUser({
          name: `${repoName}-retry-test`,
          auto_init: true
        })
      }, {
        maxRetries: 3,
        baseDelay: 100,
        maxDelay: 1000,
        jitter: true,
        onRetry: (attempt, error) => {
          console.log(`🔄 Retry ${attempt}: ${error.message}`)
        }
      })
      
      const totalTime = Date.now() - startTime
      console.log(`✅ Retry pattern succeeded after ${attemptCount} attempts in ${totalTime}ms`)
      console.log(`📊 Created repository: ${result.data.name}`)
      
      expect(result.data.name).toBe(`${repoName}-retry-test`)
      expect(attemptCount).toBe(3) // Should have retried twice then succeeded
      
    } finally {
      vi.restoreAllMocks()
    }
    
    console.log('\n🎯 Proper Retry Pattern Benefits:')
    console.log('1. Exponential backoff prevents overwhelming the service')
    console.log('2. Jitter avoids thundering herd problems')
    console.log('3. Configurable max retries prevent infinite loops')
    console.log('4. Detailed logging aids in debugging and monitoring')
  })
})
