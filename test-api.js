const axios = require('axios');

async function testAPI() {
  try {
    console.log('Testing ticker info API...');
    const tickerResponse = await axios.get('http://localhost:3001/api/ticker/TSLA');
    console.log('Ticker info response:', JSON.stringify(tickerResponse.data, null, 2));
    
    console.log('\nTesting historical data API...');
    const historyResponse = await axios.get('http://localhost:3001/api/ticker/TSLA/history?period=1D&timeframe=1H');
    console.log('Historical data response:', JSON.stringify(historyResponse.data, null, 2));
    
  } catch (error) {
    console.error('API test failed:', error.response?.data || error.message);
  }
}

testAPI(); 