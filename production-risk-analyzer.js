const EngineeringHarness = require('./engineering-harness');

class ProductionRiskAnalyzer {
  constructor(token) {
    this.token = token;
    this.riskAssessments = [];
    this.topRisks = [];
  }

  // ============ RISK SCORING SYSTEM ============
  
  calculateRiskScore(failure, impact, likelihood) {
    // Risk Score = Impact × Likelihood × Severity Multiplier
    const severityMultipliers = {
      'CRITICAL': 3.0,
      'HIGH': 2.0,
      'MEDIUM': 1.5,
      'LOW': 1.0
    };
    
    const multiplier = severityMultipliers[impact.severity] || 1.0;
    const baseScore = (impact.businessImpact + impact.technicalImpact) * likelihood;
    
    return {
      score: Math.round(baseScore * multiplier),
      level: this.getRiskLevel(baseScore * multiplier),
      components: {
        businessImpact: impact.businessImpact,
        technicalImpact: impact.technicalImpact,
        likelihood,
        severity: impact.severity,
        multiplier
      }
    };
  }

  getRiskLevel(score) {
    if (score >= 80) return 'CRITICAL';
    if (score >= 60) return 'HIGH';
    if (score >= 40) return 'MEDIUM';
    if (score >= 20) return 'LOW';
    return 'MINIMAL';
  }

  // ============ PRODUCTION RISK SCENARIOS ============
  
  async analyzeRetryStormRisk() {
    console.log('\n🔁 PRODUCTION RISK: Retry Storm');
    console.log('Analyzing: What happens if retry logic creates duplicates in production?');
    
    const agent = new EngineeringHarness(this.token, 'Risk-Analyzer');
    agent.setScenario('retry_storm');
    
    try {
      // Simulate production scenario
      const repo = await agent.createRepository('production-risk-retry');
      await agent.createBranch('octocat', repo.name, 'feature-branch');
      
      // Simulate retry storm creating duplicate PRs
      let createdPRs = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Bypass failure injection for analysis
          const pr = await agent.makeRequest('POST', `/repos/octocat/${repo.name}/pulls`, {
            title: `Production Risk PR #${attempt}`,
            head: 'feature-branch',
            body: `This PR created on attempt ${attempt}`
          });
          createdPRs.push(pr.data.number);
          console.log(`✅ Created PR #${pr.data.number} on attempt ${attempt}`);
        } catch (error) {
          console.log(`❌ Attempt ${attempt} failed: ${error.message}`);
        }
      }
      
      // PRODUCTION IMPACT ANALYSIS
      const impact = {
        description: 'Duplicate PR creation due to non-idempotent retry logic',
        businessImpact: 70, // High business impact
        technicalImpact: 60, // High technical impact
        severity: 'HIGH',
        productionConsequences: [
          'Duplicate CI/CD pipeline triggers',
          'Multiple deployment attempts for same change',
          'Resource waste and confusion',
          'Potential for conflicting deployments',
          'Alert fatigue from duplicate notifications'
        ],
        realWorldDamage: {
          immediate: 'Wasted compute resources and developer time',
          shortTerm: 'Confusing deployment history and rollbacks',
          longTerm: 'Eroded trust in automation systems'
        }
      };
      
      const likelihood = createdPRs.length > 1 ? 0.8 : 0.2; // High likelihood if duplicates
      const riskScore = this.calculateRiskScore('retry_storm', impact, likelihood);
      
      const assessment = {
        scenario: 'Retry Storm',
        failure: 'Non-idempotent retry logic creates duplicate PRs',
        riskScore,
        productionConsequences: impact.productionConsequences,
        realWorldDamage: impact.realWorldDamage,
        mitigation: [
          'Implement idempotency keys for all write operations',
          'Check for existing resources before retry',
          'Use deduplication logic in retry mechanisms',
          'Add monitoring for duplicate operations'
        ]
      };
      
      this.riskAssessments.push(assessment);
      return assessment;
      
    } catch (error) {
      console.log('Retry storm risk analysis failed:', error.message);
      return { error: error.message };
    }
  }

  async analyzeStaleStateRisk() {
    console.log('\n🗄️ PRODUCTION RISK: Stale State Execution');
    console.log('Analyzing: What happens if agent acts on outdated data?');
    
    const agent = new EngineeringHarness(this.token, 'Risk-Analyzer');
    agent.setScenario('stale_cache');
    
    try {
      const repo = await agent.createRepository('production-risk-stale');
      const branchName = 'feature-stale-branch';
      await agent.createBranch('octocat', repo.name, branchName);
      await agent.createFile('octocat', repo.name, 'critical-config.txt', 
        'production=true', branchName);
      
      // Create PR
      const pr = await agent.createPullRequest('octocat', repo.name, 
        'Critical Production PR', branchName);
      
      console.log(`Created PR #${pr.number} for stale state analysis`);
      
      // Simulate external mutation (PR gets closed)
      await new Promise(resolve => setTimeout(resolve, 1000));
      await agent.makeRequest('PATCH', `/repos/octocat/${repo.name}/pulls/${pr.number}`, {
        state: 'closed'
      });
      
      // Agent proceeds with stale data (thinks PR is still open)
      console.log('Agent proceeding with stale data (thinks PR is open)...');
      
      try {
        const mergeResult = await agent.mergePullRequest('octocat', repo.name, pr.number);
        
        const impact = {
          description: 'Agent merged closed PR based on stale cached data',
          businessImpact: 85, // Critical business impact
          technicalImpact: 80, // Critical technical impact
          severity: 'CRITICAL',
          productionConsequences: [
            'Merged changes that should not have been merged',
            'Bypassed code review and approval processes',
            'Potential introduction of conflicting or untested code',
            'Silent corruption of production codebase',
            'Loss of audit trail and change management'
          ],
          realWorldDamage: {
            immediate: 'Unauthorized code merged to production',
            shortTerm: 'Production incidents and emergency rollbacks',
            longTerm: 'Security vulnerabilities and compliance violations'
          }
        };
        
        const riskScore = this.calculateRiskScore('stale_state', impact, 0.9); // Very high likelihood
        
        const assessment = {
          scenario: 'Stale State Execution',
          failure: 'Agent acted on stale data, merged closed PR',
          riskScore,
          productionConsequences: impact.productionConsequences,
          realWorldDamage: impact.realWorldDamage,
          mitigation: [
            'Always validate current state before critical operations',
            'Implement real-time state checking',
            'Add invariant validation before merges',
            'Use source-of-truth validation, not cached data'
          ]
        };
        
        this.riskAssessments.push(assessment);
        return assessment;
        
      } catch (error) {
        console.log('Merge failed as expected:', error.message);
        return { scenario: 'stale_state', prevented: true };
      }
      
    } catch (error) {
      console.log('Stale state risk analysis failed:', error.message);
      return { error: error.message };
    }
  }

  async analyzePermissionDriftRisk() {
    console.log('\n🔐 PRODUCTION RISK: Permission Drift');
    console.log('Analyzing: What happens if agent continues with revoked permissions?');
    
    const agent = new EngineeringHarness(this.token, 'Risk-Analyzer');
    agent.setScenario('permission_drift');
    
    try {
      // Agent starts with valid permissions
      const repo = await agent.createRepository('production-risk-perms');
      const branchName = 'feature-perms-branch';
      await agent.createBranch('octocat', repo.name, branchName);
      
      console.log('✅ Agent has write permissions initially');
      
      // Simulate permission revocation (step 3+)
      console.log('🚨 SIMULATING: Agent permissions revoked mid-execution');
      
      try {
        await agent.createFile('octocat', repo.name, 'sensitive-data.txt', 
          'secret-api-key=abc123', branchName);
        
        const impact = {
          description: 'Agent continued operations after permission revocation',
          businessImpact: 95, // Critical business impact
          technicalImpact: 90, // Critical technical impact
          severity: 'CRITICAL',
          productionConsequences: [
            'Unauthorized modifications to production resources',
            'Potential data exposure or corruption',
            'Security policy violations',
            'Compliance and audit failures',
            'Silent security breaches'
          ],
          realWorldDamage: {
            immediate: 'Security breach and data exposure',
            shortTerm: 'Emergency incident response and forensics',
            longTerm: 'Legal liability and loss of customer trust'
          }
        };
        
        const riskScore = this.calculateRiskScore('permission_drift', impact, 0.7); // High likelihood
        
        const assessment = {
          scenario: 'Permission Drift',
          failure: 'Agent operated with revoked permissions',
          riskScore,
          productionConsequences: impact.productionConsequences,
          realWorldDamage: impact.realWorldDamage,
          mitigation: [
            'Validate permissions before every operation',
            'Implement real-time permission checking',
            'Add immediate failure on permission errors',
            'Use short-lived tokens with automatic refresh'
          ]
        };
        
        this.riskAssessments.push(assessment);
        return assessment;
        
      } catch (error) {
        if (error.message.includes('403')) {
          console.log('✅ Permission error correctly blocked unauthorized operation');
          
          const impact = {
            description: 'Permission error prevented unauthorized action',
            businessImpact: 10, // Low business impact (good thing)
            technicalImpact: 5, // Low technical impact (good thing)
            severity: 'LOW',
            productionConsequences: [
              'Operation safely blocked',
              'Security policy enforced',
              'No unauthorized changes made'
            ],
            realWorldDamage: {
              immediate: 'None - security incident prevented',
              shortTerm: 'None - system integrity maintained',
              longTerm: 'None - trust in security controls maintained'
            }
          };
          
          const riskScore = this.calculateRiskScore('permission_drift_blocked', impact, 0.1); // Low likelihood
          
          const assessment = {
            scenario: 'Permission Drift (Blocked)',
            failure: 'Permission error correctly prevented unauthorized action',
            riskScore,
            productionConsequences: impact.productionConsequences,
            realWorldDamage: impact.realWorldDamage,
            mitigation: [
              'Maintain current permission validation',
              'Continue using real-time permission checks',
              'Monitor permission changes in production'
            ]
          };
          
          this.riskAssessments.push(assessment);
          return assessment;
        } else {
          throw error;
        }
      }
      
    } catch (error) {
      console.log('Permission drift risk analysis failed:', error.message);
      return { error: error.message };
    }
  }

  async analyzeRaceConditionRisk() {
    console.log('\n🏁 PRODUCTION RISK: Race Condition');
    console.log('Analyzing: What happens when multiple agents compete for same resources?');
    
    const agent1 = new EngineeringHarness(this.token, 'Risk-Analyzer-1');
    const agent2 = new EngineeringHarness(this.token, 'Risk-Analyzer-2');
    
    try {
      // Both agents try to work on same resource
      const repo = await agent1.createRepository('production-risk-race');
      const branchName = 'race-condition-branch';
      
      // Both create branches
      const branch1Promise = agent1.createBranch('octocat', repo.name, `${branchName}-1`);
      const branch2Promise = agent2.createBranch('octocat', repo.name, `${branchName}-2`);
      
      await Promise.all([branch1Promise, branch2Promise]);
      console.log('✅ Both agents created branches');
      
      // Both try to create PRs to same base
      const pr1Promise = agent1.createPullRequest('octocat', repo.name, 
        'Race Condition PR 1', `${branchName}-1`);
      const pr2Promise = agent2.createPullRequest('octocat', repo.name, 
        'Race Condition PR 2', `${branchName}-2`);
      
      const [pr1, pr2] = await Promise.all([pr1Promise, pr2Promise]);
      console.log(`✅ Created PRs: #${pr1.number} and #${pr2.number}`);
      
      // Simulate race: One agent merges while other is still working
      const merge1Promise = agent1.mergePullRequest('octocat', repo.name, pr1.number);
      
      // Small delay to create race condition
      await new Promise(resolve => setTimeout(resolve, 200));
      
      try {
        const merge2Result = await agent2.mergePullRequest('octocat', repo.name, pr2.number);
        
        const impact = {
          description: 'Concurrent agents created conflicting changes',
          businessImpact: 65, // High business impact
          technicalImpact: 70, // High technical impact
          severity: 'HIGH',
          productionConsequences: [
            'Conflicting changes merged to production',
            'Branch conflicts and code corruption',
            'Lost work due to overwrite conflicts',
            'Inconsistent production state',
            'Difficult to rollback or identify issues'
          ],
          realWorldDamage: {
            immediate: 'Production corruption from conflicting merges',
            shortTerm: 'Emergency debugging and manual conflict resolution',
            longTerm: 'Data integrity issues and system instability'
          }
        };
        
        const riskScore = this.calculateRiskScore('race_condition', impact, 0.6); // Medium-high likelihood
        
        const assessment = {
          scenario: 'Race Condition',
          failure: 'Concurrent agents created conflicting production state',
          riskScore,
          productionConsequences: impact.productionConsequences,
          realWorldDamage: impact.realWorldDamage,
          mitigation: [
            'Implement distributed locking mechanisms',
            'Use atomic operations for critical changes',
            'Add conflict detection and resolution',
            'Implement proper serialization for shared resources'
          ]
        };
        
        this.riskAssessments.push(assessment);
        return assessment;
        
      } catch (error) {
        console.log('Second merge failed as expected:', error.message);
        return { scenario: 'race_condition', partial_failure: true };
      }
      
    } catch (error) {
      console.log('Race condition risk analysis failed:', error.message);
      return { error: error.message };
    }
  }

  // ============ TOP PRODUCTION RISKS ANALYSIS ============
  
  generateTopRisksReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🚨 TOP PRODUCTION RISKS ANALYSIS');
    console.log('='.repeat(80));
    
    // Sort risks by score
    const sortedRisks = this.riskAssessments
      .filter(r => r.riskScore)
      .sort((a, b) => b.riskScore.score - a.riskScore.score);
    
    // Extract top risks
    this.topRisks = sortedRisks.slice(0, 5);
    
    console.log('\n🎯 CRITICAL RISKS THAT WOULD CAUSE REAL PRODUCTION DAMAGE:');
    
    this.topRisks.forEach((risk, index) => {
      console.log(`\n${index + 1}. ${risk.scenario}`);
      console.log('─'.repeat(50));
      console.log(`Risk Level: ${risk.riskScore.level} (Score: ${risk.riskScore.score})`);
      console.log(`Failure: ${risk.failure}`);
      
      console.log('\n💥 PRODUCTION CONSEQUENCES:');
      risk.productionConsequences.forEach(consequence => {
        console.log(`  • ${consequence}`);
      });
      
      console.log('\n🔥 REAL-WORLD DAMAGE:');
      const damage = risk.realWorldDamage;
      console.log(`  Immediate: ${damage.immediate}`);
      console.log(`  Short-term: ${damage.shortTerm}`);
      console.log(`  Long-term: ${damage.longTerm}`);
      
      console.log('\n🛡️  MITIGATION STRATEGIES:');
      risk.mitigation.forEach((strategy, i) => {
        console.log(`  ${i + 1}. ${strategy}`);
      });
    });
    
    return {
      summary: {
        totalRisks: this.riskAssessments.length,
        criticalRisks: this.topRisks.length,
        highestRisk: this.topRisks[0]?.riskScore.level || 'UNKNOWN',
        timestamp: new Date().toISOString()
      },
      topRisks: this.topRisks,
      allRisks: this.riskAssessments
    };
  }

  generateKillerOutput() {
    console.log('\n' + '='.repeat(80));
    console.log('🔥 PRE-PRODUCTION RISK ANALYZER - KILLER OUTPUT');
    console.log('='.repeat(80));
    
    console.log('\n🎯 ANSWERING THE CORE QUESTION:');
    console.log('"What would cause real-world damage if this ran in production?"');
    
    console.log('\n🚨 TOP PRODUCTION RISKS:');
    
    this.topRisks.forEach((risk, index) => {
      const score = risk.riskScore;
      const severity = score.level;
      const emoji = severity === 'CRITICAL' ? '🔴' : 
                   severity === 'HIGH' ? '🟠' : 
                   severity === 'MEDIUM' ? '🟡' : '🟢';
      
      console.log(`\n${emoji} RISK ${index + 1}: ${risk.scenario}`);
      console.log(`   Severity: ${severity} (Score: ${score.score})`);
      console.log(`   Failure: ${risk.failure}`);
      
      // Focus on REAL-WORLD DAMAGE
      console.log(`   🏭 PRODUCTION IMPACT:`);
      const damage = risk.realWorldDamage;
      console.log(`   → Immediate: ${damage.immediate}`);
      console.log(`   → Short-term: ${damage.shortTerm}`);
      console.log(`   → Long-term: ${damage.longTerm}`);
      
      // Business impact
      console.log(`   💰 BUSINESS RISK:`);
      console.log(`   → Impact Level: ${severity}`);
      console.log(`   → Technical Score: ${score.components.technicalImpact}`);
      console.log(`   → Business Score: ${score.components.businessImpact}`);
    });
    
    console.log('\n🎯 KEY INSIGHT:');
    console.log('These are not "test failures" - these are PRODUCTION DISASTERS waiting to happen');
    console.log('Each represents real business damage, security risks, or system corruption');
    
    console.log('\n🛡️  CRITICAL MITIGATION PATH:');
    console.log('1. Implement the mitigation strategies above');
    console.log('2. Add production monitoring for these specific risks');
    console.log('3. Create incident response playbooks for each scenario');
    console.log('4. Test mitigation in staging before production deployment');
    
    return this.topRisks;
  }

  async runCompleteRiskAnalysis() {
    console.log('🔥 PRE-PRODUCTION RISK ANALYZER');
    console.log('Transforming failure patterns into production impact assessments');
    
    try {
      // Run all risk scenarios
      await this.analyzeRetryStormRisk();
      await this.analyzeStaleStateRisk();
      await this.analyzePermissionDriftRisk();
      await this.analyzeRaceConditionRisk();
      
      // Generate comprehensive analysis
      const report = this.generateTopRisksReport();
      
      // Generate killer output
      this.generateKillerOutput();
      
      // Save comprehensive report
      const fs = require('fs');
      fs.writeFileSync('production-risk-report.json', JSON.stringify(report, null, 2));
      console.log('\n📄 Detailed production risk report saved to: production-risk-report.json');
      
      // Save killer markdown report
      const markdownReport = this.generateMarkdownReport(report);
      fs.writeFileSync('production-risk-analysis.md', markdownReport);
      console.log('📄 Production risk analysis saved to: production-risk-analysis.md');
      
      return report;
      
    } catch (error) {
      console.error('❌ Production risk analysis failed:', error.message);
      throw error;
    }
  }

  generateMarkdownReport(report) {
    let markdown = `# Production Risk Analysis Report

## Executive Summary

This analysis transforms failure scenarios into production impact assessments, answering the critical question: **"What would cause real-world damage if this ran in production?"**

## Top Production Risks

`;

    report.topRisks.forEach((risk, index) => {
      const score = risk.riskScore;
      const severity = score.level;
      
      markdown += `### ${index + 1}. ${risk.scenario} - ${severity}

**Risk Score:** ${score.score} (${severity})

**Failure Mode:** ${risk.failure}

**Production Consequences:**
`;
      risk.productionConsequences.forEach(consequence => {
        markdown += `- ${consequence}\n`;
      });
      
      markdown += `**Real-World Damage:**
- **Immediate:** ${risk.realWorldDamage.immediate}
- **Short-term:** ${risk.realWorldDamage.shortTerm}
- **Long-term:** ${risk.realWorldDamage.longTerm}

**Mitigation Strategies:**
`;
      risk.mitigation.forEach((strategy, i) => {
        markdown += `${i + 1}. ${strategy}\n`;
      });
      
      markdown += '\n---\n\n';
    });

    markdown += `## Risk Analysis Summary

- **Total Risks Analyzed:** ${report.summary.totalRisks}
- **Critical Risks Identified:** ${report.summary.criticalRisks}
- **Highest Risk Level:** ${report.summary.highestRisk}

## Key Insights

### 1. These Are NOT Test Failures - They Are Production Disasters

Each risk above represents a real production incident that would cause:
- Business damage and financial loss
- Security vulnerabilities and data exposure
- System corruption and downtime
- Compliance violations and legal risks

### 2. The Core Question Answered

**"What would cause real-world damage?"**

✅ **Retry Storm:** Duplicate deployments and resource waste
✅ **Stale State:** Unauthorized merges and security breaches  
✅ **Permission Drift:** Data exposure and compliance failures
✅ **Race Conditions:** Production corruption and system instability

### 3. Critical Mitigation Required

The analysis shows that **preventing these production disasters requires:**

1. **Idempotency Controls** - Prevent duplicate operations
2. **Real-time State Validation** - Never trust cached data
3. **Permission Enforcement** - Validate at execution time
4. **Concurrency Controls** - Prevent race conditions

## Recommendations

### Immediate Actions (High Priority)
1. **Implement Risk Mitigations** - Use the strategies above
2. **Add Production Monitoring** - Detect these patterns in real-time
3. **Create Incident Response Plans** - Have playbooks ready
4. **Test in Staging** - Validate fixes before production

### Architectural Changes
1. **Request Interception Layer** - Centralized validation and control
2. **Invariant Enforcement** - Automatically check critical invariants
3. **Circuit Breaker Patterns** - Fail fast on detected risks
4. **Audit Logging** - Track all high-risk operations

### Business Impact
- **Financial Risk:** High - Production incidents cost millions
- **Reputation Risk:** Critical - Customer trust is fragile
- **Security Risk:** Severe - Data breaches have legal consequences
- **Operational Risk:** High - System instability affects all users

## Conclusion

This production risk analysis demonstrates that **agent reliability is not a technical concern—it is a business imperative**. The risks identified would cause real damage to production systems, customer data, and business operations.

The key insight is that **preventing production disasters requires proactive risk identification and mitigation**, not just reactive error handling.

---

*Generated by Pre-Production Risk Analyzer*  
*Timestamp: ${new Date().toISOString()}*
`;

    return markdown;
  }
}

module.exports = ProductionRiskAnalyzer;
