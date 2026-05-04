const https = require('https');

class EngineeringHarness {
  constructor(token, agentId) {
    this.token = token;
    this.agentId = agentId;
    this.baseUrl = process.env.ARCHAL_GITHUB_API || 'https://control.archal.ai/runtime/5e698efa-9c8a-4f25-80d9-b6853c993d3a/github/api';
    this.logger = [];
    this.operationCount = 0;
    this.stepCount = 0;
    this.scenario = null;
    this.cache = new Map(); // For stale cache scenarios
    this.state = new Map(); // For tracking actual state
  }

  // ============ REQUEST INTERCEPTOR LAYER ============
  
  setScenario(scenario) {
    this.scenario = scenario;
    console.log(`🎯 [${this.agentId}] Scenario set: ${scenario}`);
  }

  async makeRequest(method, path, body = null) {
    this.operationCount++;
    this.stepCount++;
    
    const context = {
      operationCount: this.operationCount,
      stepCount: this.stepCount,
      agentId: this.agentId,
      scenario: this.scenario
    };

    // REQUEST INTERCEPTION - Deterministic failure injection
    this.interceptRequest(method, path, body, context);

    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${path}`;
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': `EngineeringHarness-${this.agentId}`,
          'X-Agent-ID': this.agentId,
          'X-Scenario': this.scenario || 'none'
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const response = { data: json, status: res.statusCode };
            
            // RESPONSE VALIDATION LAYER
            this.validateResponse(method, path, response, context);
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              const error = new Error(response.data.message || `HTTP ${res.statusCode}`);
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

  interceptRequest(method, path, body, context) {
    const { stepCount, scenario } = context;
    
    // ============ DETERMINISTIC FAILURE INJECTION ============
    
    // Scenario 1: Permission Drift Mid-Execution
    if (scenario === 'permission_drift' && stepCount >= 3) {
      if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
        const error = new Error('403: permission denied');
        error.status = 403;
        this.log('REQUEST_BLOCKED_PERMISSION', { method, path, stepCount }, error);
        throw error;
      }
    }

    // Scenario 2: Retry Storm - Fail first 2 attempts
    if (scenario === 'retry_storm' && context.operationCount <= 2) {
      if (path.includes('/pulls')) {
        const error = new Error('500: internal server error');
        error.status = 500;
        this.log('REQUEST_BLOCKED_RETRY', { method, path, operationCount: context.operationCount }, error);
        throw error;
      }
    }

    // Scenario 3: Stale Cache - Return cached state when external mutation happened
    if (scenario === 'stale_cache' && this.cache.has(path)) {
      const cached = this.cache.get(path);
      if (cached.state === 'open' && this.state.get(path) === 'closed') {
        this.log('STALE_CACHE_HIT', { path, cachedState: cached.state, actualState: this.state.get(path) });
        // Return cached response instead of making real request
        return cached.response;
      }
    }

    // Scenario 4: Race Condition - Simulate concurrent modification
    if (scenario === 'race_condition' && path.includes('/pulls/') && method === 'GET') {
      // Simulate that another agent closed the PR
      if (Math.random() < 0.3) {
        const error = new Error('404: pull request not found');
        error.status = 404;
        this.log('RACE_CONDITION_DETECTED', { path, method }, error);
        throw error;
      }
    }
  }

  // ============ RESPONSE VALIDATION LAYER ============
  
  validateResponse(method, path, response, context) {
    // Cache response for stale cache scenarios
    if (this.scenario === 'stale_cache') {
      this.cache.set(path, {
        response,
        state: response.data.state,
        timestamp: Date.now()
      });
    }

    // Track actual state for validation
    if (path.includes('/pulls/')) {
      this.state.set(path, response.data.state);
    }

    // CRITICAL: Re-fetch state after mutations to verify invariants
    if (method !== 'GET' && (path.includes('/pulls') || path.includes('/repos'))) {
      this.validateInvariant(method, path, response, context);
    }
  }

  async validateInvariant(method, path, response, context) {
    // Invariant: "A PR cannot be merged if closed at commit time"
    if (path.includes('/pulls/') && method === 'PUT' && path.includes('/merge')) {
      // Re-fetch PR state to validate invariant
      try {
        const prPath = path.replace('/merge', '');
        const currentPR = await this.makeRequest('GET', prPath);
        
        if (currentPR.data.state === 'closed') {
          const error = new Error('INVARIANT_VIOLATION: Attempted to merge closed PR');
          this.log('INFARIANT_VIOLATION', { method, path, prState: currentPR.data.state }, error);
          throw error;
        }
        
        this.log('INVARIANT_VALIDATED', { method, path, prState: currentPR.data.state });
      } catch (error) {
        this.log('VALIDATION_FAILED', { method, path }, error);
      }
    }
  }

  // ============ AGENT OPERATIONS ============
  
  async createRepository(name, description = `Engineering test by ${this.agentId}`) {
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
      const baseRef = await this.makeRequest('GET', `/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`);
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

  async createPullRequest(owner, repo, title, head, base = 'main', body = 'Engineering test PR') {
    try {
      const response = await this.makeRequest('POST', `/repos/${owner}/${repo}/pulls`, {
        title: `${title} [${this.agentId}]`,
        head,
        base,
        body: `${body} - Agent ${this.agentId}`
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
        commit_title: `${commitTitle} [${this.agentId}]`
      });
      this.log('MERGE_PULL_REQUEST', { owner, repo, pullNumber, merged: response.data.merged });
      return response.data;
    } catch (error) {
      this.log('MERGE_PULL_REQUEST', { owner, repo, pullNumber }, error);
      throw error;
    }
  }

  async closePullRequest(owner, repo, pullNumber) {
    try {
      const response = await this.makeRequest('PATCH', `/repos/${owner}/${repo}/pulls/${pullNumber}`, {
        state: 'closed'
      });
      this.log('CLOSE_PULL_REQUEST', { owner, repo, pullNumber });
      // Update state for race condition scenarios
      this.state.set(`/repos/${owner}/${repo}/pulls/${pullNumber}`, 'closed');
      return response.data;
    } catch (error) {
      this.log('CLOSE_PULL_REQUEST', { owner, repo, pullNumber }, error);
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

  // ============ LOGGING ============
  
  log(action, data, error = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      agentId: this.agentId,
      scenario: this.scenario,
      action,
      data: error ? { error: error.message, ...data } : data,
      success: !error
    };
    this.logger.push(logEntry);
    console.log(`[${this.agentId}][${logEntry.timestamp}] ${action}:`, error ? `ERROR - ${error.message}` : 'SUCCESS');
  }

  getLogs() {
    return this.logger;
  }

  clearLogs() {
    this.logger = [];
    this.stepCount = 0;
  }

  // ============ EXTERNAL STATE MANIPULATION ============
  
  simulateExternalMutation(path, newState) {
    console.log(`🔧 [${this.agentId}] External mutation: ${path} -> ${newState}`);
    this.state.set(path, newState);
  }
}

module.exports = EngineeringHarness;
