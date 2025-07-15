import { tradingSystem, createTradingSystem } from '../core/bootstrap/trading-system.bootstrap';
import { TradingRequest } from '../core/services/trading-orchestrator.service';

/**
 * Demonstration of the new optimized trading architecture
 * 
 * This example shows how the new architecture is:
 * 1. Trade command agnostic
 * 2. Scalable and modular
 * 3. Plugin-based for extensibility
 * 4. Provider-agnostic for LLM and brokers
 */

async function demonstrateOptimizedArchitecture() {
  console.log('🚀 Initializing optimized trading architecture...\n');

  try {
    // Initialize the trading system
    const orchestrator = await tradingSystem.initialize();
    
    // Test various trade scenarios
    const testScenarios: TradingRequest[] = [
      {
        id: 'test-1',
        input: 'Buy 100 shares of AAPL at market price',
        context: { userId: 'demo-user' }
      },
      {
        id: 'test-2', 
        input: 'Sell 50 shares of TSLA with limit order at $250',
        context: { userId: 'demo-user' }
      },
      {
        id: 'test-3',
        input: 'Analyze NVDA stock with technical analysis',
        context: { userId: 'demo-user', analysisDepth: 'detailed' }
      },
      {
        id: 'test-4',
        input: 'Give me a comprehensive analysis of MSFT for the next quarter',
        context: { userId: 'demo-user' }
      }
    ];

    console.log('📊 Processing trade scenarios...\n');

    // Process individual requests
    for (const scenario of testScenarios) {
      console.log(`Processing: "${scenario.input}"`);
      
      try {
        const result = await orchestrator.processTradingRequest({
          ...scenario,
          options: { dryRun: true } // Safe testing mode
        });
        
        console.log(`✅ Success: ${result.success}`);
        console.log(`📝 Intent: ${result.intent?.intent.type} - ${result.intent?.intent.symbol}`);
        console.log(`⏱️  Processing time: ${result.metadata.processingTime}ms`);
        console.log(`💰 Estimated cost: $${(result.metadata.costs.llm + result.metadata.costs.broker).toFixed(4)}`);
        console.log(`🔍 Steps: ${result.metadata.steps.join(' → ')}`);
        
      } catch (error) {
        console.log(`❌ Error: ${error}`);
      }
      
      console.log('─'.repeat(50));
    }

    // Demonstrate batch processing
    console.log('\n🔄 Testing batch processing...');
    const batchResults = await orchestrator.batchProcessTradingRequests(
      testScenarios.map(s => ({ ...s, options: { dryRun: true } }))
    );
    
    console.log(`Batch processed ${batchResults.length} requests`);
    console.log(`Success rate: ${batchResults.filter(r => r.success).length}/${batchResults.length}`);

    // Show system statistics
    console.log('\n📈 System Statistics:');
    const stats = tradingSystem.getSystemStats();
    console.log(`Total requests: ${stats.orchestrator.totalRequests}`);
    console.log(`Success rate: ${(stats.orchestrator.successRate * 100).toFixed(1)}%`);
    console.log(`Average processing time: ${stats.orchestrator.averageProcessingTime.toFixed(0)}ms`);
    console.log(`Average cost per request: $${stats.orchestrator.averageCost.toFixed(4)}`);

    // Demonstrate health check
    console.log('\n🏥 Health Check:');
    const health = await orchestrator.healthCheck();
    console.log(`System healthy: ${health.healthy}`);
    console.log(`LLM service: ${health.services.llm ? '✅' : '❌'}`);
    console.log(`Broker service: ${health.services.broker ? '✅' : '❌'}`);

    // Show configuration
    console.log('\n⚙️  Configuration:');
    console.log(`LLM Provider: ${stats.config.llm.provider} (${stats.config.llm.model})`);
    console.log(`Broker: ${stats.config.broker.provider}`);
    console.log(`Features enabled: ${Object.entries(stats.features).filter(([_, enabled]) => enabled).map(([name]) => name).join(', ')}`);

    console.log('\n🎉 Architecture demonstration completed successfully!');
    console.log('\n📋 Key Improvements:');
    console.log('• ✅ Trade command agnostic - handles any trade type through plugins');
    console.log('• ✅ Scalable - supports batch processing and concurrent requests');
    console.log('• ✅ Modular - easy to swap LLM providers and brokers');
    console.log('• ✅ Plugin-based - extensible with new trade types');
    console.log('• ✅ Provider-agnostic - works with any LLM or broker');
    console.log('• ✅ Configuration-driven - easy to customize behavior');
    console.log('• ✅ Robust error handling and health monitoring');

  } catch (error) {
    console.error('❌ Failed to initialize trading system:', error);
  }
}

// Alternative example: Creating a custom trading system
async function demonstrateCustomConfiguration() {
  console.log('\n🔧 Creating custom trading system configuration...');
  
  // Create a custom trading system with specific config
  const customSystem = createTradingSystem();
  
  // Update configuration
  customSystem.getConfigService().updateConfig({
    llm: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.2,
      maxTokens: 1500,
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: 'https://api.openai.com/v1',
      timeout: 30000,
      retries: 3
    },
    features: {
      caching: true,
      batchProcessing: true,
      realTimeUpdates: false,
      analytics: true
    }
  });
  
  const customOrchestrator = await customSystem.initialize();
  console.log('✅ Custom trading system initialized');
  
  // Test with custom configuration
  const result = await customOrchestrator.processTradingRequest({
    id: 'custom-test',
    input: 'I want to buy some Apple stock, maybe 50 shares',
    options: { dryRun: true }
  });
  
  console.log('Custom system result:', result.success ? '✅' : '❌');
}

// Run the demonstration
if (require.main === module) {
  demonstrateOptimizedArchitecture()
    .then(() => demonstrateCustomConfiguration())
    .catch(console.error);
}

export { demonstrateOptimizedArchitecture, demonstrateCustomConfiguration };