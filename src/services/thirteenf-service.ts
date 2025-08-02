// ============================================================================
// 13F SERVICE - BUSINESS LOGIC LAYER
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import { 
  ThirteenFReport, 
  ThirteenFBasket, 
  WeightedPortfolioAllocation,
  BrokerAdapter,
  MarketData
} from '../types';
import { PortfolioBasket } from '../storage/basket-storage';
import { PerplexityLLMAdapter } from '../infrastructure/adapters/PerplexityLLMAdapter';
import { BasketStorageService } from '../storage/basket-storage';
import { ILogger } from '../core/interfaces';

export class ThirteenFService {
  private perplexityAdapter: PerplexityLLMAdapter;
  private basketStorage: BasketStorageService;

  constructor(
    private logger: ILogger,
    private broker: BrokerAdapter
  ) {
    this.perplexityAdapter = new PerplexityLLMAdapter(logger);
    this.basketStorage = new BasketStorageService();
    // Initialize storage asynchronously
    this.basketStorage.initialize().catch(error => {
      this.logger.error('Failed to initialize basket storage', error instanceof Error ? error : new Error('Unknown error'));
    });
  }

  /**
   * Main method to process 13F request and create investment basket
   */
  async process13FRequest(
    institution: string, 
    investmentAmount: number,
    options: {
      maxPositions?: number;
      minWeight?: number;
      rebalanceThreshold?: number;
    } = {}
  ): Promise<PortfolioBasket> {
    
    this.logger.info('Processing 13F request', { institution, investmentAmount });

    try {
      // Step 1: Fetch 13F data from Perplexity
      this.logger.debug('Fetching 13F data from Perplexity');
      const thirteenFReport = await this.perplexityAdapter.fetch13FData(institution);

      // Step 2: Create weighted portfolio allocations
      this.logger.debug('Creating weighted portfolio allocations');
      const allocations = await this.createWeightedAllocations(
        thirteenFReport, 
        investmentAmount,
        options
      );

      // Step 3: Create basket object
      const basket = this.createBasket(thirteenFReport, allocations, investmentAmount, options);

      // Step 4: Save to storage
      await this.basketStorage.initialize(); // Ensure storage is ready
      await this.basketStorage.saveBasket(basket);

      this.logger.info('Successfully created 13F basket', {
        basketId: basket.id,
        institution,
        allocations: allocations.length,
        totalValue: investmentAmount
      });

      return basket;

    } catch (error) {
      this.logger.error('Failed to process 13F request', error instanceof Error ? error : new Error('Unknown error'), { 
        institution, 
        investmentAmount 
      });
      throw error;
    }
  }

  /**
   * Create weighted portfolio allocations from 13F holdings
   */
  private async createWeightedAllocations(
    report: ThirteenFReport,
    investmentAmount: number,
    options: {
      maxPositions?: number;
      minWeight?: number;
      rebalanceThreshold?: number;
    }
  ): Promise<WeightedPortfolioAllocation[]> {
    
    const maxPositions = options.maxPositions || 25;
    const minWeight = options.minWeight || 0.5; // Minimum 0.5% allocation
    
    // Filter and sort holdings
    let relevantHoldings = report.holdings
      .filter(h => h.weightPercent >= minWeight)
      .slice(0, maxPositions)
      .sort((a, b) => b.weightPercent - a.weightPercent);

    // Normalize weights to sum to 100%
    const totalWeight = relevantHoldings.reduce((sum, h) => sum + h.weightPercent, 0);
    const scaleFactor = 100 / totalWeight;

    const allocations: WeightedPortfolioAllocation[] = [];
    let cumulativeValue = 0;

    for (let i = 0; i < relevantHoldings.length; i++) {
      const holding = relevantHoldings[i];
      const normalizedWeight = (holding.weightPercent * scaleFactor) / 100;
      const targetValue = investmentAmount * normalizedWeight;

      // Skip very small allocations
      if (targetValue < 10) {
        continue;
      }

      try {
        // Get current market data for share calculation
        const marketData = await this.getMarketDataWithRetry(holding.symbol);
        const targetShares = Math.floor(targetValue / marketData.currentPrice);

        if (targetShares > 0) {
          allocations.push({
            symbol: holding.symbol,
            companyName: holding.companyName,
            targetWeight: normalizedWeight,
            targetValue: targetShares * marketData.currentPrice, // Use actual executable value
            targetShares,
            priority: i + 1
          });

          cumulativeValue += targetShares * marketData.currentPrice;
        }
      } catch (error) {
        this.logger.warn('Could not get market data for symbol, skipping', { 
          symbol: holding.symbol, 
          errorMessage: error instanceof Error ? error.message : 'Unknown error' 
        });
        continue;
      }
    }

    // Recalculate weights based on actual executable values
    allocations.forEach(allocation => {
      allocation.targetWeight = allocation.targetValue / cumulativeValue;
    });

    this.logger.debug('Created weighted allocations', {
      totalAllocations: allocations.length,
      totalValue: cumulativeValue,
      largestPosition: allocations[0]?.targetWeight || 0
    });

    return allocations;
  }

  /**
   * Get market data with retry logic for robustness
   */
  private async getMarketDataWithRetry(symbol: string, maxRetries = 3): Promise<MarketData> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.broker.getMarketData(symbol);
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
    throw new Error(`Failed to get market data for ${symbol} after ${maxRetries} attempts`);
  }

  /**
   * Create the basket object
   */
  private createBasket(
    report: ThirteenFReport,
    allocations: WeightedPortfolioAllocation[],
    investmentAmount: number,
    options: any
  ): PortfolioBasket {
    
    const basketId = uuidv4();
    const totalAllocatedValue = allocations.reduce((sum, a) => sum + a.targetValue, 0);

    return {
      id: basketId,
      name: `${report.institution} ${report.quarter} Portfolio`,
      description: `Institutional portfolio basket based on ${report.institution}'s ${report.quarter} 13F filing`,
      institution: report.institution,
      createdAt: new Date(),
      totalValue: totalAllocatedValue,
      allocations: allocations.map(allocation => ({
        symbol: allocation.symbol,
        companyName: allocation.companyName,
        targetWeight: allocation.targetWeight,
        targetValue: allocation.targetValue,
        actualShares: 0,
        actualValue: 0
      })),
      metadata: {
        source: 'perplexity-13f',
        institution: report.institution,
        filingDate: report.filingDate,
        totalPositions: allocations.length,
        rebalanceThreshold: options.rebalanceThreshold || 5.0
      },
      status: 'pending'
    };
  }

  /**
   * Execute trades for a 13F basket
   */
  async executeBasket(basketId: string): Promise<void> {
    this.logger.info('Executing 13F basket trades', { basketId });

    try {
      const baskets = await this.basketStorage.loadBaskets();
      const basket = baskets.find(b => b.id === basketId);

      if (!basket) {
        throw new Error(`Basket not found: ${basketId}`);
      }

      if (basket.status !== 'pending') {
        throw new Error(`Basket ${basketId} is not in pending status`);
      }

      // Update status
      await this.basketStorage.updateBasket(basketId, { status: 'partial' });

      let successfulTrades = 0;
      let failedTrades = 0;

      // Execute trades for each allocation
      for (const allocation of basket.allocations) {
        try {
          if (allocation.targetValue < 10) {
            this.logger.debug('Skipping small allocation', { 
              symbol: allocation.symbol, 
              value: allocation.targetValue 
            });
            continue;
          }

          // Create trade intent
          const tradeIntent = {
            action: 'buy' as const,
            symbol: allocation.symbol,
            amountType: 'dollars' as const,
            amount: allocation.targetValue,
            orderType: 'market' as const
          };

          // Execute the trade
          const result = await this.broker.executeOrder(tradeIntent);

          if (result.success && result.executedShares && result.executedValue) {
            // Update basket with execution details
            await this.basketStorage.updateBasketExecution(
              basketId,
              allocation.symbol,
              result.executedShares,
              result.executedValue,
              result.orderId || ''
            );

            successfulTrades++;
            this.logger.debug('Successfully executed trade', {
              symbol: allocation.symbol,
              shares: result.executedShares,
              value: result.executedValue
            });
          } else {
            failedTrades++;
            this.logger.warn('Trade execution failed', {
              symbol: allocation.symbol,
              error: result.error
            });
          }

        } catch (error) {
          failedTrades++;
          this.logger.error('Failed to execute trade', error instanceof Error ? error : new Error('Unknown error'), {
            symbol: allocation.symbol
          });
        }
      }

      // Update final status
      const finalStatus = failedTrades === 0 ? 'executed' : 
                         successfulTrades > 0 ? 'partial' : 'failed';
      
      await this.basketStorage.updateBasket(basketId, { status: finalStatus });

      this.logger.info('Completed basket execution', {
        basketId,
        successfulTrades,
        failedTrades,
        finalStatus
      });

    } catch (error) {
      this.logger.error('Failed to execute basket', error instanceof Error ? error : new Error('Unknown error'), { 
        basketId 
      });
      await this.basketStorage.updateBasket(basketId, { status: 'failed' });
      throw error;
    }
  }

  /**
   * Get all 13F baskets
   */
  async get13FBaskets(): Promise<PortfolioBasket[]> {
    const baskets = await this.basketStorage.getBaskets({
      limit: 50
    });
    
    return baskets.filter(basket => 
      basket.metadata?.source === 'perplexity-13f'
    );
  }

  /**
   * Delete a 13F basket
   */
  async deleteBasket(basketId: string): Promise<void> {
    return this.basketStorage.deleteBasket(basketId);
  }
}