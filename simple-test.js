const SimpleGitHubAgent = require('./simple-agent');

async function testConnection() {
  console.log('Testing Simple GitHub Agent connection...');
  
  const token = process.env.ARCHAL_TOKEN;
  const agent = new SimpleGitHubAgent(token);
  
  try {
    // Test basic API call
    const response = await agent.makeRequest('GET', '/user');
    console.log('✅ Connection successful!');
    console.log('User:', response.data.login);
    return true;
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    return false;
  }
}

testConnection();
