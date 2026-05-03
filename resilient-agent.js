const SimpleGitHubAgent = require('./simple-agent');

class ResilientGitHubAgent extends SimpleGitHubAgent {
  constructor(token) {
    super(token);
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000
    };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  calculateDelay(attempt) {
    // Exponential backoff with jitter
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
      this.retryConfig.maxDelay
    );
    // Add jitter to avoid thundering herd
    return delay + Math.random() * 1000;
  }

  async retryOperation(operation, operationName, context = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 1) {
          this.log(`RETRY_SUCCESS`, { 
            operation: operationName, 
            attempt, 
            context 
          });
        }
        return result;
      } catch (error) {
        lastError = error;
        
        // Don't retry on authentication or permission errors
        if (error.message.includes('Unauthorized') || 
            error.message.includes('Forbidden') ||
            error.message.includes('Permission denied')) {
          this.log(`AUTH_ERROR`, { 
            operation: operationName, 
            error: error.message,
            context 
          });
          throw error;
        }
        
        // Don't retry on not found errors for operations that should create
        if (error.message.includes('Not Found') && 
            (operationName.includes('CREATE') || operationName.includes('PUT'))) {
          this.log(`NOT_FOUND_ERROR`, { 
            operation: operationName, 
            error: error.message,
            context 
          });
          throw error;
        }
        
        this.log(`RETRY_ATTEMPT`, { 
          operation: operationName, 
          attempt, 
          maxRetries: this.retryConfig.maxRetries,
          error: error.message,
          context 
        });
        
        if (attempt < this.retryConfig.maxRetries) {
          const delay = this.calculateDelay(attempt);
          console.log(`⏳ Retrying ${operationName} in ${Math.round(delay)}ms... (attempt ${attempt}/${this.retryConfig.maxRetries})`);
          await this.sleep(delay);
        }
      }
    }
    
    this.log(`RETRY_EXHAUSTED`, { 
      operation: operationName, 
      attempts: this.retryConfig.maxRetries,
      error: lastError.message,
      context 
    });
    throw lastError;
  }

  async validatePermissions(owner, repo) {
    try {
      const repoData = await this.getRepository(owner, repo);
      const permissions = repoData.permissions;
      
      this.log('VALIDATE_PERMISSIONS', { 
        owner, 
        repo, 
        permissions: {
          admin: permissions.admin,
          push: permissions.push,
          pull: permissions.pull
        }
      });
      
      if (!permissions.push) {
        throw new Error('Insufficient permissions: Cannot write to repository');
      }
      
      return permissions;
    } catch (error) {
      this.log('VALIDATE_PERMISSIONS_ERROR', { owner, repo }, error);
      throw error;
    }
  }

  async validatePullRequestState(owner, repo, pullNumber) {
    try {
      const pr = await this.getPullRequest(owner, repo, pullNumber);
      
      this.log('VALIDATE_PR_STATE', { 
        owner, 
        repo, 
        pullNumber, 
        state: pr.state,
        mergeable: pr.mergeable,
        merged: pr.merged
      });
      
      if (pr.state === 'closed') {
        throw new Error(`Pull request ${pullNumber} is closed`);
      }
      
      if (pr.merged) {
        throw new Error(`Pull request ${pullNumber} is already merged`);
      }
      
      if (pr.mergeable === false) {
        throw new Error(`Pull request ${pullNumber} is not mergeable (likely due to conflicts)`);
      }
      
      return pr;
    } catch (error) {
      this.log('VALIDATE_PR_STATE_ERROR', { owner, repo, pullNumber }, error);
      throw error;
    }
  }

  async createRepository(name, description = 'Test repository for failure simulation') {
    return this.retryOperation(
      () => super.createRepository(name, description),
      'CREATE_REPOSITORY',
      { repo: name }
    );
  }

  async createBranch(owner, repo, branchName, baseBranch = 'main') {
    // Validate permissions first
    await this.validatePermissions(owner, repo);
    
    return this.retryOperation(
      () => super.createBranch(owner, repo, branchName, baseBranch),
      'CREATE_BRANCH',
      { owner, repo, branch: branchName, base: baseBranch }
    );
  }

  async createFile(owner, repo, path, content, branch = 'main', message = 'Add new file') {
    // Validate permissions first
    await this.validatePermissions(owner, repo);
    
    return this.retryOperation(
      () => super.createFile(owner, repo, path, content, branch, message),
      'CREATE_FILE',
      { owner, repo, path, branch }
    );
  }

  async createPullRequest(owner, repo, title, head, base = 'main', body = 'Test pull request for failure simulation') {
    return this.retryOperation(
      () => super.createPullRequest(owner, repo, title, head, base, body),
      'CREATE_PULL_REQUEST',
      { owner, repo, title, head, base }
    );
  }

  async mergePullRequest(owner, repo, pullNumber, commitTitle = 'Merge pull request') {
    // Validate PR state before attempting merge
    await this.validatePullRequestState(owner, repo, pullNumber);
    
    return this.retryOperation(
      () => super.mergePullRequest(owner, repo, pullNumber, commitTitle),
      'MERGE_PULL_REQUEST',
      { owner, repo, pullNumber }
    );
  }
}

class ResilientFailureSimulator {
  constructor(token) {
    this.agent = new ResilientGitHubAgent(token);
    this.scenarios = [];
  }

  async runResilientWorkflow(repoName, owner = 'octocat') {
    console.log(`\n=== Running Resilient Workflow for ${repoName} ===`);
    
    try {
      // Step 1: Create repository
      console.log('\n1. Creating repository...');
      const repo = await this.agent.createRepository(repoName);
      
      // Step 2: Create branch (with permission validation)
      console.log('\n2. Creating feature branch...');
      const branchName = 'feature/resilient-test';
      await this.agent.createBranch(owner, repoName, branchName);
      
      // Step 3: Make a commit (with permission validation and retry)
      console.log('\n3. Making commit...');
      await this.agent.createFile(
        owner, 
        repoName, 
        'resilient-file.txt', 
        'This is a test file for the resilient agent.',
        branchName,
        'Add resilient test file'
      );
      
      // Step 4: Create pull request (with retry)
      console.log('\n4. Creating pull request...');
      const pr = await this.agent.createPullRequest(
        owner,
        repoName,
        'Resilient Test Pull Request',
        branchName
      );
      
      // Step 5: Merge pull request (with state validation and retry)
      console.log('\n5. Merging pull request...');
      await this.agent.mergePullRequest(owner, repoName, pr.number);
      
      console.log('\n✅ Resilient workflow completed successfully!');
      return { success: true, repo, pr };
      
    } catch (error) {
      console.log('\n❌ Resilient workflow failed:', error.message);
      return { success: false, error };
    }
  }

  async demonstrateResilience(repoName, owner = 'octocat') {
    console.log(`\n=== Demonstrating Resilient Agent Features ===`);
    
    this.agent.clearLogs();
    const scenario = {
      name: 'Resilient Agent Demonstration',
      expectedBehavior: 'Agent should handle failures gracefully with retries and validation',
      startTime: new Date().toISOString()
    };
    
    try {
      console.log('\n📋 Running resilient workflow...');
      const result = await this.runResilientWorkflow(repoName);
      
      if (result.success) {
        scenario.actualBehavior = 'Resilient workflow completed successfully with proper error handling';
        scenario.failurePoint = 'None - resilient design prevented failures';
      } else {
        scenario.actualBehavior = `Resilient workflow failed gracefully: ${result.error.message}`;
        scenario.failurePoint = result.error.message;
      }
      
    } catch (error) {
      scenario.actualBehavior = `Unexpected failure: ${error.message}`;
      scenario.failurePoint = 'Unexpected error in resilient workflow';
    }
    
    scenario.endTime = new Date().toISOString();
    scenario.logs = this.agent.getLogs();
    scenario.suggestedFix = 'Resilient agent already implements best practices';
    
    this.scenarios.push(scenario);
    return scenario;
  }

  generateResilienceReport() {
    console.log('\n' + '='.repeat(80));
    console.log('RESILIENT AGENT DEMONSTRATION REPORT');
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
      
      // Show retry logs
      const retryLogs = scenario.logs.filter(log => 
        log.action.includes('RETRY') || 
        log.action.includes('VALIDATE')
      );
      
      if (retryLogs.length > 0) {
        console.log('\nResilience Features Demonstrated:');
        retryLogs.forEach(log => {
          console.log(`  - ${log.action}: ${log.success ? 'SUCCESS' : 'INFO'}`);
        });
      }
    });
    
    return report;
  }
}

module.exports = { ResilientGitHubAgent, ResilientFailureSimulator };
