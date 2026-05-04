const StressTestOrchestrator = require('./stress-test-orchestrator');

// Get the Archal token from environment
const token = process.env.ARCHAL_TOKEN;

if (!token) {
  console.error('❌ Error: ARCHAL_TOKEN environment variable not set');
  console.log('Please run: export ARCHAL_TOKEN=your_token_here');
  process.exit(1);
}

async function main() {
  console.log('🚀 STARTING ADVANCED STRESS TEST SUITE');
  console.log('Pushing Archal twin to absolute limits with:');
  console.log('• Concurrency stress tests');
  console.log('• Race condition scenarios'); 
  console.log('• Aggressive retry under load');
  console.log('• Partial commit failures');
  console.log('• State rehydration bugs');
  console.log('• High failure rate injection');
  
  const orchestrator = new StressTestOrchestrator(token, 5); // 5 concurrent agents
  
  try {
    // Run the full stress test suite
    const testSuite = await orchestrator.runFullStressTestSuite();
    
    // Generate comprehensive report
    const report = orchestrator.generateStressTestReport(testSuite);
    
    // Save detailed report to file
    const fs = require('fs');
    fs.writeFileSync('stress-test-report.json', JSON.stringify(testSuite, null, 2));
    console.log('\n📄 Detailed stress test report saved to: stress-test-report.json');
    
    // Save individual agent logs
    orchestrator.agents.forEach((agent, index) => {
      const agentReport = {
        agentId: agent.agentId,
        logs: agent.getLogs(),
        operationCount: agent.operationCount
      };
      fs.writeFileSync(`agent-${index + 1}-logs.json`, JSON.stringify(agentReport, null, 2));
    });
    console.log('📄 Individual agent logs saved to: agent-*-logs.json');
    
  } catch (error) {
    console.error('❌ Stress test suite failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
  
  console.log('\n✅ ADVANCED STRESS TEST SUITE COMPLETED!');
  console.log('🔥 Twin was pushed to absolute limits!');
  console.log('📊 Check stress-test-report.json for detailed analysis');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, StressTestOrchestrator };
