const { ResilientFailureSimulator } = require('./resilient-agent');

// Get the Archal token from environment
const token = process.env.ARCHAL_TOKEN;

if (!token) {
  console.error('❌ Error: ARCHAL_TOKEN environment variable not set');
  console.log('Please run: export ARCHAL_TOKEN=your_token_here');
  process.exit(1);
}

async function main() {
  console.log('🛡️  Starting Resilient Agent Demonstration');
  console.log('Showing improved error handling, validation, and retry logic');
  
  const simulator = new ResilientFailureSimulator(token);
  
  console.log('\n' + '='.repeat(80));
  console.log('RESILIENT AGENT FEATURES');
  console.log('='.repeat(80));
  console.log('✅ Permission validation before operations');
  console.log('✅ State validation before merges');
  console.log('✅ Exponential backoff retry logic');
  console.log('✅ Intelligent error classification');
  console.log('✅ Comprehensive logging and observability');
  
  try {
    // Demonstrate resilient workflow
    await simulator.demonstrateResilience('resilient-test-repo');
    
    // Generate report
    const report = simulator.generateResilienceReport();
    
    // Save report to file
    const fs = require('fs');
    fs.writeFileSync('resilient-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Resilient agent report saved to: resilient-report.json');
    
  } catch (error) {
    console.error('❌ Resilient demo failed:', error.message);
    process.exit(1);
  }
  
  console.log('\n✅ Resilient Agent Demonstration completed!');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, ResilientFailureSimulator };
