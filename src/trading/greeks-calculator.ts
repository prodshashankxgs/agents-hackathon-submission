import { OptionContract, GreeksCalculation, OptionsStrategy, OptionsLeg } from '../types';

/**
 * Advanced Greeks Calculator Service
 * 
 * Provides comprehensive Greeks calculations using Black-Scholes model
 * and other mathematical models for options pricing and risk analysis.
 * 
 * Greeks calculated:
 * - Delta: Price sensitivity to underlying asset
 * - Gamma: Rate of change of delta
 * - Theta: Time decay
 * - Vega: Volatility sensitivity  
 * - Rho: Interest rate sensitivity
 */
export class GreeksCalculatorService {
  
  /**
   * Calculate Greeks for a single option contract
   */
  calculateOptionGreeks(
    contract: OptionContract,
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number,
    dividendYield: number = 0
  ): GreeksCalculation {
    const timeToExpiration = this.calculateTimeToExpiration(contract.expirationDate);
    
    if (timeToExpiration <= 0) {
      return this.getExpiredGreeks();
    }

    const d1 = this.calculateD1(underlyingPrice, contract.strikePrice, riskFreeRate, dividendYield, volatility, timeToExpiration);
    const d2 = d1 - volatility * Math.sqrt(timeToExpiration);

    const greeks = contract.contractType === 'call' 
      ? this.calculateCallGreeks(underlyingPrice, contract.strikePrice, riskFreeRate, dividendYield, volatility, timeToExpiration, d1, d2)
      : this.calculatePutGreeks(underlyingPrice, contract.strikePrice, riskFreeRate, dividendYield, volatility, timeToExpiration, d1, d2);

    return greeks;
  }

  /**
   * Calculate aggregated Greeks for a multi-leg strategy
   */
  calculateStrategyGreeks(
    strategy: OptionsStrategy,
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number,
    dividendYield: number = 0
  ): GreeksCalculation {
    let totalDelta = 0;
    let totalGamma = 0;
    let totalTheta = 0;
    let totalVega = 0;
    let totalRho = 0;

    for (const leg of strategy.legs) {
      const legGreeks = this.calculateOptionGreeks(
        leg.contract,
        underlyingPrice,
        volatility,
        riskFreeRate,
        dividendYield
      );

      const multiplier = leg.side === 'long' ? 1 : -1;
      const quantity = leg.quantity * multiplier;

      totalDelta += legGreeks.delta * quantity;
      totalGamma += legGreeks.gamma * quantity;
      totalTheta += legGreeks.theta * quantity;
      totalVega += legGreeks.vega * quantity;
      totalRho += legGreeks.rho * quantity;
    }

    return {
      delta: totalDelta,
      gamma: totalGamma,
      theta: totalTheta,
      vega: totalVega,
      rho: totalRho
    };
  }

  /**
   * Calculate portfolio-level Greeks across multiple positions
   */
  calculatePortfolioGreeks(
    positions: Array<{
      strategy: OptionsStrategy;
      underlyingPrice: number;
      volatility: number;
    }>,
    riskFreeRate: number,
    dividendYield: number = 0
  ): GreeksCalculation {
    let portfolioDelta = 0;
    let portfolioGamma = 0;
    let portfolioTheta = 0;
    let portfolioVega = 0;
    let portfolioRho = 0;

    for (const position of positions) {
      const strategyGreeks = this.calculateStrategyGreeks(
        position.strategy,
        position.underlyingPrice,
        position.volatility,
        riskFreeRate,
        dividendYield
      );

      portfolioDelta += strategyGreeks.delta;
      portfolioGamma += strategyGreeks.gamma;
      portfolioTheta += strategyGreeks.theta;
      portfolioVega += strategyGreeks.vega;
      portfolioRho += strategyGreeks.rho;
    }

    return {
      delta: portfolioDelta,
      gamma: portfolioGamma,
      theta: portfolioTheta,
      vega: portfolioVega,
      rho: portfolioRho
    };
  }

  /**
   * Calculate call option Greeks using Black-Scholes
   */
  private calculateCallGreeks(
    S: number,  // Underlying price
    K: number,  // Strike price
    r: number,  // Risk-free rate
    q: number,  // Dividend yield
    σ: number,  // Volatility
    T: number,  // Time to expiration
    d1: number,
    d2: number
  ): GreeksCalculation {
    const Nd1 = this.normalCDF(d1);
    const Nd2 = this.normalCDF(d2);
    const nd1 = this.normalPDF(d1);

    // Delta
    const delta = Math.exp(-q * T) * Nd1;

    // Gamma
    const gamma = (Math.exp(-q * T) * nd1) / (S * σ * Math.sqrt(T));

    // Theta (convert to daily)
    const theta = (-(S * nd1 * σ * Math.exp(-q * T)) / (2 * Math.sqrt(T)) 
                   - r * K * Math.exp(-r * T) * Nd2 
                   + q * S * Math.exp(-q * T) * Nd1) / 365;

    // Vega (convert to percentage)
    const vega = (S * Math.exp(-q * T) * nd1 * Math.sqrt(T)) / 100;

    // Rho (convert to percentage)
    const rho = (K * T * Math.exp(-r * T) * Nd2) / 100;

    return { delta, gamma, theta, vega, rho };
  }

  /**
   * Calculate put option Greeks using Black-Scholes
   */
  private calculatePutGreeks(
    S: number,  // Underlying price
    K: number,  // Strike price
    r: number,  // Risk-free rate
    q: number,  // Dividend yield
    σ: number,  // Volatility
    T: number,  // Time to expiration
    d1: number,
    d2: number
  ): GreeksCalculation {
    const Nd1 = this.normalCDF(d1);
    const Nd2 = this.normalCDF(d2);
    const nd1 = this.normalPDF(d1);

    // Delta
    const delta = -Math.exp(-q * T) * this.normalCDF(-d1);

    // Gamma (same for calls and puts)
    const gamma = (Math.exp(-q * T) * nd1) / (S * σ * Math.sqrt(T));

    // Theta (convert to daily)
    const theta = (-(S * nd1 * σ * Math.exp(-q * T)) / (2 * Math.sqrt(T)) 
                   + r * K * Math.exp(-r * T) * this.normalCDF(-d2) 
                   - q * S * Math.exp(-q * T) * this.normalCDF(-d1)) / 365;

    // Vega (same for calls and puts, convert to percentage)
    const vega = (S * Math.exp(-q * T) * nd1 * Math.sqrt(T)) / 100;

    // Rho (convert to percentage)
    const rho = (-K * T * Math.exp(-r * T) * this.normalCDF(-d2)) / 100;

    return { delta, gamma, theta, vega, rho };
  }

  /**
   * Calculate d1 parameter for Black-Scholes
   */
  private calculateD1(
    S: number,  // Underlying price
    K: number,  // Strike price
    r: number,  // Risk-free rate
    q: number,  // Dividend yield
    σ: number,  // Volatility
    T: number   // Time to expiration
  ): number {
    return (Math.log(S / K) + (r - q + 0.5 * σ * σ) * T) / (σ * Math.sqrt(T));
  }

  /**
   * Calculate time to expiration in years
   */
  private calculateTimeToExpiration(expirationDate: string): number {
    const expiry = new Date(expirationDate);
    const now = new Date();
    const timeDiff = expiry.getTime() - now.getTime();
    return Math.max(0, timeDiff / (1000 * 60 * 60 * 24 * 365.25));
  }

  /**
   * Standard normal cumulative distribution function
   */
  private normalCDF(x: number): number {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
  }

  /**
   * Standard normal probability density function
   */
  private normalPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * Error function approximation (Abramowitz and Stegun)
   */
  private erf(x: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  /**
   * Get Greeks for expired options
   */
  private getExpiredGreeks(): GreeksCalculation {
    return {
      delta: 0,
      gamma: 0,
      theta: 0,
      vega: 0,
      rho: 0
    };
  }

  /**
   * Calculate implied volatility using Newton-Raphson method
   */
  calculateImpliedVolatility(
    contract: OptionContract,
    underlyingPrice: number,
    optionPrice: number,
    riskFreeRate: number,
    dividendYield: number = 0,
    maxIterations: number = 100,
    tolerance: number = 0.0001
  ): number {
    const timeToExpiration = this.calculateTimeToExpiration(contract.expirationDate);
    
    if (timeToExpiration <= 0) {
      return 0;
    }

    let volatility = 0.2; // Initial guess of 20%
    
    for (let i = 0; i < maxIterations; i++) {
      const theoreticalPrice = this.calculateOptionPrice(
        contract,
        underlyingPrice,
        volatility,
        riskFreeRate,
        dividendYield
      );
      
      const vega = this.calculateOptionGreeks(
        contract,
        underlyingPrice,
        volatility,
        riskFreeRate,
        dividendYield
      ).vega * 100; // Convert back from percentage
      
      const priceDiff = theoreticalPrice - optionPrice;
      
      if (Math.abs(priceDiff) < tolerance) {
        return volatility;
      }
      
      if (vega === 0) {
        break;
      }
      
      volatility = volatility - priceDiff / vega;
      
      // Ensure volatility stays positive
      volatility = Math.max(0.001, volatility);
    }
    
    return volatility;
  }

  /**
   * Calculate theoretical option price using Black-Scholes
   */
  calculateOptionPrice(
    contract: OptionContract,
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number,
    dividendYield: number = 0
  ): number {
    const timeToExpiration = this.calculateTimeToExpiration(contract.expirationDate);
    
    if (timeToExpiration <= 0) {
      // Calculate intrinsic value for expired options
      if (contract.contractType === 'call') {
        return Math.max(0, underlyingPrice - contract.strikePrice);
      } else {
        return Math.max(0, contract.strikePrice - underlyingPrice);
      }
    }

    const d1 = this.calculateD1(
      underlyingPrice,
      contract.strikePrice,
      riskFreeRate,
      dividendYield,
      volatility,
      timeToExpiration
    );
    const d2 = d1 - volatility * Math.sqrt(timeToExpiration);

    if (contract.contractType === 'call') {
      return (
        underlyingPrice * Math.exp(-dividendYield * timeToExpiration) * this.normalCDF(d1) -
        contract.strikePrice * Math.exp(-riskFreeRate * timeToExpiration) * this.normalCDF(d2)
      );
    } else {
      return (
        contract.strikePrice * Math.exp(-riskFreeRate * timeToExpiration) * this.normalCDF(-d2) -
        underlyingPrice * Math.exp(-dividendYield * timeToExpiration) * this.normalCDF(-d1)
      );
    }
  }

  /**
   * Calculate Greeks sensitivity analysis
   */
  calculateGreeksSensitivity(
    contract: OptionContract,
    baseUnderlyingPrice: number,
    baseVolatility: number,
    riskFreeRate: number,
    dividendYield: number = 0,
    priceShift: number = 0.01,  // 1% price change
    volShift: number = 0.01     // 1% volatility change
  ): {
    deltaChange: number;
    gammaChange: number;
    vegaChange: number;
    thetaDecay: number;
  } {
    const baseGreeks = this.calculateOptionGreeks(
      contract,
      baseUnderlyingPrice,
      baseVolatility,
      riskFreeRate,
      dividendYield
    );

    // Price sensitivity
    const upPriceGreeks = this.calculateOptionGreeks(
      contract,
      baseUnderlyingPrice * (1 + priceShift),
      baseVolatility,
      riskFreeRate,
      dividendYield
    );

    // Volatility sensitivity
    const upVolGreeks = this.calculateOptionGreeks(
      contract,
      baseUnderlyingPrice,
      baseVolatility * (1 + volShift),
      riskFreeRate,
      dividendYield
    );

    // Time decay (1 day)
    const tomorrowExpiration = new Date(contract.expirationDate);
    tomorrowExpiration.setDate(tomorrowExpiration.getDate() - 1);
    
    const newExpirationDate = tomorrowExpiration.toISOString().split('T')[0];
    if (!newExpirationDate) {
      return {
        deltaChange: 0,
        gammaChange: 0,
        vegaChange: 0,
        thetaDecay: 0
      };
    }
    
    const tomorrowContract: OptionContract = {
      ...contract,
      expirationDate: newExpirationDate
    };
    
    const tomorrowGreeks = this.calculateOptionGreeks(
      tomorrowContract,
      baseUnderlyingPrice,
      baseVolatility,
      riskFreeRate,
      dividendYield
    );

    return {
      deltaChange: upPriceGreeks.delta - baseGreeks.delta,
      gammaChange: upPriceGreeks.gamma - baseGreeks.gamma,
      vegaChange: upVolGreeks.vega - baseGreeks.vega,
      thetaDecay: tomorrowGreeks.theta - baseGreeks.theta
    };
  }

  /**
   * Calculate risk metrics for a strategy
   */
  calculateRiskMetrics(
    strategy: OptionsStrategy,
    underlyingPrice: number,
    volatility: number,
    riskFreeRate: number,
    dividendYield: number = 0
  ): {
    greeks: GreeksCalculation;
    valueAtRisk: number;
    maxDrawdown: number;
    probabilityOfProfit: number;
    expectedValue: number;
  } {
    const greeks = this.calculateStrategyGreeks(
      strategy,
      underlyingPrice,
      volatility,
      riskFreeRate,
      dividendYield
    );

    // Calculate Value at Risk (simplified)
    const oneStdMove = underlyingPrice * volatility * Math.sqrt(1/365); // Daily VaR
    const valueAtRisk = Math.abs(greeks.delta * oneStdMove);

    // Max drawdown is essentially max loss
    const maxDrawdown = strategy.maxLoss;

    // Simplified probability of profit calculation
    const timeToExpiration = this.calculateTimeToExpiration(strategy.legs[0]?.contract.expirationDate || '');
    const expectedMove = underlyingPrice * volatility * Math.sqrt(timeToExpiration);
    
    let probabilityOfProfit = 0.5; // Default 50%
    if (strategy.breakeven.length > 0) {
      const lowerBreakeven = Math.min(...strategy.breakeven);
      const upperBreakeven = Math.max(...strategy.breakeven);
      
      if (strategy.breakeven.length === 1) {
        // Single breakeven point
                const firstBreakeven = strategy.breakeven[0];
        if (firstBreakeven !== undefined) {
          const distanceFromCurrent = Math.abs(underlyingPrice - firstBreakeven);
          probabilityOfProfit = 1 - this.normalCDF(distanceFromCurrent / expectedMove);
        }
      } else {
        // Range between two breakeven points
        const probAboveLower = 1 - this.normalCDF((lowerBreakeven - underlyingPrice) / expectedMove);
        const probBelowUpper = this.normalCDF((upperBreakeven - underlyingPrice) / expectedMove);
        probabilityOfProfit = probBelowUpper - (1 - probAboveLower);
      }
    }

    // Expected value calculation (simplified)
    const expectedValue = strategy.maxProfit * probabilityOfProfit + 
                         strategy.maxLoss * (1 - probabilityOfProfit);

    return {
      greeks,
      valueAtRisk,
      maxDrawdown,
      probabilityOfProfit: Math.max(0, Math.min(1, probabilityOfProfit)),
      expectedValue
    };
  }
} 