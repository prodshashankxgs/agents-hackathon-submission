import { 
  OptionsStrategy, 
  OptionsLeg, 
  OptionContract, 
  OptionQuote,
  GreeksCalculation,
  OptionsTradeIntent,
  OptionsValidation,
  BrokerError 
} from '../types';
import { OptionsStrategyEngine } from './options-strategy-engine';
import { GreeksCalculatorService } from './greeks-calculator';

/**
 * Multi-Leg Strategy Service
 * 
 * Comprehensive service for managing complex options strategies.
 * Integrates strategy building, Greeks calculations, risk analysis,
 * and strategy optimization.
 */
export class MultiLegStrategyService {
  private strategyEngine: OptionsStrategyEngine;
  private greeksCalculator: GreeksCalculatorService;

  constructor() {
    this.strategyEngine = new OptionsStrategyEngine();
    this.greeksCalculator = new GreeksCalculatorService();
  }

  /**
   * Create and analyze a complete multi-leg strategy
   */
  async createStrategy(
    strategyType: string,
    underlying: string,
    parameters: any,
    marketData: { [symbol: string]: OptionQuote },
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number = 0.05,
    dividendYield: number = 0
  ): Promise<{
    strategy: OptionsStrategy;
    analysis: StrategyAnalysis;
  }> {
    let strategy: OptionsStrategy;

    switch (strategyType.toLowerCase()) {
      case 'covered_call':
        strategy = this.strategyEngine.createCoveredCall(
          underlying,
          parameters.stockQuantity,
          parameters.callStrike,
          parameters.expirationDate,
          parameters.callPrice
        );
        break;

      case 'cash_secured_put':
        strategy = this.strategyEngine.createCashSecuredPut(
          underlying,
          parameters.putStrike,
          parameters.expirationDate,
          parameters.putPrice,
          parameters.quantity || 1
        );
        break;

      case 'protective_put':
        strategy = this.strategyEngine.createProtectivePut(
          underlying,
          parameters.stockQuantity,
          parameters.putStrike,
          parameters.expirationDate,
          parameters.putPrice,
          parameters.stockPrice
        );
        break;

      case 'long_straddle':
        strategy = this.strategyEngine.createLongStraddle(
          underlying,
          parameters.strike,
          parameters.expirationDate,
          parameters.callPrice,
          parameters.putPrice,
          parameters.quantity || 1
        );
        break;

      case 'long_strangle':
        strategy = this.strategyEngine.createLongStrangle(
          underlying,
          parameters.callStrike,
          parameters.putStrike,
          parameters.expirationDate,
          parameters.callPrice,
          parameters.putPrice,
          parameters.quantity || 1
        );
        break;

      case 'iron_condor':
        strategy = this.strategyEngine.createIronCondor(
          underlying,
          parameters.putSellStrike,
          parameters.putBuyStrike,
          parameters.callSellStrike,
          parameters.callBuyStrike,
          parameters.expirationDate,
          parameters.prices,
          parameters.quantity || 1
        );
        break;

      case 'butterfly':
        strategy = this.strategyEngine.createButterflySpread(
          underlying,
          parameters.contractType,
          parameters.lowerStrike,
          parameters.middleStrike,
          parameters.upperStrike,
          parameters.expirationDate,
          parameters.prices,
          parameters.quantity || 1
        );
        break;

      default:
        throw new BrokerError(`Unsupported strategy type: ${strategyType}`);
    }

    const analysis = await this.analyzeStrategy(
      strategy,
      underlyingPrice,
      volatility,
      riskFreeRate,
      dividendYield
    );

    return { strategy, analysis };
  }

  /**
   * Comprehensive strategy analysis
   */
  async analyzeStrategy(
    strategy: OptionsStrategy,
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number,
    dividendYield: number = 0
  ): Promise<StrategyAnalysis> {
    // Calculate Greeks
    const greeks = this.greeksCalculator.calculateStrategyGreeks(
      strategy,
      underlyingPrice,
      volatility,
      riskFreeRate,
      dividendYield
    );

    // Calculate risk metrics
    const riskMetrics = this.greeksCalculator.calculateRiskMetrics(
      strategy,
      underlyingPrice,
      volatility,
      riskFreeRate,
      dividendYield
    );

    // Calculate P&L profile
    const pnlProfile = this.strategyEngine.calculatePnLProfile(strategy, {
      min: underlyingPrice * 0.7,
      max: underlyingPrice * 1.3,
      steps: 50
    });

    // Time decay analysis
    const timeDecayAnalysis = this.calculateTimeDecayProfile(
      strategy,
      underlyingPrice,
      volatility,
      riskFreeRate,
      dividendYield
    );

    // Volatility sensitivity
    const volatilitySensitivity = this.calculateVolatilitySensitivity(
      strategy,
      underlyingPrice,
      volatility,
      riskFreeRate,
      dividendYield
    );

    return {
      greeks,
      riskMetrics,
      pnlProfile,
      timeDecayAnalysis,
      volatilitySensitivity,
      recommendations: this.generateRecommendations(strategy, greeks, riskMetrics)
    };
  }

  /**
   * Optimize strategy parameters
   */
  optimizeStrategy(
    strategyType: string,
    underlying: string,
    targetOutcome: 'max_profit' | 'min_risk' | 'balanced',
    constraints: StrategyConstraints,
    marketData: { [symbol: string]: OptionQuote },
    underlyingPrice: number,
    volatility: number
  ): Promise<OptionsStrategy> {
    // This would implement optimization algorithms
    // For now, return a basic implementation
    throw new BrokerError('Strategy optimization not yet implemented');
  }

  /**
   * Calculate time decay profile over time
   */
  private calculateTimeDecayProfile(
    strategy: OptionsStrategy,
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number,
    dividendYield: number
  ): Array<{ daysRemaining: number; portfolioValue: number; theta: number }> {
    const results: Array<{ daysRemaining: number; portfolioValue: number; theta: number }> = [];
    const originalExpiration = new Date(strategy.legs[0]?.contract.expirationDate || '');
    const today = new Date();
    const totalDays = Math.ceil((originalExpiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    for (let daysToGo = totalDays; daysToGo >= 0; daysToGo -= 5) {
      const futureDate = new Date(originalExpiration);
      futureDate.setDate(futureDate.getDate() - daysToGo);

      // Create modified strategy with updated expiration
      const newExpirationDate = futureDate.toISOString().split('T')[0];
      if (!newExpirationDate) continue; // Skip if date parsing fails
      
      const modifiedStrategy: OptionsStrategy = {
        ...strategy,
        legs: strategy.legs.map(leg => ({
          ...leg,
          contract: {
            ...leg.contract,
            expirationDate: newExpirationDate
          }
        }))
      };

      const greeks = this.greeksCalculator.calculateStrategyGreeks(
        modifiedStrategy,
        underlyingPrice,
        volatility,
        riskFreeRate,
        dividendYield
      );

      const portfolioValue = this.calculateCurrentPortfolioValue(
        modifiedStrategy,
        underlyingPrice,
        volatility,
        riskFreeRate,
        dividendYield
      );

      results.push({
        daysRemaining: daysToGo,
        portfolioValue,
        theta: greeks.theta
      });
    }

    return results;
  }

  /**
   * Calculate volatility sensitivity analysis
   */
  private calculateVolatilitySensitivity(
    strategy: OptionsStrategy,
    underlyingPrice: number,
    baseVolatility: number,
    riskFreeRate: number,
    dividendYield: number
  ): Array<{ volatility: number; portfolioValue: number; vega: number }> {
    const results: Array<{ volatility: number; portfolioValue: number; vega: number }> = [];
    const volRange = { min: baseVolatility * 0.5, max: baseVolatility * 1.5, steps: 20 };
    const stepSize = (volRange.max - volRange.min) / volRange.steps;

    for (let i = 0; i <= volRange.steps; i++) {
      const vol = volRange.min + (i * stepSize);
      
      const greeks = this.greeksCalculator.calculateStrategyGreeks(
        strategy,
        underlyingPrice,
        vol,
        riskFreeRate,
        dividendYield
      );

      const portfolioValue = this.calculateCurrentPortfolioValue(
        strategy,
        underlyingPrice,
        vol,
        riskFreeRate,
        dividendYield
      );

      results.push({
        volatility: vol,
        portfolioValue,
        vega: greeks.vega
      });
    }

    return results;
  }

  /**
   * Calculate current portfolio value
   */
  private calculateCurrentPortfolioValue(
    strategy: OptionsStrategy,
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number,
    dividendYield: number
  ): number {
    let totalValue = 0;

    for (const leg of strategy.legs) {
      const theoreticalPrice = this.greeksCalculator.calculateOptionPrice(
        leg.contract,
        underlyingPrice,
        volatility,
        riskFreeRate,
        dividendYield
      );

      const legValue = theoreticalPrice * leg.quantity * 100;
      
      if (leg.side === 'long') {
        totalValue += legValue;
      } else {
        totalValue -= legValue;
      }
    }

    return totalValue;
  }

  /**
   * Generate strategy recommendations
   */
  private generateRecommendations(
    strategy: OptionsStrategy,
    greeks: GreeksCalculation,
    riskMetrics: any
  ): string[] {
    const recommendations: string[] = [];

    // Delta recommendations
    if (Math.abs(greeks.delta) > 0.5) {
      recommendations.push(
        `High delta exposure (${greeks.delta.toFixed(2)}). Consider hedging with underlying stock.`
      );
    }

    // Gamma recommendations
    if (Math.abs(greeks.gamma) > 0.1) {
      recommendations.push(
        `High gamma exposure (${greeks.gamma.toFixed(3)}). Delta will change rapidly with price moves.`
      );
    }

    // Theta recommendations
    if (greeks.theta < -50) {
      recommendations.push(
        `High time decay (${greeks.theta.toFixed(2)}/day). Monitor position closely as expiration approaches.`
      );
    }

    // Vega recommendations
    if (Math.abs(greeks.vega) > 100) {
      recommendations.push(
        `High volatility sensitivity (${greeks.vega.toFixed(0)}). Position value will change significantly with IV changes.`
      );
    }

    // Risk recommendations
    if (riskMetrics.probabilityOfProfit < 0.4) {
      recommendations.push(
        `Low probability of profit (${(riskMetrics.probabilityOfProfit * 100).toFixed(1)}%). Consider adjusting strategy.`
      );
    }

    // Strategy-specific recommendations
    if (strategy.type === 'iron_condor' && strategy.maxProfit < strategy.margin * 0.1) {
      recommendations.push(
        'Low return on capital for iron condor. Consider wider spreads or different expiration.'
      );
    }

    if (strategy.type === 'straddle' && Math.abs(greeks.delta) > 0.1) {
      recommendations.push(
        'Straddle is not delta-neutral. Consider adjusting strikes or hedge with stock.'
      );
    }

    return recommendations;
  }

  /**
   * Validate multi-leg strategy before execution
   */
  validateMultiLegStrategy(
    strategy: OptionsStrategy,
    accountInfo: any,
    marketConditions: MarketConditions
  ): StrategyValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic strategy validation
    const basicValidation = this.strategyEngine.validateStrategy(strategy, accountInfo);
    errors.push(...basicValidation.errors);
    warnings.push(...basicValidation.warnings);

    // Multi-leg specific validations
    if (strategy.legs.length > 4) {
      warnings.push('Complex strategy with more than 4 legs. Ensure proper risk management.');
    }

    // Check for early assignment risk
    for (const leg of strategy.legs) {
      if (leg.side === 'short' && leg.contract.contractType === 'call') {
        const timeToExpiration = this.calculateTimeToExpiration(leg.contract.expirationDate);
        if (timeToExpiration < 30 && marketConditions.underlyingPrice > leg.contract.strikePrice) {
          warnings.push(
            `Short call ${leg.contract.optionSymbol} is ITM with < 30 days to expiration. Early assignment risk.`
          );
        }
      }
    }

    // Check for liquidity
    for (const leg of strategy.legs) {
      const volume = marketConditions.optionVolumes?.[leg.contract.optionSymbol];
      if (volume !== undefined && volume < 10) {
        warnings.push(
          `Low liquidity for ${leg.contract.optionSymbol}. May have difficulty closing position.`
        );
      }
    }

    // Market condition checks
    if (marketConditions.volatilityRank > 80 && strategy.type === 'straddle') {
      warnings.push('High volatility environment. Long straddle may be expensive.');
    }

    if (marketConditions.volatilityRank < 20 && strategy.type === 'iron_condor') {
      warnings.push('Low volatility environment. Iron condor may have limited profit potential.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      riskLevel: this.assessRiskLevel(strategy),
      recommendations: this.generateValidationRecommendations(strategy, marketConditions)
    };
  }

  /**
   * Assess overall risk level of strategy
   */
  private assessRiskLevel(strategy: OptionsStrategy): 'low' | 'medium' | 'high' {
    // Simple risk assessment based on strategy characteristics
    if (strategy.maxLoss === Number.POSITIVE_INFINITY) {
      return 'high';
    }

    const riskRatio = Math.abs(strategy.maxLoss / strategy.maxProfit);
    
    if (riskRatio > 3) {
      return 'high';
    } else if (riskRatio > 1) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Generate validation-specific recommendations
   */
  private generateValidationRecommendations(
    strategy: OptionsStrategy,
    marketConditions: MarketConditions
  ): string[] {
    const recommendations: string[] = [];

    // Add market-condition specific recommendations
    if (marketConditions.trend === 'bullish' && strategy.type === 'cash_secured_put') {
      recommendations.push('Bullish market conditions favor cash-secured puts.');
    }

    if (marketConditions.trend === 'bearish' && strategy.type === 'covered_call') {
      recommendations.push('Bearish conditions may result in stock assignment for covered calls.');
    }

    return recommendations;
  }

  /**
   * Calculate time to expiration
   */
  private calculateTimeToExpiration(expirationDate: string): number {
    const expiry = new Date(expirationDate);
    const now = new Date();
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }
}

// Supporting interfaces
export interface StrategyAnalysis {
  greeks: GreeksCalculation;
  riskMetrics: any;
  pnlProfile: Array<{ price: number; pnl: number }>;
  timeDecayAnalysis: Array<{ daysRemaining: number; portfolioValue: number; theta: number }>;
  volatilitySensitivity: Array<{ volatility: number; portfolioValue: number; vega: number }>;
  recommendations: string[];
}

export interface StrategyConstraints {
  maxRisk: number;
  minProbabilityOfProfit: number;
  maxCapitalRequired: number;
  preferredExpiration?: string;
  deltaRange?: { min: number; max: number };
}

export interface StrategyValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface MarketConditions {
  underlyingPrice: number;
  volatilityRank: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  optionVolumes?: { [symbol: string]: number };
  impliedVolatility?: number;
} 