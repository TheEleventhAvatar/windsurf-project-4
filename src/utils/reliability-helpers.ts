import { Octokit } from '@octokit/core'

/**
 * Production-grade reliability testing utilities for GitHub workflows
 * These helpers are designed to detect and measure reliability failures
 */

export interface OperationLog {
  id: string
  timestamp: number
  operation: string
  duration: number
  success: boolean
  error?: string
  retryCount: number
  metadata?: Record<string, any>
}

export interface InvariantViolation {
  invariant: string
  description: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  detectedAt: number
  context: Record<string, any>
}

export interface ReliabilityMetrics {
  totalOperations: number
  failedOperations: number
  retryCount: number
  staleReads: number
  raceConditions: number
  invariantViolations: InvariantViolation[]
  averageLatency: number
  reliabilityScore: number
}

/**
 * Retry with exponential backoff and jitter for resilience testing
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    baseDelay?: number
    maxDelay?: number
    jitter?: boolean
    onRetry?: (attempt: number, error: Error) => void
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    jitter = true,
    onRetry
  } = options

  let lastError: Error
  let retryCount = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)
        const jitterAmount = jitter ? Math.random() * delay * 0.1 : 0
        await new Promise(resolve => setTimeout(resolve, delay + jitterAmount))
      }

      return await operation()
    } catch (error) {
      lastError = error as Error
      retryCount = attempt

      if (attempt < maxRetries) {
        onRetry?.(attempt + 1, lastError)
      }
    }
  }

  throw lastError!
}

/**
 * Invariant assertion helpers for detecting reliability failures
 */
export class InvariantChecker {
  private violations: InvariantViolation[] = []

  /**
   * Assert that a PR is in expected state
   */
  assertPRState(
    actual: string,
    expected: string,
    context: Record<string, any>
  ): void {
    if (actual !== expected) {
      this.addViolation({
        invariant: 'PR_STATE_CONSISTENCY',
        description: `PR state should be ${expected} but was ${actual}`,
        severity: 'HIGH',
        context
      })
    }
  }

  /**
   * Assert that no duplicate resources exist
   */
  assertNoDuplicates<T>(
    items: T[],
    keyFn: (item: T) => string,
    context: Record<string, any>
  ): void {
    const seen = new Set<string>()
    const duplicates: string[] = []

    for (const item of items) {
      const key = keyFn(item)
      if (seen.has(key)) {
        duplicates.push(key)
      } else {
        seen.add(key)
      }
    }

    if (duplicates.length > 0) {
      this.addViolation({
        invariant: 'NO_DUPLICATE_RESOURCES',
        description: `Duplicate resources found: ${duplicates.join(', ')}`,
        severity: 'CRITICAL',
        context: { ...context, duplicates }
      })
    }
  }

  /**
   * Assert that operations are idempotent
   */
  assertIdempotency(
    operationId: string,
    results: any[],
    context: Record<string, any>
  ): void {
    const unique = new Set(results.map(r => JSON.stringify(r)))
    if (unique.size > 1) {
      this.addViolation({
        invariant: 'IDEMPOTENT_OPERATIONS',
        description: `Operation ${operationId} produced different results on repeated execution`,
        severity: 'HIGH',
        context: { ...context, results }
      })
    }
  }

  /**
   * Assert that state is fresh (not stale)
   */
  assertFreshState(
    cachedAt: number,
    currentAt: number,
    maxAge: number,
    context: Record<string, any>
  ): void {
    const age = currentAt - cachedAt
    if (age > maxAge) {
      this.addViolation({
        invariant: 'FRESH_STATE_READS',
        description: `State is ${age}ms old, exceeds max age ${maxAge}ms`,
        severity: 'MEDIUM',
        context: { ...context, age, maxAge }
      })
    }
  }

  /**
   * Assert no race conditions occurred
   */
  assertNoRaceCondition(
    operations: OperationLog[],
    context: Record<string, any>
  ): void {
    // Look for overlapping operations on same resource
    const resourceOps = new Map<string, OperationLog[]>()
    
    for (const op of operations) {
      const resource = op.metadata?.resource || 'unknown'
      if (!resourceOps.has(resource)) {
        resourceOps.set(resource, [])
      }
      resourceOps.get(resource)!.push(op)
    }

    for (const [resource, ops] of resourceOps) {
      if (ops.length > 1) {
        // Check for temporal overlap
        for (let i = 0; i < ops.length; i++) {
          for (let j = i + 1; j < ops.length; j++) {
            const [op1, op2] = [ops[i], ops[j]]
            const overlap = Math.abs(op1.timestamp - op2.timestamp) < 1000 // 1 second threshold
            
            if (overlap && op1.operation !== op2.operation) {
              this.addViolation({
                invariant: 'NO_RACE_CONDITIONS',
                description: `Race condition detected on resource ${resource}: ${op1.operation} vs ${op2.operation}`,
                severity: 'HIGH',
                context: { ...context, resource, operations: [op1, op2] }
              })
            }
          }
        }
      }
    }
  }

  private addViolation(violation: Omit<InvariantViolation, 'detectedAt'>): void {
    this.violations.push({
      ...violation,
      detectedAt: Date.now()
    })
  }

  getViolations(): InvariantViolation[] {
    return [...this.violations]
  }

  clearViolations(): void {
    this.violations = []
  }
}

/**
 * Request logger for detailed operation tracking
 */
export class RequestLogger {
  private logs: OperationLog[] = []
  private operationCounter = 0

  /**
   * Log an operation with detailed metrics
   */
  logOperation(
    operation: string,
    success: boolean,
    duration: number,
    error?: string,
    retryCount = 0,
    metadata?: Record<string, any>
  ): string {
    const id = `op_${++this.operationCounter}_${Date.now()}`
    
    const log: OperationLog = {
      id,
      timestamp: Date.now(),
      operation,
      duration,
      success,
      error,
      retryCount,
      metadata
    }

    this.logs.push(log)
    return id
  }

  /**
   * Get all logs for analysis
   */
  getLogs(): OperationLog[] {
    return [...this.logs]
  }

  /**
   * Get logs for a specific operation
   */
  getOperationLogs(operation: string): OperationLog[] {
    return this.logs.filter(log => log.operation === operation)
  }

  /**
   * Calculate reliability metrics
   */
  calculateMetrics(): ReliabilityMetrics {
    const totalOps = this.logs.length
    const failedOps = this.logs.filter(log => !log.success).length
    const totalRetries = this.logs.reduce((sum, log) => sum + log.retryCount, 0)
    const avgLatency = this.logs.reduce((sum, log) => sum + log.duration, 0) / totalOps

    // Calculate reliability score (0-100)
    const successRate = (totalOps - failedOps) / totalOps
    const retryPenalty = Math.min(totalRetries / totalOps * 10, 30) // Max 30 point penalty
    const latencyScore = Math.max(0, 100 - (avgLatency / 1000) * 10) // Penalty for high latency
    const reliabilityScore = Math.max(0, successRate * 100 - retryPenalty + latencyScore) / 2

    return {
      totalOperations: totalOps,
      failedOperations: failedOps,
      retryCount: totalRetries,
      staleReads: 0, // Will be calculated by invariant checker
      raceConditions: 0, // Will be calculated by invariant checker
      invariantViolations: [], // Will be populated by invariant checker
      averageLatency: avgLatency,
      reliabilityScore: Math.round(reliabilityScore)
    }
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = []
    this.operationCounter = 0
  }

  /**
   * Generate detailed reliability report
   */
  generateReport(): string {
    const metrics = this.calculateMetrics()
    const failedOperations = this.logs.filter(log => !log.success)
    const slowOperations = this.logs.filter(log => log.duration > 5000) // > 5s

    let report = `
Reliability Report
==================

Overall Metrics:
- Total Operations: ${metrics.totalOperations}
- Failed Operations: ${metrics.failedOperations}
- Success Rate: ${((metrics.totalOperations - metrics.failedOperations) / metrics.totalOperations * 100).toFixed(1)}%
- Average Latency: ${metrics.averageLatency.toFixed(0)}ms
- Reliability Score: ${metrics.reliabilityScore}/100

`

    if (failedOperations.length > 0) {
      report += `
Failed Operations:
${failedOperations.map(op => `- ${op.operation}: ${op.error} (attempt ${op.retryCount + 1})`).join('\n')}

`
    }

    if (slowOperations.length > 0) {
      report += `
Slow Operations (>5s):
${slowOperations.map(op => `- ${op.operation}: ${op.duration.toFixed(0)}ms`).join('\n')}

`
    }

    return report
  }
}

/**
 * Concurrent worker runner for stress testing
 */
export class ConcurrentWorker {
  /**
   * Run multiple workers concurrently with controlled timing
   */
  static async runConcurrent<T>(
    workers: Array<{
      id: string
      work: () => Promise<T>
      delay?: number
    }>,
    options: {
      maxConcurrency?: number
      jitter?: boolean
    } = {}
  ): Promise<Array<{ id: string; result: T; duration: number }>> {
    const { maxConcurrency = Infinity, jitter = true } = options
    const results: Array<{ id: string; result: T; duration: number }> = []
    
    // Create semaphore for concurrency control
    const semaphore = new Semaphore(maxConcurrency)
    
    const promises = workers.map(async (worker) => {
      await semaphore.acquire()
      
      try {
        // Add jitter if enabled
        if (jitter && worker.delay) {
          const jitterAmount = Math.random() * worker.delay * 0.5
          await new Promise(resolve => setTimeout(resolve, worker.delay! + jitterAmount))
        } else if (worker.delay) {
          await new Promise(resolve => setTimeout(resolve, worker.delay))
        }
        
        const start = Date.now()
        const result = await worker.work()
        const duration = Date.now() - start
        
        return { id: worker.id, result, duration }
      } finally {
        semaphore.release()
      }
    })
    
    const settled = await Promise.allSettled(promises)
    
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value)
      }
    }
    
    return results
  }
}

/**
 * Simple semaphore for concurrency control
 */
class Semaphore {
  private permits: number
  private waiters: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--
      return
    }

    return new Promise(resolve => {
      this.waiters.push(resolve)
    })
  }

  release(): void {
    this.permits++
    if (this.waiters.length > 0) {
      const resolve = this.waiters.shift()!
      this.permits--
      resolve()
    }
  }
}

/**
 * Trace summarizer for analyzing execution patterns
 */
export class TraceSummarizer {
  /**
   * Analyze operation traces for patterns and anomalies
   */
  static analyzeTraces(logs: OperationLog[]): {
    patterns: string[]
    anomalies: string[]
    recommendations: string[]
  } {
    const patterns: string[] = []
    const anomalies: string[] = []
    const recommendations: string[] = []

    // Analyze retry patterns
    const retries = logs.filter(log => log.retryCount > 0)
    if (retries.length > 0) {
      const avgRetries = retries.reduce((sum, log) => sum + log.retryCount, 0) / retries.length
      patterns.push(`Average retry count: ${avgRetries.toFixed(1)}`)
      
      if (avgRetries > 2) {
        anomalies.push('High retry rate detected')
        recommendations.push('Implement circuit breaker pattern')
      }
    }

    // Analyze failure patterns
    const failures = logs.filter(log => !log.success)
    if (failures.length > 0) {
      const failureRate = failures.length / logs.length
      patterns.push(`Failure rate: ${(failureRate * 100).toFixed(1)}%`)
      
      if (failureRate > 0.1) {
        anomalies.push('High failure rate detected')
        recommendations.push('Review error handling and retry logic')
      }
    }

    // Analyze latency patterns
    const latencies = logs.map(log => log.duration)
    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length
    patterns.push(`Average latency: ${avgLatency.toFixed(0)}ms`)
    
    if (avgLatency > 5000) {
      anomalies.push('High average latency')
      recommendations.push('Optimize API calls and implement caching')
    }

    return { patterns, anomalies, recommendations }
  }
}
