const HighImpactScenarios = require('./high-impact-scenarios');

// Get Archal token from environment
const token = process.env.ARCHAL_TOKEN;

if (!token) {
  console.error('❌ Error: ARCHAL_TOKEN environment variable not set');
  console.log('Please run: export ARCHAL_TOKEN=your_token_here');
  process.exit(1);
}

async function main() {
  console.log('🔬 ENGINEERING INSIGHTS SUITE');
  console.log('Exposing hidden assumptions in agent workflows');
  console.log('4 High-Impact Scenarios with Deterministic Failure Injection');
  console.log('Comparative Analysis: Naive Agent vs Resilient Agent');
  
  const scenarios = new HighImpactScenarios(token);
  
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 STARTING HIGH-IMPACT SCENARIOS');
    console.log('='.repeat(80));
    
    // Scenario 1: Concurrency / Race Conditions
    console.log('\n🧵 EXECUTING SCENARIO 1: Concurrency / Race Conditions');
    await scenarios.testConcurrencyRaceConditions();
    
    // Scenario 2: Retry Storm + Partial Failure
    console.log('\n🔁 EXECUTING SCENARIO 2: Retry Storm + Partial Failure');
    await scenarios.testRetryStorm();
    
    // Scenario 3: Stale Cache vs Source of Truth
    console.log('\n🗄️ EXECUTING SCENARIO 3: Stale Cache vs Source of Truth');
    await scenarios.testStaleCache();
    
    // Scenario 4: Permission Drift Mid-Execution
    console.log('\n🔐 EXECUTING SCENARIO 4: Permission Drift Mid-Execution');
    await scenarios.testPermissionDrift();
    
    // Generate comprehensive engineering insights report
    const report = scenarios.generateEngineeringReport();
    
    // Save detailed report
    const fs = require('fs');
    fs.writeFileSync('engineering-insights-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Engineering insights report saved to: engineering-insights-report.json');
    
    // Create summary markdown report
    const markdownReport = generateMarkdownReport(report);
    fs.writeFileSync('engineering-insights.md', markdownReport);
    console.log('📄 Markdown report saved to: engineering-insights.md');
    
  } catch (error) {
    console.error('❌ Engineering insights suite failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
  
  console.log('\n✅ ENGINEERING INSIGHTS SUITE COMPLETED!');
  console.log('🔬 Successfully exposed hidden agent workflow assumptions');
  console.log('📊 Comparative analysis demonstrates resilience patterns');
  console.log('🎯 Engineering insights provide actionable fixes');
}

function generateMarkdownReport(report) {
  let markdown = `# Engineering Insights Report

## Executive Summary

This report exposes hidden assumptions in agent workflows through 4 high-impact scenarios with deterministic failure injection. We compare naive agent behavior against resilient agent patterns to identify critical failure points and provide actionable fixes.

## Scenario Analysis

`;

  report.scenarios.forEach((scenario, index) => {
    markdown += `### Scenario ${index + 1}: ${scenario.scenario}

**Invariant:** ${scenario.expected}

**Results:**
- **Naive Agent:** ${scenario.observed.includes('Naive: ') ? scenario.observed.split(' | ')[0].replace('Naive: ', '') : 'Unknown behavior'}
- **Resilient Agent:** ${scenario.observed.includes('Resilient: ') ? scenario.observed.split(' | ')[1].replace('Resilient: ', '') : 'Unknown behavior'}

**Failure Point:** ${scenario.failurePoint}

**Hypothesis:** ${scenario.hypothesis}

**Fix:** ${scenario.fix}

---

`;
  });

  markdown += `## Comparative Analysis

| Scenario | Naive Agent | Resilient Agent | Status |
|-----------|---------------|------------------|---------|
`;

  report.scenarios.forEach(scenario => {
    const naiveStatus = scenario.observed.includes('Naive: ') ? 
      scenario.observed.split(' | ')[0].replace('Naive: ', '') : 'Unknown';
    const resilientStatus = scenario.observed.includes('Resilient: ') ? 
      scenario.observed.split(' | ')[1].replace('Resilient: ', '') : 'Unknown';
    
    markdown += `| ${scenario.scenario} | ${naiveStatus} | ${resilientStatus} | ${resilientStatus.includes('blocked') || resilientStatus.includes('validation') ? '✅ Better' : '⚠️ Similar'} |\n`;
  });

  markdown += `

## Key Engineering Insights

### 1. State Validation is NOT Optional
- **Finding:** Agents that skip state validation create catastrophic failures
- **Impact:** Merging closed PRs, acting on stale data
- **Solution:** Always validate current state before critical operations

### 2. Idempotency is Essential for Retry Logic
- **Finding:** Retries without idempotency create duplicate side effects
- **Impact:** Multiple PRs, resource conflicts
- **Solution:** Add idempotency keys and pre-checks

### 3. Permission Assumptions Create Security Vulnerabilities
- **Finding:** Agents that assume permissions persist create security risks
- **Impact:** Unauthorized operations, data exposure
- **Solution:** Validate permissions at execution time

### 4. Race Conditions are Inevitable
- **Finding:** Concurrent operations will eventually conflict
- **Impact:** Data corruption, inconsistent state
- **Solution:** Implement proper locking and validation

### 5. Caching Without Invalidation is Dangerous
- **Finding:** Stale cache data leads to wrong decisions
- **Impact:** Acting on outdated information
- **Solution:** Always validate against source of truth

## Recommendations

### Immediate Actions
1. **Add State Validation Layer** - Validate PR state before merges
2. **Implement Idempotency Keys** - Prevent duplicate operations
3. **Permission Check Before Each Operation** - Don't assume access persists
4. **Add Retry Logic with Backoff** - Handle transient failures gracefully

### Architectural Changes
1. **Request Interceptor Pattern** - Centralized failure injection and validation
2. **Response Validation Layer** - Verify invariants after mutations
3. **Deterministic Testing** - Reproducible failure scenarios
4. **Comparative Agent Testing** - Naive vs Resilient patterns

### Long-term Strategy
1. **Formalize Invariants** - Document and test critical invariants
2. **Automated Failure Testing** - Integrate into CI/CD pipeline
3. **Monitoring and Alerting** - Detect invariant violations in production
4. **Resilience Metrics** - Track recovery rates and MTTR

## Conclusion

This analysis demonstrates that building resilient agents requires more than just error handling - it requires understanding and validating system invariants. The 4 scenarios tested reveal common failure patterns and provide concrete solutions for building more reliable agent workflows.

The key insight is that **agents must assume the system state can change at any time** and validate accordingly. This shift from assuming consistency to validating consistency is fundamental to building robust distributed systems.

---

*Generated by Agent Failure Simulator Engineering Insights Suite*  
*Timestamp: ${new Date().toISOString()}*
`;

  return markdown;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, generateMarkdownReport };
