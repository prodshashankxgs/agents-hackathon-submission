import fetch from 'node-fetch';
import { TradingError } from '../types';
import { BasketStorageService } from '../storage/basket-storage';
import { config } from '../config';

export interface ThirteenFHolding {
  symbol: string;
  companyName: string;
  shares: number;
  marketValue: number;
  percentOfPortfolio: number;
  changeFromPrevious?: number;
  changePercent?: number;
  cusip?: string;
  pricePerShare?: number;
  sector?: string;
  industry?: string;
  marketCap?: number;
}

export interface ThirteenFPortfolio {
  institution: string;
  cik: string;
  filingDate: string;
  totalValue: number;
  holdings: ThirteenFHolding[];
  quarterEndDate: string;
  formType?: string;
  documentCount?: number;
  amendmentFlag?: boolean;
  // Enhanced analytics
  analytics?: {
    topSectors: Array<{ sector: string; percentage: number; value: number }>;
    diversificationScore: number;
    concentrationRisk: number;
    avgHoldingSize: number;
    quarterlyChange: {
      totalValue: number;
      totalValuePercent: number;
      newPositions: number;
      closedPositions: number;
      increasedPositions: number;
      decreasedPositions: number;
    };
    performanceMetrics?: {
      returnSinceLastFiling?: number;
      volatility?: number;
      sharpeRatio?: number;
    };
    riskMetrics?: {
      betaWeighted?: number;
      correlationToSP500?: number;
      maxDrawdown?: number;
    };
  };
  metadata?: {
    dataSource: 'quiver' | 'mock';
    lastUpdated: string;
    cacheExpiry: string;
    processingTime: number;
  };
}

interface CacheEntry {
  data: ThirteenFPortfolio;
  timestamp: number;
  expiry: number;
}

interface QuiverApiResponse {
  data: Array<{
    symbol: string;
    companyName: string;
    value: string;
    shares: string;
    [key: string]: any;
  }>;
  filingDate: string;
  totalValue: number;
  [key: string]: any;
}

interface SectorMapping {
  [symbol: string]: {
    sector: string;
    industry: string;
    marketCap?: number;
  };
}

export class ThirteenFService {
  private cache = new Map<string, CacheEntry>();
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 4; // 4 hours
  private readonly REQUEST_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between requests
  private lastRequestTime = 0;
  
  // Sector mapping cache for better performance
  private sectorCache = new Map<string, SectorMapping[string]>();
  
  constructor(private basketStorage: BasketStorageService) {}

  /**
   * Get 13F portfolio data with caching and error handling
   */
  async getPortfolio(institution: string, options: {
    useCache?: boolean;
    includeAnalytics?: boolean;
    maxHoldings?: number;
  } = {}): Promise<ThirteenFPortfolio> {
    const {
      useCache = true,
      includeAnalytics = true,
      maxHoldings = 200
    } = options;

    const cacheKey = `13f-${institution.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const startTime = Date.now();

    try {
      // Check cache first
      if (useCache && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        if (Date.now() < cached.expiry) {
          console.log(`📋 Using cached 13F data for ${institution}`);
          return cached.data;
        }
        this.cache.delete(cacheKey);
      }

      // Rate limiting
      await this.enforceRateLimit();

      let portfolio: ThirteenFPortfolio;
      
      if (config.quiverApiKey) {
        console.log(`🔍 Fetching real 13F data for ${institution} from QuiverQuant`);
        portfolio = await this.fetchFromQuiverQuant(institution, maxHoldings);
      } else {
        console.log(`🎭 Using mock 13F data for ${institution} (no API key)`);
        portfolio = await this.generateMockPortfolio(institution, maxHoldings);
      }

      // Add analytics if requested
      if (includeAnalytics) {
        const analytics = await this.calculateAnalytics(portfolio);
        if (analytics) {
          portfolio.analytics = analytics;
        }
      }

      // Add metadata
      portfolio.metadata = {
        dataSource: config.quiverApiKey ? 'quiver' : 'mock',
        lastUpdated: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + this.CACHE_DURATION).toISOString(),
        processingTime: Date.now() - startTime
      };

      // Cache the result
      if (useCache) {
        this.cache.set(cacheKey, {
          data: portfolio,
          timestamp: Date.now(),
          expiry: Date.now() + this.CACHE_DURATION
        });
      }

      return portfolio;
      
    } catch (error) {
      console.error(`❌ Error fetching 13F data for ${institution}:`, error);
      
      // Fallback to cached data if available, even if expired
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        console.log(`🔄 Using expired cache as fallback for ${institution}`);
        return cached.data;
      }

      // Final fallback to mock data
      console.log(`🎭 Falling back to mock data for ${institution}`);
      return this.generateMockPortfolio(institution, maxHoldings);
    }
  }

  /**
   * Fetch real data from QuiverQuant API
   */
  private async fetchFromQuiverQuant(institution: string, maxHoldings: number): Promise<ThirteenFPortfolio> {
    const url = `https://api.quiverquant.com/beta/bulk/13f/${encodeURIComponent(institution)}`;
    
    const response = await this.fetchWithRetry(url, {
      headers: {
        'Authorization': `Bearer ${config.quiverApiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'NaturalLanguageTradingApp/1.0'
      },
      timeout: this.REQUEST_TIMEOUT
    });

    if (!response.ok) {
      throw new TradingError(
        `QuiverQuant API error: ${response.status} ${response.statusText}`,
        'QUIVER_API_ERROR',
        { status: response.status, institution }
      );
    }

    const data: QuiverApiResponse = await response.json();
    return this.processQuiverData(data, institution, maxHoldings);
  }

  /**
   * Process QuiverQuant API response into our format
   */
  private async processQuiverData(data: QuiverApiResponse, institution: string, maxHoldings: number): Promise<ThirteenFPortfolio> {
    if (!data.data || !Array.isArray(data.data)) {
      throw new TradingError('Invalid QuiverQuant API response format', 'INVALID_API_RESPONSE');
    }

    const totalValue = data.totalValue || data.data.reduce((sum, item) => sum + parseFloat(item.value || '0'), 0);
    
    // Process holdings with enhanced data
    const holdings: ThirteenFHolding[] = await Promise.all(
      data.data
        .filter(item => item.symbol && item.value && parseFloat(item.value) > 0)
        .slice(0, maxHoldings)
        .map(async (item): Promise<ThirteenFHolding> => {
          const marketValue = parseFloat(item.value || '0');
          const shares = parseInt(item.shares || '0');
          
          // Get sector information
          const sectorInfo = await this.getSectorInfo(item.symbol);
          
          const holding: ThirteenFHolding = {
            symbol: item.symbol,
            companyName: item.companyName || item.symbol,
            shares,
            marketValue,
            percentOfPortfolio: totalValue > 0 ? (marketValue / totalValue) * 100 : 0,
            pricePerShare: shares > 0 ? marketValue / shares : 0
          };

          // Add optional fields only if they exist
          if (item.cusip) holding.cusip = item.cusip;
          if (sectorInfo?.sector) holding.sector = sectorInfo.sector;
          if (sectorInfo?.industry) holding.industry = sectorInfo.industry;
          if (sectorInfo?.marketCap) holding.marketCap = sectorInfo.marketCap;
          if (item.changeFromPrevious) holding.changeFromPrevious = parseFloat(item.changeFromPrevious);
          if (item.changePercent) holding.changePercent = parseFloat(item.changePercent);

          return holding;
        })
    );

    // Sort by portfolio percentage
    holdings.sort((a: ThirteenFHolding, b: ThirteenFHolding) => b.percentOfPortfolio - a.percentOfPortfolio);

    return {
      institution,
      cik: data.cik || '',
      filingDate: data.filingDate || new Date().toISOString(),
      totalValue,
      holdings,
      quarterEndDate: data.quarterEndDate || data.filingDate || new Date().toISOString(),
      formType: data.formType || '13F-HR',
      documentCount: holdings.length,
      amendmentFlag: data.amendmentFlag || false
    };
  }

  /**
   * Get sector information for a symbol (with caching)
   */
  private async getSectorInfo(symbol: string): Promise<SectorMapping[string] | undefined> {
    if (this.sectorCache.has(symbol)) {
      return this.sectorCache.get(symbol);
    }

    try {
      // This would typically call a financial data API
      // For now, we'll use a basic mapping or return undefined
      const sectorInfo = await this.fetchSectorInfo(symbol);
      if (sectorInfo) {
        this.sectorCache.set(symbol, sectorInfo);
      }
      return sectorInfo;
    } catch (error) {
      console.warn(`Could not fetch sector info for ${symbol}:`, error);
      return undefined;
    }
  }

  /**
   * Fetch sector information from external API
   */
  private async fetchSectorInfo(symbol: string): Promise<SectorMapping[string] | undefined> {
    // This is a placeholder - in production, you'd integrate with a financial data provider
    // like Alpha Vantage, IEX Cloud, or similar
    const basicSectorMap: { [key: string]: SectorMapping[string] } = {
      'AAPL': { sector: 'Technology', industry: 'Consumer Electronics' },
      'MSFT': { sector: 'Technology', industry: 'Software' },
      'GOOGL': { sector: 'Technology', industry: 'Internet Services' },
      'AMZN': { sector: 'Consumer Discretionary', industry: 'E-commerce' },
      'TSLA': { sector: 'Consumer Discretionary', industry: 'Electric Vehicles' },
      'NVDA': { sector: 'Technology', industry: 'Semiconductors' },
      'META': { sector: 'Technology', industry: 'Social Media' },
      'BRK.B': { sector: 'Financial Services', industry: 'Conglomerates' },
      'JNJ': { sector: 'Healthcare', industry: 'Pharmaceuticals' },
      'V': { sector: 'Financial Services', industry: 'Payment Processing' }
    };

    return basicSectorMap[symbol.toUpperCase()];
  }

  /**
   * Calculate comprehensive analytics for the portfolio
   */
  private async calculateAnalytics(portfolio: ThirteenFPortfolio): Promise<ThirteenFPortfolio['analytics']> {
    const holdings = portfolio.holdings;
    const totalValue = portfolio.totalValue;

    // Sector allocation
    const sectorTotals: { [sector: string]: number } = {};
    holdings.forEach(holding => {
      const sector = holding.sector || 'Unknown';
      sectorTotals[sector] = (sectorTotals[sector] || 0) + holding.marketValue;
    });

    const topSectors = Object.entries(sectorTotals)
      .map(([sector, value]) => ({
        sector,
        value,
        percentage: (value / totalValue) * 100
      }))
      .sort((a: { value: number }, b: { value: number }) => b.value - a.value)
      .slice(0, 10);

    // Diversification metrics
    const top10Concentration = holdings.slice(0, 10).reduce((sum, h) => sum + h.percentOfPortfolio, 0);
    const diversificationScore = Math.max(0, 100 - top10Concentration);
    const avgHoldingSize = totalValue / holdings.length;

    // Calculate Herfindahl-Hirschman Index for concentration
    const hhi = holdings.reduce((sum, h) => sum + Math.pow(h.percentOfPortfolio, 2), 0);
    const concentrationRisk = Math.min(100, hhi / 100); // Normalize to 0-100

    return {
      topSectors,
      diversificationScore: Math.round(diversificationScore * 100) / 100,
      concentrationRisk: Math.round(concentrationRisk * 100) / 100,
      avgHoldingSize: Math.round(avgHoldingSize),
      quarterlyChange: {
        totalValue: 0, // Would need historical data
        totalValuePercent: 0,
        newPositions: holdings.filter(h => !h.changeFromPrevious).length,
        closedPositions: 0,
        increasedPositions: holdings.filter(h => (h.changePercent || 0) > 0).length,
        decreasedPositions: holdings.filter(h => (h.changePercent || 0) < 0).length
      }
    };
  }

  /**
   * Generate mock portfolio data for development/fallback
   */
  private async generateMockPortfolio(institution: string, maxHoldings: number): Promise<ThirteenFPortfolio> {
    const mockHoldings: ThirteenFHolding[] = [
      { symbol: 'AAPL', companyName: 'Apple Inc.', shares: 1000000, marketValue: 150000000, percentOfPortfolio: 15.0, sector: 'Technology', industry: 'Consumer Electronics' },
      { symbol: 'MSFT', companyName: 'Microsoft Corporation', shares: 800000, marketValue: 120000000, percentOfPortfolio: 12.0, sector: 'Technology', industry: 'Software' },
      { symbol: 'GOOGL', companyName: 'Alphabet Inc.', shares: 400000, marketValue: 100000000, percentOfPortfolio: 10.0, sector: 'Technology', industry: 'Internet Services' },
      { symbol: 'AMZN', companyName: 'Amazon.com Inc.', shares: 300000, marketValue: 80000000, percentOfPortfolio: 8.0, sector: 'Consumer Discretionary', industry: 'E-commerce' },
      { symbol: 'TSLA', companyName: 'Tesla Inc.', shares: 250000, marketValue: 70000000, percentOfPortfolio: 7.0, sector: 'Consumer Discretionary', industry: 'Electric Vehicles' },
      { symbol: 'NVDA', companyName: 'NVIDIA Corporation', shares: 200000, marketValue: 60000000, percentOfPortfolio: 6.0, sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'META', companyName: 'Meta Platforms Inc.', shares: 180000, marketValue: 50000000, percentOfPortfolio: 5.0, sector: 'Technology', industry: 'Social Media' },
      { symbol: 'BRK.B', companyName: 'Berkshire Hathaway Inc.', shares: 150000, marketValue: 45000000, percentOfPortfolio: 4.5, sector: 'Financial Services', industry: 'Conglomerates' },
      { symbol: 'JNJ', companyName: 'Johnson & Johnson', shares: 120000, marketValue: 40000000, percentOfPortfolio: 4.0, sector: 'Healthcare', industry: 'Pharmaceuticals' },
      { symbol: 'V', companyName: 'Visa Inc.', shares: 100000, marketValue: 35000000, percentOfPortfolio: 3.5, sector: 'Financial Services', industry: 'Payment Processing' }
    ].slice(0, maxHoldings);

    const totalValue = mockHoldings.reduce((sum, h) => sum + h.marketValue, 0);

    // Add price per share
    mockHoldings.forEach(holding => {
      holding.pricePerShare = holding.marketValue / holding.shares;
    });

    return {
      institution,
      cik: 'MOCK-CIK',
      filingDate: new Date().toISOString(),
      totalValue,
      holdings: mockHoldings,
      quarterEndDate: new Date().toISOString(),
      formType: '13F-HR',
      documentCount: mockHoldings.length,
      amendmentFlag: false
    };
  }

  /**
   * Enforce rate limiting between API requests
   */
  private async enforceRateLimit(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(url: string, options: any, retries = 0): Promise<any> {
    try {
      return await fetch(url, options);
    } catch (error) {
      if (retries < this.MAX_RETRIES) {
        console.log(`🔄 Retrying request to ${url} (attempt ${retries + 1}/${this.MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
        return this.fetchWithRetry(url, options, retries + 1);
      }
      throw error;
    }
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  public clearCache(): void {
    this.cache.clear();
    this.sectorCache.clear();
    console.log('🧹 13F service cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { entries: number; size: number; oldestEntry?: string } {
    const entries = this.cache.size;
    const size = JSON.stringify([...this.cache.entries()]).length;
    
    if (entries > 0) {
      const oldest = Math.min(...[...this.cache.values()].map(entry => entry.timestamp));
      return { entries, size, oldestEntry: new Date(oldest).toISOString() };
    }

    return { entries, size };
  }

  /**
   * Create a weighted investment basket from a 13F portfolio
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
    const {
      minHoldingPercent = 0.5,
      maxPositions = 20,
      rebalanceThreshold = 0.1
    } = options;

    const portfolio = await this.getPortfolio(institution);
    const eligibleHoldings = portfolio.holdings.filter(h => h.percentOfPortfolio >= minHoldingPercent);
    const topHoldings = eligibleHoldings.slice(0, maxPositions);

    // Calculate weights and allocations
    const totalWeight = topHoldings.reduce((sum, h) => sum + h.percentOfPortfolio, 0);
    const allocations = topHoldings.map(holding => ({
      symbol: holding.symbol,
      companyName: holding.companyName,
      targetWeight: (holding.percentOfPortfolio / totalWeight) * 100,
      targetValue: (holding.percentOfPortfolio / totalWeight) * investmentAmount,
      originalWeight: holding.percentOfPortfolio
    }));

    // Store in basket storage
    const basketId = `13f-${institution.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    await this.basketStorage.saveBasket({
      id: basketId,
      name: `${institution} 13F Portfolio`,
      description: `Weighted allocation based on ${institution}'s latest 13F filing`,
      allocations,
      totalValue: investmentAmount,
      createdAt: new Date().toISOString(),
      metadata: {
        source: '13f',
        institution,
        filingDate: portfolio.filingDate,
        totalPositions: allocations.length,
        rebalanceThreshold
      }
    });

    return {
      basketId,
      allocations,
      totalValue: investmentAmount,
      metadata: {
        institution,
        filingDate: portfolio.filingDate,
        positionsIncluded: allocations.length,
        totalPortfolioValue: portfolio.totalValue
      }
    };
  }
} 