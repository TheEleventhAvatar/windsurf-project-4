const https = require('https');

class SimpleGitHubAgent {
  constructor(token) {
    this.token = token;
    this.baseUrl = process.env.ARCHAL_GITHUB_API || 'https://control.archal.ai/runtime/7c8d8da7-1cae-4100-81af-5c08ff85db20/github/api';
    this.logger = [];
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
    return new Promise((resolve, reject) => {
      const url = `${this.baseUrl}${path}`;
      const options = {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Agent-Failure-Simulator'
        }
      };

      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ data: json, status: res.statusCode });
            } else {
              const error = new Error(json.message || `HTTP ${res.statusCode}`);
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
}

module.exports = SimpleGitHubAgent;
