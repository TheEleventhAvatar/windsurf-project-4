class FailureOrchestrator {
  constructor() {
    this.activeFailures = new Map();
    this.requestCount = 0;
    this.stateCache = new Map();
  }

  // Register a failure scenario
  registerFailure(name, config) {
    this.activeFailures.set(name, config);
    console.log(`🔥 Registered failure: ${name}`);
  }

  // Remove a failure scenario
  removeFailure(name) {
    this.activeFailures.delete(name);
    console.log(`✅ Removed failure: ${name}`);
  }

  // Intercept and potentially modify requests
  interceptRequest(method, url, body, context = {}) {
    this.requestCount++;
    
    for (const [failureName, config] of this.activeFailures) {
      if (this.shouldTriggerFailure(config, method, url, body, context)) {
        const error = this.generateFailureError(config, method, url, context);
        console.log(`🚫 ${failureName} triggered: ${error.message}`);
        throw error;
      }
    }
    
    return { method, url, body, context };
  }

  // Intercept and potentially modify responses
  interceptResponse(method, url, response, context = {}) {
    for (const [failureName, config] of this.activeFailures) {
      if (this.shouldModifyResponse(config, method, url, response, context)) {
        const modifiedResponse = this.modifyResponse(config, response, method, url, context);
        console.log(`🔄 ${failureName} modified response for ${method} ${url}`);
        return modifiedResponse;
      }
    }
    
    return response;
  }

  shouldTriggerFailure(config, method, url, body, context) {
    if (!config.enabled) return false;
    
    // Check trigger conditions
    if (config.trigger?.requestCount && this.requestCount >= config.trigger.requestCount) {
      return true;
    }
    
    if (config.trigger?.method && config.trigger.method !== method) {
      return false;
    }
    
    if (config.trigger?.urlPattern && !url.includes(config.trigger.urlPattern)) {
      return false;
    }
    
    if (config.trigger?.afterOperation && context.operationCount && 
        context.operationCount >= config.trigger.afterOperation) {
      return true;
    }
    
    if (config.trigger?.random && Math.random() < config.trigger.random) {
      return true;
    }
    
    return false;
  }

  shouldModifyResponse(config, method, url, response, context) {
    if (!config.responseModification) return false;
    
    if (config.responseModification?.method && config.responseModification.method !== method) {
      return false;
    }
    
    if (config.responseModification?.urlPattern && !url.includes(config.responseModification.urlPattern)) {
      return false;
    }
    
    return true;
  }

  generateFailureError(config, method, url, context) {
    const error = new Error(config.error?.message || 'Simulated failure');
    error.status = config.error?.status || 500;
    error.failureType = config.type;
    error.simulated = true;
    
    // Add GitHub-specific error formatting
    if (config.error?.githubFormat) {
      error.message = config.error.githubFormat;
    }
    
    return error;
  }

  modifyResponse(config, response, method, url, context) {
    const modified = { ...response };
    
    if (config.responseModification?.changeState) {
      const newState = config.responseModification.changeState;
      modified.data = { ...response.data, ...newState };
      
      // Cache the modified state for consistency
      const cacheKey = `${method}:${url}`;
      this.stateCache.set(cacheKey, modified.data);
    }
    
    if (config.responseModification?.delay) {
      // Simulate network delay
      const start = Date.now();
      while (Date.now() - start < config.responseModification.delay) {
        // Busy wait to simulate delay
      }
    }
    
    return modified;
  }

  // Get cached state (for stale state scenarios)
  getCachedState(method, url) {
    return this.stateCache.get(`${method}:${url}`);
  }

  // Clear all failures and cache
  reset() {
    this.activeFailures.clear();
    this.stateCache.clear();
    this.requestCount = 0;
    console.log('🔄 Failure orchestrator reset');
  }
}

// Predefined failure configurations
const FailureConfigs = {
  // Case A: Permission downgrade after certain operations
  permissionDowngrade: {
    type: 'permission_loss',
    enabled: true,
    trigger: {
      afterOperation: 2, // After 2 successful operations
      method: 'POST' // Only affect write operations
    },
    error: {
      message: 'Permission denied: You no longer have write access to this repository',
      status: 403,
      githubFormat: 'Forbidden - Insufficient permissions for repository'
    }
  },

  // Case B: Stale state - PR appears open but is actually closed
  stalePrState: {
    type: 'stale_state',
    enabled: true,
    responseModification: {
      method: 'GET',
      urlPattern: '/pulls/',
      changeState: {
        state: 'open',
        merged: false,
        mergeable: true
      }
    }
  },

  // Case C: Intermittent API failures
  intermittentApiFailure: {
    type: 'api_failure',
    enabled: true,
    trigger: {
      random: 0.6, // 60% chance of failure
      method: 'POST',
      urlPattern: '/pulls'
    },
    error: {
      message: 'Internal server error: Request timeout',
      status: 500,
      githubFormat: 'Server Error: The request timed out'
    }
  },

  // Rate limiting failure
  rateLimit: {
    type: 'rate_limit',
    enabled: true,
    trigger: {
      requestCount: 10, // After 10 requests
    },
    error: {
      message: 'API rate limit exceeded',
      status: 429,
      githubFormat: 'Rate limit exceeded for this IP address'
    }
  },

  // Network timeout
  networkTimeout: {
    type: 'network_timeout',
    enabled: true,
    trigger: {
      random: 0.3, // 30% chance
    },
    responseModification: {
      delay: 30000 // 30 second delay
    }
  }
};

module.exports = { FailureOrchestrator, FailureConfigs };
