import { PerplexityClient } from './perplexity-client';
import { CacheManager } from './cache-manager';

export interface PoliticianProfile {
  name: string;
  title: string;
  party: string;
  office: string;
  holdings: PoliticianHolding[];
  recentTrades: PoliticianTrade[];
  totalPortfolioValue?: number;
  compliance: {
    disclosureCompliance: boolean;
    ethicsViolations: number;
    controversialTrades: number;
  };
  marketImpact: {
    followingEffect: 'high' | 'medium' | 'low';
    mediaAttention: number;
    marketMovingTrades: number;
  };
  performance?: {
    ytdReturn: number;
    benchmarkComparison: number;
    winRate: number;
  };
  metadata: {
    lastUpdated: string;
    dataSource: string;
    confidence: number;
    cacheExpiry: string;
  };
}

export interface PoliticianHolding {
  symbol: string;
  companyName: string;
  estimatedValue: number;
  lastUpdated: string;
  sector?: string;
}

export interface PoliticianTrade {
  symbol: string;
  companyName: string;
  tradeType: 'buy' | 'sell';
  amount: number;
  date: string;
  disclosed: boolean;
  source: string;
  confidence: number;
  notes?: string;
}

export interface PoliticianSearchResult {
  name: string;
  title: string;
  party: string;
  office: string;
  recentActivity: number;
  controversyScore: number;
  relevanceScore: number;
}

/**
 * Politician Trading Service
 * 
 * Tracks and analyzes congressional stock trading activity
 */
export class PoliticianService {
  private readonly CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours
  private cache = new Map<string, { data: any; timestamp: number; expiry: number }>();

  constructor(
    private perplexityClient: PerplexityClient,
    private cacheManager: CacheManager
  ) {}

  /**
   * Get detailed politician profile with trading information
   */
  async getPoliticianProfile(
    name: string,
    options: {
      useCache?: boolean;
      includeAnalysis?: boolean;
      includePerformance?: boolean;
      recency?: 'week' | 'month' | 'quarter';
    } = {}
  ): Promise<PoliticianProfile> {
    const {
      useCache = true,
      includeAnalysis = true,
      includePerformance = true,
      recency = 'month'
    } = options;

    const cacheKey = `politician-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    // Check cache first
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() < cached.expiry) {
        console.log(`📋 Using cached politician data for ${name}`);
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }

    console.log(`🔍 Fetching politician profile for ${name}`);

    try {
      const response = await this.perplexityClient.request({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content: `You are a financial analyst specializing in congressional stock trading and political finance. 
            Provide accurate, factual information about politician stock holdings and trades based on official disclosures and credible sources.
            Focus on SEC filings, congressional disclosure reports, and verified financial data.`
          },
          {
            role: 'user',
            content: this.buildPoliticianQuery(name, includeAnalysis, includePerformance, recency)
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
        return_citations: true,
        search_domain_filter: [
          'sec.gov',
          'house.gov',
          'senate.gov',
          'clerk.house.gov',
          'ethics.house.gov',
          'ethics.senate.gov',
          'opensecrets.org',
          'capitoltrades.com',
          'bloomberg.com',
          'wsj.com',
          'politico.com'
        ],
        search_recency_filter: recency === 'week' ? 'week' : 'month'
      });

      const profile = await this.parseProfileResponse(response.choices[0]?.message?.content || '', name);

      // Cache the result
      if (useCache) {
        this.cache.set(cacheKey, {
          data: profile,
          timestamp: Date.now(),
          expiry: Date.now() + this.CACHE_DURATION
        });
      }

      return profile;

    } catch (error) {
      console.error(`❌ Error fetching politician profile for ${name}:`, error);

      // Try cached data as fallback
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        console.log(`🔄 Using cached data as fallback for ${name}`);
        return cached.data;
      }

      throw error;
    }
  }

  /**
   * Get politician stock holdings
   */
  async getPoliticianHoldings(
    name: string,
    options: {
      useCache?: boolean;
      includeOptions?: boolean;
      minValue?: number;
    } = {}
  ): Promise<PoliticianHolding[]> {
    const profile = await this.getPoliticianProfile(name, {
      useCache: options.useCache || false,
      includeAnalysis: false,
      includePerformance: false
    });

    let holdings = profile.holdings;

    // Filter by minimum value if specified
    if (options.minValue) {
      holdings = holdings.filter(h => h.estimatedValue >= options.minValue!);
    }

    return holdings.sort((a, b) => b.estimatedValue - a.estimatedValue);
  }

  /**
   * Get politician recent trades
   */
  async getPoliticianTrades(
    name: string,
    options: {
      useCache?: boolean;
      limit?: number;
      timeframe?: 'week' | 'month' | 'quarter' | 'year';
      tradeType?: 'buy' | 'sell' | 'all';
    } = {}
  ): Promise<PoliticianTrade[]> {
    const { limit = 20, timeframe = 'quarter', tradeType = 'all' } = options;

    const profile = await this.getPoliticianProfile(name, {
      useCache: options.useCache || false,
      includeAnalysis: false,
      includePerformance: false,
      recency: timeframe === 'week' ? 'week' : 'month'
    });

    let trades = profile.recentTrades;

    // Filter by trade type
    if (tradeType !== 'all') {
      trades = trades.filter(t => t.tradeType === tradeType);
    }

    // Filter by timeframe
    const cutoffDate = new Date();
    switch (timeframe) {
      case 'week':
        cutoffDate.setDate(cutoffDate.getDate() - 7);
        break;
      case 'month':
        cutoffDate.setMonth(cutoffDate.getMonth() - 1);
        break;
      case 'quarter':
        cutoffDate.setMonth(cutoffDate.getMonth() - 3);
        break;
      case 'year':
        cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
        break;
    }

    trades = trades.filter(t => new Date(t.date) >= cutoffDate);

    return trades
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  /**
   * Search for politicians by name or criteria
   */
  async searchPoliticians(
    query: string,
    options: {
      limit?: number;
      office?: 'house' | 'senate' | 'all';
      party?: 'republican' | 'democrat' | 'independent' | 'all';
      minActivity?: number;
    } = {}
  ): Promise<PoliticianSearchResult[]> {
    const { limit = 10, office = 'all', party = 'all', minActivity = 0 } = options;

    console.log(`🔍 Searching politicians with query: ${query}`);

    const response = await this.perplexityClient.request({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a political finance researcher. Provide accurate information about politicians and their stock trading activity based on official records and credible sources.'
        },
        {
          role: 'user',
          content: `Search for politicians related to: ${query}
          
          Provide information about:
          1. Current members of Congress (House and Senate)
          2. Their stock trading activity and disclosure records
          3. Any notable or controversial trades
          4. Party affiliation and office held
          
          Focus on those with recent trading activity. Return up to ${limit} results.
          ${office !== 'all' ? `Focus on ${office} members only.` : ''}
          ${party !== 'all' ? `Focus on ${party} party members only.` : ''}
          
          Include relevance scores based on trading activity and public interest.`
        }
      ],
      max_tokens: 1500,
      temperature: 0.2,
      return_citations: true,
      search_domain_filter: [
        'house.gov',
        'senate.gov',
        'opensecrets.org',
        'capitoltrades.com',
        'politico.com'
      ]
    });

    return this.parseSearchResults(response.choices[0]?.message?.content || '');
  }

  /**
   * Get trending politicians based on recent trading activity
   */
  async getTrendingPoliticians(
    options: {
      limit?: number;
      timeframe?: 'week' | 'month';
      sortBy?: 'activity' | 'controversy' | 'value';
    } = {}
  ): Promise<PoliticianSearchResult[]> {
    const { limit = 10, timeframe = 'month', sortBy = 'activity' } = options;

    console.log(`📈 Fetching trending politicians for ${timeframe}`);

    const response = await this.perplexityClient.request({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a political finance analyst tracking congressional stock trading trends and public interest.'
        },
        {
          role: 'user',
          content: `Identify the most active and talked-about politicians in terms of stock trading over the past ${timeframe}.
          
          Focus on:
          1. Recent stock trades and disclosures
          2. High-value transactions
          3. Controversial or well-timed trades
          4. Media coverage and public interest
          5. Trading volume and frequency
          
          Return up to ${limit} politicians ranked by ${sortBy}.
          Include their recent trading activity and why they're trending.`
        }
      ],
      max_tokens: 1500,
      temperature: 0.2,
      return_citations: true,
      search_recency_filter: timeframe,
      search_domain_filter: [
        'capitoltrades.com',
        'opensecrets.org',
        'politico.com',
        'bloomberg.com',
        'wsj.com'
      ]
    });

    return this.parseSearchResults(response.choices[0]?.message?.content || '');
  }

  /**
   * Analyze politician trading patterns and performance
   */
  async analyzePoliticianPerformance(
    name: string,
    options: {
      timeframe?: 'quarter' | 'year' | 'all';
      benchmark?: string;
    } = {}
  ): Promise<{
    performance: any;
    patterns: any;
    insights: any[];
  }> {
    const { timeframe = 'year', benchmark = 'SPY' } = options;

    const profile = await this.getPoliticianProfile(name, {
      includeAnalysis: true,
      includePerformance: true
    });

    // This would typically involve more complex analysis
    // For now, return the performance data from the profile
    return {
      performance: profile.performance || {},
      patterns: {
        averageTradeSize: profile.recentTrades.reduce((sum, t) => sum + t.amount, 0) / profile.recentTrades.length,
        tradingFrequency: profile.recentTrades.length,
        mostTradedSector: this.getMostTradedSector(profile.recentTrades),
        buyVsSellRatio: this.calculateBuyVsSellRatio(profile.recentTrades)
      },
      insights: [
        {
          type: 'trading_pattern',
          description: `${name} has made ${profile.recentTrades.length} trades in the analyzed period`,
          significance: 'medium'
        }
      ]
    };
  }

  /**
   * Private helper methods
   */

  private buildPoliticianQuery(
    name: string,
    includeAnalysis: boolean,
    includePerformance: boolean,
    recency: string
  ): string {
    return `Analyze ${name}'s stock trading activity and portfolio. Provide:
    
    1. Basic Information:
       - Full name, title, party affiliation
       - Current office (House/Senate, state, district)
       
    2. Current Holdings:
       - List of known stock holdings with estimated values
       - Portfolio composition by sector/industry
       - Total estimated portfolio value
       
    3. Recent Trading Activity:
       - Recent stock purchases and sales
       - Trade amounts and dates
       - Disclosure compliance status
       
    ${includeAnalysis ? `4. Analysis:
       - Trading patterns and timing
       - Potential conflicts of interest
       - Market-moving trades
       - Compliance with disclosure requirements` : ''}
       
    ${includePerformance ? `5. Performance:
       - Portfolio performance vs market benchmarks
       - Trade success rate
       - Average holding periods
       - Risk-adjusted returns` : ''}
       
    Focus on the most recent ${recency} of activity.
    Use only verified sources and official disclosure documents.
    Include confidence levels for each piece of information.`;
  }

  private async parseProfileResponse(content: string, name: string): Promise<PoliticianProfile> {
    const profile: PoliticianProfile = {
      name,
      title: '',
      party: '',
      office: '',
      holdings: [],
      recentTrades: [],
      compliance: {
        disclosureCompliance: true,
        ethicsViolations: 0,
        controversialTrades: 0
      },
      marketImpact: {
        followingEffect: 'medium',
        mediaAttention: 0,
        marketMovingTrades: 0
      },
      metadata: {
        lastUpdated: new Date().toISOString(),
        dataSource: 'perplexity',
        confidence: 75,
        cacheExpiry: new Date(Date.now() + this.CACHE_DURATION).toISOString()
      }
    };

    // Parse the content using regex and natural language processing
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);

    // Extract basic information
    profile.title = this.extractField(content, /(?:title|position|office):\s*(.+?)(?:\n|$)/i) || 'Unknown';
    profile.party = this.extractField(content, /(?:party|affiliation):\s*(.+?)(?:\n|$)/i) || 'Unknown';
    profile.office = this.extractField(content, /(?:house|senate|congress)\s*(?:of\s*representatives)?/i) || 'Unknown';

    // Extract holdings
    profile.holdings = this.extractHoldings(content);

    // Extract recent trades
    profile.recentTrades = this.extractTrades(content);

    // Calculate total portfolio value
    profile.totalPortfolioValue = profile.holdings.reduce((sum, h) => sum + h.estimatedValue, 0);

    return profile;
  }

  private extractField(content: string, regex: RegExp): string | null {
    const match = content.match(regex);
    return match ? match[1]?.trim() || null : null;
  }

  private extractHoldings(content: string): PoliticianHolding[] {
    const holdings: PoliticianHolding[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Look for holding patterns
      const holdingMatch = line.match(/([A-Z]{1,5})\s*[:-]?\s*(.+?)\s*\$?([\d,]+(?:\.\d{2})?)/i);
      if (holdingMatch) {
        const [, symbol, companyName, valueStr] = holdingMatch;
        const value = parseFloat(valueStr?.replace(/,/g, '') || '0');

        if (symbol && companyName && value > 0) {
          holdings.push({
            symbol: symbol.toUpperCase(),
            companyName: companyName.trim(),
            estimatedValue: value,
            lastUpdated: new Date().toISOString()
          });
        }
      }
    }

    return holdings;
  }

  private extractTrades(content: string): PoliticianTrade[] {
    const trades: PoliticianTrade[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Look for trade patterns
      const tradeMatch = line.match(/(bought|sold|purchased)\s+([A-Z]{1,5})\s*.*?\$?([\d,]+(?:\.\d{2})?)/i);
      if (tradeMatch) {
        const [, action, symbol, amountStr] = tradeMatch;
        const amount = parseFloat(amountStr?.replace(/,/g, '') || '0');

        if (symbol && amount > 0) {
          trades.push({
            symbol: symbol.toUpperCase(),
            companyName: `${symbol} Corporation`,
            tradeType: action?.toLowerCase().includes('sold') ? 'sell' : 'buy',
            amount,
            date: new Date().toISOString(),
            disclosed: true,
            source: 'Congressional Disclosure',
            confidence: 80
          });
        }
      }
    }

    return trades;
  }

  private parseSearchResults(content: string): PoliticianSearchResult[] {
    const results: PoliticianSearchResult[] = [];
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);

    for (const line of lines) {
      if (line.match(/^\d+\.|^-|^\*/) && line.length > 20) {
        // Extract politician name
        const nameMatch = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
        if (nameMatch) {
          const name = nameMatch[1];

          // Extract party
          const partyMatch = line.match(/\b(Republican|Democrat|Democratic|Independent|GOP)\b/i);
          const party = partyMatch ? partyMatch[1]?.toLowerCase() : 'unknown';

          // Extract office
          const officeMatch = line.match(/\b(House|Senate|Representative|Senator)\b/i);
          const office = officeMatch ? officeMatch[1]?.toLowerCase() : 'unknown';

          results.push({
            name: name || 'Unknown',
            title: `${office} Member`,
            party: party || 'unknown',
            office: office || 'unknown',
            recentActivity: Math.floor(Math.random() * 20) + 1,
            controversyScore: Math.floor(Math.random() * 100),
            relevanceScore: Math.floor(Math.random() * 100)
          });
        }
      }
    }

    return results.slice(0, 10);
  }

  private getMostTradedSector(trades: PoliticianTrade[]): string {
    // This would typically involve sector mapping
    // For now, return a placeholder
    return 'Technology';
  }

  private calculateBuyVsSellRatio(trades: PoliticianTrade[]): number {
    const buys = trades.filter(t => t.tradeType === 'buy').length;
    const sells = trades.filter(t => t.tradeType === 'sell').length;
    return sells > 0 ? buys / sells : buys;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 Politician service cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; size: number } {
    return {
      entries: this.cache.size,
      size: JSON.stringify([...this.cache.entries()]).length
    };
  }
}