// Quick test of Perplexity API integration
require('dotenv').config();

const test13FIntegration = async () => {
  console.log('🔍 Testing Perplexity 13F Integration\n');
  
  // Check API key
  if (!process.env.PERPLEXITY_API_KEY) {
    console.error('❌ PERPLEXITY_API_KEY not found in environment');
    console.log('Please add it to your .env file');
    return;
  }
  
  console.log('✅ Perplexity API key found');
  console.log('Key preview:', process.env.PERPLEXITY_API_KEY.substring(0, 8) + '...');
  
  // Test API call
  try {
    console.log('\n🌐 Testing Perplexity API call...');
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: 'You are a financial data analyst. Provide brief, accurate information about institutional holdings.'
          },
          {
            role: 'user',
            content: 'Find the latest 13F filing for Bridgewater Associates. I need the top 10 holdings with ticker symbols, company names, and portfolio percentages. Provide exact data from SEC filings.'
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
        search_domain_filter: ["sec.gov", "fintel.io", "whalewisdom.com"],
        return_citations: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ API Error:', response.status, errorText);
      return;
    }

    const data = await response.json();
    console.log('✅ API Response received');
    console.log('Response length:', data.choices[0].message.content.length, 'characters');
    console.log('\n📊 Sample 13F Data:');
    console.log(data.choices[0].message.content.substring(0, 500) + '...');
    
    // Test parsing patterns
    const content = data.choices[0].message.content;
    const tickerMatches = content.match(/\b[A-Z]{1,5}\b/g);
    const percentMatches = content.match(/\d+\.?\d*%/g);
    
    console.log('\n🔍 Parsing Test:');
    console.log('Tickers found:', tickerMatches?.slice(0, 5) || 'None');
    console.log('Percentages found:', percentMatches?.slice(0, 3) || 'None');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

test13FIntegration();