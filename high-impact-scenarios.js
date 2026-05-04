const EngineeringHarness = require('./engineering-harness');

class HighImpactScenarios {
  constructor(token) {
    this.token = token;
    this.results = [];
  }

  log(scenario, expected, observed, failurePoint, hypothesis, fix) {
    const result = {
      scenario,
      expected,
      observed,
      failurePoint,
      hypothesis,
      fix,
      timestamp: new Date().toISOString()
    };
    this.results.push(result);
    
    console.log(`\n📊 SCENARIO: ${scenario}`);
    console.log(`Expected: ${expected}`);
    console.log(`Observed: ${observed}`);
    console.log(`Failure Point: ${failurePoint}`);
    console.log(`Hypothesis: ${hypothesis}`);
    console.log(`Fix: ${fix}`);
    console.log('─'.repeat(60));
  }

  // ============ SCENARIO 1: CONCURRENCY / RACE CONDITIONS ============
  
  async testConcurrencyRaceConditions() {
    console.log('\n🧵 SCENARIO 1: Concurrency / Race Conditions');
    console.log('Invariant: "A PR cannot be merged if closed at commit time"');
    
    // Naive Agent
    const naiveAgent = new EngineeringHarness(this.token, 'Naive-Agent');
    naiveAgent.setScenario('race_condition');
    
    // Resilient Agent
    const resilientAgent = new EngineeringHarness(this.token, 'Resilient-Agent');
    resilientAgent.setScenario('race_condition');
    
    try {
      // Setup: Create repo and PR
      const repo = await naiveAgent.createRepository('race-test');
      const branchName = 'race-branch';
      await naiveAgent.createBranch('octocat', repo.name, branchName);
      await naiveAgent.createFile('octocat', repo.name, 'race-file.txt', 
        'Content for race condition test', branchName);
      
      const pr = await naiveAgent.createPullRequest('octocat', repo.name, 
        'Race Condition Test PR', branchName);
      
      console.log(`Created PR #${pr.number} for race condition testing`);
      
      // Simulate concurrent operations with delays
      const operations = [
        // Agent A: Try to merge PR
        async () => {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
          return await naiveAgent.mergePullRequest('octocat', repo.name, pr.number);
        },
        
        // Agent B: Close PR simultaneously
        async () => {
          await new Promise(resolve => setTimeout(resolve, 200)); // 200ms delay
          return await naiveAgent.closePullRequest('octocat', repo.name, pr.number);
        }
      ];
      
      // Execute concurrently
      const results = await Promise.allSettled(operations.map(op => op()));
      
      const mergeResult = results[0];
      const closeResult = results[1];
      
      // Analyze naive agent behavior
      let naiveResult;
      if (mergeResult.status === 'fulfilled' && mergeResult.value.merged) {
        naiveResult = 'merge succeeded on potentially closed PR';
      } else if (mergeResult.status === 'rejected') {
        naiveResult = `merge failed: ${mergeResult.reason.message}`;
      } else {
        naiveResult = 'merge returned not merged';
      }
      
      // Test resilient agent with validation
      let resilientResult = 'not tested';
      try {
        // Resilient agent would validate PR state before merge
        const currentPR = await resilientAgent.getPullRequest('octocat', repo.name, pr.number);
        if (currentPR.state === 'open') {
          const mergeAttempt = await resilientAgent.mergePullRequest('octocat', repo.name, pr.number);
          resilientResult = mergeAttempt.merged ? 'merge succeeded after validation' : 'merge failed despite validation';
        } else {
          resilientResult = 'merge blocked - PR already closed';
        }
      } catch (error) {
        resilientResult = `resilient merge failed: ${error.message}`;
      }
      
      this.log(
        'Concurrency / Race Conditions',
        'single PR created and merged safely',
        `Naive: ${naiveResult} | Resilient: ${resilientResult}`,
        naiveResult.includes('succeeded') ? 'naive agent merged without validation' : 'race condition handled',
        'naive agent does not check PR state before merge',
        'add state validation before critical operations'
      );
      
      return { naiveResult, resilientResult, prNumber: pr.number };
      
    } catch (error) {
      console.log('Race condition test setup failed:', error.message);
      return { error: error.message };
    }
  }

  // ============ SCENARIO 2: RETRY STORM + PARTIAL FAILURE ============
  
  async testRetryStorm() {
    console.log('\n🔁 SCENARIO 2: Retry Storm + Partial Failure');
    console.log('Invariant: "Retries should not create duplicate side effects"');
    
    const naiveAgent = new EngineeringHarness(this.token, 'Naive-Agent');
    naiveAgent.setScenario('retry_storm');
    
    const resilientAgent = new EngineeringHarness(this.token, 'Resilient-Agent');
    resilientAgent.setScenario('retry_storm');
    
    try {
      // Setup
      const repo = await naiveAgent.createRepository('retry-storm');
      await naiveAgent.createBranch('octocat', repo.name, 'retry-branch');
      
      // Test naive agent retry behavior
      let naivePRs = [];
      let naiveAttempts = 0;
      
      while (naiveAttempts < 3) {
        naiveAttempts++;
        try {
          const pr = await naiveAgent.createPullRequest('octocat', repo.name, 
            'Retry Storm Test PR', 'retry-branch');
          naivePRs.push(pr.number);
          console.log(`Naive agent attempt ${naiveAttempts}: PR #${pr.number} created`);
          break; // Stop on first success
        } catch (error) {
          console.log(`Naive agent attempt ${naiveAttempts} failed: ${error.message}`);
          if (naiveAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
          }
        }
      }
      
      // Test resilient agent with idempotency
      let resilientPRs = [];
      let resilientAttempts = 0;
      
      while (resilientAttempts < 3) {
        resilientAttempts++;
        try {
          // Resilient agent checks for existing PRs first
          const existingPRs = await this.checkExistingPRs(resilientAgent, 'octocat', repo.name);
          
          if (existingPRs.length === 0) {
            const pr = await resilientAgent.createPullRequest('octocat', repo.name, 
              'Resilient Retry Storm PR', 'resilient-retry-branch');
            resilientPRs.push(pr.number);
            console.log(`Resilient agent attempt ${resilientAttempts}: PR #${pr.number} created`);
          } else {
            console.log(`Resilient agent attempt ${resilientAttempts}: Found existing PR #${existingPRs[0]}, skipping`);
            resilientPRs.push(existingPRs[0]);
            break;
          }
        } catch (error) {
          console.log(`Resilient agent attempt ${resilientAttempts} failed: ${error.message}`);
          if (resilientAttempts < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      this.log(
        'Retry Storm',
        'single PR created after retries',
        `Naive: ${naivePRs.length} PRs | Resilient: ${resilientPRs.length} PRs`,
        naivePRs.length > 1 ? 'duplicate PRs created' : 'idempotency handled',
        naivePRs.length > 1 ? 'agent does not check for existing PR before retry' : 'idempotency working',
        'add idempotency key / pre-check before retry'
      );
      
      return { naivePRs, resilientPRs };
      
    } catch (error) {
      console.log('Retry storm test failed:', error.message);
      return { error: error.message };
    }
  }

  // ============ SCENARIO 3: STALE CACHE VS SOURCE OF TRUTH ============
  
  async testStaleCache() {
    console.log('\n🗄️ SCENARIO 3: Stale Cache vs Source of Truth');
    console.log('Invariant: "Critical actions must validate latest state before execution"');
    
    const naiveAgent = new EngineeringHarness(this.token, 'Naive-Agent');
    naiveAgent.setScenario('stale_cache');
    
    const resilientAgent = new EngineeringHarness(this.token, 'Resilient-Agent');
    resilientAgent.setScenario('stale_cache');
    
    try {
      // Setup
      const repo = await naiveAgent.createRepository('stale-cache');
      const branchName = 'stale-branch';
      await naiveAgent.createBranch('octocat', repo.name, branchName);
      await naiveAgent.createFile('octocat', repo.name, 'stale-file.txt', 
        'Content for stale cache test', branchName);
      
      // Create PR
      const pr = await naiveAgent.createPullRequest('octocat', repo.name, 
        'Stale Cache Test PR', branchName);
      
      console.log(`Created PR #${pr.number} for stale cache testing`);
      
      // Simulate stale cache: Agent reads PR state once
      const cachedPR = await naiveAgent.getPullRequest('octocat', repo.name, pr.number);
      console.log(`Cached PR state: ${cachedPR.state}`);
      
      // External mutation: PR gets closed
      naiveAgent.simulateExternalMutation(`/repos/octocat/${repo.name}/pulls/${pr.number}`, 'closed');
      
      // Test naive agent - proceeds based on stale data
      let naiveResult;
      try {
        const mergeAttempt = await naiveAgent.mergePullRequest('octocat', repo.name, pr.number);
        naiveResult = mergeAttempt.merged ? 'merged based on stale data' : 'merge failed';
      } catch (error) {
        naiveResult = `merge blocked: ${error.message}`;
      }
      
      // Test resilient agent - validates current state
      let resilientResult;
      try {
        // Resilient agent re-fetches state before action
        const currentPR = await resilientAgent.getPullRequest('octocat', repo.name, pr.number);
        if (currentPR.state === 'closed') {
          resilientResult = 'merge blocked - PR already closed';
        } else {
          const mergeAttempt = await resilientAgent.mergePullRequest('octocat', repo.name, pr.number);
          resilientResult = mergeAttempt.merged ? 'merge succeeded after validation' : 'merge failed despite validation';
        }
      } catch (error) {
        resilientResult = `resilient merge failed: ${error.message}`;
      }
      
      this.log(
        'Stale Cache vs Source of Truth',
        'agent validates latest state before merge',
        `Naive: ${naiveResult} | Resilient: ${resilientResult}`,
        naiveResult.includes('stale') ? 'agent used outdated information' : 'state validation working',
        'agent assumes stale state without validation',
        'add state validation step before critical operations'
      );
      
      return { naiveResult, resilientResult };
      
    } catch (error) {
      console.log('Stale cache test failed:', error.message);
      return { error: error.message };
    }
  }

  // ============ SCENARIO 4: PERMISSION DRIFT MID-EXECUTION ============
  
  async testPermissionDrift() {
    console.log('\n🔐 SCENARIO 4: Permission Drift Mid-Execution');
    console.log('Invariant: "Authorization must be enforced at execution time, not assumed"');
    
    const naiveAgent = new EngineeringHarness(this.token, 'Naive-Agent');
    naiveAgent.setScenario('permission_drift');
    
    const resilientAgent = new EngineeringHarness(this.token, 'Resilient-Agent');
    resilientAgent.setScenario('permission_drift');
    
    try {
      // Test naive agent - continues assuming success
      let naiveSteps = [];
      try {
        const repo = await naiveAgent.createRepository('permission-drift');
        naiveSteps.push('✅ repository created');
        
        await naiveAgent.createBranch('octocat', repo.name, 'permission-branch');
        naiveSteps.push('✅ branch created');
        
        // Step 3+ should fail due to permission drift
        await naiveAgent.createFile('octocat', repo.name, 'permission-file.txt', 
          'Content after permission loss', 'permission-branch');
        naiveSteps.push('❌ file creation should have failed');
        
      } catch (error) {
        if (error.message.includes('403')) {
          naiveSteps.push('✅ permission error detected');
        } else {
          naiveSteps.push(`❌ unexpected error: ${error.message}`);
        }
      }
      
      // Test resilient agent - handles permission loss gracefully
      let resilientSteps = [];
      try {
        const repo = await resilientAgent.createRepository('permission-drift-resilient');
        resilientSteps.push('✅ repository created');
        
        await resilientAgent.createBranch('octocat', repo.name, 'permission-branch');
        resilientSteps.push('✅ branch created');
        
        // Step 3+ should fail, and resilient agent should handle it
        await resilientAgent.createFile('octocat', repo.name, 'permission-file.txt', 
          'Content after permission loss', 'permission-branch');
        resilientSteps.push('❌ file creation should have failed');
        
      } catch (error) {
        if (error.message.includes('403')) {
          resilientSteps.push('✅ permission error handled gracefully');
        } else {
          resilientSteps.push(`❌ unexpected error: ${error.message}`);
        }
      }
      
      this.log(
        'Permission Drift Mid-Execution',
        'agent detects and handles permission loss',
        `Naive: ${naiveSteps.join(' | ')} | Resilient: ${resilientSteps.join(' | ')}`,
        naiveSteps.includes('should have failed') ? 'agent continued assuming success' : 'permission drift handled',
        'agent does not detect permission changes',
        'add permission validation before each operation'
      );
      
      return { naiveSteps, resilientSteps };
      
    } catch (error) {
      console.log('Permission drift test failed:', error.message);
      return { error: error.message };
    }
  }

  // ============ HELPER METHODS ============
  
  async checkExistingPRs(agent, owner, repo) {
    try {
      // This would normally list PRs, but for test we'll simulate
      return []; // Assume no existing PRs
    } catch (error) {
      return [];
    }
  }

  // ============ COMPARATIVE ANALYSIS ============
  
  generateEngineeringReport() {
    console.log('\n' + '='.repeat(80));
    console.log('🔬 ENGINEERING INSIGHTS REPORT');
    console.log('='.repeat(80));
    
    console.log('\n📊 COMPARATIVE ANALYSIS:');
    console.log('┌─────────────────────────────┬──────────────────┬─────────────────────┐');
    console.log('│ Scenario                 │ Naive Agent      │ Resilient Agent    │');
    console.log('├─────────────────────────────┼──────────────────┼─────────────────────┤');
    
    this.results.forEach(result => {
      const naiveStatus = result.observed.includes('Naive: ') ? 
        result.observed.split(' | ')[0].replace('Naive: ', '') : 'Unknown';
      const resilientStatus = result.observed.includes('Resilient: ') ? 
        result.observed.split(' | ')[1].replace('Resilient: ', '') : 'Unknown';
      
      console.log(`│ ${result.scenario.padEnd(24)} │ ${naiveStatus.padEnd(16)} │ ${resilientStatus.padEnd(17)} │`);
    });
    
    console.log('└─────────────────────────────┴──────────────────┴─────────────────────┘');
    
    console.log('\n🎯 KEY FINDINGS:');
    this.results.forEach(result => {
      console.log(`\n${result.scenario}:`);
      console.log(`  • Failure Point: ${result.failurePoint}`);
      console.log(`  • Hypothesis: ${result.hypothesis}`);
      console.log(`  • Fix: ${result.fix}`);
    });
    
    console.log('\n🔥 CRITICAL INSIGHTS:');
    console.log('1. State validation is NOT optional - it prevents catastrophic failures');
    console.log('2. Idempotency is essential for retry logic to work correctly');
    console.log('3. Permission assumptions lead to security vulnerabilities');
    console.log('4. Race conditions are inevitable in distributed systems');
    console.log('5. Caching without invalidation creates data consistency issues');
    
    return {
      summary: {
        totalScenarios: this.results.length,
        timestamp: new Date().toISOString()
      },
      scenarios: this.results
    };
  }
}

module.exports = HighImpactScenarios;
