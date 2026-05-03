const { Octokit } = require('@octokit/core');

class GitHubAgent {
  constructor(token) {
    this.octokit = new Octokit({ 
      auth: token,
      baseUrl: process.env.ARCHAL_GITHUB_API || 'https://control.archal.ai/runtime/7c8d8da7-1cae-4100-81af-5c08ff85db20/github/api',
      request: { timeout: 15000 }
    });
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

  async createRepository(name, description = 'Test repository for failure simulation') {
    try {
      const response = await this.octokit.request('POST /user/repos', {
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
      const baseRef = await this.octokit.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
        owner,
        repo,
        ref: `heads/${baseBranch}`
      });

      // Create new branch
      const response = await this.octokit.request('POST /repos/{owner}/{repo}/git/refs', {
        owner,
        repo,
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
      const response = await this.octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
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
      const response = await this.octokit.request('POST /repos/{owner}/{repo}/pulls', {
        owner,
        repo,
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
      const response = await this.octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
        owner,
        repo,
        pull_number: pullNumber,
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
      const response = await this.octokit.request('GET /repos/{owner}/{repo}', {
        owner,
        repo
      });
      
      this.log('GET_REPOSITORY', { owner, repo, permissions: response.data.permissions });
      return response.data;
    } catch (error) {
      this.log('GET_REPOSITORY', { owner, repo }, error);
      throw error;
    }
  }

  async getPullRequest(owner, repo, pullNumber) {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
        owner,
        repo,
        pull_number: pullNumber
      });
      
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

module.exports = GitHubAgent;
