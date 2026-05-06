const ProductionRiskAnalyzer = require('./production-risk-analyzer');

// Get Archal token from environment
const token = process.env.ARCHAL_TOKEN;

if (!token) {
  console.error('❌ Error: ARCHAL_TOKEN environment variable not set');
  console.log('Please run: export ARCHAL_TOKEN=your_token_here');
  process.exit(1);
}

async function main() {
  console.log('🔥 PRE-PRODUCTION RISK ANALYZER');
  console.log('Answering: "What would cause real-world damage if this ran in production?"');
  console.log('Transforming failure patterns into production impact assessments');
  
  const riskAnalyzer = new ProductionRiskAnalyzer(token);
  
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🚨 STARTING PRODUCTION RISK ANALYSIS');
    console.log('='.repeat(80));
    console.log('⚠️  This is NOT a test suite - this is PRODUCTION DAMAGE ASSESSMENT');
    console.log('⚠️  Each scenario represents a REAL production disaster waiting to happen');
    
    // Run complete production risk analysis
    const report = await riskAnalyzer.runCompleteRiskAnalysis();
    
    console.log('\n✅ PRODUCTION RISK ANALYSIS COMPLETE');
    console.log('🔥 Identified production disasters that would cause real damage');
    console.log('📊 Generated actionable mitigation strategies');
    console.log('🎯 Answered core question: "What would break in production?"');
    
  } catch (error) {
    console.error('❌ Production risk analysis failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
  
  console.log('\n🎯 KEY TAKEAWAY:');
  console.log('This analysis moves beyond "agent failed" to "production disaster prevented"');
  console.log('🔥 Each identified risk represents REAL business impact');
  console.log('💰 The cost of these failures is measured in production downtime');
  console.log('🛡️  Prevention is cheaper than incident response');
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, ProductionRiskAnalyzer };
