const GitHubAgent = require('./agent');

class FailureSimulator {
  constructor(token) {
    this.agent = new GitHubAgent(token);
    this.scenarios = [];
  }

  async runBasicWorkflow(repoName, owner = 'test-user') {
    console.log(`\n=== Running Basic Workflow for ${repoName} ===`);
    
    try {
      // Step 1: Create repository
      console.log('\n1. Creating repository...');
      const repo = await this.agent.createRepository(repoName);
      
      // Step 2: Create branch
      console.log('\n2. Creating feature branch...');
      const branchName = 'feature/test-branch';
      await this.agent.createBranch(owner, repoName, branchName);
      
      // Step 3: Make a commit (create a file)
      console.log('\n3. Making commit...');
      await this.agent.createFile(
        owner, 
        repoName, 
        'test-file.txt', 
        'This is a test file for the failure simulation.',
        branchName,
        'Add test file'
      );
      
      // Step 4: Create pull request
      console.log('\n4. Creating pull request...');
      const pr = await this.agent.createPullRequest(
        owner,
        repoName,
        'Test Pull Request',
        branchName
      );
      
      // Step 5: Merge pull request
      console.log('\n5. Merging pull request...');
      await this.agent.mergePullRequest(owner, repoName, pr.number);
      
      console.log('\n✅ Basic workflow completed successfully!');
      return { success: true, repo, pr };
      
    } catch (error) {
      console.log('\n❌ Basic workflow failed:', error.message);
      return { success: false, error };
    }
  }

  async runCaseA_PermissionChange(repoName, owner = 'test-user') {
    console.log(`\n=== Case A: Permission Change Mid-Flow ===`);
    console.log('Scenario: Agent starts with write access, permission gets downgraded mid-flow');
    
    this.agent.clearLogs();
    const scenario = {
      name: 'Permission Change Mid-Flow',
      expectedBehavior: 'Agent should detect permission loss and handle gracefully',
      startTime: new Date().toISOString()
    };
    
    try {
      // Step 1: Create repository (should work)
      console.log('\n1. Creating repository...');
      const repo = await this.agent.createRepository(repoName);
      
      // Step 2: Create branch (should work)
      console.log('\n2. Creating feature branch...');
      const branchName = 'feature/permission-test';
      await this.agent.createBranch(owner, repoName, branchName);
      
      // Simulate permission downgrade by switching to a different context
      console.log('\n⚠️  SIMULATING PERMISSION DOWNGRADE...');
      console.log('Agent loses write permissions, now has read-only access');
      
      // Step 3: Try to make a commit (should fail)
      console.log('\n3. Attempting to make commit (should fail)...');
      try {
        await this.agent.createFile(
          owner, 
          repoName, 
          'test-file-permission.txt', 
          'This should fail due to permission loss.',
          branchName,
          'Add test file after permission loss'
        );
        scenario.actualBehavior = 'Unexpectedly succeeded - permission detection failed';
        scenario.failurePoint = 'None - unexpected success';
      } catch (error) {
        scenario.actualBehavior = `Failed as expected: ${error.message}`;
        scenario.failurePoint = 'File creation due to permission loss';
        console.log('Expected failure occurred:', error.message);
      }
      
      // Step 4: Try to create PR (should fail)
      console.log('\n4. Attempting to create pull request (should fail)...');
      try {
        await this.agent.createPullRequest(
          owner,
          repoName,
          'Permission Test PR',
          branchName
        );
        scenario.actualBehavior += '; PR creation unexpectedly succeeded';
      } catch (error) {
        scenario.actualBehavior += `; PR creation failed as expected: ${error.message}`;
        console.log('Expected PR failure occurred:', error.message);
      }
      
    } catch (error) {
      scenario.actualBehavior = `Unexpected failure: ${error.message}`;
      scenario.failurePoint = 'Repository creation or branch creation';
    }
    
    scenario.endTime = new Date().toISOString();
    scenario.logs = this.agent.getLogs();
    scenario.suggestedFix = 'Implement permission validation before each write operation and handle permission changes gracefully';
    
    this.scenarios.push(scenario);
    return scenario;
  }

  async runCaseB_StaleState(repoName, owner = 'test-user') {
    console.log(`\n=== Case B: Stale or Inconsistent State ===`);
    console.log('Scenario: PR appears open but is actually closed in backend');
    
    this.agent.clearLogs();
    const scenario = {
      name: 'Stale/Inconsistent State',
      expectedBehavior: 'Agent should validate PR state before attempting merge',
      startTime: new Date().toISOString()
    };
    
    try {
      // Step 1: Create repository and branch
      console.log('\n1. Setting up repository and branch...');
      const repo = await this.agent.createRepository(repoName);
      const branchName = 'feature/stale-state-test';
      await this.agent.createBranch(owner, repoName, branchName);
      
      // Step 2: Make a commit
      console.log('\n2. Making commit...');
      await this.agent.createFile(
        owner, 
        repoName, 
        'stale-state-file.txt', 
        'Testing stale state handling.',
        branchName,
        'Add stale state test file'
      );
      
      // Step 3: Create pull request
      console.log('\n3. Creating pull request...');
      const pr = await this.agent.createPullRequest(
        owner,
        repoName,
        'Stale State Test PR',
        branchName
      );
      
      // Simulate stale state - PR appears open but is actually closed
      console.log('\n⚠️  SIMULATING STALE STATE...');
      console.log('PR appears open in agent cache but was closed externally');
      
      // Step 4: Try to merge without validation (should fail)
      console.log('\n4. Attempting to merge without state validation...');
      try {
        await this.agent.mergePullRequest(owner, repoName, pr.number);
        scenario.actualBehavior = 'Merge unexpectedly succeeded - state validation failed';
        scenario.failurePoint = 'None - unexpected success';
      } catch (error) {
        scenario.actualBehavior = `Failed as expected: ${error.message}`;
        scenario.failurePoint = 'Merge attempt due to stale state';
        console.log('Expected merge failure occurred:', error.message);
      }
      
      // Step 5: Show proper validation approach
      console.log('\n5. Demonstrating proper state validation...');
      try {
        const currentPR = await this.agent.getPullRequest(owner, repoName, pr.number);
        if (currentPR.state === 'closed') {
          console.log('✅ State validation detected closed PR, avoiding merge attempt');
          scenario.actualBehavior += '; State validation correctly detected closed PR';
        } else {
          scenario.actualBehavior += '; State validation failed to detect issue';
        }
      } catch (error) {
        scenario.actualBehavior += `; State validation failed: ${error.message}`;
      }
      
    } catch (error) {
      scenario.actualBehavior = `Unexpected failure: ${error.message}`;
      scenario.failurePoint = 'Setup phase (repo/branch/commit creation)';
    }
    
    scenario.endTime = new Date().toISOString();
    scenario.logs = this.agent.getLogs();
    scenario.suggestedFix = 'Always validate current state from source before operations, don\'t rely on cached data';
    
    this.scenarios.push(scenario);
    return scenario;
  }

  async runCaseC_APIError(repoName, owner = 'test-user') {
    console.log(`\n=== Case C: API Error / Partial Failure ===`);
    console.log('Scenario: Intermittent API failure - commit succeeds but PR creation fails');
    
    this.agent.clearLogs();
    const scenario = {
      name: 'API Error / Partial Failure',
      expectedBehavior: 'Agent should handle partial failures and retry appropriately',
      startTime: new Date().toISOString()
    };
    
    try {
      // Step 1: Create repository
      console.log('\n1. Creating repository...');
      const repo = await this.agent.createRepository(repoName);
      
      // Step 2: Create branch
      console.log('\n2. Creating feature branch...');
      const branchName = 'feature/api-error-test';
      await this.agent.createBranch(owner, repoName, branchName);
      
      // Step 3: Make commit (simulated success)
      console.log('\n3. Making commit...');
      try {
        await this.agent.createFile(
          owner, 
          repoName, 
          'api-error-file.txt', 
          'Testing API error handling.',
          branchName,
          'Add API error test file'
        );
        console.log('✅ Commit succeeded');
      } catch (error) {
        console.log('❌ Commit failed - this should not happen in this scenario');
        throw error;
      }
      
      // Step 4: Simulate API failure during PR creation
      console.log('\n⚠️  SIMULATING API FAILURE...');
      console.log('Intermittent API error during PR creation');
      
      console.log('\n4. Attempting to create pull request (simulated failure)...');
      let prCreationAttempts = 0;
      let prCreated = false;
      
      while (prCreationAttempts < 3 && !prCreated) {
        prCreationAttempts++;
        try {
          // Simulate intermittent failure (fail on first 2 attempts)
          if (prCreationAttempts <= 2) {
            throw new Error('Simulated API timeout: Request failed after 30 seconds');
          }
          
          const pr = await this.agent.createPullRequest(
            owner,
            repoName,
            'API Error Test PR',
            branchName
          );
          
          console.log(`✅ PR creation succeeded on attempt ${prCreationAttempts}`);
          prCreated = true;
          scenario.actualBehavior = `PR creation succeeded after ${prCreationAttempts} attempts`;
          
        } catch (error) {
          console.log(`❌ PR creation attempt ${prCreationAttempts} failed:`, error.message);
          
          if (prCreationAttempts < 3) {
            console.log(`⏳ Retrying in 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log('❌ All retry attempts exhausted');
            scenario.actualBehavior = `PR creation failed after ${prCreationAttempts} attempts: ${error.message}`;
            scenario.failurePoint = 'PR creation due to API errors';
          }
        }
      }
      
      if (prCreated) {
        scenario.failurePoint = 'None - recovered after retries';
      }
      
    } catch (error) {
      scenario.actualBehavior = `Unexpected failure: ${error.message}`;
      scenario.failurePoint = 'Setup phase';
    }
    
    scenario.endTime = new Date().toISOString();
    scenario.logs = this.agent.getLogs();
    scenario.suggestedFix = 'Implement exponential backoff retry logic for transient API failures';
    
    this.scenarios.push(scenario);
    return scenario;
  }

  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('AGENT FAILURE SIMULATION REPORT');
    console.log('='.repeat(80));
    
    const report = {
      summary: {
        totalScenarios: this.scenarios.length,
        timestamp: new Date().toISOString()
      },
      scenarios: this.scenarios
    };
    
    this.scenarios.forEach((scenario, index) => {
      console.log(`\n${index + 1}. ${scenario.name}`);
      console.log('-'.repeat(50));
      console.log(`Expected: ${scenario.expectedBehavior}`);
      console.log(`Actual: ${scenario.actualBehavior}`);
      console.log(`Failure Point: ${scenario.failurePoint}`);
      console.log(`Suggested Fix: ${scenario.suggestedFix}`);
      console.log(`Duration: ${scenario.startTime} → ${scenario.endTime}`);
      
      // Show key logs
      const errorLogs = scenario.logs.filter(log => !log.success);
      if (errorLogs.length > 0) {
        console.log('\nKey Failures:');
        errorLogs.slice(0, 3).forEach(log => {
          console.log(`  - ${log.action}: ${log.data.error}`);
        });
      }
    });
    
    return report;
  }
}

module.exports = FailureSimulator;
