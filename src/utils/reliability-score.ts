import { InvariantViolation, OperationLog, ReliabilityMetrics } from './reliability-helpers'

/**
 * Production-grade reliability scoring system for agent workflows
 * Provides quantitative assessment of reliability characteristics
 */

export interface ReliabilityScoreBreakdown {
  overall: number
  categories: {
    invariantCompliance: number
    retryEfficiency: number
    stateConsistency: number
    concurrencySafety: number
    errorHandling: number
  }
  penalties: {
    invariantViolations: number
    excessiveRetries: number
    staleReads: number
    raceConditions: number
    resourceLeaks: number
  }
  improvements: {
    afterFixes: number
    potentialGain: number
    recommendations: string[]
  }
}

export interface ScoringWeights {
  invariantCompliance: number
  retryEfficiency: number
  stateConsistency: number
  concurrencySafety: number
  errorHandling: number
}

export class ReliabilityScoreCalculator {
  private static readonly DEFAULT_WEIGHTS: ScoringWeights = {
    invariantCompliance: 0.30, // 30% - Critical for system integrity
    retryEfficiency: 0.20,      // 20% - Important for resilience
    stateConsistency: 0.25,     // 25% - Essential for correctness
    concurrencySafety: 0.15,    // 15% - Important for multi-agent systems
    errorHandling: 0.10         // 10% - Basic requirement
  }

  /**
   * Calculate comprehensive reliability score
   */
  static calculateScore(
    metrics: ReliabilityMetrics,
    violations: InvariantViolation[],
    logs: OperationLog[],
    weights: Partial<ScoringWeights> = {}
  ): ReliabilityScoreBreakdown {
    const finalWeights = { ...this.DEFAULT_WEIGHTS, ...weights }
    
    // Calculate individual category scores
    const categories = {
      invariantCompliance: this.calculateInvariantComplianceScore(metrics, violations),
      retryEfficiency: this.calculateRetryEfficiencyScore(metrics, logs),
      stateConsistency: this.calculateStateConsistencyScore(metrics, violations),
      concurrencySafety: this.calculateConcurrencySafetyScore(metrics, logs),
      errorHandling: this.calculateErrorHandlingScore(metrics, logs)
    }
    
    // Calculate penalties
    const penalties = {
      invariantViolations: this.calculateInvariantPenalty(violations),
      excessiveRetries: this.calculateRetryPenalty(metrics),
      staleReads: this.calculateStaleReadPenalty(metrics),
      raceConditions: this.calculateRaceConditionPenalty(violations),
      resourceLeaks: this.calculateResourceLeakPenalty(metrics)
    }
    
    // Calculate overall score
    const overall = this.calculateOverallScore(categories, finalWeights, penalties)
    
    // Calculate improvement potential
    const improvements = this.calculateImprovementPotential(overall, penalties, violations)
    
    return {
      overall,
      categories,
      penalties,
      improvements
    }
  }

  /**
   * Calculate invariant compliance score
   */
  private static calculateInvariantComplianceScore(
    metrics: ReliabilityMetrics,
    violations: InvariantViolation[]
  ): number {
    const totalViolations = violations.length
    const criticalViolations = violations.filter(v => v.severity === 'CRITICAL').length
    const highViolations = violations.filter(v => v.severity === 'HIGH').length
    
    // Base score starts at 100, subtract penalties
    let score = 100
    
    // Penalty for any violations
    score -= totalViolations * 10
    
    // Additional penalty for critical violations
    score -= criticalViolations * 20
    
    // Additional penalty for high severity violations
    score -= highViolations * 15
    
    // Ensure score doesn't go below 0
    return Math.max(0, score)
  }

  /**
   * Calculate retry efficiency score
   */
  private static calculateRetryEfficiencyScore(
    metrics: ReliabilityMetrics,
    logs: OperationLog[]
  ): number {
    const totalOperations = metrics.totalOperations
    const totalRetries = metrics.retryCount
    const failedOperations = metrics.failedOperations
    
    if (totalOperations === 0) return 100
    
    // Calculate retry efficiency
    const retryRate = totalRetries / totalOperations
    const failureRate = failedOperations / totalOperations
    
    // Base score starts at 100
    let score = 100
    
    // Penalty for high retry rate (more than 0.5 retries per operation)
    if (retryRate > 0.5) {
      score -= (retryRate - 0.5) * 50
    }
    
    // Penalty for high failure rate
    score -= failureRate * 30
    
    // Bonus for successful operations with minimal retries
    if (retryRate < 0.2 && failureRate < 0.1) {
      score += 10
    }
    
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Calculate state consistency score
   */
  private static calculateStateConsistencyScore(
    metrics: ReliabilityMetrics,
    violations: InvariantViolation[]
  ): number {
    const staleReadViolations = violations.filter(v => 
      v.invariant === 'FRESH_STATE_READS' || v.invariant === 'STATE_CONSISTENCY'
    ).length
    
    // Base score starts at 100
    let score = 100
    
    // Penalty for stale reads
    score -= staleReadViolations * 15
    
    // Penalty for general state consistency issues
    score -= metrics.staleReads * 5
    
    return Math.max(0, score)
  }

  /**
   * Calculate concurrency safety score
   */
  private static calculateConcurrencySafetyScore(
    metrics: ReliabilityMetrics,
    logs: OperationLog[]
  ): number {
    const raceConditionViolations = metrics.raceConditions
    const concurrentOperations = logs.filter(log => 
      log.metadata?.concurrent === true
    ).length
    
    // Base score starts at 100
    let score = 100
    
    // Penalty for race conditions
    score -= raceConditionViolations * 25
    
    // Penalty for unsafe concurrent operations
    if (concurrentOperations > 0) {
      const unsafeRate = raceConditionViolations / concurrentOperations
      score -= unsafeRate * 30
    }
    
    return Math.max(0, score)
  }

  /**
   * Calculate error handling score
   */
  private static calculateErrorHandlingScore(
    metrics: ReliabilityMetrics,
    logs: OperationLog[]
  ): number {
    const totalOperations = metrics.totalOperations
    const failedOperations = metrics.failedOperations
    const handledFailures = logs.filter(log => 
      !log.success && log.metadata?.handled === true
    ).length
    
    if (totalOperations === 0) return 100
    
    const failureRate = failedOperations / totalOperations
    const handlingRate = failedOperations > 0 ? handledFailures / failedOperations : 1
    
    // Base score starts at 100
    let score = 100
    
    // Penalty for high failure rate
    score -= failureRate * 20
    
    // Bonus for good error handling
    if (handlingRate > 0.8) {
      score += 10
    } else if (handlingRate < 0.5) {
      score -= 20
    }
    
    return Math.max(0, Math.min(100, score))
  }

  /**
   * Calculate overall score with weighted categories and penalties
   */
  private static calculateOverallScore(
    categories: any,
    weights: ScoringWeights,
    penalties: any
  ): number {
    // Weighted sum of category scores
    const weightedScore = 
      categories.invariantCompliance * weights.invariantCompliance +
      categories.retryEfficiency * weights.retryEfficiency +
      categories.stateConsistency * weights.stateConsistency +
      categories.concurrencySafety * weights.concurrencySafety +
      categories.errorHandling * weights.errorHandling
    
    // Apply penalties
    const totalPenalty = Object.values(penalties).reduce((sum: number, penalty: number) => sum + penalty, 0)
    
    return Math.max(0, Math.min(100, weightedScore - totalPenalty))
  }

  /**
   * Calculate individual penalties
   */
  private static calculateInvariantPenalty(violations: InvariantViolation[]): number {
    const criticalCount = violations.filter(v => v.severity === 'CRITICAL').length
    const highCount = violations.filter(v => v.severity === 'HIGH').length
    return (criticalCount * 10) + (highCount * 5)
  }

  private static calculateRetryPenalty(metrics: ReliabilityMetrics): number {
    const retryRate = metrics.retryCount / Math.max(metrics.totalOperations, 1)
    return Math.min(retryRate * 20, 15) // Cap at 15 points
  }

  private static calculateStaleReadPenalty(metrics: ReliabilityMetrics): number {
    return Math.min(metrics.staleReads * 3, 10) // Cap at 10 points
  }

  private static calculateRaceConditionPenalty(violations: InvariantViolation[]): number {
    const raceViolations = violations.filter(v => v.invariant === 'NO_RACE_CONDITIONS').length
    return raceViolations * 8
  }

  private static calculateResourceLeakPenalty(metrics: ReliabilityMetrics): number {
    // This would be calculated based on resource leak detection
    return 0 // Placeholder
  }

  /**
   * Calculate improvement potential
   */
  private static calculateImprovementPotential(
    currentScore: number,
    penalties: any,
    violations: InvariantViolation[]
  ): any {
    const totalPenalty = Object.values(penalties).reduce((sum: number, penalty: number) => sum + penalty, 0)
    const potentialScore = Math.min(100, currentScore + totalPenalty)
    const potentialGain = potentialScore - currentScore
    
    const recommendations = this.generateRecommendations(violations, penalties)
    
    return {
      afterFixes: potentialScore,
      potentialGain,
      recommendations
    }
  }

  /**
   * Generate improvement recommendations
   */
  private static generateRecommendations(
    violations: InvariantViolation[],
    penalties: any
  ): string[] {
    const recommendations: string[] = []
    
    // Invariant violation recommendations
    if (violations.some(v => v.invariant === 'NO_DUPLICATE_RESOURCES')) {
      recommendations.push('Add idempotency keys to prevent duplicate resource creation')
    }
    
    if (violations.some(v => v.invariant === 'FRESH_STATE_READS')) {
      recommendations.push('Implement cache invalidation and real-time state validation')
    }
    
    if (violations.some(v => v.invariant === 'NO_RACE_CONDITIONS')) {
      recommendations.push('Add distributed locking and serialization for concurrent operations')
    }
    
    if (violations.some(v => v.invariant === 'PERMISSION_CONSISTENCY')) {
      recommendations.push('Implement permission validation before each operation')
    }
    
    // Retry-related recommendations
    if (penalties.excessiveRetries > 5) {
      recommendations.push('Implement exponential backoff and circuit breaker patterns')
    }
    
    // General recommendations
    if (violations.filter(v => v.severity === 'CRITICAL').length > 0) {
      recommendations.push('Address critical invariant violations immediately')
    }
    
    return recommendations
  }

  /**
   * Generate reliability score report
   */
  static generateScoreReport(score: ReliabilityScoreBreakdown): string {
    let report = `
Reliability Score Report
======================

Overall Score: ${score.overall}/100

Category Breakdown:
- Invariant Compliance: ${score.categories.invariantCompliance}/100 (30% weight)
- Retry Efficiency: ${score.categories.retryEfficiency}/100 (20% weight)
- State Consistency: ${score.categories.stateConsistency}/100 (25% weight)
- Concurrency Safety: ${score.categories.concurrencySafety}/100 (15% weight)
- Error Handling: ${score.categories.errorHandling}/100 (10% weight)

Penalties Applied:
- Invariant Violations: -${score.penalties.invariantViolations} points
- Excessive Retries: -${score.penalties.excessiveRetries} points
- Stale Reads: -${score.penalties.staleReads} points
- Race Conditions: -${score.penalties.raceConditions} points
- Resource Leaks: -${score.penalties.resourceLeaks} points

Improvement Potential:
- Score after fixes: ${score.improvements.afterFixes}/100
- Potential improvement: +${score.improvements.potentialGain} points

Recommendations:
`

    score.improvements.recommendations.forEach((rec, index) => {
      report += `${index + 1}. ${rec}\n`
    })

    // Add grade assessment
    const grade = this.getReliabilityGrade(score.overall)
    report += `
Reliability Grade: ${grade.letter} (${grade.description})
`

    return report
  }

  /**
   * Get reliability grade based on score
   */
  private static getReliabilityGrade(score: number): { letter: string; description: string } {
    if (score >= 90) return { letter: 'A+', description: 'Excellent - Production Ready' }
    if (score >= 80) return { letter: 'A', description: 'Very Good - High Reliability' }
    if (score >= 70) return { letter: 'B', description: 'Good - Acceptable Reliability' }
    if (score >= 60) return { letter: 'C', description: 'Fair - Needs Improvement' }
    if (score >= 50) return { letter: 'D', description: 'Poor - Significant Issues' }
    return { letter: 'F', description: 'Fail - Not Production Ready' }
  }

  /**
   * Compare two reliability scores
   */
  static compareScores(
    before: ReliabilityScoreBreakdown,
    after: ReliabilityScoreBreakdown
  ): string {
    const improvement = after.overall - before.overall
    const improvementPercent = ((improvement / before.overall) * 100).toFixed(1)
    
    let comparison = `
Reliability Score Comparison
===========================

Before: ${before.overall}/100
After:  ${after.overall}/100
Improvement: +${improvement} points (${improvementPercent}%)

Category Improvements:
`

    Object.keys(before.categories).forEach(category => {
      const beforeScore = before.categories[category as keyof typeof before.categories]
      const afterScore = after.categories[category as keyof typeof after.categories]
      const categoryImprovement = afterScore - beforeScore
      
      comparison += `- ${category}: ${beforeScore} → ${afterScore} (${categoryImprovement >= 0 ? '+' : ''}${categoryImprovement})\n`
    })

    comparison += `
Overall Assessment: ${improvement > 0 ? 'Improved' : 'No Change'}
`

    return comparison
  }
}
