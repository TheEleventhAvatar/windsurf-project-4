const StressTestAgent = require('./stress-test-agent');

class StressTestOrchestrator {
  constructor(token, numAgents = 5) {
    this.token = token;
    this.agents = [];
    this.testResults = [];
    this.startTime = null;
    this.endTime = null;
    
    // Create multiple agents for concurrency testing
    for (let i = 1; i <= numAgents; i++) {
      this.agents.push(new StressTestAgent(token, `Agent-${i}`));
    }
  }

  log(message, data = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data,
      orchestrator: true
    };
    console.log(`[ORCHESTRATOR][${logEntry.timestamp}] ${message}:`, JSON.stringify(data, null, 2));
    this.testResults.push(logEntry);
  }

  async runConcurrentRepositoryCreation(repoBaseName) {
    console.log(`\n🔥 STRESS TEST: Concurrent Repository Creation`);
    console.log(`${this.agents.length} agents competing to create repositories simultaneously`);
    
    this.startTime = Date.now();
    
    // Enable stress failures for realistic testing
    this.agents.forEach(agent => agent.enableStressFailures());
    
    // Launch all agents simultaneously
    const promises = this.agents.map((agent, index) => 
      agent.concurrentOperation(repoBaseName, 'create_repo', Math.random() * 100)
    );
    
    try {
      const results = await Promise.allSettled(promises);
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      this.log('CONCURRENT_REPO_CREATION_COMPLETE', {
        totalAgents: this.agents.length,
        successful,
        failed,
        successRate: `${((successful / this.agents.length) * 100).toFixed(1)}%`
      });
      
      return { successful, failed, results };
      
    } catch (error) {
      this.log('CONCURRENT_REPO_CREATION_ERROR', { error: error.message });
      throw error;
    } finally {
      this.agents.forEach(agent => agent.disableAllFailures());
    }
  }

  async runRaceConditionMerge(repoName, owner = 'octocat') {
    console.log(`\n🏁 STRESS TEST: Race Condition Merge`);
    console.log(`Multiple agents attempting to merge the same PR simultaneously`);
    
    // First, create a repository and PR for the race condition test
    const agent = this.agents[0];
    agent.enableStressFailures();
    
    try {
      // Setup: Create repo, branch, file, and PR
      const repo = await agent.createRepository(`race-test-${Date.now()}`);
      const branchName = 'race-condition-branch';
      await agent.createBranch(owner, repo.name, branchName);
      await agent.createFile(owner, repo.name, 'race-file.txt', 
        'Content for race condition test', branchName);
      
      const pr = await agent.createPullRequest(owner, repo.name, 
        'Race Condition Test PR', branchName);
      
      console.log(`Created PR #${pr.number} for race condition testing`);
      
      // Now have multiple agents try to merge the same PR simultaneously
      const competingAgents = this.agents.slice(0, 3); // Use first 3 agents
      const racePromises = competingAgents.map((raceAgent, index) => 
        raceAgent.raceConditionMerge(owner, repo.name, pr.number, `Agent-${index + 1}`)
      );
      
      const raceResults = await Promise.allSettled(racePromises);
      
      const winners = raceResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const losers = raceResults.filter(r => r.status === 'rejected' || 
        (r.status === 'fulfilled' && !r.value.success)).length;
      
      this.log('RACE_CONDITION_MERGE_COMPLETE', {
        totalCompetitors: competingAgents.length,
        winners,
        losers,
        prNumber: pr.number
      });
      
      return { winners, losers, results: raceResults };
      
    } catch (error) {
      this.log('RACE_CONDITION_MERGE_ERROR', { error: error.message });
      throw error;
    } finally {
      agent.disableAllFailures();
    }
  }

  async runStressRetryTest(repoBaseName) {
    console.log(`\n🔄 STRESS TEST: Aggressive Retry Under Load`);
    console.log(`Agents retrying operations with high failure rates`);
    
    const retryPromises = this.agents.map((agent, index) => 
      agent.stressRetry(`${repoBaseName}-retry-${index}`, 8) // 8 max retries
    );
    
    try {
      const retryResults = await Promise.allSettled(retryPromises);
      
      const successful = retryResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = retryResults.filter(r => r.status === 'rejected' || 
        (r.status === 'fulfilled' && !r.value.success)).length;
      
      // Calculate average retry attempts
      const attempts = retryResults
        .filter(r => r.status === 'fulfilled')
        .map(r => r.value.attempt || 1);
      const avgAttempts = attempts.length > 0 ? 
        (attempts.reduce((sum, a) => sum + a, 0) / attempts.length).toFixed(1) : 0;
      
      this.log('STRESS_RETRY_COMPLETE', {
        totalAgents: this.agents.length,
        successful,
        failed,
        averageRetries: avgAttempts,
        successRate: `${((successful / this.agents.length) * 100).toFixed(1)}%`
      });
      
      return { successful, failed, averageRetries: avgAttempts, results: retryResults };
      
    } catch (error) {
      this.log('STRESS_RETRY_ERROR', { error: error.message });
      throw error;
    }
  }

  async runPartialCommitTest(repoName) {
    console.log(`\n📄 STRESS TEST: Partial Commit Failures`);
    console.log(`Testing agent behavior when file uploads fail mid-transfer`);
    
    const partialPromises = this.agents.map((agent, index) => {
      const branchName = `partial-commit-${index}`;
      return agent.partialCommitRecovery(repoName, branchName);
    });
    
    try {
      const partialResults = await Promise.allSettled(partialPromises);
      
      const successful = partialResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const recovered = partialResults.filter(r => 
        r.status === 'fulfilled' && r.value.recovered).length;
      const failed = partialResults.filter(r => r.status === 'rejected' || 
        (r.status === 'fulfilled' && !r.value.success)).length;
      
      this.log('PARTIAL_COMMIT_COMPLETE', {
        totalAgents: this.agents.length,
        successful,
        recovered,
        failed,
        recoveryRate: `${((recovered / this.agents.length) * 100).toFixed(1)}%`
      });
      
      return { successful, recovered, failed, results: partialResults };
      
    } catch (error) {
      this.log('PARTIAL_COMMIT_ERROR', { error: error.message });
      throw error;
    }
  }

  async runStateRehydrationTest(repoName) {
    console.log(`\n💾 STRESS TEST: State Rehydration Bugs`);
    console.log(`Testing agent recovery from corrupted session state`);
    
    const rehydrationPromises = this.agents.map((agent, index) => 
      agent.stateRehydrationTest(`${repoName}-rehydrate-${index}`)
    );
    
    try {
      const rehydrationResults = await Promise.allSettled(rehydrationPromises);
      
      const successful = rehydrationResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const recovered = rehydrationResults.filter(r => 
        r.status === 'fulfilled' && r.value.recovered).length;
      const failed = rehydrationResults.filter(r => r.status === 'rejected' || 
        (r.status === 'fulfilled' && !r.value.success)).length;
      
      this.log('STATE_REHYDRATION_COMPLETE', {
        totalAgents: this.agents.length,
        successful,
        recovered,
        failed,
        recoveryRate: `${((recovered / this.agents.length) * 100).toFixed(1)}%`
      });
      
      return { successful, recovered, failed, results: rehydrationResults };
      
    } catch (error) {
      this.log('STATE_REHYDRATION_ERROR', { error: error.message });
      throw error;
    }
  }

  async runFullStressTestSuite() {
    console.log(`\n🚀 STARTING FULL STRESS TEST SUITE`);
    console.log(`Testing with ${this.agents.length} concurrent agents`);
    console.log(`⚠️  WARNING: This will push the twin to its limits!`);
    
    const testSuite = {
      startTime: new Date().toISOString(),
      agentCount: this.agents.length,
      tests: {}
    };
    
    try {
      // Test 1: Concurrent Repository Creation
      console.log(`\n${'='.repeat(60)}`);
      testSuite.tests.concurrentRepos = await this.runConcurrentRepositoryCreation('stress-repo');
      
      // Test 2: Race Condition Merges
      console.log(`\n${'='.repeat(60)}`);
      testSuite.tests.raceConditions = await this.runRaceConditionMerge();
      
      // Test 3: Stress Retry Under Load
      console.log(`\n${'='.repeat(60)}`);
      testSuite.tests.stressRetries = await this.runStressRetryTest('stress-retry');
      
      // Test 4: Partial Commit Failures
      console.log(`\n${'='.repeat(60)}`);
      testSuite.tests.partialCommits = await this.runPartialCommitTest('stress-partial');
      
      // Test 5: State Rehydration
      console.log(`\n${'='.repeat(60)}`);
      testSuite.tests.stateRehydration = await this.runStateRehydrationTest('stress-rehydrate');
      
      this.endTime = Date.now();
      testSuite.endTime = new Date().toISOString();
      testSuite.duration = this.endTime - this.startTime;
      
      this.log('STRESS_TEST_SUITE_COMPLETE', {
        duration: `${testSuite.duration}ms`,
        totalTests: 5
      });
      
      return testSuite;
      
    } catch (error) {
      this.log('STRESS_TEST_SUITE_ERROR', { error: error.message });
      throw error;
    }
  }

  generateStressTestReport(testSuite) {
    console.log(`\n${'='.repeat(80)}`);
    console.log('STRESS TEST REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📊 Test Suite Summary:`);
    console.log(`- Duration: ${testSuite.duration}ms`);
    console.log(`- Agents: ${testSuite.agentCount}`);
    console.log(`- Start: ${testSuite.startTime}`);
    console.log(`- End: ${testSuite.endTime}`);
    
    const tests = testSuite.tests;
    
    console.log(`\n🔥 Test 1: Concurrent Repository Creation`);
    console.log(`- Success Rate: ${tests.concurrentRepos.successful}/${testSuite.agentCount} agents`);
    console.log(`- Failure Rate: ${tests.concurrentRepos.failed}/${testSuite.agentCount} agents`);
    
    console.log(`\n🏁 Test 2: Race Condition Merges`);
    console.log(`- Winners: ${tests.raceConditions.winners} agents`);
    console.log(`- Losers: ${tests.raceConditions.losers} agents`);
    
    console.log(`\n🔄 Test 3: Stress Retry Under Load`);
    console.log(`- Successful: ${tests.stressRetries.successful}/${testSuite.agentCount} agents`);
    console.log(`- Failed: ${tests.stressRetries.failed}/${testSuite.agentCount} agents`);
    console.log(`- Average Retries: ${tests.stressRetries.averageRetries} attempts`);
    
    console.log(`\n📄 Test 4: Partial Commit Failures`);
    console.log(`- Successful: ${tests.partialCommits.successful}/${testSuite.agentCount} agents`);
    console.log(`- Recovered: ${tests.partialCommits.recovered}/${testSuite.agentCount} agents`);
    console.log(`- Failed: ${tests.partialCommits.failed}/${testSuite.agentCount} agents`);
    console.log(`- Recovery Rate: ${((tests.partialCommits.recovered / testSuite.agentCount) * 100).toFixed(1)}%`);
    
    console.log(`\n💾 Test 5: State Rehydration`);
    console.log(`- Successful: ${tests.stateRehydration.successful}/${testSuite.agentCount} agents`);
    console.log(`- Recovered: ${tests.stateRehydration.recovered}/${testSuite.agentCount} agents`);
    console.log(`- Failed: ${tests.stateRehydration.failed}/${testSuite.agentCount} agents`);
    console.log(`- Recovery Rate: ${((tests.stateRehydration.recovered / testSuite.agentCount) * 100).toFixed(1)}%`);
    
    // Aggregate all agent logs
    console.log(`\n📋 Detailed Agent Logs:`);
    this.agents.forEach(agent => {
      const agentLogs = agent.getLogs();
      const errors = agentLogs.filter(log => !log.success);
      const blocked = agentLogs.filter(log => log.action === 'REQUEST_BLOCKED');
      
      if (errors.length > 0 || blocked.length > 0) {
        console.log(`\n${agent.agentId}:`);
        console.log(`- Total Operations: ${agentLogs.length}`);
        console.log(`- Errors: ${errors.length}`);
        console.log(`- Blocked Requests: ${blocked.length}`);
        
        if (errors.length > 0) {
          console.log(`- Recent Errors:`);
          errors.slice(-3).forEach(log => {
            console.log(`  • ${log.action}: ${log.data.error}`);
          });
        }
      }
    });
    
    return testSuite;
  }
}

module.exports = StressTestOrchestrator;
