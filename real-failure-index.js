const { RealFailureSimulator } = require('./real-failure-agent');

// Get the Archal token from environment
const token = process.env.ARCHAL_TOKEN;

if (!token) {
  console.error('❌ Error: ARCHAL_TOKEN environment variable not set');
  console.log('Please run: export ARCHAL_TOKEN=your_token_here');
  process.exit(1);
}

async function main() {
  console.log('🚀 Starting REAL Agent Failure Simulator');
  console.log('Using actual failure injection - requests will be BLOCKED and MODIFIED');
  
  const simulator = new RealFailureSimulator(token);
  
  // Run all real failure scenarios
  console.log('\n' + '='.repeat(80));
  console.log('RUNNING REAL FAILURE SCENARIOS');
  console.log('='.repeat(80));
  console.log('⚠️  WARNING: These scenarios will actually block and modify requests!');
  console.log('⚠️  This is not simulated - agents will face real operational failures!');
  
  try {
    // Test basic workflow first (no failures)
    console.log('\n📋 Testing basic workflow (no failures)...');
    await simulator.runBasicWorkflow('real-basic-test-repo');
    
    // Run Case A: REAL Permission Downgrade
    await simulator.runRealCaseA_PermissionDowngrade('real-permission-test-repo');
    
    // Run Case B: REAL Stale State
    await simulator.runRealCaseB_StaleState('real-stale-state-test-repo');
    
    // Run Case C: REAL Intermittent Failures
    await simulator.runRealCaseC_IntermittentFailures('real-api-error-test-repo');
    
    // Generate report
    const report = simulator.generateRealFailureReport();
    
    // Save report to file
    const fs = require('fs');
    fs.writeFileSync('real-failure-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Detailed real failure report saved to: real-failure-report.json');
    
  } catch (error) {
    console.error('❌ Real failure simulator failed:', error.message);
    process.exit(1);
  }
  
  console.log('\n✅ REAL Agent Failure Simulator completed!');
  console.log('🔥 Agents experienced actual operational failures, not simulations!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, RealFailureSimulator };
