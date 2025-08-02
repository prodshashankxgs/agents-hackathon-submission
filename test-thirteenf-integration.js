// Test the full 13F integration end-to-end
require('ts-node/register');
require('dotenv').config();

const { ThirteenFService } = require('./src/services/thirteenf-service');
const { ConsoleLogger } = require('./src/infrastructure/logging/ConsoleLogger');
const { AlpacaAdapter } = require('./src/brokers/alpaca-adapter');

const testFullIntegration = async () => {
  console.log('🧪 Testing Full 13F Integration\n');
  
  try {
    // Initialize services
    const logger = new ConsoleLogger();
    const broker = new AlpacaAdapter();
    const thirteenFService = new ThirteenFService(logger, broker);

    console.log('🔍 Testing Bridgewater 13F parsing...');
    
    // Test with a smaller amount for testing
    const basket = await thirteenFService.process13FRequest(
      'Bridgewater Associates',
      1000, // $1000 test amount
      {
        maxPositions: 5, // Limit to 5 positions for testing
        minWeight: 1.0,  // Only major positions
        rebalanceThreshold: 5.0
      }
    );

    console.log('\n✅ 13F Basket Created Successfully!');
    console.log(`📊 Basket Details:`);
    console.log(`   Name: ${basket.name}`);
    console.log(`   Institution: ${basket.institution}`);
    console.log(`   Total Value: $${basket.totalValue.toLocaleString()}`);
    console.log(`   Positions: ${basket.allocations.length}`);
    console.log(`   Status: ${basket.status}`);

    console.log('\n📈 Allocations:');
    basket.allocations.forEach((allocation, index) => {
      console.log(`${index + 1}. ${allocation.symbol} - ${allocation.companyName}`);
      console.log(`   Weight: ${(allocation.targetWeight * 100).toFixed(1)}%`);
      console.log(`   Value: $${allocation.targetValue.toLocaleString()}`);
      console.log('');
    });

    console.log('🎉 Integration test completed successfully!');
    console.log('\nThe 13F functionality is working with real Perplexity data.');
    
  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    
    if (error.message.includes('API key')) {
      console.log('\n💡 Make sure your API keys are configured:');
      console.log('- PERPLEXITY_API_KEY for 13F data');
      console.log('- ALPACA_API_KEY for market data');
    }
  }
};

testFullIntegration();