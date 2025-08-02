// ============================================================================
// LLM PROVIDER EXAMPLE - DEMONSTRATES OPENAI AND CLAUDE INTEGRATION
// ============================================================================

import { optimizedParsingService } from '../parsing/parsing-service';
import { configureLLMProvider, resolveLLMAdapter, resolveOpenAILLMAdapter, resolveClaudeLLMAdapter } from '../infrastructure/di/Container';

/**
 * Example demonstrating how to use both OpenAI and Claude LLM providers
 */
export async function demonstrateLLMProviders() {
  console.log('🔧 LLM Provider Integration Demo');
  console.log('================================\n');

  const testInputs = [
    'buy $100 of AAPL',
    'sell 50 shares of TSLA',
    'purchase $250 worth of Microsoft stock',
    'get rid of all my GOOGL positions'
  ];

  // Test with OpenAI (default)
  console.log('🤖 Testing with OpenAI GPT models:');
  console.log('-----------------------------------');
  
  optimizedParsingService.setLLMProvider('openai');
  
  for (const input of testInputs) {
    try {
      const result = await optimizedParsingService.parseTradeIntent(input);
      console.log(`✅ "${input}" -> ${optimizedParsingService.generateTradeSummary(result.intent)} (${result.confidence.toFixed(3)} confidence)`);
    } catch (error) {
      console.log(`❌ "${input}" -> Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n🧠 Testing with Anthropic Claude:');
  console.log('----------------------------------');
  
  optimizedParsingService.setLLMProvider('claude');
  
  for (const input of testInputs) {
    try {
      const result = await optimizedParsingService.parseTradeIntent(input);
      console.log(`✅ "${input}" -> ${optimizedParsingService.generateTradeSummary(result.intent)} (${result.confidence.toFixed(3)} confidence)`);
    } catch (error) {
      console.log(`❌ "${input}" -> Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  console.log('\n📊 Performance Comparison:');
  console.log('---------------------------');
  
  const performanceStats = optimizedParsingService.getPerformanceStats();
  console.log('Metrics:', JSON.stringify(performanceStats.metrics, null, 2));
  console.log('Cache Stats:', JSON.stringify(performanceStats.cacheStats, null, 2));
  console.log('Recommendations:', performanceStats.recommendations);
}

/**
 * Example demonstrating direct LLM adapter usage
 */
export async function demonstrateLLMAdapters() {
  console.log('\n🔧 Direct LLM Adapter Usage Demo');
  console.log('=================================\n');

  const testInput = 'analyze the performance of AAPL and MSFT';

  try {
    // Test OpenAI adapter directly
    console.log('🤖 OpenAI LLM Adapter:');
    const openaiAdapter = resolveOpenAILLMAdapter();
    const openaiClassification = await openaiAdapter.classifyIntent(testInput);
    console.log(`Classification: ${openaiClassification.type} (${openaiClassification.confidence.toFixed(3)} confidence)`);

    if (openaiClassification.type === 'analysis') {
      const openaiAnalysis = await openaiAdapter.generateAnalysis({
        symbols: ['AAPL', 'MSFT'],
        analysisType: 'comprehensive',
        timeframe: '1 month',
        criteria: ['performance', 'outlook']
      });
      console.log(`Analysis Preview: ${openaiAnalysis.substring(0, 200)}...`);
    }

    // Test Claude adapter directly
    console.log('\n🧠 Claude LLM Adapter:');
    const claudeAdapter = resolveClaudeLLMAdapter();
    const claudeClassification = await claudeAdapter.classifyIntent(testInput);
    console.log(`Classification: ${claudeClassification.type} (${claudeClassification.confidence.toFixed(3)} confidence)`);

    if (claudeClassification.type === 'analysis') {
      const claudeAnalysis = await claudeAdapter.generateAnalysis({
        symbols: ['AAPL', 'MSFT'],
        analysisType: 'comprehensive',
        timeframe: '1 month',
        criteria: ['performance', 'outlook']
      });
      console.log(`Analysis Preview: ${claudeAnalysis.substring(0, 200)}...`);
    }

  } catch (error) {
    console.log(`❌ Error testing LLM adapters: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Example showing how to configure LLM provider at container level
 */
export function demonstrateContainerConfiguration() {
  console.log('\n🔧 Container LLM Configuration Demo');
  console.log('====================================\n');

  // Switch to Claude as default
  console.log('🔄 Switching default LLM provider to Claude...');
  configureLLMProvider('claude');
  
  const llmAdapter = resolveLLMAdapter();
  console.log(`✅ Default LLM adapter is now: ${llmAdapter.constructor.name}`);

  // Switch back to OpenAI
  console.log('🔄 Switching default LLM provider back to OpenAI...');
  configureLLMProvider('openai');
  
  const llmAdapter2 = resolveLLMAdapter();
  console.log(`✅ Default LLM adapter is now: ${llmAdapter2.constructor.name}`);
}

// Example usage
if (require.main === module) {
  async function runDemo() {
    try {
      await demonstrateLLMProviders();
      await demonstrateLLMAdapters();
      demonstrateContainerConfiguration();
    } catch (error) {
      console.error('Demo failed:', error);
    }
  }

  runDemo();
}