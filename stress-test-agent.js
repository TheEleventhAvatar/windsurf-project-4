const https = require('https');
const { FailureOrchestrator } = require('./failure-orchestrator');

class StressTestAgent {
  constructor(token, agentId) {
    this.token = token;
    this.agentId = agentId;
    this.baseUrl = process.env.ARCHAL_GITHUB_API || 'https://control.archal.ai/runtime/e4fa7620-e4da-4297-af7c-eec82f1a019c/github/api';
    this.logger = [];
    this.orchestrator = new FailureOrchestrator();
    this.operationCount = 0;
    this.sessionState = new Map(); // For state rehydration tests
    this.corruptedState = false;
  }

  log(action, data, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      action,
      data: error ? { error: error.message, ...data } : data,
      success: !error
    };
    this.logger.push(logEntry);
    console.log(`[${this.agentId}][${logEntry.timestamp}] ${action}:`, error ? `ERROR - ${error.message}` : 'SUCCESS');
  }

  async makeRequest(method, path, body = null) {
    this.operationCount++;
    
    const context = {
      operationCount: this.operationCount,
      requestNumber: this.logger.length + 1,
      agentId: this.agentId
    };

    // Simulate state rehydration bugs
    if (this.corruptedState && Math.random() < 0.3) {
      throw new Error('State rehydration failed: Corrupted session data');
    }

    // Intercept request before sending
    try {
      const intercepted = this.orchestrator.interceptRequest(method, path, body, context);
    } catch (error) {
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
          'User-Agent': `StressTestAgent-${this.agentId}`,
          'X-Agent-ID': this.agentId
        }
      };

      // Simulate partial commit failures
      if (method === 'PUT' && path.includes('/contents/') && Math.random() < 0.2) {
        // Simulate incomplete upload
        setTimeout(() => {
          const error = new Error('Partial upload failed: Connection interrupted');
          error.status = 502;
          this.log('PARTIAL_UPLOAD_FAILURE', { method, path }, error);
          reject(error);
        }, Math.random() * 1000 + 500); // Random delay 500-1500ms
        return;
      }

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const response = { data: json, status: res.statusCode };
            
            // Cache state for rehydration tests
            this.sessionState.set(`${method}:${path}`, {
              data: json,
              timestamp: Date.now(),
              agentId: this.agentId
            });
            
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

  async createRepository(name, description = `Stress test repository by agent ${this.agentId}`) {
    try {
      const response = await this.makeRequest('POST', '/user/repos', {
        name: `${name}-${this.agentId}-${Date.now()}`,
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

  async createPullRequest(owner, repo, title, head, base = 'main', body = 'Stress test pull request') {
    try {
      const response = await this.makeRequest('POST', `/repos/${owner}/${repo}/pulls`, {
        title: `${title} [Agent ${this.agentId}]`,
        head,
        base,
        body: `${body} - Created by agent ${this.agentId} at ${new Date().toISOString()}`
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
        commit_title: `${commitTitle} [Agent ${this.agentId}]`
      });
      
      this.log('MERGE_PULL_REQUEST', { owner, repo, pullNumber, merged: response.data.merged });
      return response.data;
    } catch (error) {
      this.log('MERGE_PULL_REQUEST', { owner, repo, pullNumber }, error);
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

  // Stress test specific methods
  async concurrentOperation(repoName, operationType, delay = 0) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    switch (operationType) {
      case 'create_repo':
        return this.createRepository(repoName);
      case 'create_branch':
        return this.createBranch('octocat', repoName, `concurrent-branch-${this.agentId}`);
      case 'create_file':
        return this.createFile('octocat', repoName, `concurrent-file-${this.agentId}.txt`, 
          `Content from agent ${this.agentId} at ${Date.now()}`);
      default:
        throw new Error(`Unknown operation type: ${operationType}`);
    }
  }

  async raceConditionMerge(owner, repo, pullNumber, competitorId) {
    console.log(`[${this.agentId}] Starting race condition merge against ${competitorId}`);
    
    // Simulate race condition by checking PR state multiple times quickly
    for (let i = 0; i < 5; i++) {
      try {
        const pr = await this.getPullRequest(owner, repo, pullNumber);
        if (pr.state === 'closed' || pr.merged) {
          this.log('RACE_CONDITION_LOST', { competitorId, pullNumber, finalState: pr.state });
          return { success: false, reason: 'PR already merged/closed by competitor' };
        }
        
        // Small delay to simulate race timing
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
      } catch (error) {
        this.log('RACE_CONDITION_ERROR', { competitorId, attempt: i + 1 }, error);
      }
    }
    
    // Attempt merge
    try {
      const result = await this.mergePullRequest(owner, repo, pullNumber);
      this.log('RACE_CONDITION_WON', { competitorId, pullNumber });
      return { success: true, result };
    } catch (error) {
      this.log('RACE_CONDITION_FAILED', { competitorId, pullNumber }, error);
      return { success: false, error };
    }
  }

  async stressRetry(repoName, maxRetries = 10) {
    let attempt = 0;
    let lastError;
    
    while (attempt < maxRetries) {
      attempt++;
      try {
        console.log(`[${this.agentId}] Stress retry attempt ${attempt}/${maxRetries}`);
        
        // Random operation to stress retry logic
        const operations = [
          () => this.createRepository(repoName),
          () => this.createBranch('octocat', repoName, `retry-branch-${attempt}`),
          () => this.createFile('octocat', repoName, `retry-file-${attempt}.txt`, 
            `Retry attempt ${attempt} content`),
        ];
        
        const operation = operations[Math.floor(Math.random() * operations.length)];
        const result = await operation();
        
        this.log('STRESS_RETRY_SUCCESS', { attempt, operation: operation.name });
        return { success: true, attempt, result };
        
      } catch (error) {
        lastError = error;
        this.log('STRESS_RETRY_FAILED', { attempt, maxRetries }, error);
        
        // Exponential backoff with jitter
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) + Math.random() * 1000;
        console.log(`[${this.agentId}] Retrying in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    this.log('STRESS_RETRY_EXHAUSTED', { maxRetries }, lastError);
    return { success: false, attempts: maxRetries, error: lastError };
  }

  async partialCommitRecovery(repoName, branchName) {
    console.log(`[${this.agentId}] Testing partial commit recovery`);
    
    // Create a large file that might fail partially
    const largeContent = 'x'.repeat(1000000); // 1MB of data
    
    try {
      const result = await this.createFile('octocat', repoName, 'large-file.txt', 
        largeContent, branchName, 'Add large file (may fail partially)');
      
      this.log('PARTIAL_COMMIT_SUCCESS', { repoName, branchName, size: largeContent.length });
      return { success: true, result };
      
    } catch (error) {
      this.log('PARTIAL_COMMIT_FAILED', { repoName, branchName }, error);
      
      // Try recovery with smaller chunks
      try {
        console.log(`[${this.agentId}] Attempting recovery with smaller file`);
        const smallContent = 'Recovery content after partial failure';
        const recoveryResult = await this.createFile('octocat', repoName, 'recovery-file.txt', 
          smallContent, branchName, 'Recovery file after partial failure');
        
        this.log('PARTIAL_COMMIT_RECOVERY', { repoName, branchName });
        return { success: true, recovered: true, result: recoveryResult };
        
      } catch (recoveryError) {
        this.log('PARTIAL_COMMIT_RECOVERY_FAILED', { repoName, branchName }, recoveryError);
        return { success: false, error, recoveryError };
      }
    }
  }

  async stateRehydrationTest(repoName) {
    console.log(`[${this.agentId}] Testing state rehydration`);
    
    // Corrupt state intentionally
    this.corruptedState = true;
    
    try {
      // Try to perform operation with corrupted state
      const result = await this.createRepository(repoName);
      
      this.log('STATE_REHYDRATION_UNEXPECTED_SUCCESS', { repoName });
      return { success: true, result };
      
    } catch (error) {
      this.log('STATE_REHYDRATION_FAILED', { repoName }, error);
      
      // Attempt state recovery
      console.log(`[${this.agentId}] Attempting state recovery`);
      this.corruptedState = false;
      this.sessionState.clear();
      
      try {
        const recoveryResult = await this.createRepository(`${repoName}-recovered`);
        this.log('STATE_REHYDRATION_RECOVERY', { repoName });
        return { success: true, recovered: true, result: recoveryResult };
        
      } catch (recoveryError) {
        this.log('STATE_REHYDRATION_RECOVERY_FAILED', { repoName }, recoveryError);
        return { success: false, error, recoveryError };
      }
    }
  }

  getLogs() {
    return this.logger;
  }

  clearLogs() {
    this.logger = [];
  }

  // Enable stress test failures
  enableStressFailures() {
    // High failure rate for stress testing
    this.orchestrator.registerFailure('stressFailures', {
      type: 'stress_test',
      enabled: true,
      trigger: {
        random: 0.7, // 70% failure rate
      },
      error: {
        message: 'Stress test failure: System under load',
        status: 503,
        githubFormat: 'Service Unavailable: System experiencing high load'
      }
    });

    // Rate limiting under stress
    this.orchestrator.registerFailure('stressRateLimit', {
      type: 'rate_limit',
      enabled: true,
      trigger: {
        requestCount: 5, // After 5 requests
      },
      error: {
        message: 'Rate limit exceeded under stress',
        status: 429,
        githubFormat: 'Rate limit exceeded: Too many requests under stress test'
      }
    });
  }

  disableAllFailures() {
    this.orchestrator.reset();
  }
}

module.exports = StressTestAgent;
