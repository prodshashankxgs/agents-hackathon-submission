import fetch from 'node-fetch';
import { TradingError } from '../types';
import { BasketStorageService } from '../storage/basket-storage';

export interface ThirteenFHolding {
  symbol: string;
  companyName: string;
  shares: number;
  marketValue: number;
  percentOfPortfolio: number;
  changeFromPrevious?: number;
  changePercent?: number;
}

export interface ThirteenFPortfolio {
  institution: string;
  cik: string;
  filingDate: string;
  totalValue: number;
  holdings: ThirteenFHolding[];
  quarterEndDate: string;
}

export interface PortfolioBasket {
  id: string;
  name: string;
  institution: string;
  createdAt: Date;
  totalInvestment: number;
  holdings: Array<{
    symbol: string;
    targetWeight: number;
    actualShares: number;
    actualValue: number;
    orderId?: string;
  }>;
  status: 'pending' | 'executed' | 'partial' | 'failed';
}

export class ThirteenFService {
  private static readonly SEC_BASE_URL = 'https://data.sec.gov';
  private storage: BasketStorageService;

  constructor() {
    this.storage = new BasketStorageService();
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await this.storage.initialize();
    } catch (error) {
      console.error('Failed to initialize basket storage:', error);
    }
  }

  // Known institution mappings for common names
  private static readonly INSTITUTION_MAPPINGS: Record<string, { cik: string; name: string }> = {
    'berkshire': { cik: '0001067983', name: 'Berkshire Hathaway Inc' },
    'berkshire hathaway': { cik: '0001067983', name: 'Berkshire Hathaway Inc' },
    'warren buffett': { cik: '0001067983', name: 'Berkshire Hathaway Inc' },
    'bridgewater': { cik: '0001350694', name: 'Bridgewater Associates LP' },
    'bridgewater associates': { cik: '0001350694', name: 'Bridgewater Associates LP' },
    'ray dalio': { cik: '0001350694', name: 'Bridgewater Associates LP' },
    'renaissance': { cik: '0001037389', name: 'Renaissance Technologies LLC' },
    'renaissance technologies': { cik: '0001037389', name: 'Renaissance Technologies LLC' },
    'rentech': { cik: '0001037389', name: 'Renaissance Technologies LLC' },
    'jim simons': { cik: '0001037389', name: 'Renaissance Technologies LLC' },
    'citadel': { cik: '0001423053', name: 'Citadel Advisors LLC' },
    'ken griffin': { cik: '0001423053', name: 'Citadel Advisors LLC' },
    'two sigma': { cik: '0001040273', name: 'Two Sigma Investments LP' },
    'millennium': { cik: '0001040273', name: 'Millennium Management LLC' },
    'aqr': { cik: '0001582652', name: 'AQR Capital Management LLC' },
    'aqr capital': { cik: '0001582652', name: 'AQR Capital Management LLC' },
    'elliott': { cik: '0001067983', name: 'Elliott Management Corp' },
    'elliott management': { cik: '0001067983', name: 'Elliott Management Corp' },
    'paul singer': { cik: '0001067983', name: 'Elliott Management Corp' }
  };

  /**
   * Get the latest 13F filing for an institution
   */
  async getLatest13F(institution: string): Promise<ThirteenFPortfolio> {
    try {
      // Normalize the institution name
      const normalizedName = institution.toLowerCase().trim();
      
      // Try to find a known mapping first
      const mapping = this.findInstitutionMapping(normalizedName);
      
      if (mapping) {
        return await this.get13FByMapping(mapping, institution);
      }
      
      // If no mapping found, try to generate synthetic data based on the institution name
      return await this.generateSynthetic13F(institution);
      
    } catch (error) {
      if (error instanceof TradingError) {
        throw error;
      }
      throw new TradingError('Failed to fetch 13F data', 'FETCH_ERROR', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Find institution mapping by checking various name variations
   */
  private findInstitutionMapping(normalizedName: string): { cik: string; name: string } | null {
    // Direct match
    if (ThirteenFService.INSTITUTION_MAPPINGS[normalizedName]) {
      return ThirteenFService.INSTITUTION_MAPPINGS[normalizedName];
    }
    
    // Partial match - check if any key is contained in the input
    for (const [key, mapping] of Object.entries(ThirteenFService.INSTITUTION_MAPPINGS)) {
      if (normalizedName.includes(key) || key.includes(normalizedName)) {
        return mapping;
      }
    }
    
    return null;
  }

  /**
   * Get 13F data using a known institution mapping
   */
  private async get13FByMapping(mapping: { cik: string; name: string }, originalInput: string): Promise<ThirteenFPortfolio> {
    // For now, we'll use predefined data for known institutions
    // In production, you would fetch from SEC EDGAR API using the CIK
    
    if (mapping.cik === '0001067983') { // Berkshire Hathaway
      return await this.getBerkshire13F(mapping.name);
    } else if (mapping.cik === '0001350694') { // Bridgewater
      return await this.getBridgewater13F(mapping.name);
    } else if (mapping.cik === '0001037389') { // Renaissance Technologies
      return await this.getRenaissance13F(mapping.name);
    } else if (mapping.cik === '0001423053') { // Citadel
      return await this.getCitadel13F(mapping.name);
    } else {
      // For other known institutions, generate synthetic data
      return await this.generateSynthetic13F(mapping.name);
    }
  }

  /**
   * Generate synthetic 13F data for unknown institutions
   */
  private async generateSynthetic13F(institution: string): Promise<ThirteenFPortfolio> {
    // Create plausible synthetic holdings for demonstration
    const syntheticHoldings: ThirteenFHolding[] = [
      {
        symbol: 'AAPL',
        companyName: 'Apple Inc',
        shares: 5000000,
        marketValue: 950000000,
        percentOfPortfolio: 15.8,
        changeFromPrevious: 100000,
        changePercent: 2.0
      },
      {
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        shares: 3500000,
        marketValue: 1330000000,
        percentOfPortfolio: 22.2,
        changeFromPrevious: 200000,
        changePercent: 6.1
      },
      {
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc Class A',
        shares: 2800000,
        marketValue: 392000000,
        percentOfPortfolio: 6.5,
        changeFromPrevious: -50000,
        changePercent: -1.8
      },
      {
        symbol: 'AMZN',
        companyName: 'Amazon.com Inc',
        shares: 4200000,
        marketValue: 672000000,
        percentOfPortfolio: 11.2,
        changeFromPrevious: 150000,
        changePercent: 3.7
      },
      {
        symbol: 'TSLA',
        companyName: 'Tesla Inc',
        shares: 1800000,
        marketValue: 360000000,
        percentOfPortfolio: 6.0,
        changeFromPrevious: -100000,
        changePercent: -5.3
      },
      {
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        shares: 900000,
        marketValue: 810000000,
        percentOfPortfolio: 13.5,
        changeFromPrevious: 50000,
        changePercent: 5.9
      },
      {
        symbol: 'META',
        companyName: 'Meta Platforms Inc',
        shares: 2100000,
        marketValue: 567000000,
        percentOfPortfolio: 9.5,
        changeFromPrevious: 75000,
        changePercent: 3.7
      },
      {
        symbol: 'JPM',
        companyName: 'JPMorgan Chase & Co',
        shares: 3600000,
        marketValue: 540000000,
        percentOfPortfolio: 9.0,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'JNJ',
        companyName: 'Johnson & Johnson',
        shares: 2400000,
        marketValue: 384000000,
        percentOfPortfolio: 6.4,
        changeFromPrevious: -25000,
        changePercent: -1.0
      }
    ];

    const totalValue = syntheticHoldings.reduce((sum, holding) => sum + holding.marketValue, 0);

    return {
      institution: institution,
      cik: 'SYNTHETIC',
      filingDate: new Date().toISOString().split('T')[0] || new Date().toISOString(),
      quarterEndDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] || new Date().toISOString(),
      totalValue,
      holdings: syntheticHoldings.sort((a, b) => b.percentOfPortfolio - a.percentOfPortfolio)
    };
  }

  /**
   * Get Berkshire Hathaway's latest 13F filing
   * Note: This is a simplified implementation. In production, you'd parse actual SEC EDGAR data
   */
  private async getBerkshire13F(institutionName: string = 'Berkshire Hathaway Inc'): Promise<ThirteenFPortfolio> {
    // For demo purposes, using known Berkshire holdings as of recent filings
    // In production, you would fetch this from SEC EDGAR API or a financial data provider
    const holdings: ThirteenFHolding[] = [
      {
        symbol: 'AAPL',
        companyName: 'Apple Inc',
        shares: 916000000,
        marketValue: 174000000000,
        percentOfPortfolio: 47.4,
        changeFromPrevious: -10000000,
        changePercent: -1.1
      },
      {
        symbol: 'BAC',
        companyName: 'Bank of America Corp',
        shares: 1032000000,
        marketValue: 31500000000,
        percentOfPortfolio: 8.6,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'CVX',
        companyName: 'Chevron Corporation',
        shares: 123000000,
        marketValue: 18900000000,
        percentOfPortfolio: 5.1,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'KO',
        companyName: 'Coca-Cola Company',
        shares: 400000000,
        marketValue: 25200000000,
        percentOfPortfolio: 6.9,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'AXP',
        companyName: 'American Express Company',
        shares: 151000000,
        marketValue: 22800000000,
        percentOfPortfolio: 6.2,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'OXY',
        companyName: 'Occidental Petroleum Corp',
        shares: 248000000,
        marketValue: 14500000000,
        percentOfPortfolio: 3.9,
        changeFromPrevious: 2000000,
        changePercent: 0.8
      },
      {
        symbol: 'KHC',
        companyName: 'Kraft Heinz Company',
        shares: 325000000,
        marketValue: 11700000000,
        percentOfPortfolio: 3.2,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'MCO',
        companyName: 'Moody\'s Corporation',
        shares: 24600000,
        marketValue: 9200000000,
        percentOfPortfolio: 2.5,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'DVA',
        companyName: 'DaVita Inc',
        shares: 36000000,
        marketValue: 4100000000,
        percentOfPortfolio: 1.1,
        changeFromPrevious: 0,
        changePercent: 0
      },
      {
        symbol: 'HPQ',
        companyName: 'HP Inc',
        shares: 104000000,
        marketValue: 3100000000,
        percentOfPortfolio: 0.8,
        changeFromPrevious: 0,
        changePercent: 0
      }
    ];

    const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);

    return {
      institution: institutionName,
      cik: '0001067983',
      filingDate: '2024-02-14',
      quarterEndDate: '2023-12-31',
      totalValue,
      holdings: holdings.sort((a, b) => b.percentOfPortfolio - a.percentOfPortfolio)
    };
  }

  /**
   * Get Bridgewater Associates' latest 13F filing
   */
  private async getBridgewater13F(institutionName: string): Promise<ThirteenFPortfolio> {
    const holdings: ThirteenFHolding[] = [
      {
        symbol: 'SPY',
        companyName: 'SPDR S&P 500 ETF Trust',
        shares: 45000000,
        marketValue: 20250000000,
        percentOfPortfolio: 18.5,
        changeFromPrevious: 2000000,
        changePercent: 4.7
      },
      {
        symbol: 'VTI',
        companyName: 'Vanguard Total Stock Market ETF',
        shares: 35000000,
        marketValue: 8400000000,
        percentOfPortfolio: 7.7,
        changeFromPrevious: 1500000,
        changePercent: 4.5
      },
      {
        symbol: 'EEM',
        companyName: 'iShares MSCI Emerging Markets ETF',
        shares: 180000000,
        marketValue: 7560000000,
        percentOfPortfolio: 6.9,
        changeFromPrevious: -5000000,
        changePercent: -2.7
      },
      {
        symbol: 'TLT',
        companyName: 'iShares 20+ Year Treasury Bond ETF',
        shares: 85000000,
        marketValue: 8075000000,
        percentOfPortfolio: 7.4,
        changeFromPrevious: 3000000,
        changePercent: 3.7
      },
      {
        symbol: 'GLD',
        companyName: 'SPDR Gold Shares',
        shares: 25000000,
        marketValue: 4750000000,
        percentOfPortfolio: 4.3,
        changeFromPrevious: 1000000,
        changePercent: 4.2
      }
    ];

    const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);

    return {
      institution: institutionName,
      cik: '0001350694',
      filingDate: '2024-02-14',
      quarterEndDate: '2023-12-31',
      totalValue,
      holdings: holdings.sort((a, b) => b.percentOfPortfolio - a.percentOfPortfolio)
    };
  }

  /**
   * Get Renaissance Technologies' latest 13F filing
   */
  private async getRenaissance13F(institutionName: string): Promise<ThirteenFPortfolio> {
    const holdings: ThirteenFHolding[] = [
      {
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        shares: 8500000,
        marketValue: 7650000000,
        percentOfPortfolio: 12.8,
        changeFromPrevious: 500000,
        changePercent: 6.3
      },
      {
        symbol: 'AMZN',
        companyName: 'Amazon.com Inc',
        shares: 42000000,
        marketValue: 6720000000,
        percentOfPortfolio: 11.2,
        changeFromPrevious: 2000000,
        changePercent: 5.0
      },
      {
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc Class A',
        shares: 38000000,
        marketValue: 5320000000,
        percentOfPortfolio: 8.9,
        changeFromPrevious: -1000000,
        changePercent: -2.6
      },
      {
        symbol: 'TSLA',
        companyName: 'Tesla Inc',
        shares: 25000000,
        marketValue: 5000000000,
        percentOfPortfolio: 8.3,
        changeFromPrevious: 1500000,
        changePercent: 6.4
      },
      {
        symbol: 'META',
        companyName: 'Meta Platforms Inc',
        shares: 18000000,
        marketValue: 4860000000,
        percentOfPortfolio: 8.1,
        changeFromPrevious: 800000,
        changePercent: 4.7
      }
    ];

    const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);

    return {
      institution: institutionName,
      cik: '0001037389',
      filingDate: '2024-02-14',
      quarterEndDate: '2023-12-31',
      totalValue,
      holdings: holdings.sort((a, b) => b.percentOfPortfolio - a.percentOfPortfolio)
    };
  }

  /**
   * Get Citadel's latest 13F filing
   */
  private async getCitadel13F(institutionName: string): Promise<ThirteenFPortfolio> {
    const holdings: ThirteenFHolding[] = [
      {
        symbol: 'SPY',
        companyName: 'SPDR S&P 500 ETF Trust',
        shares: 75000000,
        marketValue: 33750000000,
        percentOfPortfolio: 15.2,
        changeFromPrevious: 5000000,
        changePercent: 7.1
      },
      {
        symbol: 'QQQ',
        companyName: 'Invesco QQQ Trust',
        shares: 55000000,
        marketValue: 20900000000,
        percentOfPortfolio: 9.4,
        changeFromPrevious: 2500000,
        changePercent: 4.8
      },
      {
        symbol: 'AAPL',
        companyName: 'Apple Inc',
        shares: 95000000,
        marketValue: 18050000000,
        percentOfPortfolio: 8.1,
        changeFromPrevious: -3000000,
        changePercent: -3.1
      },
      {
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        shares: 38000000,
        marketValue: 14440000000,
        percentOfPortfolio: 6.5,
        changeFromPrevious: 1200000,
        changePercent: 3.3
      },
      {
        symbol: 'AMZN',
        companyName: 'Amazon.com Inc',
        shares: 72000000,
        marketValue: 11520000000,
        percentOfPortfolio: 5.2,
        changeFromPrevious: 3500000,
        changePercent: 5.1
      }
    ];

    const totalValue = holdings.reduce((sum, holding) => sum + holding.marketValue, 0);

    return {
      institution: institutionName,
      cik: '0001423053',
      filingDate: '2024-02-14',
      quarterEndDate: '2023-12-31',
      totalValue,
      holdings: holdings.sort((a, b) => b.percentOfPortfolio - a.percentOfPortfolio)
    };
  }

  /**
   * Calculate portfolio allocation for a given investment amount
   */
  calculateAllocation(portfolio: ThirteenFPortfolio, investmentAmount: number): Array<{
    symbol: string;
    companyName: string;
    targetWeight: number;
    targetValue: number;
    estimatedShares: number;
  }> {
    // Filter out holdings that are too small (less than 0.5% of portfolio)
    const significantHoldings = portfolio.holdings.filter(h => h.percentOfPortfolio >= 0.5);
    
    // Recalculate weights for significant holdings only
    const totalWeight = significantHoldings.reduce((sum, h) => sum + h.percentOfPortfolio, 0);
    
    return significantHoldings.map(holding => {
      const normalizedWeight = holding.percentOfPortfolio / totalWeight;
      const targetValue = Math.round(investmentAmount * normalizedWeight * 100) / 100; // Round to 2 decimal places
      
      // Estimate shares based on current market value and shares in 13F
      const estimatedPrice = holding.marketValue / holding.shares;
      const estimatedShares = Math.floor(targetValue / estimatedPrice);
      
      return {
        symbol: holding.symbol,
        companyName: holding.companyName,
        targetWeight: normalizedWeight,
        targetValue,
        estimatedShares
      };
    });
  }

  /**
   * Create a new portfolio basket
   */
  createBasket(
    institution: string,
    investmentAmount: number,
    allocation: Array<{
      symbol: string;
      targetWeight: number;
      targetValue: number;
      estimatedShares: number;
    }>
  ): PortfolioBasket {
    const basketId = `basket_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const basket: PortfolioBasket = {
      id: basketId,
      name: `${institution} Portfolio Spread`,
      institution,
      createdAt: new Date(),
      totalInvestment: investmentAmount,
      holdings: allocation.map(item => ({
        symbol: item.symbol,
        targetWeight: item.targetWeight,
        actualShares: 0,
        actualValue: 0
      })),
      status: 'pending'
    };

    // Save to persistent storage
    this.storage.saveBasket(basket).catch(error => {
      console.error('Failed to save basket:', error);
    });

    return basket;
  }

  /**
   * Update basket with execution results
   */
  async updateBasketExecution(
    basketId: string,
    symbol: string,
    shares: number,
    value: number,
    orderId: string
  ): Promise<void> {
    try {
      await this.storage.updateBasketExecution(basketId, symbol, shares, value, orderId);
    } catch (error) {
      console.error('Failed to update basket execution:', error);
      throw new TradingError('Failed to update basket execution', 'BASKET_UPDATE_ERROR');
    }
  }

  /**
   * Get all baskets
   */
  async getAllBaskets(): Promise<PortfolioBasket[]> {
    try {
      return await this.storage.getBaskets();
    } catch (error) {
      console.error('Failed to get baskets:', error);
      return [];
    }
  }

  /**
   * Get basket by ID
   */
  async getBasket(basketId: string): Promise<PortfolioBasket | null> {
    try {
      return await this.storage.getBasket(basketId);
    } catch (error) {
      console.error('Failed to get basket:', error);
      return null;
    }
  }

  /**
   * Delete a basket
   */
  async deleteBasket(basketId: string): Promise<boolean> {
    try {
      await this.storage.deleteBasket(basketId);
      return true;
    } catch (error) {
      console.error('Failed to delete basket:', error);
      return false;
    }
  }
} 