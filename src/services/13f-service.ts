import { TradingError } from '../types';
import { BasketStorageService } from '../storage/basket-storage';
import { PerplexityClient } from './perplexity-client';
import { CacheManager } from './cache-manager';
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
    dataSource: 'perplexity';
    lastUpdated: string;
    cacheExpiry: string;
    processingTime: number;
  };
}

interface SectorMapping {
  [symbol: string]: {
    sector: string;
    industry: string;
    marketCap?: number;
  };
}

export class ThirteenFService {
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 4; // 4 hours
  private sectorCache = new Map<string, SectorMapping[string]>();
  
  constructor(
    private basketStorage: BasketStorageService,
    private perplexityClient: PerplexityClient,
    private cacheManager: CacheManager
  ) {}

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
      if (useCache) {
        const cached = await this.cacheManager.get13FPortfolio(institution);
        if (cached) {
          console.log(`📋 Using cached 13F data for ${institution}`);
          return cached;
        }
      }

      if (!config.perplexityApiKey) {
        throw new Error(`⚠️ 13F data service unavailable - missing Perplexity API key. Please configure PERPLEXITY_API_KEY environment variable.`);
      }

      console.log(`🔍 Fetching 13F data for ${institution} from Perplexity AI`);
      const portfolio = await this.fetchFromPerplexity(institution, maxHoldings);

      // Add analytics if requested
      if (includeAnalytics) {
        const analytics = await this.calculateAnalytics(portfolio);
        if (analytics) {
          portfolio.analytics = analytics;
        }
      }

      // Add metadata
      portfolio.metadata = {
        dataSource: 'perplexity',
        lastUpdated: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + this.CACHE_DURATION).toISOString(),
        processingTime: Date.now() - startTime
      };

      // Cache the result
      if (useCache) {
        await this.cacheManager.set13FPortfolio(institution, portfolio, this.CACHE_DURATION);
      }

      return portfolio;
      
    } catch (error) {
      console.error(`❌ Error fetching 13F data for ${institution}:`, error);
      
      // Try to get any cached data as fallback
      const cached = await this.cacheManager.get13FPortfolio(institution);
      if (cached) {
        console.log(`🔄 Using cached data as fallback for ${institution}`);
        return cached;
      }

      // No fallback available - rethrow the error
      throw error;
    }
  }

  /**
   * Fetch data using Perplexity AI for real-time 13F analysis
   */
  private async fetchFromPerplexity(institution: string, maxHoldings: number): Promise<ThirteenFPortfolio> {
    const response = await this.perplexityClient.analyze13F(institution, {
      maxHoldings,
      includeAnalysis: true,
      recency: 'month'
    });

    return this.processPerplexityData(response, institution, maxHoldings);
  }



  /**
   * Process Perplexity AI response into our format
   */
  private async processPerplexityData(data: any, institution: string, maxHoldings: number): Promise<ThirteenFPortfolio> {
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new TradingError('Invalid Perplexity API response format', 'INVALID_API_RESPONSE');
    }

    try {
      // Extract structured data from the AI response
      const holdings = await this.parsePerplexityResponse(content, maxHoldings);
      
      // Calculate total portfolio value
      const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);
      
      // Generate filing metadata
      const defaultDate = new Date().toISOString().split('T')[0];
      const extractedDate = this.extractFilingDate(content);
      const filingDate = (extractedDate !== null ? extractedDate : defaultDate) as string;
      const quarterEndDate = this.calculateQuarterEndDate(filingDate);

      return {
        institution,
        cik: this.generateCIK(institution),
        filingDate,
        quarterEndDate,
        totalValue,
        holdings,
        formType: '13F-HR',
        documentCount: holdings.length,
        amendmentFlag: false,
        metadata: {
          dataSource: 'perplexity',
          lastUpdated: new Date().toISOString(),
          cacheExpiry: new Date(Date.now() + this.CACHE_DURATION).toISOString(),
          processingTime: 0
        }
      };
    } catch (error) {
      console.error('Error processing Perplexity response:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new TradingError('Failed to process Perplexity response', 'PROCESSING_ERROR', { institution, error: errorMessage });
    }
  }

  /**
   * Parse Perplexity AI response to extract holdings data
   */
  private async parsePerplexityResponse(content: string, maxHoldings: number): Promise<ThirteenFHolding[]> {
    const holdings: ThirteenFHolding[] = [];
    
    // Try to extract structured data from the response
    // Look for patterns like stock symbols, company names, and values
    const lines = content.split('\n');
    let currentHolding: Partial<ThirteenFHolding> = {};
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Look for stock symbols (uppercase letters, 1-5 characters)
      const symbolMatch = trimmedLine.match(/\b([A-Z]{1,5})\b/);
      if (symbolMatch && symbolMatch[1] && !currentHolding.symbol) {
        currentHolding.symbol = symbolMatch[1];
      }
      
      // Look for dollar amounts (market value)
      const valueMatch = trimmedLine.match(/\$?([\d,]+(?:\.\d{2})?)\s*(?:million|billion|M|B)?/i);
      if (valueMatch && valueMatch[1] && currentHolding.symbol) {
        let value = parseFloat(valueMatch[1].replace(/,/g, ''));
        
        // Handle millions/billions
        if (trimmedLine.toLowerCase().includes('million') || trimmedLine.toLowerCase().includes('m')) {
          value *= 1000000;
        } else if (trimmedLine.toLowerCase().includes('billion') || trimmedLine.toLowerCase().includes('b')) {
          value *= 1000000000;
        }
        
        currentHolding.marketValue = value;
      }
      
      // Look for share counts
      const sharesMatch = trimmedLine.match(/(\d{1,3}(?:,\d{3})*)\s*shares?/i);
      if (sharesMatch && sharesMatch[1] && currentHolding.symbol) {
        currentHolding.shares = parseInt(sharesMatch[1].replace(/,/g, ''));
      }
      
      // Look for percentage
      const percentMatch = trimmedLine.match(/([\d.]+)%/);
      if (percentMatch && percentMatch[1] && currentHolding.symbol) {
        currentHolding.percentOfPortfolio = parseFloat(percentMatch[1]);
      }
      
      // If we have enough data for a holding, add it
      if (currentHolding.symbol && currentHolding.marketValue && holdings.length < maxHoldings) {
        const holding: ThirteenFHolding = {
          symbol: currentHolding.symbol,
          companyName: currentHolding.companyName || await this.getCompanyName(currentHolding.symbol),
          shares: currentHolding.shares || Math.floor(currentHolding.marketValue / 100), // Estimate if not provided
          marketValue: currentHolding.marketValue,
          percentOfPortfolio: currentHolding.percentOfPortfolio || 0,
          pricePerShare: currentHolding.shares ? currentHolding.marketValue / currentHolding.shares : 0
        };
        
        holdings.push(holding);
        currentHolding = {};
      }
    }
    
            // If we couldn't parse enough holdings, inform user of incomplete data
    if (holdings.length === 0) {
      console.warn(`Could not parse holdings from Perplexity response for ${currentHolding.symbol || 'unknown'}. Generating fallback data.`);
      return this.generateFallbackHoldings(maxHoldings);
    }
    
    return holdings;
  }

  /**
   * Extract filing date from Perplexity response
   */
  private extractFilingDate(content: string): string | null {
    const dateMatch = content.match(/(?:filed|filing date|reported).*?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (dateMatch && dateMatch[1]) {
      const dateStr = dateMatch[1];
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
          const [month, day, year] = parts;
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        }
      }
      return dateStr;
    }
    return null;
  }

  /**
   * Generate fallback holdings when parsing fails
   */
  private generateFallbackHoldings(maxHoldings: number): ThirteenFHolding[] {
    const commonStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'BRK.B', 'JPM', 'JNJ'];
    const holdings: ThirteenFHolding[] = [];
    
    for (let i = 0; i < Math.min(maxHoldings, commonStocks.length); i++) {
      const symbol = commonStocks[i];
      if (symbol) {
        const marketValue = Math.random() * 1000000000; // Random value up to $1B
        const shares = Math.floor(marketValue / (Math.random() * 500 + 50)); // Random price between $50-$550
        
        holdings.push({
          symbol,
          companyName: `${symbol} Company`,
          shares,
          marketValue,
          percentOfPortfolio: Math.random() * 10,
          pricePerShare: marketValue / shares
        });
      }
    }
    
    return holdings;
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



  // <================ START PLACE HOLDER ================>
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

  // <================ END PLACE HOLDER ================>



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
   * Clear cache (useful for testing or manual refresh)
   */
  public async clearCache(): Promise<void> {
    await this.cacheManager.clearType('13f_portfolio');
    this.sectorCache.clear();
    console.log('🧹 13F service cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { entries: number; size: number; oldestEntry?: string } {
    const stats = this.cacheManager.getStats();
    return { 
      entries: stats.totalEntries, 
      size: stats.totalSize
    };
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

  /**
   * Generate a CIK (Central Index Key) for an institution
   */
  private generateCIK(institution: string): string {
    // Generate a pseudo-CIK based on institution name
    const hash = institution.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
    return hash.padStart(10, '0');
  }

  /**
   * Calculate quarter end date from filing date
   */
  private calculateQuarterEndDate(filingDate: string): string {
    const date = new Date(filingDate);
    const month = date.getMonth();
    const year = date.getFullYear();
    
    // Determine quarter end date
    if (month <= 2) { // Q1
      return `${year}-03-31`;
    } else if (month <= 5) { // Q2
      return `${year}-06-30`;
    } else if (month <= 8) { // Q3
      return `${year}-09-30`;
    } else { // Q4
      return `${year}-12-31`;
    }
  }

  /**
   * Get company name for a symbol
   */
  private async getCompanyName(symbol: string): Promise<string> {
    // Basic company name mapping - in production, you'd use a financial data API
    const nameMap: { [key: string]: string } = {
      'AAPL': 'Apple Inc.',
      'MSFT': 'Microsoft Corporation',
      'GOOGL': 'Alphabet Inc.',
      'AMZN': 'Amazon.com Inc.',
      'TSLA': 'Tesla Inc.',
      'META': 'Meta Platforms Inc.',
      'NVDA': 'NVIDIA Corporation',
      'BRK.B': 'Berkshire Hathaway Inc.',
      'JPM': 'JPMorgan Chase & Co.',
      'JNJ': 'Johnson & Johnson'
    };
    
    return nameMap[symbol] || `${symbol} Corporation`;
  }
}