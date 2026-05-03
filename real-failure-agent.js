const https = require('https');
const { FailureOrchestrator, FailureConfigs } = require('./failure-orchestrator');

class RealFailureAgent {
  constructor(token) {
    this.token = token;
    this.baseUrl = process.env.ARCHAL_GITHUB_API || 'https://control.archal.ai/runtime/7c8d8da7-1cae-4100-81af-5c08ff85db20/github/api';
    this.logger = [];
    this.orchestrator = new FailureOrchestrator();
    this.operationCount = 0;
  }

  log(action, data, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      data: error ? { error: error.message, ...data } : data,
      success: !error
    };
    this.logger.push(logEntry);
    console.log(`[${logEntry.timestamp}] ${action}:`, error ? `ERROR - ${error.message}` : 'SUCCESS');
  }

  async makeRequest(method, path, body = null) {
    this.operationCount++;
    
    const context = {
      operationCount: this.operationCount,
      requestNumber: this.logger.length + 1
    };

    // Intercept request before sending
    try {
      const intercepted = this.orchestrator.interceptRequest(method, path, body, context);
    } catch (error) {
      // Request was blocked by failure orchestrator
      this.log('REQUEST_BLOCKED', { method, path, context }, error);
      throw error;
    }

    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${path}`;
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Real-Failure-Agent'
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const response = { data: json, status: res.statusCode };
            
            // Intercept response before returning
            try {
              const modifiedResponse = this.orchestrator.interceptResponse(method, path, response, context);
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(modifiedResponse);
              } else {
                const error = new Error(modifiedResponse.data.message || `HTTP ${res.statusCode}`);
                reject(error);
              }
            } catch (error) {
              reject(error);
            }
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      
      if (body) {
        req.write(JSON.stringify(body));
      }
      
      req.end();
    });
  }

  async createRepository(name, description = 'Test repository for failure simulation') {
    try {
      const response = await this.makeRequest('POST', '/user/repos', {
        name,
        description,
        auto_init: true
      });
      this.log('CREATE_REPOSITORY', { repo: name, repoId: response.data.id });
      return response.data;
    } catch (error) {
      this.log('CREATE_REPOSITORY', { repo: name }, error);
      throw error;
    }
  }

  async createBranch(owner, repo, branchName, baseBranch = 'main') {
    try {
      // Get base branch reference
      const baseRef = await this.makeRequest('GET', `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);

      // Create new branch
      const response = await this.makeRequest('POST', `/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${branchName}`,
        sha: baseRef.data.object.sha
      });
      
      this.log('CREATE_BRANCH', { owner, repo, branch: branchName, base: baseBranch });
      return response.data;
    } catch (error) {
      this.log('CREATE_BRANCH', { owner, repo, branch: branchName }, error);
      throw error;
    }
  }

  async createFile(owner, repo, path, content, branch = 'main', message = 'Add new file') {
    try {
      const response = await this.makeRequest('PUT', `/repos/${owner}/${repo}/contents/${path}`, {
        message,
        content: Buffer.from(content).toString('base64'),
        branch
      });
      
      this.log('CREATE_FILE', { owner, repo, path, branch, message });
      return response.data;
    } catch (error) {
      this.log('CREATE_FILE', { owner, repo, path, branch }, error);
      throw error;
    }
  }

  async createPullRequest(owner, repo, title, head, base = 'main', body = 'Test pull request for failure simulation') {
    try {
      const response = await this.makeRequest('POST', `/repos/${owner}/${repo}/pulls`, {
        title,
        head,
        base,
        body
      });
      
      this.log('CREATE_PULL_REQUEST', { owner, repo, title, head, base, prNumber: response.data.number });
      return response.data;
    } catch (error) {
      this.log('CREATE_PULL_REQUEST', { owner, repo, title, head, base }, error);
      throw error;
    }
  }

  async mergePullRequest(owner, repo, pullNumber, commitTitle = 'Merge pull request') {
    try {
      const response = await this.makeRequest('PUT', `/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, {
        commit_title: commitTitle
      });
      
      this.log('MERGE_PULL_REQUEST', { owner, repo, pullNumber, merged: response.data.merged });
      return response.data;
    } catch (error) {
      this.log('MERGE_PULL_REQUEST', { owner, repo, pullNumber }, error);
      throw error;
    }
  }

  async getRepository(owner, repo) {
    try {
      const response = await this.makeRequest('GET', `/repos/${owner}/${repo}`);
      this.log('GET_REPOSITORY', { owner, repo, permissions: response.data.permissions });
      return response.data;
    } catch (error) {
      this.log('GET_REPOSITORY', { owner, repo }, error);
      throw error;
    }
  }

  async getPullRequest(owner, repo, pullNumber) {
    try {
      const response = await this.makeRequest('GET', `/repos/${owner}/${repo}/pulls/${pullNumber}`);
      this.log('GET_PULL_REQUEST', { owner, repo, pullNumber, state: response.data.state });
      return response.data;
    } catch (error) {
      this.log('GET_PULL_REQUEST', { owner, repo, pullNumber }, error);
      throw error;
    }
  }

  getLogs() {
    return this.logger;
  }

  clearLogs() {
    this.logger = [];
  }

  // Failure control methods
  enablePermissionDowngrade() {
    this.orchestrator.registerFailure('permissionDowngrade', FailureConfigs.permissionDowngrade);
  }

  enableStalePrState() {
    this.orchestrator.registerFailure('stalePrState', FailureConfigs.stalePrState);
  }

  enableIntermittentFailures() {
    this.orchestrator.registerFailure('intermittentApiFailure', FailureConfigs.intermittentApiFailure);
  }

  enableRateLimit() {
    this.orchestrator.registerFailure('rateLimit', FailureConfigs.rateLimit);
  }

  disableAllFailures() {
    this.orchestrator.reset();
  }
}

class RealFailureSimulator {
  constructor(token) {
    this.agent = new RealFailureAgent(token);
    this.scenarios = [];
  }

  async runBasicWorkflow(repoName, owner = 'octocat') {
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

  async runRealCaseA_PermissionDowngrade(repoName, owner = 'octocat') {
    console.log(`\n=== Case A: REAL Permission Downgrade ===`);
    console.log('Scenario: Agent loses write permissions after 2 operations');
    
    this.agent.clearLogs();
    const scenario = {
      name: 'REAL Permission Downgrade',
      expectedBehavior: 'Agent should be blocked from write operations after permission loss',
      startTime: new Date().toISOString()
    };
    
    try {
      // Enable permission downgrade after 2 operations
      this.agent.enablePermissionDowngrade();
      
      // Step 1: Create repository (should work)
      console.log('\n1. Creating repository...');
      const repo = await this.agent.createRepository(repoName);
      
      // Step 2: Create branch (should work)
      console.log('\n2. Creating feature branch...');
      const branchName = 'feature/permission-test';
      await this.agent.createBranch(owner, repoName, branchName);
      
      // Step 3: Try to make a commit (should be BLOCKED)
      console.log('\n3. Attempting to make commit (should be BLOCKED)...');
      try {
        await this.agent.createFile(
          owner, 
          repoName, 
          'test-file-permission.txt', 
          'This should be blocked by permission downgrade.',
          branchName,
          'Add test file after permission loss'
        );
        scenario.actualBehavior = 'Unexpectedly succeeded - permission blocking failed';
        scenario.failurePoint = 'None - unexpected success';
      } catch (error) {
        if (error.simulated) {
          scenario.actualBehavior = `Correctly blocked: ${error.message}`;
          scenario.failurePoint = 'File creation blocked by permission downgrade';
        } else {
          scenario.actualBehavior = `Failed for different reason: ${error.message}`;
          scenario.failurePoint = 'Unexpected error type';
        }
      }
      
      // Step 4: Try to create PR (should be BLOCKED)
      console.log('\n4. Attempting to create pull request (should be BLOCKED)...');
      try {
        await this.agent.createPullRequest(
          owner,
          repoName,
          'Permission Test PR',
          branchName
        );
        scenario.actualBehavior += '; PR creation unexpectedly succeeded';
      } catch (error) {
        if (error.simulated) {
          scenario.actualBehavior += `; PR creation correctly blocked: ${error.message}`;
        } else {
          scenario.actualBehavior += `; PR creation failed for different reason: ${error.message}`;
        }
      }
      
    } catch (error) {
      scenario.actualBehavior = `Unexpected failure: ${error.message}`;
      scenario.failurePoint = 'Repository creation or branch creation';
    } finally {
      this.agent.disableAllFailures();
    }
    
    scenario.endTime = new Date().toISOString();
    scenario.logs = this.agent.getLogs();
    scenario.suggestedFix = 'Implement permission validation and graceful handling of permission loss';
    
    this.scenarios.push(scenario);
    return scenario;
  }

  async runRealCaseB_StaleState(repoName, owner = 'octocat') {
    console.log(`\n=== Case B: REAL Stale State ===`);
    console.log('Scenario: PR appears open in cache but is actually closed');
    
    this.agent.clearLogs();
    const scenario = {
      name: 'REAL Stale State',
      expectedBehavior: 'Agent should detect inconsistent PR state and handle appropriately',
      startTime: new Date().toISOString()
    };
    
    try {
      // Enable stale state modification
      this.agent.enableStalePrState();
      
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
      
      // Step 4: Try to merge - PR will appear open but might have inconsistent state
      console.log('\n4. Attempting to merge with potentially stale state...');
      try {
        await this.agent.mergePullRequest(owner, repoName, pr.number);
        
        // Check if we got the modified response
        const logs = this.agent.getLogs();
        const mergeLog = logs.find(log => log.action === 'MERGE_PULL_REQUEST');
        
        if (mergeLog && mergeLog.success) {
          scenario.actualBehavior = 'Merge succeeded - state inconsistency may not have been detected';
          scenario.failurePoint = 'State inconsistency not detected';
        } else {
          scenario.actualBehavior = 'Merge failed - state inconsistency detected or other error';
          scenario.failurePoint = 'Merge failed due to state inconsistency';
        }
        
      } catch (error) {
        scenario.actualBehavior = `Merge failed as expected: ${error.message}`;
        scenario.failurePoint = 'State inconsistency prevented merge';
      }
      
    } catch (error) {
      scenario.actualBehavior = `Unexpected failure: ${error.message}`;
      scenario.failurePoint = 'Setup phase (repo/branch/commit creation)';
    } finally {
      this.agent.disableAllFailures();
    }
    
    scenario.endTime = new Date().toISOString();
    scenario.logs = this.agent.getLogs();
    scenario.suggestedFix = 'Implement state validation and conflict resolution for stale data';
    
    this.scenarios.push(scenario);
    return scenario;
  }

  async runRealCaseC_IntermittentFailures(repoName, owner = 'octocat') {
    console.log(`\n=== Case C: REAL Intermittent Failures ===`);
    console.log('Scenario: Random API failures during operations');
    
    this.agent.clearLogs();
    const scenario = {
      name: 'REAL Intermittent Failures',
      expectedBehavior: 'Agent should handle random API failures and retry appropriately',
      startTime: new Date().toISOString()
    };
    
    try {
      // Enable intermittent failures
      this.agent.enableIntermittentFailures();
      
      // Step 1: Create repository
      console.log('\n1. Creating repository...');
      const repo = await this.agent.createRepository(repoName);
      
      // Step 2: Create branch
      console.log('\n2. Creating feature branch...');
      const branchName = 'feature/api-error-test';
      await this.agent.createBranch(owner, repoName, branchName);
      
      // Step 3: Make commit
      console.log('\n3. Making commit...');
      try {
        await this.agent.createFile(
          owner, 
          repoName, 
          'api-error-file.txt', 
          'Testing real API error handling.',
          branchName,
          'Add API error test file'
        );
        console.log('✅ Commit succeeded');
      } catch (error) {
        console.log('❌ Commit failed due to intermittent failure');
      }
      
      // Step 4: Try to create PR (high chance of failure)
      console.log('\n4. Attempting to create pull request (high failure probability)...');
      let prCreationAttempts = 0;
      let prCreated = false;
      
      while (prCreationAttempts < 5 && !prCreated) {
        prCreationAttempts++;
        try {
          const pr = await this.agent.createPullRequest(
            owner,
            repoName,
            'API Error Test PR',
            branchName
          );
          
          console.log(`✅ PR creation succeeded on attempt ${prCreationAttempts}`);
          prCreated = true;
          scenario.actualBehavior = `PR creation succeeded after ${prCreationAttempts} attempts with real failures`;
          
        } catch (error) {
          console.log(`❌ PR creation attempt ${prCreationAttempts} failed:`, error.message);
          
          if (prCreationAttempts < 5) {
            console.log(`⏳ Retrying in 3 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            console.log('❌ All retry attempts exhausted');
            scenario.actualBehavior = `PR creation failed after ${prCreationAttempts} attempts: ${error.message}`;
            scenario.failurePoint = 'PR creation due to real intermittent API failures';
          }
        }
      }
      
      if (prCreated) {
        scenario.failurePoint = 'None - recovered after retries';
      }
      
    } catch (error) {
      scenario.actualBehavior = `Unexpected failure: ${error.message}`;
      scenario.failurePoint = 'Setup phase';
    } finally {
      this.agent.disableAllFailures();
    }
    
    scenario.endTime = new Date().toISOString();
    scenario.logs = this.agent.getLogs();
    scenario.suggestedFix = 'Implement robust retry logic with exponential backoff for intermittent failures';
    
    this.scenarios.push(scenario);
    return scenario;
  }

  generateRealFailureReport() {
    console.log('\n' + '='.repeat(80));
    console.log('REAL FAILURE SIMULATION REPORT');
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
      
      // Show blocked requests and real failures
      const blockedLogs = scenario.logs.filter(log => log.action === 'REQUEST_BLOCKED');
      const errorLogs = scenario.logs.filter(log => !log.success);
      
      if (blockedLogs.length > 0) {
        console.log('\nBlocked Requests:');
        blockedLogs.forEach(log => {
          console.log(`  - ${log.data.method} ${log.data.path}: ${log.data.error}`);
        });
      }
      
      if (errorLogs.length > 0) {
        console.log('\nReal Failures:');
        errorLogs.slice(0, 3).forEach(log => {
          console.log(`  - ${log.action}: ${log.data.error}`);
        });
      }
    });
    
    return report;
  }
}

module.exports = { RealFailureAgent, RealFailureSimulator };
