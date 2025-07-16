import { UnifiedFinancialIntelligenceService } from '../services/unified-financial-intelligence';
import { PerplexityClient } from '../services/perplexity-client';
import { CacheManager } from '../services/cache-manager';
import { BasketStorageService } from '../storage/basket-storage';

/**
 * Unified Financial Intelligence Demo
 * 
 * Demonstrates the new architecture that combines:
 * - 13F institutional filings
 * - VIP investor profiles and sentiment
 * - Political trading activity
 * - Cross-referenced correlation analysis
 */

async function demonstrateUnifiedIntelligence() {
  console.log('🧠 Unified Financial Intelligence Demo');
  console.log('=====================================\n');

  // Initialize services
  const perplexityClient = new PerplexityClient();
  const cacheManager = new CacheManager();
  const basketStorage = new BasketStorageService();

  const unifiedService = new UnifiedFinancialIntelligenceService(
    perplexityClient,
    cacheManager,
    basketStorage,
    {
      enableCrossReferencing: true,
      enableRealTimeUpdates: true
    }
  );

  try {
    // 1. Generate comprehensive market intelligence
    console.log('🔍 1. Generating Unified Market Intelligence...');
    const intelligence = await unifiedService.generateUnifiedIntelligence({
      sectors: ['Technology', 'Healthcare', 'Financial'],
      timeframe: 'month',
      includeRiskAnalysis: true,
      includeCrossReferencing: true,
      maxResults: 10
    });

    console.log(`📊 Found ${intelligence.topMovers.length} top movers`);
    console.log(`📈 Identified ${intelligence.emergingTrends.length} emerging trends`);
    console.log(`⚠️  Generated ${intelligence.riskAlerts.length} risk alerts`);
    console.log(`⏱️  Processing time: ${intelligence.metadata.processingTime}ms\n`);

    // 2. Analyze specific symbol across all data sources
    console.log('🔍 2. Comprehensive Symbol Analysis...');
    const symbolAnalysis = await unifiedService.getSymbolAnalysis('AAPL', {
      includeInstitutional: true,
      includePolitical: true,
      includeVIP: true,
      timeframe: 'month'
    });

    console.log(`📊 ${symbolAnalysis.symbol} Consensus: ${symbolAnalysis.consensus.overallSentiment}`);
    console.log(`📈 Consensus Score: ${symbolAnalysis.consensus.consensusScore.toFixed(1)}`);
    console.log(`🔗 Cross-referenced insights: ${symbolAnalysis.insights.length}`);
    console.log(`⚠️  Risk factors: ${symbolAnalysis.riskFactors.length}`);
    console.log(`💡 Opportunities: ${symbolAnalysis.opportunities.length}\n`);

    // 3. Find correlation patterns
    console.log('🔍 3. Finding Correlation Patterns...');
    const correlations = await unifiedService.findCorrelationPatterns({
      timeframe: 'month',
      minCorrelationStrength: 0.6,
      sectors: ['Technology'],
      maxPatterns: 5
    });

    console.log(`🔗 Found ${correlations.length} correlation patterns`);
    correlations.forEach((pattern, index) => {
      console.log(`   ${index + 1}. ${pattern.title} (strength: ${pattern.correlationStrength})`);
    });
    console.log('');

    // 4. Generate investment recommendations
    console.log('🔍 4. Generating Investment Recommendations...');
    const recommendations = await unifiedService.generateInvestmentRecommendations({
      riskTolerance: 'moderate',
      investmentAmount: 50000,
      sectors: ['Technology', 'Healthcare'],
      timeHorizon: 'medium'
    });

    console.log(`💰 Generated ${recommendations.recommendations.length} recommendations`);
    console.log(`📊 Portfolio risk score: ${recommendations.portfolioSummary.riskScore}`);
    console.log(`📈 Expected return: ${recommendations.portfolioSummary.expectedReturn}%`);
    console.log(`🎯 Diversification score: ${recommendations.portfolioSummary.diversificationScore}\n`);

    // 5. Service statistics
    console.log('🔍 5. Service Statistics...');
    const stats = unifiedService.getServiceStats();
    console.log('Cache usage:', stats.cache);
    console.log('Perplexity usage:', stats.perplexity);
    console.log('Component services:', {
      vip: stats.vipProfiles,
      thirteenF: stats.thirteenF,
      politician: stats.politician
    });

    console.log('\n✅ Unified Financial Intelligence Demo completed successfully!');

  } catch (error) {
    console.error('❌ Demo failed:', error);
  }
}

async function demonstrateRealTimeIntelligence() {
  console.log('\n🔄 Real-Time Intelligence Updates Demo');
  console.log('=====================================\n');

  const perplexityClient = new PerplexityClient();
  const cacheManager = new CacheManager();
  const basketStorage = new BasketStorageService();

  const unifiedService = new UnifiedFinancialIntelligenceService(
    perplexityClient,
    cacheManager,
    basketStorage,
    {
      enableCrossReferencing: true,
      enableRealTimeUpdates: true
    }
  );

  // Simulate real-time updates
  const symbols = ['AAPL', 'TSLA', 'NVDA', 'MSFT'];
  
  for (const symbol of symbols) {
    console.log(`🔄 Analyzing ${symbol}...`);
    
    try {
      const analysis = await unifiedService.getSymbolAnalysis(symbol, {
        timeframe: 'week'
      });

      console.log(`   Sentiment: ${analysis.consensus.overallSentiment}`);
      console.log(`   Score: ${analysis.consensus.consensusScore.toFixed(1)}`);
      console.log(`   Institutional activity: ${analysis.consensus.institutionalActivity.participantCount} participants`);
      console.log(`   Political activity: ${analysis.consensus.politicalActivity.participantCount} participants`);
      console.log('');

    } catch (error) {
      console.log(`   ⚠️ Analysis failed for ${symbol}`);
    }

    // Simulate delay between analyses
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('✅ Real-time intelligence demo completed!');
}

export async function runUnifiedIntelligenceDemo() {
  console.log('🚀 Starting Unified Financial Intelligence Architecture Demo\n');
  
  await demonstrateUnifiedIntelligence();
  await demonstrateRealTimeIntelligence();

  console.log('\n🎉 All demos completed successfully!');
  console.log('\nKey Features Demonstrated:');
  console.log('✅ Unified data aggregation from 13F, VIP, and political sources');
  console.log('✅ Cross-referenced correlation analysis');
  console.log('✅ Market consensus generation');
  console.log('✅ Investment recommendation engine');
  console.log('✅ Real-time intelligence updates');
  console.log('✅ Risk analysis and alerting');
  console.log('✅ Performance monitoring and caching');
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runUnifiedIntelligenceDemo().catch(console.error);
} 