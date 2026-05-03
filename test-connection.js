const { Octokit } = require('@octokit/core');

// Test the GitHub API connection using the Archal twin
async function testConnection() {
  console.log('Testing GitHub API connection...');
  
  // The Archal twin provides the token and API URL
  const token = process.env.ARCHAL_TOKEN || 'test-token';
  const apiUrl = process.env.ARCHAL_GITHUB_API || 'https://control.archal.ai/runtime/7c8d8da7-1cae-4100-81af-5c08ff85db20/github/api';
  
  console.log('API URL:', apiUrl);
  console.log('Token exists:', !!token);
  
  const octokit = new Octokit({ 
    auth: token,
    baseUrl: apiUrl
  });
  
  try {
    // Test basic API call
    const response = await octokit.request('GET /user');
    console.log('✅ Connection successful!');
    console.log('User:', response.data.login);
    return true;
  } catch (error) {
    console.log('❌ Connection failed:', error.message);
    return false;
  }
}

testConnection();
