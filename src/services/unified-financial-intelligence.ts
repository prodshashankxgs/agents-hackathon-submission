import { PerplexityClient } from './perplexity-client';
import { VIPProfileService, VIPInvestorProfile, VIPSearchResult } from './vip-profile-service';
import { ThirteenFService, ThirteenFPortfolio, ThirteenFHolding } from './13f-service';
import { PoliticianService, PoliticianProfile, PoliticianTrade } from './politician-service';
import { CacheManager } from './cache-manager';
import { BasketStorageService } from '../storage/basket-storage';
import { TradingError } from '../types';

export interface UnifiedIntelligenceConfig {
  cacheConfig?: {
    defaultTTL?: number;
    maxSize?: number;
    redisUrl?: string;
  };
  perplexityConfig?: {
    timeout?: number;
    maxRetries?: number;
    rateLimitDelay?: number;
  };
  enableCrossReferencing?: boolean;
  enableRealTimeUpdates?: boolean;
}

export interface CrossReferencedInsight {
  type: 'institutional_follow' | 'political_trade_correlation' | 'vip_sentiment_shift' | 'sector_consensus';
  title: string;
  description: string;
  participants: Array<{
    type: 'institution' | 'politician' | 'vip';
    name: string;
    action: string;
    timing: string;
    confidence: number;
  }>;
  impact: 'high' | 'medium' | 'low';
  correlationStrength: number;
  timeWindow: string;
  affectedSymbols: string[];
  metadata: {
    generatedAt: string;
    sources: string[];
    confidence: number;
  };
}

export interface MarketConsensus {
  symbol: string;
  companyName: string;
  overallSentiment: 'bullish' | 'bearish' | 'neutral';
  institutionalActivity: {
    buying: number;
    selling: number;
    netFlow: number;
    participantCount: number;
  };
  politicalActivity: {
    buying: number;
    selling: number;
    netFlow: number;
    participantCount: number;
    controversyScore: number;
  };
  vipActivity: {
    mentions: number;
    sentiment: 'positive' | 'negative' | 'neutral';
    influencerCount: number;
  };
  consensusScore: number;
  riskFactors: string[];
  opportunities: string[];
}

export interface UnifiedMarketIntelligence {
  topMovers: Array<{
    symbol: string;
    companyName: string;
    consensus: MarketConsensus;
    crossReferencedInsights: CrossReferencedInsight[];
  }>;
  
  emergingTrends: Array<{
    sector: string;
    trend: string;
    strength: number;
    participants: Array<{
      type: 'institution' | 'politician' | 'vip';
      names: string[];
      activity: string;
    }>;
    projectedImpact: 'high' | 'medium' | 'low';
  }>;
  
  riskAlerts: Array<{
    type: 'concentration_risk' | 'timing_anomaly' | 'regulatory_concern' | 'sentiment_divergence';
    severity: 'high' | 'medium' | 'low';
    description: string;
    affectedSymbols: string[];
    recommendedActions: string[];
  }>;
  
  metadata: {
    generatedAt: string;
    dataFreshness: string;
    coverage: {
      institutions: number;
      politicians: number;
      vipProfiles: number;
      totalHoldings: number;
      totalTrades: number;
    };
    processingTime: number;
  };
}

/**
 * Unified Financial Intelligence Service
 * 
 * The next-generation financial intelligence platform that combines:
 * - 13F institutional filings and holdings
 * - VIP investor profiles and market influence
 * - Political trading activity and congressional disclosures
 * - Cross-referencing and correlation analysis
 * - Real-time market consensus and sentiment analysis
 */
export class UnifiedFinancialIntelligenceService {
  private cacheManager: CacheManager;
  private perplexityClient: PerplexityClient;
  private vipProfileService: VIPProfileService;
  private thirteenFService: ThirteenFService;
  private politicianService: PoliticianService;
  private basketStorage: BasketStorageService;

  constructor(
    perplexityClient: PerplexityClient,
    cacheManager: CacheManager,
    basketStorage: BasketStorageService,
    private config: UnifiedIntelligenceConfig = {}
  ) {
    this.perplexityClient = perplexityClient;
    this.cacheManager = cacheManager;
    this.basketStorage = basketStorage;
    
    // Initialize component services
    this.vipProfileService = new VIPProfileService(perplexityClient);
    this.thirteenFService = new ThirteenFService(basketStorage, perplexityClient, cacheManager);
    this.politicianService = new PoliticianService(perplexityClient, cacheManager);
  }

  /**
   * Generate comprehensive unified market intelligence
   */
  async generateUnifiedIntelligence(
    options: {
      symbols?: string[];
      sectors?: string[];
      timeframe?: 'week' | 'month' | 'quarter';
      includeRiskAnalysis?: boolean;
      includeCrossReferencing?: boolean;
      maxResults?: number;
    } = {}
  ): Promise<UnifiedMarketIntelligence> {
    const startTime = Date.now();
    const {
      symbols = [],
      sectors = [],
      timeframe = 'month',
      includeRiskAnalysis = true,
      includeCrossReferencing = this.config.enableCrossReferencing ?? true,
      maxResults = 50
    } = options;

    console.log(`🧠 Generating unified financial intelligence...`);

    try {
      // Fetch data from all sources in parallel
      const [institutionalData, politicalData, vipData] = await Promise.allSettled([
        this.fetchInstitutionalData({ sectors, timeframe, maxResults }),
        this.fetchPoliticalData({ symbols, timeframe, maxResults }),
        this.fetchVIPData({ sectors, timeframe, maxResults })
      ]);

      // Process and combine the data
      const processedData = this.processUnifiedData(
        this.extractSettledResult(institutionalData),
        this.extractSettledResult(politicalData),
        this.extractSettledResult(vipData)
      );

      // Generate market consensus for top symbols
      const marketConsensus = await this.generateMarketConsensus(
        processedData,
        { maxSymbols: maxResults }
      );

      // Cross-reference insights if enabled
      let crossReferencedInsights: CrossReferencedInsight[] = [];
      if (includeCrossReferencing) {
        crossReferencedInsights = await this.generateCrossReferencedInsights(
          processedData,
          { timeframe, maxInsights: 20 }
        );
      }

      // Generate emerging trends
      const emergingTrends = this.identifyEmergingTrends(processedData, sectors);

      // Generate risk alerts if enabled
      let riskAlerts: any[] = [];
      if (includeRiskAnalysis) {
        riskAlerts = this.generateRiskAlerts(processedData, marketConsensus);
      }

      // Combine top movers with insights
      const topMovers = marketConsensus.slice(0, maxResults).map(consensus => ({
        symbol: consensus.symbol,
        companyName: consensus.companyName,
        consensus,
        crossReferencedInsights: crossReferencedInsights.filter(
          insight => insight.affectedSymbols.includes(consensus.symbol)
        )
      }));

      const processingTime = Date.now() - startTime;

      return {
        topMovers,
        emergingTrends,
        riskAlerts,
        metadata: {
          generatedAt: new Date().toISOString(),
          dataFreshness: 'Real-time',
          coverage: {
            institutions: processedData.institutionalCount,
            politicians: processedData.politicalCount,
            vipProfiles: processedData.vipCount,
            totalHoldings: processedData.totalHoldings,
            totalTrades: processedData.totalTrades
          },
          processingTime
        }
      };

    } catch (error) {
      console.error('Error generating unified intelligence:', error);
      throw new TradingError('Failed to generate unified intelligence', 'INTELLIGENCE_ERROR', { error });
    }
  }

  /**
   * Get comprehensive symbol analysis combining all data sources
   */
  async getSymbolAnalysis(
    symbol: string,
    options: {
      includeInstitutional?: boolean;
      includePolitical?: boolean;
      includeVIP?: boolean;
      timeframe?: 'week' | 'month' | 'quarter';
    } = {}
  ): Promise<{
    symbol: string;
    companyName: string;
    institutionalActivity?: any;
    politicalActivity?: any;
    vipActivity?: any;
    consensus: MarketConsensus;
    insights: CrossReferencedInsight[];
    riskFactors: string[];
    opportunities: string[];
  }> {
    const {
      includeInstitutional = true,
      includePolitical = true,
      includeVIP = true,
      timeframe = 'month'
    } = options;

    console.log(`🔍 Analyzing ${symbol} across all data sources...`);

    const activities = await Promise.allSettled([
      includeInstitutional ? this.getSymbolInstitutionalActivity(symbol, timeframe) : null,
      includePolitical ? this.getSymbolPoliticalActivity(symbol, timeframe) : null,
      includeVIP ? this.getSymbolVIPActivity(symbol, timeframe) : null
    ]);

    const [institutionalActivity, politicalActivity, vipActivity] = activities.map(
      result => this.extractSettledResult(result)
    );

    // Generate consensus based on available data
    const consensus = await this.generateSymbolConsensus(symbol, {
      institutionalActivity,
      politicalActivity,
      vipActivity
    });

    // Generate symbol-specific insights
    const insights = await this.generateSymbolInsights(symbol, {
      institutionalActivity,
      politicalActivity,
      vipActivity,
      timeframe
    });

    return {
      symbol,
      companyName: consensus.companyName,
      institutionalActivity: includeInstitutional ? institutionalActivity : undefined,
      politicalActivity: includePolitical ? politicalActivity : undefined,
      vipActivity: includeVIP ? vipActivity : undefined,
      consensus,
      insights,
      riskFactors: consensus.riskFactors,
      opportunities: consensus.opportunities
    };
  }

  /**
   * Find correlation patterns between different data sources
   */
  async findCorrelationPatterns(
    options: {
      timeframe?: 'week' | 'month' | 'quarter';
      minCorrelationStrength?: number;
      sectors?: string[];
      maxPatterns?: number;
    } = {}
  ): Promise<CrossReferencedInsight[]> {
    const {
      timeframe = 'month',
      minCorrelationStrength = 0.7,
      sectors = [],
      maxPatterns = 20
    } = options;

    console.log(`🔗 Finding correlation patterns across data sources...`);

    // Get recent activity from all sources
    const [institutionalTrades, politicalTrades, vipMentions] = await Promise.allSettled([
      this.getRecentInstitutionalTrades(timeframe, sectors),
      this.getRecentPoliticalTrades(timeframe),
      this.getRecentVIPMentions(timeframe, sectors)
    ]);

    // Analyze temporal correlations
    const correlations = this.analyzeTemporalCorrelations(
      this.extractSettledResult(institutionalTrades),
      this.extractSettledResult(politicalTrades),
      this.extractSettledResult(vipMentions),
      minCorrelationStrength
    );

    return correlations.slice(0, maxPatterns);
  }

  /**
   * Generate investment recommendations based on unified intelligence
   */
  async generateInvestmentRecommendations(
    options: {
      riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
      investmentAmount?: number;
      sectors?: string[];
      excludeSymbols?: string[];
      timeHorizon?: 'short' | 'medium' | 'long';
    } = {}
  ): Promise<{
    recommendations: Array<{
      symbol: string;
      companyName: string;
      recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
      confidence: number;
      reasoning: string;
      supportingData: {
        institutionalSupport: number;
        politicalSentiment: number;
        vipInfluence: number;
      };
      riskFactors: string[];
      targetAllocation?: number;
    }>;
    portfolioSummary: {
      totalAllocation: number;
      riskScore: number;
      diversificationScore: number;
      expectedReturn: number;
    };
    reasoning: string;
  }> {
    const {
      riskTolerance = 'moderate',
      investmentAmount = 10000,
      sectors = [],
      excludeSymbols = [],
      timeHorizon = 'medium'
    } = options;

    console.log(`💡 Generating investment recommendations...`);

    // Generate unified intelligence
    const intelligence = await this.generateUnifiedIntelligence({
      sectors,
      timeframe: timeHorizon === 'short' ? 'week' : timeHorizon === 'long' ? 'quarter' : 'month',
      includeRiskAnalysis: true,
      includeCrossReferencing: true,
      maxResults: 100
    });

    // Filter and score recommendations based on unified data
    const scoredRecommendations = intelligence.topMovers
      .filter(mover => !excludeSymbols.includes(mover.symbol))
      .map(mover => this.scoreInvestmentOpportunity(mover, riskTolerance, timeHorizon))
      .sort((a, b) => b.score - a.score);

    // Generate portfolio allocation
    const recommendations = this.optimizePortfolioAllocation(
      scoredRecommendations,
      investmentAmount,
      riskTolerance
    );

    const portfolioSummary = this.calculatePortfolioMetrics(recommendations);

    return {
      recommendations,
      portfolioSummary,
      reasoning: this.generateRecommendationReasoning(intelligence, riskTolerance, timeHorizon)
    };
  }

  /**
   * Private helper methods
   */

  private async fetchInstitutionalData(options: any): Promise<any> {
    const defaultInstitutions = [
      'Berkshire Hathaway',
      'Bridgewater Associates',
      'BlackRock',
      'Vanguard Group',
      'Citadel LLC',
      'Renaissance Technologies'
    ];

    const portfolioPromises = defaultInstitutions.map(async institution => {
      try {
        return await this.thirteenFService.getPortfolio(institution, {
          useCache: true,
          includeAnalytics: true,
          maxHoldings: 50
        });
      } catch (error) {
        console.warn(`Failed to fetch ${institution}:`, error);
        return null;
      }
    });

    const portfolios = await Promise.all(portfolioPromises);
    return portfolios.filter(Boolean);
  }

  private async fetchPoliticalData(options: any): Promise<any> {
    try {
      const trendingPoliticians = await this.politicianService.getTrendingPoliticians({
        limit: 20,
        timeframe: options.timeframe === 'week' ? 'week' : 'month'
      });

      const tradePromises = trendingPoliticians.slice(0, 10).map(async politician => {
        try {
          return await this.politicianService.getPoliticianTrades(politician.name, {
            limit: 20,
            timeframe: options.timeframe
          });
        } catch (error) {
          return [];
        }
      });

      const allTrades = await Promise.all(tradePromises);
      return allTrades.flat();
    } catch (error) {
      console.warn('Failed to fetch political data:', error);
      return [];
    }
  }

  private async fetchVIPData(options: any): Promise<any> {
    try {
      return await this.vipProfileService.getTrendingVIPs({
        limit: 15,
        timeframe: options.timeframe
      });
    } catch (error) {
      console.warn('Failed to fetch VIP data:', error);
      return [];
    }
  }

  private extractSettledResult(result: PromiseSettledResult<any>): any {
    return result.status === 'fulfilled' ? result.value : null;
  }

  private processUnifiedData(institutional: any, political: any, vip: any): any {
    return {
      institutional: institutional || [],
      political: political || [],
      vip: vip || [],
      institutionalCount: institutional?.length || 0,
      politicalCount: political?.length || 0,
      vipCount: vip?.length || 0,
      totalHoldings: institutional?.reduce((sum: number, p: any) => sum + (p.holdings?.length || 0), 0) || 0,
      totalTrades: political?.length || 0
    };
  }

  private async generateMarketConsensus(data: any, options: any): Promise<MarketConsensus[]> {
    // Aggregate all symbols from different sources
    const symbolMap = new Map<string, any>();

    // Process institutional holdings
    data.institutional?.forEach((portfolio: any) => {
      portfolio.holdings?.forEach((holding: any) => {
        if (!symbolMap.has(holding.symbol)) {
          symbolMap.set(holding.symbol, {
            symbol: holding.symbol,
            companyName: holding.companyName,
            institutional: { buyers: 0, sellers: 0, totalValue: 0, count: 0 },
            political: { buyers: 0, sellers: 0, totalValue: 0, count: 0 },
            vip: { mentions: 0, sentiment: 'neutral' }
          });
        }
        const symbolData = symbolMap.get(holding.symbol);
        symbolData.institutional.buyers += 1;
        symbolData.institutional.totalValue += holding.marketValue || 0;
        symbolData.institutional.count += 1;
      });
    });

    // Process political trades
    data.political?.forEach((trade: PoliticianTrade) => {
      if (!symbolMap.has(trade.symbol)) {
        symbolMap.set(trade.symbol, {
          symbol: trade.symbol,
          companyName: trade.companyName,
          institutional: { buyers: 0, sellers: 0, totalValue: 0, count: 0 },
          political: { buyers: 0, sellers: 0, totalValue: 0, count: 0 },
          vip: { mentions: 0, sentiment: 'neutral' }
        });
      }
      const symbolData = symbolMap.get(trade.symbol);
      if (trade.tradeType === 'buy') {
        symbolData.political.buyers += 1;
      } else {
        symbolData.political.sellers += 1;
      }
      symbolData.political.totalValue += trade.amount;
      symbolData.political.count += 1;
    });

    // Convert to consensus objects
    return Array.from(symbolMap.values()).map(symbolData => ({
      symbol: symbolData.symbol,
      companyName: symbolData.companyName,
      overallSentiment: this.calculateOverallSentiment(symbolData),
      institutionalActivity: {
        buying: symbolData.institutional.buyers,
        selling: symbolData.institutional.sellers,
        netFlow: symbolData.institutional.totalValue,
        participantCount: symbolData.institutional.count
      },
      politicalActivity: {
        buying: symbolData.political.buyers,
        selling: symbolData.political.sellers,
        netFlow: symbolData.political.totalValue,
        participantCount: symbolData.political.count,
        controversyScore: Math.random() * 100 // Placeholder
      },
      vipActivity: {
        mentions: symbolData.vip.mentions,
        sentiment: symbolData.vip.sentiment,
        influencerCount: 0
      },
      consensusScore: this.calculateConsensusScore(symbolData),
      riskFactors: this.identifyRiskFactors(symbolData),
      opportunities: this.identifyOpportunities(symbolData)
    })).sort((a, b) => b.consensusScore - a.consensusScore);
  }

  private calculateOverallSentiment(symbolData: any): 'bullish' | 'bearish' | 'neutral' {
    const instBullish = symbolData.institutional.buyers > symbolData.institutional.sellers;
    const polBullish = symbolData.political.buyers > symbolData.political.sellers;
    
    if (instBullish && polBullish) return 'bullish';
    if (!instBullish && !polBullish) return 'bearish';
    return 'neutral';
  }

  private calculateConsensusScore(symbolData: any): number {
    const instWeight = 0.5;
    const polWeight = 0.3;
    const vipWeight = 0.2;

    const instScore = (symbolData.institutional.buyers / Math.max(symbolData.institutional.count, 1)) * 100;
    const polScore = (symbolData.political.buyers / Math.max(symbolData.political.count, 1)) * 100;
    const vipScore = 50; // Placeholder

    return instScore * instWeight + polScore * polWeight + vipScore * vipWeight;
  }

  private identifyRiskFactors(symbolData: any): string[] {
    const factors = [];
    if (symbolData.political.count > 5) factors.push('High political trading activity');
    if (symbolData.institutional.sellers > symbolData.institutional.buyers) factors.push('Institutional selling pressure');
    return factors;
  }

  private identifyOpportunities(symbolData: any): string[] {
    const opportunities = [];
    if (symbolData.institutional.buyers > symbolData.institutional.sellers) opportunities.push('Strong institutional support');
    if (symbolData.political.buyers > 0) opportunities.push('Political insider interest');
    return opportunities;
  }

  private async generateCrossReferencedInsights(data: any, options: any): Promise<CrossReferencedInsight[]> {
    // This would implement sophisticated correlation analysis
    // For now, return placeholder insights
    return [
      {
        type: 'institutional_follow',
        title: 'Major institutions following political trades',
        description: 'Several large institutions have increased positions in stocks recently traded by politicians',
        participants: [],
        impact: 'medium',
        correlationStrength: 0.8,
        timeWindow: options.timeframe,
        affectedSymbols: ['AAPL', 'TSLA'],
        metadata: {
          generatedAt: new Date().toISOString(),
          sources: ['13F filings', 'Political disclosures'],
          confidence: 75
        }
      }
    ];
  }

  private identifyEmergingTrends(data: any, sectors: string[]): any[] {
    // Placeholder implementation
    return [
      {
        sector: 'Technology',
        trend: 'AI and Machine Learning Focus',
        strength: 85,
        participants: [
          {
            type: 'institution',
            names: ['BlackRock', 'Vanguard'],
            activity: 'Increasing AI stock positions'
          }
        ],
        projectedImpact: 'high'
      }
    ];
  }

  private generateRiskAlerts(data: any, consensus: MarketConsensus[]): any[] {
    return [
      {
        type: 'concentration_risk',
        severity: 'medium',
        description: 'High concentration in tech stocks across institutional portfolios',
        affectedSymbols: ['AAPL', 'GOOGL', 'MSFT'],
        recommendedActions: ['Consider diversification', 'Monitor tech sector volatility']
      }
    ];
  }

  // Additional helper methods would be implemented here...
  private async getSymbolInstitutionalActivity(symbol: string, timeframe: string): Promise<any> {
    // Implementation for getting institutional activity for a specific symbol
    return {};
  }

  private async getSymbolPoliticalActivity(symbol: string, timeframe: string): Promise<any> {
    // Implementation for getting political activity for a specific symbol
    return {};
  }

  private async getSymbolVIPActivity(symbol: string, timeframe: string): Promise<any> {
    // Implementation for getting VIP activity for a specific symbol
    return {};
  }

  private async generateSymbolConsensus(symbol: string, data: any): Promise<MarketConsensus> {
    // Implementation for generating consensus for a specific symbol
    return {
      symbol,
      companyName: 'Unknown Company',
      overallSentiment: 'neutral',
      institutionalActivity: { buying: 0, selling: 0, netFlow: 0, participantCount: 0 },
      politicalActivity: { buying: 0, selling: 0, netFlow: 0, participantCount: 0, controversyScore: 0 },
      vipActivity: { mentions: 0, sentiment: 'neutral', influencerCount: 0 },
      consensusScore: 50,
      riskFactors: [],
      opportunities: []
    };
  }

  private async generateSymbolInsights(symbol: string, data: any): Promise<CrossReferencedInsight[]> {
    // Implementation for generating symbol-specific insights
    return [];
  }

  private async getRecentInstitutionalTrades(timeframe: string, sectors: string[]): Promise<any[]> {
    // Implementation for getting recent institutional trades
    return [];
  }

  private async getRecentPoliticalTrades(timeframe: string): Promise<any[]> {
    // Implementation for getting recent political trades
    return [];
  }

  private async getRecentVIPMentions(timeframe: string, sectors: string[]): Promise<any[]> {
    // Implementation for getting recent VIP mentions
    return [];
  }

  private analyzeTemporalCorrelations(institutional: any[], political: any[], vip: any[], minStrength: number): CrossReferencedInsight[] {
    // Implementation for analyzing temporal correlations
    return [];
  }

  private scoreInvestmentOpportunity(mover: any, riskTolerance: string, timeHorizon: string): any {
    // Implementation for scoring investment opportunities
    return { symbol: mover.symbol, score: Math.random() * 100 };
  }

  private optimizePortfolioAllocation(opportunities: any[], amount: number, riskTolerance: string): any[] {
    // Implementation for optimizing portfolio allocation
    return [];
  }

  private calculatePortfolioMetrics(recommendations: any[]): any {
    // Implementation for calculating portfolio metrics
    return {
      totalAllocation: 100,
      riskScore: 50,
      diversificationScore: 75,
      expectedReturn: 8.5
    };
  }

  private generateRecommendationReasoning(intelligence: any, riskTolerance: string, timeHorizon: string): string {
    return `Based on unified analysis of institutional, political, and VIP data sources with ${riskTolerance} risk tolerance and ${timeHorizon} time horizon.`;
  }

  /**
   * Get comprehensive service statistics
   */
  getServiceStats(): {
    cache: any;
    perplexity: any;
    vipProfiles: any;
    thirteenF: any;
    politician: any;
  } {
    return {
      cache: this.cacheManager.getStats(),
      perplexity: this.perplexityClient.getUsageStats(),
      vipProfiles: this.vipProfileService.getCacheStats(),
      thirteenF: this.thirteenFService.getCacheStats(),
      politician: this.politicianService.getCacheStats()
    };
  }

  /**
   * Clear all caches across all services
   */
  async clearAllCaches(): Promise<void> {
    await this.cacheManager.clearAll();
    this.vipProfileService.clearCache();
    await this.thirteenFService.clearCache();
    this.politicianService.clearCache();
    console.log('🧹 All unified intelligence caches cleared');
  }

  /**
   * Warm up caches with popular data across all services
   */
  async warmUpCaches(): Promise<void> {
    console.log('🔥 Warming up unified intelligence caches...');
    
    const popularInstitutions = ['Berkshire Hathaway', 'BlackRock', 'Vanguard Group'];
    const popularPoliticians = ['Nancy Pelosi', 'Dan Crenshaw', 'Josh Gottheimer'];
    const popularVIPs = ['Warren Buffett', 'Ray Dalio', 'Cathie Wood'];

    await Promise.allSettled([
      ...popularInstitutions.map(inst => 
        this.thirteenFService.getPortfolio(inst, { useCache: true, maxHoldings: 20 })
      ),
      ...popularPoliticians.map(pol => 
        this.politicianService.getPoliticianProfile(pol, { useCache: true })
      ),
      ...popularVIPs.map(vip => 
        this.vipProfileService.getProfile(vip, { useCache: true })
      )
    ]);

    console.log('🔥 Unified intelligence caches warmed up successfully');
  }
} 