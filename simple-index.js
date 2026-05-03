const SimpleFailureSimulator = require('./simple-workflow');

// Get the Archal token from environment
const token = process.env.ARCHAL_TOKEN;

if (!token) {
  console.error('❌ Error: ARCHAL_TOKEN environment variable not set');
  console.log('Please run: export ARCHAL_TOKEN=your_token_here');
  process.exit(1);
}

async function main() {
  console.log('🚀 Starting Agent Failure Simulator (Simple Version)');
  console.log('Using Archal GitHub twin for testing');
  
  const simulator = new SimpleFailureSimulator(token);
  
  // Run all failure scenarios
  console.log('\n' + '='.repeat(80));
  console.log('RUNNING FAILURE SCENARIOS');
  console.log('='.repeat(80));
  
  try {
    // Test basic workflow first
    console.log('\n📋 Testing basic workflow...');
    await simulator.runBasicWorkflow('basic-test-repo');
    
    // Run Case A: Permission Change
    await simulator.runCaseA_PermissionChange('permission-test-repo');
    
    // Run Case B: Stale State
    await simulator.runCaseB_StaleState('stale-state-test-repo');
    
    // Run Case C: API Error
    await simulator.runCaseC_APIError('api-error-test-repo');
    
    // Generate report
    const report = simulator.generateReport();
    
    // Save report to file
    const fs = require('fs');
    fs.writeFileSync('simple-failure-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed report saved to: simple-failure-report.json');
    
  } catch (error) {
    console.error('❌ Simulator failed:', error.message);
    process.exit(1);
  }
  
  console.log('\n✅ Agent Failure Simulator completed!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, SimpleFailureSimulator };
