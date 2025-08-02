// ============================================================================
// PORTFOLIO SERVICE - APPLICATION LAYER
// ============================================================================

import {
  IPortfolioService,
  IBrokerAdapter,
  ICacheService,
  IEventBus,
  Portfolio,
  PositionEntity,
  PerformanceMetrics,
  PortfolioTarget,
  RebalanceResult,
  TradeEntity,
  ApplicationError,
  ILogger
} from '../../core/interfaces';

export class PortfolioService implements IPortfolioService {
  private readonly PORTFOLIO_CACHE_TTL = 60000; // 1 minute
  private readonly PERFORMANCE_CACHE_TTL = 300000; // 5 minutes

  constructor(
    private brokerAdapter: IBrokerAdapter,
    private cacheService: ICacheService,
    private eventBus: IEventBus,
    private logger: ILogger
  ) {}

  async getPortfolio(): Promise<Portfolio> {
    this.logger.debug('Fetching portfolio');

    try {
      // Check cache first
      const cacheKey = 'portfolio:current';
      const cached = await this.cacheService.get<Portfolio>(cacheKey);
      
      if (cached) {
        this.logger.debug('Portfolio retrieved from cache');
        return cached;
      }

      // Fetch fresh data
      const [account, positions] = await Promise.all([
        this.brokerAdapter.getAccountInfo(),
        this.brokerAdapter.getPositions()
      ]);

      // Calculate portfolio metrics
      const totalValue = account.portfolioValue;
      const totalCost = positions.reduce((sum, pos) => sum + (pos.quantity * pos.averagePrice), 0);
      const totalReturn = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
      const totalReturnPercent = totalCost > 0 ? (totalReturn / totalCost) * 100 : 0;

      // Calculate day change
      const dayChange = positions.reduce((sum, pos) => {
        // This is simplified - would need intraday P&L data
        return sum + (pos.unrealizedPnL * 0.1); // Placeholder calculation
      }, 0);
      const dayChangePercent = totalValue > 0 ? (dayChange / totalValue) * 100 : 0;

      // Calculate available cash
      const cash = account.buyingPower;

      const portfolio: Portfolio = {
        totalValue,
        totalCost,
        totalReturn,
        totalReturnPercent,
        positions,
        cash,
        dayChange,
        dayChangePercent
      };

      // Cache the result
      await this.cacheService.set(cacheKey, portfolio, this.PORTFOLIO_CACHE_TTL);

      this.logger.info('Portfolio retrieved successfully', {
        totalValue,
        positionCount: positions.length,
        totalReturnPercent
      });

      return portfolio;

    } catch (error) {
      this.logger.error('Failed to get portfolio', error as Error);
      
      throw new ApplicationError(
        `Failed to retrieve portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PORTFOLIO_FETCH_FAILED',
        { originalError: error }
      );
    }
  }

  async getPositions(): Promise<PositionEntity[]> {
    this.logger.debug('Fetching positions');

    try {
      const positions = await this.brokerAdapter.getPositions();
      
      this.logger.debug('Positions retrieved', { count: positions.length });
      return positions;

    } catch (error) {
      this.logger.error('Failed to get positions', error as Error);
      
      throw new ApplicationError(
        `Failed to retrieve positions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'POSITIONS_FETCH_FAILED',
        { originalError: error }
      );
    }
  }

  async getPerformanceMetrics(period: string): Promise<PerformanceMetrics> {
    this.logger.debug('Calculating performance metrics', { period });

    try {
      // Check cache first
      const cacheKey = `performance:${period}`;
      const cached = await this.cacheService.get<PerformanceMetrics>(cacheKey);
      
      if (cached) {
        this.logger.debug('Performance metrics retrieved from cache', { period });
        return cached;
      }

      // Get current portfolio
      const portfolio = await this.getPortfolio();
      
      // This is a simplified implementation
      // In reality, you'd need historical portfolio data to calculate these metrics properly
      
      const annualizedMultiplier = this.getAnnualizedMultiplier(period);
      const annualizedReturn = portfolio.totalReturnPercent * annualizedMultiplier;

      // Simplified calculations (would need historical data for accurate metrics)
      const metrics: PerformanceMetrics = {
        period,
        totalReturn: portfolio.totalReturn,
        annualizedReturn,
        volatility: this.estimateVolatility(portfolio), // Simplified estimation
        sharpeRatio: this.calculateSharpeRatio(annualizedReturn, 15), // Assuming 15% volatility
        maxDrawdown: Math.abs(Math.min(0, portfolio.totalReturnPercent * 1.5)), // Rough estimation
        winRate: this.estimateWinRate(portfolio), // Simplified estimation
        profitFactor: this.calculateProfitFactor(portfolio) // Simplified calculation
      };

      // Cache the result
      await this.cacheService.set(cacheKey, metrics, this.PERFORMANCE_CACHE_TTL);

      this.logger.info('Performance metrics calculated', {
        period,
        totalReturn: metrics.totalReturn,
        annualizedReturn: metrics.annualizedReturn,
        sharpeRatio: metrics.sharpeRatio
      });

      return metrics;

    } catch (error) {
      this.logger.error('Failed to calculate performance metrics', error as Error, { period });
      
      throw new ApplicationError(
        `Failed to calculate performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PERFORMANCE_CALCULATION_FAILED',
        { period, originalError: error }
      );
    }
  }

  async rebalancePortfolio(targets: PortfolioTarget[]): Promise<RebalanceResult> {
    this.logger.info('Starting portfolio rebalancing', { targetCount: targets.length });

    try {
      const portfolio = await this.getPortfolio();
      const trades: TradeEntity[] = [];
      let totalCost = 0;

      // Validate targets
      const totalTargetPercent = targets.reduce((sum, target) => sum + target.targetPercent, 0);
      if (Math.abs(totalTargetPercent - 100) > 0.01) {
        throw new ApplicationError(
          `Target allocations must sum to 100% (currently ${totalTargetPercent.toFixed(2)}%)`,
          'INVALID_TARGET_ALLOCATION',
          { targets, totalTargetPercent }
        );
      }

      // Calculate required trades for each target
      for (const target of targets) {
        const currentPosition = portfolio.positions.find(p => p.symbol === target.symbol);
        const currentValue = currentPosition ? currentPosition.marketValue : 0;
        const currentPercent = (currentValue / portfolio.totalValue) * 100;
        
        const targetValue = (target.targetPercent / 100) * portfolio.totalValue;
        const difference = targetValue - currentValue;

        if (Math.abs(difference) > portfolio.totalValue * 0.005) { // 0.5% threshold
          const action = difference > 0 ? 'buy' : 'sell';
          const quantity = Math.abs(difference);

          // Get current market price for trade calculation
          const marketData = await this.brokerAdapter.getMarketData(target.symbol);
          const shares = Math.floor(quantity / marketData.currentPrice);

          if (shares > 0) {
            const trade: TradeEntity = {
              id: `rebalance_${Date.now()}_${target.symbol}`,
              symbol: target.symbol,
              action,
              quantity: shares,
              orderType: 'market',
              status: 'pending',
              timestamp: new Date()
            };
            
            // Set optional properties conditionally
            if (marketData.currentPrice !== undefined) {
              trade.price = marketData.currentPrice;
            }

            trades.push(trade);
            totalCost += Math.abs(difference);

            this.logger.debug('Rebalancing trade calculated', {
              symbol: target.symbol,
              action,
              shares,
              currentPercent: currentPercent.toFixed(2),
              targetPercent: target.targetPercent.toFixed(2)
            });
          }
        }
      }

      // Execute trades (simplified - in reality, you'd want to execute these carefully)
      const executedTrades: TradeEntity[] = [];
      
      for (const trade of trades) {
        try {
          // This is where you'd integrate with the TradeOrchestrator
          // For now, we'll just mark as executed
          trade.status = 'executed';
          trade.executedAt = new Date();
          if (trade.price !== undefined) {
            trade.executedPrice = trade.price;
          }
          trade.executedQuantity = trade.quantity;
          
          executedTrades.push(trade);
          
        } catch (error) {
          this.logger.warn('Failed to execute rebalancing trade', { 
            error: error as Error,
            symbol: trade.symbol,
            action: trade.action 
          });
          
          trade.status = 'failed';
          executedTrades.push(trade);
        }
      }

      const result: RebalanceResult = {
        success: executedTrades.every(t => t.status === 'executed'),
        trades: executedTrades,
        totalCost,
        message: `Rebalancing completed: ${executedTrades.filter(t => t.status === 'executed').length}/${executedTrades.length} trades executed`
      };

      this.logger.info('Portfolio rebalancing completed', {
        success: result.success,
        tradesExecuted: executedTrades.filter(t => t.status === 'executed').length,
        totalTrades: executedTrades.length,
        totalCost
      });

      return result;

    } catch (error) {
      this.logger.error('Portfolio rebalancing failed', error as Error, { targets });
      
      throw new ApplicationError(
        `Portfolio rebalancing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'REBALANCING_FAILED',
        { targets, originalError: error }
      );
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private getAnnualizedMultiplier(period: string): number {
    switch (period.toUpperCase()) {
      case '1D': return 252; // Trading days per year
      case '1W': return 52;  // Weeks per year
      case '1M': return 12;  // Months per year
      case '3M': return 4;   // Quarters per year
      case '6M': return 2;   // Half-years per year
      case '1Y': return 1;   // Already annual
      case 'YTD': return 1;  // Treat as annual
      default: return 1;
    }
  }

  private estimateVolatility(portfolio: Portfolio): number {
    // This is a very simplified volatility estimation
    // In reality, you'd calculate this from historical daily returns
    
    if (portfolio.positions.length === 0) {
      return 0;
    }

    // Use position concentration as a proxy for volatility
    const concentrationRisk = this.calculateConcentrationRisk(portfolio);
    const baseVolatility = 15; // 15% base volatility assumption
    
    return baseVolatility * (1 + concentrationRisk);
  }

  private calculateConcentrationRisk(portfolio: Portfolio): number {
    if (portfolio.positions.length === 0) {
      return 0;
    }

    // Calculate Herfindahl index as measure of concentration
    let herfindahlIndex = 0;
    
    for (const position of portfolio.positions) {
      const weight = position.marketValue / portfolio.totalValue;
      herfindahlIndex += weight * weight;
    }

    // Convert to concentration risk (higher = more concentrated = more risky)
    return Math.max(0, (herfindahlIndex - (1 / portfolio.positions.length)) * 2);
  }

  private calculateSharpeRatio(annualizedReturn: number, volatility: number): number {
    const riskFreeRate = 2; // Assume 2% risk-free rate
    return volatility > 0 ? (annualizedReturn - riskFreeRate) / volatility : 0;
  }

  private estimateWinRate(portfolio: Portfolio): number {
    // Simplified win rate estimation based on current P&L distribution
    if (portfolio.positions.length === 0) {
      return 0;
    }

    const profitablePositions = portfolio.positions.filter(p => p.unrealizedPnL > 0).length;
    return (profitablePositions / portfolio.positions.length) * 100;
  }

  private calculateProfitFactor(portfolio: Portfolio): number {
    // Simplified profit factor calculation
    const totalGains = portfolio.positions
      .filter(p => p.unrealizedPnL > 0)
      .reduce((sum, p) => sum + p.unrealizedPnL, 0);
      
    const totalLosses = Math.abs(portfolio.positions
      .filter(p => p.unrealizedPnL < 0)
      .reduce((sum, p) => sum + p.unrealizedPnL, 0));

    return totalLosses > 0 ? totalGains / totalLosses : totalGains > 0 ? Infinity : 0;
  }
}