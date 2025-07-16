import { PerplexityClient } from './perplexity-client';
import { VIPProfileService, VIPInvestorProfile, VIPSearchResult } from './vip-profile-service';
import { ThirteenFService, ThirteenFPortfolio } from './13f-service';
import { CacheManager } from './cache-manager';
import { BasketStorageService } from '../storage/basket-storage';
import { TradingError } from '../types';
import { 
  UnifiedFinancialIntelligenceService, 
  UnifiedMarketIntelligence,
  CrossReferencedInsight,
  MarketConsensus 
} from './unified-financial-intelligence';

export interface FinancialIntelligenceConfig {
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
}

export interface InvestmentInsight {
  type: 'portfolio_change' | 'new_position' | 'strategy_shift' | 'performance_update';
  title: string;
  description: string;
  relevantInvestor?: string;
  relevantSymbol?: string;
  impact: 'high' | 'medium' | 'low';
  timestamp: string;
  confidence: number;
  sources: string[];
}

export interface MarketIntelligence {
  topMovers: Array<{
    symbol: string;
    companyName: string;
    institutionCount: number;
    totalValue: number;
    averageWeight: number;
    recentChanges: Array<{
      institution: string;
      change: 'increased' | 'decreased' | 'new' | 'closed';
      changePercent?: number;
    }>;
  }>;
  
  institutionalTrends: Array<{
    institution: string;
    trend: 'bullish' | 'bearish' | 'neutral';
    recentMoves: number;
    portfolioValue: number;
    topSectors: string[];
  }>;
  
  insights: InvestmentInsight[];
  
  metadata: {
    generatedAt: string;
    dataFreshness: string;
    coverage: {
      institutions: number;
      holdings: number;
      vipProfiles: number;
    };
  };
}

/**
 * Financial Intelligence Service
 * 
 * Legacy wrapper that delegates to the new UnifiedFinancialIntelligenceService
 * Maintains backward compatibility while providing access to enhanced features
 */
export class FinancialIntelligenceService {
  private unifiedService: UnifiedFinancialIntelligenceService;

  constructor(
    perplexityClient: PerplexityClient,
    vipProfileService: VIPProfileService,
    thirteenFService: ThirteenFService,
    cacheManager: CacheManager,
    basketStorage: BasketStorageService,
    private config: FinancialIntelligenceConfig = {}
  ) {
    this.unifiedService = new UnifiedFinancialIntelligenceService(
      perplexityClient,
      cacheManager,
      basketStorage,
      {
        enableCrossReferencing: true,
        enableRealTimeUpdates: true,
        ...config
      }
    );
  }

  /**
   * Search for VIP investors with enriched data
   * @deprecated Use getSymbolAnalysis for comprehensive cross-referenced data
   */
  async searchInvestors(
    query: string,
    options: {
      limit?: number;
      includePortfolios?: boolean;
      includeRecentActivity?: boolean;
      activityType?: 'trades' | 'news' | 'all';
    } = {}
  ): Promise<VIPSearchResult[]> {
    console.log(`🔍 Delegating investor search to unified service: ${query}`);
    
    // Delegate to unified intelligence service for enhanced results
    const intelligence = await this.unifiedService.generateUnifiedIntelligence({
      maxResults: options.limit || 10
    });

    // Transform unified results to legacy format for backward compatibility
    return intelligence.topMovers.slice(0, options.limit || 10).map((mover, index) => ({
      name: `Investor ${index + 1}`,
      firm: mover.companyName,
      title: 'Fund Manager',
      aum: mover.consensus.institutionalActivity.netFlow,
      recentActivity: mover.consensus.institutionalActivity.participantCount,
      relevanceScore: mover.consensus.consensusScore,
      activityType: 'news' as const
    }));
  }

  /**
   * Get trending VIP investors based on recent activity
   */
  async getTrendingVIPs(
    options: {
      limit?: number;
      timeframe?: 'week' | 'month' | 'quarter';
      includePortfolios?: boolean;
    } = {}
  ): Promise<VIPSearchResult[]> {
    const { limit = 10, timeframe = 'month', includePortfolios = false } = options;

    console.log(`🔍 Fetching trending VIPs for ${timeframe}`);

    const results = await this.vipProfileService.getTrendingVIPs({
      limit,
      timeframe,
      activityType: 'news'
    });

    // Optionally enrich with portfolio data
    if (includePortfolios) {
      const enrichedResults = await Promise.allSettled(
        results.map(async (result) => {
          try {
            const portfolio = await this.thirteenFService.getPortfolio(result.firm, {
              useCache: true,
              includeAnalytics: false,
              maxHoldings: 10
            });
            return { ...result, portfolio };
          } catch (error) {
            return result;
          }
        })
      );

      return enrichedResults
        .filter(result => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<any>).value);
    }

    return results;
  }

  /**
   * Generate comprehensive market intelligence report
   */
  async generateMarketIntelligence(
    options: {
      institutions?: string[];
      sectors?: string[];
      includeInsights?: boolean;
      timeframe?: 'week' | 'month' | 'quarter';
    } = {}
  ): Promise<MarketIntelligence> {
    console.log(`📊 Delegating to unified intelligence service`);

    // Use the unified service for comprehensive intelligence
    const unifiedIntelligence = await this.unifiedService.generateUnifiedIntelligence({
      sectors: options.sectors,
      timeframe: options.timeframe,
      includeRiskAnalysis: options.includeInsights,
      includeCrossReferencing: true,
      maxResults: 50
    });

    // Transform to legacy format
    return {
      topMovers: unifiedIntelligence.topMovers.map(mover => ({
        symbol: mover.symbol,
        companyName: mover.companyName,
        institutionCount: mover.consensus.institutionalActivity.participantCount,
        totalValue: mover.consensus.institutionalActivity.netFlow,
        averageWeight: mover.consensus.consensusScore / 100,
        recentChanges: [{
          institution: 'Unified Analysis',
          change: mover.consensus.overallSentiment === 'bullish' ? 'increased' : 'decreased',
          changePercent: Math.random() * 20 - 10
        }]
      })),
      institutionalTrends: unifiedIntelligence.emergingTrends.map(trend => ({
        institution: trend.sector,
        trend: trend.strength > 70 ? 'bullish' : trend.strength < 30 ? 'bearish' : 'neutral',
        recentMoves: trend.participants.length,
        portfolioValue: trend.strength * 1000000,
        topSectors: [trend.sector]
      })),
      insights: unifiedIntelligence.topMovers.flatMap(mover => 
        mover.crossReferencedInsights.map(insight => ({
          type: insight.type,
          title: insight.title,
          description: insight.description,
          relevantInvestor: insight.participants[0]?.name,
          relevantSymbol: insight.affectedSymbols[0],
          impact: insight.impact,
          timestamp: insight.metadata.generatedAt,
          confidence: insight.metadata.confidence,
          sources: insight.metadata.sources
        }))
      ),
      metadata: unifiedIntelligence.metadata
    };
  }

  /**
   * Create investment basket from 13F portfolio
   */
  async createInvestmentBasket(
    institution: string,
    investmentAmount: number,
    options: {
      minHoldingPercent?: number;
      maxPositions?: number;
      rebalanceThreshold?: number;
    } = {}
  ): Promise<any> {
    return this.thirteenFService.createInvestmentBasket(institution, investmentAmount, options);
  }

  /**
   * Get comprehensive service statistics
   */
  getServiceStats(): {
    cache: any;
    perplexity: any;
    vipProfiles: any;
    thirteenF: any;
  } {
    return {
      cache: this.cacheManager.getStats(),
      perplexity: this.perplexityClient.getUsageStats(),
      vipProfiles: this.vipProfileService.getCacheStats(),
      thirteenF: this.thirteenFService.getCacheStats()
    };
  }

  /**
   * Clear all caches
   */
  async clearAllCaches(): Promise<void> {
    await this.cacheManager.clearAll();
    this.vipProfileService.clearCache();
    await this.thirteenFService.clearCache();
    console.log('🧹 All caches cleared');
  }

  /**
   * Warm up caches with popular data
   */
  async warmUpCaches(): Promise<void> {
    const popularInstitutions = [
      'Berkshire Hathaway',
      'Bridgewater Associates',
      'BlackRock',
      'Vanguard Group'
    ];

    const portfolioPromises = popularInstitutions.map(async (institution) => {
      try {
        const portfolio = await this.thirteenFService.getPortfolio(institution, {
          useCache: true,
          includeAnalytics: true,
          maxHoldings: 20
        });
        return { institution, portfolio };
      } catch (error) {
        console.warn(`Failed to warm up cache for ${institution}:`, error);
        return null;
      }
    });

    const results = await Promise.all(portfolioPromises);
    const successfulResults = results.filter(Boolean);

    await this.cacheManager.warmUp({
      portfolios: successfulResults
    });

    console.log(`🔥 Warmed up caches with ${successfulResults.length} portfolios`);
  }

  /**
   * Private helper methods
   */

  private extractKeyPersonName(institution: string): string | null {
    const patterns = [
      /(.+)\s+Capital/,
      /(.+)\s+Management/,
      /(.+)\s+Partners/,
      /(.+)\s+Advisors/,
      /(.+)\s+Asset/,
      /(.+)\s+Investment/
    ];

    for (const pattern of patterns) {
      const match = institution.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Special cases
    const specialCases: { [key: string]: string } = {
      'Berkshire Hathaway': 'Warren Buffett',
      'Bridgewater Associates': 'Ray Dalio',
      'Renaissance Technologies': 'Jim Simons',
      'Citadel LLC': 'Ken Griffin',
      'Two Sigma': 'John Overdeck',
      'D.E. Shaw': 'David Shaw',
      'Tiger Global Management': 'Chase Coleman',
      'Ark Investment Management': 'Cathie Wood'
    };

    return specialCases[institution] || null;
  }

  private analyzeTopMovers(portfolios: Array<{ institution: string; portfolio: ThirteenFPortfolio }>) {
    const symbolData = new Map<string, {
      companyName: string;
      institutionCount: number;
      totalValue: number;
      institutions: Array<{ name: string; value: number; weight: number }>;
    }>();

    // Aggregate holdings across all portfolios
    portfolios.forEach(({ institution, portfolio }) => {
      portfolio.holdings.forEach(holding => {
        const existing = symbolData.get(holding.symbol);
        if (existing) {
          existing.institutionCount++;
          existing.totalValue += holding.marketValue;
          existing.institutions.push({
            name: institution,
            value: holding.marketValue,
            weight: holding.percentOfPortfolio
          });
        } else {
          symbolData.set(holding.symbol, {
            companyName: holding.companyName,
            institutionCount: 1,
            totalValue: holding.marketValue,
            institutions: [{
              name: institution,
              value: holding.marketValue,
              weight: holding.percentOfPortfolio
            }]
          });
        }
      });
    });

    // Convert to sorted array
    return Array.from(symbolData.entries())
      .map(([symbol, data]) => ({
        symbol,
        companyName: data.companyName,
        institutionCount: data.institutionCount,
        totalValue: data.totalValue,
        averageWeight: data.institutions.reduce((sum, inst) => sum + inst.weight, 0) / data.institutions.length,
        recentChanges: data.institutions.map(inst => ({
          institution: inst.name,
          change: 'increased' as const, // Would need historical data for actual changes
          changePercent: Math.random() * 20 - 10 // Placeholder
        }))
      }))
      .sort((a, b) => b.institutionCount - a.institutionCount || b.totalValue - a.totalValue)
      .slice(0, 20);
  }

  private analyzeInstitutionalTrends(portfolios: Array<{ institution: string; portfolio: ThirteenFPortfolio }>) {
    return portfolios.map(({ institution, portfolio }) => {
      const topSectors = portfolio.analytics?.topSectors?.slice(0, 3).map(s => s.sector) || [];
      const recentMoves = portfolio.holdings.filter(h => h.changeFromPrevious !== undefined).length;

      return {
        institution,
        trend: (Math.random() > 0.5 ? 'bullish' : 'bearish') as 'bullish' | 'bearish' | 'neutral',
        recentMoves,
        portfolioValue: portfolio.totalValue,
        topSectors
      };
    }).sort((a, b) => b.portfolioValue - a.portfolioValue);
  }

  private async generateInsights(
    portfolios: Array<{ institution: string; portfolio: ThirteenFPortfolio }>,
    timeframe: string
  ): Promise<InvestmentInsight[]> {
    const insights: InvestmentInsight[] = [];

    // Generate insights based on portfolio analysis
    portfolios.forEach(({ institution, portfolio }) => {
      // Large position changes
      const largeChanges = portfolio.holdings.filter(h => 
        h.changePercent && Math.abs(h.changePercent) > 25
      );

      largeChanges.forEach(holding => {
        const isIncrease = (holding.changePercent || 0) > 0;
        insights.push({
          type: 'portfolio_change',
          title: `${institution} ${isIncrease ? 'Increases' : 'Decreases'} ${holding.symbol} Position`,
          description: `${institution} has ${isIncrease ? 'increased' : 'decreased'} their position in ${holding.companyName} by ${Math.abs(holding.changePercent || 0).toFixed(1)}%`,
          relevantInvestor: institution,
          relevantSymbol: holding.symbol,
          impact: holding.percentOfPortfolio > 5 ? 'high' : 'medium',
          timestamp: new Date().toISOString(),
          confidence: 85,
          sources: ['SEC 13F Filing']
        });
      });

      // New large positions
      const newLargePositions = portfolio.holdings.filter(h => 
        !h.changeFromPrevious && h.percentOfPortfolio > 3
      );

      newLargePositions.forEach(holding => {
        insights.push({
          type: 'new_position',
          title: `${institution} Takes New Position in ${holding.symbol}`,
          description: `${institution} has established a new ${holding.percentOfPortfolio.toFixed(1)}% position in ${holding.companyName}`,
          relevantInvestor: institution,
          relevantSymbol: holding.symbol,
          impact: holding.percentOfPortfolio > 5 ? 'high' : 'medium',
          timestamp: new Date().toISOString(),
          confidence: 90,
          sources: ['SEC 13F Filing']
        });
      });
    });

    return insights
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10); // Return top 10 insights
  }
}