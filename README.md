# Agent Failure Simulator

A comprehensive testing framework for simulating real-world failure scenarios in multi-step agent workflows using Archal digital twins.

## Overview

This project demonstrates how AI agents break under inconsistent or faulty states when interacting with third-party APIs, specifically GitHub. It uses Archal's digital twin technology to create realistic testing environments without affecting production systems.

## Key Features

- **Real-world Failure Scenarios**: Simulates permission changes, stale states, and API errors
- **Comprehensive Logging**: Detailed tracking of all agent actions and decisions
- **Resilient Agent Implementation**: Demonstrates best practices for error handling
- **Archal Integration**: Uses GitHub digital twin for safe, isolated testing

## Architecture

```
Agent Failure Simulator/
├── agent.js              # Basic GitHub agent using Octokit
├── simple-agent.js       # Simplified agent using direct HTTP calls
├── resilient-agent.js     # Enhanced agent with error handling & retries
├── workflow.js           # Failure scenario implementations
├── simple-workflow.js    # Simplified workflow scenarios
├── index.js              # Main execution script
├── simple-index.js       # Simplified execution script
├── resilient-demo.js     # Resilient agent demonstration
├── .archal.json         # Archal configuration
└── package.json          # Node.js dependencies
```

## Failure Scenarios

### Case A: Permission Change Mid-Flow
- **Scenario**: Agent starts with write access, permission gets downgraded mid-flow
- **Expected**: Agent should detect permission loss and handle gracefully
- **Demonstrates**: Need for permission validation before operations

### Case B: Stale or Inconsistent State
- **Scenario**: PR appears open but is actually closed in backend
- **Expected**: Agent should validate PR state before attempting merge
- **Demonstrates**: Importance of state validation vs cached data

### Case C: API Error / Partial Failure
- **Scenario**: Intermittent API failure - commit succeeds but PR creation fails
- **Expected**: Agent should handle partial failures and retry appropriately
- **Demonstrates**: Need for retry logic and error classification

## Resilient Agent Features

The resilient agent implements several best practices:

1. **Permission Validation**: Checks repository permissions before write operations
2. **State Validation**: Validates PR state before merge attempts
3. **Exponential Backoff**: Intelligent retry logic with jitter
4. **Error Classification**: Distinguishes between retryable and non-retryable errors
5. **Comprehensive Logging**: Detailed tracking of all operations and decisions

## Setup and Installation

### Prerequisites
- Node.js (v14 or higher)
- Archal CLI installed globally
- Archal account and access token

### Installation

1. Clone or create the project directory
2. Install dependencies:
   ```bash
   npm install
   npm install @octokit/core
   ```

3. Start Archal GitHub twin:
   ```bash
   npx archal twin start github
   npx archal twin seed github small-project
   ```

4. Set environment variables:
   ```bash
   export ARCHAL_TOKEN=your_archal_token_here
   export ARCHAL_GITHUB_API=https://control.archal.ai/runtime/[session-id]/github/api
   ```

## Usage

### Basic Failure Simulation
```bash
ARCHAL_TOKEN=your_token ARCHAL_GITHUB_API=your_api_url node simple-index.js
```

### Resilient Agent Demonstration
```bash
ARCHAL_TOKEN=your_token ARCHAL_GITHUB_API=your_api_url node resilient-demo.js
```

### Using Archal CLI
```bash
npx archal run
```

## Reports

The simulator generates detailed reports in JSON format:

- `simple-failure-report.json`: Basic failure scenario results
- `resilient-report.json`: Resilient agent demonstration results
- Console output: Real-time execution logs and summary

## Key Learnings

1. **State Validation is Critical**: Never trust cached state when performing destructive operations
2. **Permission Changes Happen**: Always validate permissions before write operations
3. **API Failures are Common**: Implement proper retry logic with exponential backoff
4. **Error Classification Matters**: Distinguish between retryable and non-retryable errors
5. **Comprehensive Logging**: Detailed logs are essential for debugging agent failures

## Archal Integration

This project showcases the power of Archal's digital twin technology:

- **Safe Testing**: No impact on production systems
- **Realistic Scenarios**: Actual API behavior with controllable failure injection
- **Isolated Environment**: Each test runs in a clean, reproducible state
- **Comprehensive Tooling**: 29+ GitHub API tools available for testing

## Future Enhancements

- Additional failure scenarios (rate limiting, network timeouts)
- Multi-agent collaboration failure modes
- Integration with other service twins (Stripe, Linear, etc.)
- Automated failure scenario generation
- Performance impact analysis

## Contributing

This project serves as a reference implementation for testing agent resilience. Feel free to extend the scenarios or adapt the resilient agent patterns for your own use cases.

## License

MIT License - feel free to use this code for your own agent testing needs.
