// ============================================================================
// 13F INTEGRATION EXAMPLE
// ============================================================================

import { ThirteenFService } from '../services/thirteenf-service';
import { ConsoleLogger } from '../infrastructure/logging/ConsoleLogger';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';

/**
 * Example usage of the 13F integration functionality
 * 
 * This demonstrates how to:
 * 1. Fetch 13F filing data using Perplexity
 * 2. Create a weighted investment basket
 * 3. Execute trades for the basket
 */

async function demonstrate13FIntegration() {
  console.log('🔍 13F Integration Demo\n');

  const logger = new ConsoleLogger();
  const broker = new AlpacaAdapter();
  const thirteenFService = new ThirteenFService(logger, broker);

  try {
    // Example 1: Create a Bridgewater basket with $10,000
    console.log('Creating Bridgewater Associates basket...');
    const bridgewaterBasket = await thirteenFService.process13FRequest(
      'Bridgewater Associates',
      10000,
      {
        maxPositions: 20,
        minWeight: 1.0,
        rebalanceThreshold: 5.0
      }
    );

    console.log(`Created basket: ${bridgewaterBasket.name}`);
    console.log(`   Total Value: $${bridgewaterBasket.totalValue.toLocaleString()}`);
    console.log(`   Positions: ${bridgewaterBasket.allocations.length}`);
    console.log(`   Institution: ${bridgewaterBasket.institution}\n`);

    // Show top holdings
    console.log('Top 5 Holdings:');
    bridgewaterBasket.allocations.slice(0, 5).forEach((allocation, index) => {
      console.log(`${index + 1}. ${allocation.symbol} - ${allocation.companyName}`);
      console.log(`   Weight: ${(allocation.targetWeight * 100).toFixed(1)}%`);
      console.log(`   Value: $${allocation.targetValue.toLocaleString()}\n`);
    });

    // Example 2: Execute the basket (uncomment to run)
    // console.log('Executing basket trades...');
    // await thirteenFService.executeBasket(bridgewaterBasket.id);
    // console.log('asket execution completed!');

    // Example 3: Get all 13F baskets
    console.log('Fetching all 13F baskets...');
    const allBaskets = await thirteenFService.get13FBaskets();
    console.log(`Found ${allBaskets.length} 13F baskets\n`);

  } catch (error) {
    console.error('Error in 13F integration demo:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        console.log('\n💡 Setup required:');
        console.log('1. Get a Perplexity API key from https://docs.perplexity.ai/');
        console.log('2. Add PERPLEXITY_API_KEY to your .env file');
        console.log('3. Ensure other API keys are configured (OpenAI, Anthropic, Alpaca)');
      }
    }
  }
}

/**
 * Example of using the CLI chatbot for 13F functionality
 */
function demonstrateCLIUsage() {
  console.log('\n🤖 CLI Usage Examples:\n');
  
  const examples = [
    'show me bridgewater\'s 13f',
    'show me bridgewater\'s 13f with $5000',
    'create a basket from berkshire hathaway\'s portfolio',
    'invest $15000 in renaissance technologies 13f',
    'show me blackrock\'s holdings'
  ];

  console.log('You can use these natural language commands in the chatbot:');
  examples.forEach((example, index) => {
    console.log(`${index + 1}. "${example}"`);
  });

  console.log('\nThe system will:');
  console.log('✓ Fetch the latest 13F filing using Perplexity');
  console.log('✓ Parse institutional holdings data');
  console.log('✓ Create a weighted portfolio allocation');
  console.log('✓ Generate buy orders for your investment amount');
  console.log('✓ Save the basket for execution');
  console.log('✓ Allow you to execute trades when ready\n');
}

/**
 * Example API endpoints for frontend integration
 */
function demonstrateAPIEndpoints() {
  console.log('🌐 API Endpoints:\n');

  console.log('POST /api/13f/create-basket');
  console.log('  Create a new 13F basket from institutional data');
  console.log('  Body: { institution, investmentAmount, options }');
  console.log('  Returns: { success, basket, message }\n');

  console.log('POST /api/13f/execute-basket/:basketId');
  console.log('  Execute trades for a saved basket');
  console.log('  Returns: { success, message }\n');

  console.log('GET /api/13f/baskets');
  console.log('  Get all 13F baskets');
  console.log('  Returns: { baskets }\n');

  console.log('Frontend Integration:');
  console.log('✓ ThirteenFWidget component added to Portfolio Baskets tab');
  console.log('✓ apiService.create13FBasket() function available');
  console.log('✓ apiService.execute13FBasket() function available');
  console.log('✓ apiService.get13FBaskets() function available\n');
}

// Run the examples if this file is executed directly
if (require.main === module) {
  console.log('Running 13F Integration Examples...\n');
  demonstrateCLIUsage();
  demonstrateAPIEndpoints();
  
  // Uncomment to run live demo (requires API keys)
  // demonstrate13FIntegration();
}

export {
  demonstrate13FIntegration,
  demonstrateCLIUsage,
  demonstrateAPIEndpoints
};