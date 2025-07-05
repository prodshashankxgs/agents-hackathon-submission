import fetch from 'node-fetch';
import { TradingError, PoliticianTrade, CopyTradePortfolio, MarketData, BrokerAdapter } from '../types';
import { BasketStorageService } from '../storage/basket-storage';

export interface CopyTradeBasket {
  id: string;
  name: string;
  politician: string;
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

export class CopyTradeService {
  private storage: BasketStorageService;
  private brokerAdapter: BrokerAdapter | undefined;

  // Known politicians and their identifiers
  private static readonly POLITICIANS = {
    'nancy pelosi': {
      name: 'Nancy Pelosi',
      aliases: ['nancy pelosi', 'pelosi', 'nancy'],
      sources: ['capitoltrades', 'quiverquant']
    },
    'paul pelosi': {
      name: 'Paul Pelosi',
      aliases: ['paul pelosi', 'paul'],
      sources: ['capitoltrades', 'quiverquant']
    },
    'dan crenshaw': {
      name: 'Dan Crenshaw',
      aliases: ['dan crenshaw', 'crenshaw'],
      sources: ['capitoltrades', 'quiverquant']
    },
    'josh gottheimer': {
      name: 'Josh Gottheimer',
      aliases: ['josh gottheimer', 'gottheimer'],
      sources: ['capitoltrades', 'quiverquant']
    }
  };

  constructor(brokerAdapter?: BrokerAdapter) {
    this.storage = new BasketStorageService();
    this.brokerAdapter = brokerAdapter;
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await this.storage.initialize();
    } catch (error) {
      console.error('Failed to initialize copytrade storage:', error);
    }
  }

  /**
   * Normalize politician name for lookup
   */
  private normalizePoliticianName(name: string): string {
    const normalized = name.toLowerCase().trim();
    
    for (const [key, politician] of Object.entries(CopyTradeService.POLITICIANS)) {
      if (politician.aliases.some(alias => normalized.includes(alias))) {
        return politician.name;
      }
    }
    
    // If not found in known politicians, return capitalized version
    return name.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }

  /**
   * Fetch recent trades for a politician from multiple sources
   */
  async getPoliticianTrades(politician: string, timeframe: string = '6months'): Promise<PoliticianTrade[]> {
    const normalizedName = this.normalizePoliticianName(politician);
    
    try {
      // Try multiple data sources
      const trades = await Promise.allSettled([
        this.fetchFromCapitolTrades(normalizedName, timeframe),
        this.fetchFromQuiverQuant(normalizedName, timeframe),
        this.fetchFromUnusualWhales(normalizedName, timeframe)
      ]);

      // Combine results from all sources
      const allTrades: PoliticianTrade[] = [];
      trades.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          allTrades.push(...result.value);
        } else {
          console.warn(`Failed to fetch from source ${index}:`, result.status === 'rejected' ? result.reason : 'No data');
        }
      });

      // Remove duplicates and sort by date
      const uniqueTrades = this.deduplicateTrades(allTrades);
      return uniqueTrades.sort((a, b) => 
        new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
      );

    } catch (error) {
      console.error('Error fetching politician trades:', error);
      throw new TradingError(`Failed to fetch trades for ${normalizedName}`, 'COPYTRADE_FETCH_ERROR', { politician: normalizedName });
    }
  }

  /**
   * Fetch trades from Capitol Trades (mock implementation - would need real API)
   */
  private async fetchFromCapitolTrades(politician: string, timeframe: string): Promise<PoliticianTrade[]> {
    // Mock data for demonstration - in reality, this would call the Capitol Trades API
    const mockTrades: PoliticianTrade[] = [
      {
        politician,
        symbol: 'NVDA',
        companyName: 'NVIDIA Corporation',
        transactionType: 'buy',
        transactionDate: '2024-06-15',
        amount: '$1,000,001 - $5,000,000',
        amountRange: { min: 1000001, max: 5000000 },
        filingDate: '2024-06-20',
        source: 'Capitol Trades'
      },
      {
        politician,
        symbol: 'MSFT',
        companyName: 'Microsoft Corporation',
        transactionType: 'buy',
        transactionDate: '2024-06-10',
        amount: '$500,001 - $1,000,000',
        amountRange: { min: 500001, max: 1000000 },
        filingDate: '2024-06-15',
        source: 'Capitol Trades'
      },
      {
        politician,
        symbol: 'GOOGL',
        companyName: 'Alphabet Inc.',
        transactionType: 'sell',
        transactionDate: '2024-06-05',
        amount: '$250,001 - $500,000',
        amountRange: { min: 250001, max: 500000 },
        filingDate: '2024-06-10',
        source: 'Capitol Trades'
      }
    ];

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockTrades;
  }

  /**
   * Fetch trades from Quiver Quant (mock implementation)
   */
  private async fetchFromQuiverQuant(politician: string, timeframe: string): Promise<PoliticianTrade[]> {
    // Mock implementation - would integrate with Quiver Quant API
    const mockTrades: PoliticianTrade[] = [
      {
        politician,
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        transactionType: 'buy',
        transactionDate: '2024-06-12',
        amount: '$1,000,001 - $5,000,000',
        amountRange: { min: 1000001, max: 5000000 },
        filingDate: '2024-06-17',
        source: 'Quiver Quant'
      }
    ];

    await new Promise(resolve => setTimeout(resolve, 300));
    return mockTrades;
  }

  /**
   * Fetch trades from Unusual Whales (mock implementation)
   */
  private async fetchFromUnusualWhales(politician: string, timeframe: string): Promise<PoliticianTrade[]> {
    // Mock implementation
    await new Promise(resolve => setTimeout(resolve, 400));
    return [];
  }

  /**
   * Remove duplicate trades from multiple sources
   */
  private deduplicateTrades(trades: PoliticianTrade[]): PoliticianTrade[] {
    const seen = new Set<string>();
    return trades.filter(trade => {
      const key = `${trade.symbol}-${trade.transactionDate}-${trade.transactionType}-${trade.amount}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Create a weighted spread portfolio based on politician trades
   */
  async createWeightedSpread(politician: string, investmentAmount: number, timeframe: string = '6months'): Promise<CopyTradePortfolio> {
    const trades = await this.getPoliticianTrades(politician, timeframe);
    
    if (trades.length === 0) {
      throw new TradingError(`No recent trades found for ${politician}`, 'NO_TRADES_FOUND', { politician });
    }

    // Filter for buy transactions only (for long positions)
    const buyTrades = trades.filter(trade => trade.transactionType === 'buy');
    
    if (buyTrades.length === 0) {
      throw new TradingError(`No recent buy trades found for ${politician}`, 'NO_BUY_TRADES_FOUND', { politician });
    }

    // Calculate weights based on trade amounts and recency
    const weightedSpread = await this.calculateWeights(buyTrades, investmentAmount);

    return {
      politician,
      trades,
      totalValue: investmentAmount,
      weightedSpread,
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Calculate portfolio weights based on trade amounts and recency
   */
  private async calculateWeights(trades: PoliticianTrade[], totalAmount: number): Promise<Array<{ symbol: string; weight: number; reasoning: string; }>> {
    // Group trades by symbol
    const symbolGroups = new Map<string, PoliticianTrade[]>();
    trades.forEach(trade => {
      if (!symbolGroups.has(trade.symbol)) {
        symbolGroups.set(trade.symbol, []);
      }
      symbolGroups.get(trade.symbol)!.push(trade);
    });

    // Calculate raw weights for each symbol
    const symbolWeights = new Map<string, { weight: number; reasoning: string; }>();
    
    for (const [symbol, symbolTrades] of symbolGroups) {
      // Calculate total investment amount for this symbol
      const totalInvestment = symbolTrades.reduce((sum, trade) => {
        const avgAmount = trade.amountRange && trade.amountRange.min !== undefined && trade.amountRange.max !== undefined ? 
          (trade.amountRange.min + trade.amountRange.max) / 2 : 
          this.parseAmountString(trade.amount);
        return sum + avgAmount;
      }, 0);

      // Calculate recency factor (more recent trades get higher weight)
      const avgRecency = symbolTrades.reduce((sum, trade) => {
        const daysSince = (Date.now() - new Date(trade.transactionDate).getTime()) / (1000 * 60 * 60 * 24);
        return sum + Math.max(0, 180 - daysSince) / 180; // 180 days max, linear decay
      }, 0) / symbolTrades.length;

      // Calculate frequency factor
      const frequency = symbolTrades.length;

      // Combined score
      const score = totalInvestment * (1 + avgRecency) * Math.log(1 + frequency);
      
      symbolWeights.set(symbol, {
        weight: score,
        reasoning: `${symbolTrades.length} trade(s), avg amount: $${(totalInvestment / symbolTrades.length).toLocaleString()}, recency factor: ${(avgRecency * 100).toFixed(1)}%`
      });
    }

    // Normalize weights to sum to 1
    const totalWeight = Array.from(symbolWeights.values()).reduce((sum, item) => sum + item.weight, 0);
    
    const result = Array.from(symbolWeights.entries()).map(([symbol, data]) => ({
      symbol,
      weight: data.weight / totalWeight,
      reasoning: data.reasoning
    }));

    // Sort by weight descending
    return result.sort((a, b) => b.weight - a.weight);
  }

  /**
   * Parse amount string to number (handles ranges like "$1,000,001 - $5,000,000")
   */
  private parseAmountString(amount: string): number {
    // Remove $ and commas, then handle ranges
    const cleaned = amount.replace(/[$,]/g, '');
    
    if (cleaned.includes(' - ')) {
      const parts = cleaned.split(' - ').map(Number);
      const min = parts[0];
      const max = parts[1];
      if (min !== undefined && max !== undefined && !isNaN(min) && !isNaN(max)) {
        return (min + max) / 2; // Return average of range
      }
    }
    
    return Number(cleaned) || 0;
  }

  /**
   * Execute a copytrade portfolio
   */
  async executeCopyTrade(portfolio: CopyTradePortfolio, investmentAmount: number): Promise<CopyTradeBasket> {
    if (!this.brokerAdapter) {
      throw new TradingError('No broker adapter configured', 'NO_BROKER_ADAPTER');
    }

    const basketId = `copytrade_${portfolio.politician.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    
    const basket: CopyTradeBasket = {
      id: basketId,
      name: `${portfolio.politician} CopyTrade Portfolio`,
      politician: portfolio.politician,
      createdAt: new Date(),
      totalInvestment: investmentAmount,
      holdings: [],
      status: 'pending'
    };

    try {
      // Get current market data for all symbols
      const marketDataPromises = portfolio.weightedSpread.map(async (holding) => {
        try {
          const marketData = await this.brokerAdapter!.getMarketData(holding.symbol);
          return { symbol: holding.symbol, marketData };
        } catch (error) {
          console.warn(`Failed to get market data for ${holding.symbol}:`, error);
          return null;
        }
      });

      const marketDataResults = await Promise.all(marketDataPromises);
      const validMarketData = marketDataResults.filter(result => result !== null) as Array<{ symbol: string; marketData: MarketData; }>;

      // Calculate shares for each holding
      for (const holding of portfolio.weightedSpread) {
        const marketData = validMarketData.find(md => md.symbol === holding.symbol)?.marketData;
        
        if (!marketData) {
          console.warn(`Skipping ${holding.symbol} - no market data available`);
          continue;
        }

        const allocationAmount = investmentAmount * holding.weight;
        const shares = Math.floor(allocationAmount / marketData.currentPrice);
        
        if (shares > 0) {
          basket.holdings.push({
            symbol: holding.symbol,
            targetWeight: holding.weight,
            actualShares: shares,
            actualValue: shares * marketData.currentPrice
          });
        }
      }

      // Save basket to storage
      await this.storage.saveBasket({
        id: basket.id,
        name: basket.name,
        institution: basket.politician,
        createdAt: basket.createdAt,
        totalInvestment: basket.totalInvestment,
        holdings: basket.holdings,
        status: basket.status
      });

      basket.status = 'executed';
      return basket;

    } catch (error) {
      basket.status = 'failed';
      throw new TradingError(`Failed to execute copytrade portfolio: ${error}`, 'COPYTRADE_EXECUTION_ERROR', { basketId });
    }
  }

  /**
   * Get all copytrade baskets
   */
  async getCopyTradeBaskets(): Promise<CopyTradeBasket[]> {
    try {
      const baskets = await this.storage.getBaskets();
      return baskets.map(basket => ({
        id: basket.id,
        name: basket.name,
        politician: basket.institution,
        createdAt: basket.createdAt,
        totalInvestment: basket.totalInvestment,
        holdings: basket.holdings,
        status: basket.status
      }));
    } catch (error) {
      console.error('Error fetching copytrade baskets:', error);
      return [];
    }
  }

  /**
   * Get a specific copytrade basket by ID
   */
  async getCopyTradeBasket(basketId: string): Promise<CopyTradeBasket | null> {
    try {
      const basket = await this.storage.getBasket(basketId);
      if (!basket) return null;

      return {
        id: basket.id,
        name: basket.name,
        politician: basket.institution,
        createdAt: basket.createdAt,
        totalInvestment: basket.totalInvestment,
        holdings: basket.holdings,
        status: basket.status
      };
    } catch (error) {
      console.error('Error fetching copytrade basket:', error);
      return null;
    }
  }
}
