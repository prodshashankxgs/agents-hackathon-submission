// ============================================================================
// RISK MANAGEMENT SERVICE - DOMAIN LAYER
// ============================================================================

import {
  IRiskManagementService,
  IBrokerAdapter,
  ICacheService,
  RiskAssessment,
  TradeCommand,
  PositionEntity,
  AccountEntity,
  MarketDataEntity,
  DomainError,
  ILogger
} from '../../core/interfaces';
import { config } from '../../config';

export class RiskManagementService implements IRiskManagementService {
  private readonly MAX_POSITION_PERCENTAGE = 0.20; // 20% of portfolio max per position
  private readonly MAX_SECTOR_EXPOSURE = 0.40; // 40% max exposure to any sector
  private readonly HIGH_VOLATILITY_THRESHOLD = 15; // 15% daily change threshold
  private readonly RISK_CACHE_TTL = 300000; // 5 minutes

  constructor(
    private brokerAdapter: IBrokerAdapter,
    private cacheService: ICacheService,
    private logger: ILogger
  ) {}

  async assessRisk(command: TradeCommand, portfolio: PositionEntity[]): Promise<RiskAssessment> {
    this.logger.info('Starting risk assessment', {
      symbol: command.symbol,
      action: command.action,
      portfolioSize: portfolio.length
    });

    try {
      const riskFactors: string[] = [];
      const warnings: string[] = [];
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      let recommendedPositionSize: number | undefined;

      // Step 1: Assess position concentration risk
      await this.assessConcentrationRisk(command, portfolio, riskFactors, warnings);

      // Step 2: Assess market volatility risk
      await this.assessVolatilityRisk(command.symbol, riskFactors, warnings);

      // Step 3: Assess correlation risk (if we have multiple positions)
      if (portfolio.length > 0) {
        await this.assessCorrelationRisk(command, portfolio, riskFactors, warnings);
      }

      // Step 4: Assess liquidity risk
      await this.assessLiquidityRisk(command.symbol, riskFactors, warnings);

      // Step 5: Calculate overall risk level
      riskLevel = this.calculateOverallRiskLevel(riskFactors);

      // Step 6: Generate position size recommendation
      recommendedPositionSize = await this.calculateRecommendedPositionSize(command, portfolio);

      const assessment: RiskAssessment = {
        riskLevel,
        riskFactors,
        warnings
      };
      
      if (recommendedPositionSize !== undefined) {
        assessment.recommendedPositionSize = recommendedPositionSize;
      }

      this.logger.info('Risk assessment completed', {
        symbol: command.symbol,
        riskLevel,
        riskFactorCount: riskFactors.length,
        recommendedPositionSize
      });

      return assessment;

    } catch (error) {
      this.logger.error('Risk assessment failed', error as Error, { command });
      
      throw new DomainError(
        `Risk assessment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'RISK_ASSESSMENT_FAILED',
        { command, originalError: error }
      );
    }
  }

  async checkPositionLimits(symbol: string, quantity: number): Promise<boolean> {
    this.logger.debug('Checking position limits', { symbol, quantity });

    try {
      // Get account and portfolio information
      const [account, positions] = await Promise.all([
        this.brokerAdapter.getAccountInfo(),
        this.brokerAdapter.getPositions()
      ]);

      // Get market data for position value calculation
      const marketData = await this.brokerAdapter.getMarketData(symbol);
      const positionValue = quantity * marketData.currentPrice;

      // Check position size as percentage of portfolio
      const portfolioValue = account.portfolioValue;
      const positionPercentage = positionValue / portfolioValue;

      if (positionPercentage > this.MAX_POSITION_PERCENTAGE) {
        this.logger.warn('Position exceeds maximum percentage limit', {
          symbol,
          positionPercentage: positionPercentage * 100,
          maxPercentage: this.MAX_POSITION_PERCENTAGE * 100
        });
        return false;
      }

      // Check existing position in same symbol
      const existingPosition = positions.find(p => p.symbol === symbol);
      if (existingPosition) {
        const totalPositionValue = existingPosition.marketValue + positionValue;
        const totalPositionPercentage = totalPositionValue / portfolioValue;

        if (totalPositionPercentage > this.MAX_POSITION_PERCENTAGE) {
          this.logger.warn('Combined position would exceed maximum percentage limit', {
            symbol,
            totalPositionPercentage: totalPositionPercentage * 100,
            maxPercentage: this.MAX_POSITION_PERCENTAGE * 100
          });
          return false;
        }
      }

      return true;

    } catch (error) {
      this.logger.error('Position limit check failed', error as Error, { symbol, quantity });
      // Return false on error to be conservative
      return false;
    }
  }

  async calculateMaxPosition(symbol: string, account: AccountEntity): Promise<number> {
    this.logger.debug('Calculating maximum position size', { symbol });

    try {
      const marketData = await this.brokerAdapter.getMarketData(symbol);
      
      // Calculate based on portfolio percentage limit
      const maxValueFromPercentage = account.portfolioValue * this.MAX_POSITION_PERCENTAGE;
      
      // Calculate based on buying power
      const maxValueFromBuyingPower = account.buyingPower;
      
      // Calculate based on absolute limits from config
      const maxValueFromConfig = config.maxPositionSize || 10000;
      
      // Use the most conservative limit
      const maxPositionValue = Math.min(
        maxValueFromPercentage,
        maxValueFromBuyingPower,
        maxValueFromConfig
      );
      
      // Convert to shares
      const maxShares = Math.floor(maxPositionValue / marketData.currentPrice);

      this.logger.debug('Maximum position calculated', {
        symbol,
        maxShares,
        maxPositionValue,
        currentPrice: marketData.currentPrice
      });

      return maxShares;

    } catch (error) {
      this.logger.error('Max position calculation failed', error as Error, { symbol });
      
      throw new DomainError(
        `Failed to calculate maximum position: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'MAX_POSITION_CALCULATION_FAILED',
        { symbol, originalError: error }
      );
    }
  }

  // ===== PRIVATE RISK ASSESSMENT METHODS =====

  private async assessConcentrationRisk(
    command: TradeCommand, 
    portfolio: PositionEntity[], 
    riskFactors: string[], 
    warnings: string[]
  ): Promise<void> {
    try {
      if (portfolio.length === 0) {
        // First position - low concentration risk
        return;
      }

      // Calculate portfolio value
      const totalPortfolioValue = portfolio.reduce((sum, pos) => sum + pos.marketValue, 0);
      
      // Check if this symbol already exists in portfolio
      const existingPosition = portfolio.find(p => p.symbol === command.symbol);
      
      if (existingPosition) {
        const currentPercentage = existingPosition.marketValue / totalPortfolioValue;
        
        if (command.action === 'buy') {
          warnings.push(`Increasing existing position in ${command.symbol} (currently ${(currentPercentage * 100).toFixed(1)}% of portfolio)`);
          
          if (currentPercentage > 0.15) {
            riskFactors.push(`High concentration in ${command.symbol} (${(currentPercentage * 100).toFixed(1)}% of portfolio)`);
          }
        }
      }

      // Check for over-concentration in largest positions
      const sortedPositions = portfolio.sort((a, b) => b.marketValue - a.marketValue);
      const top3Value = sortedPositions.slice(0, 3).reduce((sum, pos) => sum + pos.marketValue, 0);
      const top3Percentage = top3Value / totalPortfolioValue;

      if (top3Percentage > 0.60) {
        riskFactors.push(`High concentration in top 3 positions (${(top3Percentage * 100).toFixed(1)}% of portfolio)`);
      }

    } catch (error) {
      this.logger.warn('Concentration risk assessment failed', error as Error);
      warnings.push('Unable to fully assess concentration risk');
    }
  }

  private async assessVolatilityRisk(symbol: string, riskFactors: string[], warnings: string[]): Promise<void> {
    try {
      const marketData = await this.brokerAdapter.getMarketData(symbol);
      
      // Check daily price movement
      if (Math.abs(marketData.changePercent) > this.HIGH_VOLATILITY_THRESHOLD) {
        riskFactors.push(`High volatility: ${symbol} has moved ${marketData.changePercent.toFixed(2)}% today`);
      } else if (Math.abs(marketData.changePercent) > 10) {
        warnings.push(`Moderate volatility: ${symbol} has moved ${marketData.changePercent.toFixed(2)}% today`);
      }

      // Check volume (low volume can indicate higher volatility/risk)
      if (marketData.volume === 0) {
        riskFactors.push(`No volume data available for ${symbol} - liquidity risk`);
      }

    } catch (error) {
      this.logger.warn('Volatility risk assessment failed', { error: error as Error, symbol });
      warnings.push('Unable to assess volatility risk due to missing market data');
    }
  }

  private async assessCorrelationRisk(
    command: TradeCommand, 
    portfolio: PositionEntity[], 
    riskFactors: string[], 
    warnings: string[]
  ): Promise<void> {
    try {
      // Simple sector-based correlation assessment
      // In a real implementation, this would use historical price correlation
      
      const techSymbols = new Set(['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'TSLA', 'META', 'NFLX', 'NVDA', 'CRM']);
      const financeSymbols = new Set(['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC', 'TFC', 'COF']);
      const energySymbols = new Set(['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PXD', 'MPC', 'VLO', 'PSX', 'OKE']);

      let sectorExposure = {
        tech: 0,
        finance: 0,
        energy: 0,
        other: 0
      };

      // Calculate current sector exposure
      const totalValue = portfolio.reduce((sum, pos) => sum + pos.marketValue, 0);
      
      for (const position of portfolio) {
        const percentage = position.marketValue / totalValue;
        
        if (techSymbols.has(position.symbol)) {
          sectorExposure.tech += percentage;
        } else if (financeSymbols.has(position.symbol)) {
          sectorExposure.finance += percentage;
        } else if (energySymbols.has(position.symbol)) {
          sectorExposure.energy += percentage;
        } else {
          sectorExposure.other += percentage;
        }
      }

      // Check if adding this position increases sector concentration
      let newSectorExposure = 0;
      if (techSymbols.has(command.symbol)) {
        newSectorExposure = sectorExposure.tech;
        if (newSectorExposure > this.MAX_SECTOR_EXPOSURE) {
          riskFactors.push(`High tech sector exposure (${(newSectorExposure * 100).toFixed(1)}%)`);
        }
      } else if (financeSymbols.has(command.symbol)) {
        newSectorExposure = sectorExposure.finance;
        if (newSectorExposure > this.MAX_SECTOR_EXPOSURE) {
          riskFactors.push(`High finance sector exposure (${(newSectorExposure * 100).toFixed(1)}%)`);
        }
      } else if (energySymbols.has(command.symbol)) {
        newSectorExposure = sectorExposure.energy;
        if (newSectorExposure > this.MAX_SECTOR_EXPOSURE) {
          riskFactors.push(`High energy sector exposure (${(newSectorExposure * 100).toFixed(1)}%)`);
        }
      }

    } catch (error) {
      this.logger.warn('Correlation risk assessment failed', error as Error);
      warnings.push('Unable to assess correlation risk');
    }
  }

  private async assessLiquidityRisk(symbol: string, riskFactors: string[], warnings: string[]): Promise<void> {
    try {
      const marketData = await this.brokerAdapter.getMarketData(symbol);
      
      // Basic liquidity assessment based on volume
      // In reality, this would also consider bid-ask spread, market depth, etc.
      
      if (marketData.volume === 0) {
        riskFactors.push(`${symbol} shows no trading volume - potential liquidity issues`);
      }
      
      // Could also check against average volume, but we'd need historical data for that

    } catch (error) {
      this.logger.warn('Liquidity risk assessment failed', { error: error as Error, symbol });
      warnings.push('Unable to assess liquidity risk');
    }
  }

  private calculateOverallRiskLevel(riskFactors: string[]): 'low' | 'medium' | 'high' {
    if (riskFactors.length === 0) {
      return 'low';
    } else if (riskFactors.length <= 2) {
      return 'medium';
    } else {
      return 'high';
    }
  }

  private async calculateRecommendedPositionSize(command: TradeCommand, portfolio: PositionEntity[]): Promise<number | undefined> {
    try {
      const account = await this.brokerAdapter.getAccountInfo();
      const marketData = await this.brokerAdapter.getMarketData(command.symbol);

      // Calculate based on risk-adjusted position sizing
      // Use Kelly Criterion-inspired approach (simplified)
      
      let basePositionSize = account.portfolioValue * 0.05; // 5% base position
      
      // Adjust for portfolio size (smaller positions in larger portfolios)
      if (portfolio.length > 10) {
        basePositionSize *= 0.8;
      } else if (portfolio.length > 20) {
        basePositionSize *= 0.6;
      }

      // Adjust for volatility
      const volatilityAdjustment = Math.max(0.5, 1 - (Math.abs(marketData.changePercent) / 100));
      basePositionSize *= volatilityAdjustment;

      // Convert to shares
      const recommendedShares = Math.floor(basePositionSize / marketData.currentPrice);

      // Ensure it doesn't exceed maximum position limits
      const maxShares = await this.calculateMaxPosition(command.symbol, account);
      
      return Math.min(recommendedShares, maxShares);

    } catch (error) {
      this.logger.warn('Recommended position size calculation failed', error as Error);
      return undefined;
    }
  }
}