import { 
  OptionsStrategy, 
  OptionsLeg, 
  OptionContract, 
  OptionQuote, 
  GreeksCalculation,
  OptionsTradeIntent,
  BrokerError 
} from '../types';

/**
 * Options Strategy Engine
 * 
 * Core engine for building, analyzing, and managing multi-leg options strategies.
 * Supports all major options strategies including spreads, straddles, strangles,
 * iron condors, butterflies, and covered calls.
 */
export class OptionsStrategyEngine {
  
  /**
   * Build a complete options strategy from individual legs
   */
  async buildStrategy(
    strategyType: string,
    legs: OptionsLeg[],
    marketData: { [symbol: string]: OptionQuote },
    underlyingPrice: number
  ): Promise<OptionsStrategy> {
    
    const analysis = this.analyzeStrategy(legs, marketData, underlyingPrice);
    
    return {
      name: this.getStrategyName(strategyType, legs),
      type: strategyType as any,
      legs,
      maxProfit: analysis.maxProfit,
      maxLoss: analysis.maxLoss,
      breakeven: analysis.breakeven,
      collateral: analysis.collateral,
      margin: analysis.marginRequirement,
      description: this.getStrategyDescription(strategyType, legs)
    };
  }

  /**
   * Create a covered call strategy
   */
  createCoveredCall(
    underlying: string,
    stockQuantity: number,
    callStrike: number,
    expirationDate: string,
    callPrice: number
  ): OptionsStrategy {
    const legs: OptionsLeg[] = [
      {
        action: 'sell_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'call', callStrike),
          contractType: 'call',
          strikePrice: callStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity: stockQuantity / 100, // 1 contract per 100 shares
        price: callPrice,
        side: 'short'
      }
    ];

    const maxProfit = (callStrike * stockQuantity) + (callPrice * stockQuantity);
    const maxLoss = Number.NEGATIVE_INFINITY; // Theoretically unlimited if stock goes to zero
    const breakeven = [callStrike + callPrice];

    return {
      name: `${underlying} Covered Call ${callStrike} ${expirationDate}`,
      type: 'covered_call',
      legs,
      maxProfit,
      maxLoss,
      breakeven,
      collateral: stockQuantity * callStrike, // Need to own the stock
      margin: 0, // No margin required if you own the stock
      description: `Sell call options against owned stock position to generate income`
    };
  }

  /**
   * Create a cash-secured put strategy
   */
  createCashSecuredPut(
    underlying: string,
    putStrike: number,
    expirationDate: string,
    putPrice: number,
    quantity: number = 1
  ): OptionsStrategy {
    const legs: OptionsLeg[] = [
      {
        action: 'sell_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'put', putStrike),
          contractType: 'put',
          strikePrice: putStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: putPrice,
        side: 'short'
      }
    ];

    const maxProfit = putPrice * quantity * 100;
    const maxLoss = (putStrike - putPrice) * quantity * 100;
    const breakeven = [putStrike - putPrice];

    return {
      name: `${underlying} Cash-Secured Put ${putStrike} ${expirationDate}`,
      type: 'cash_secured_put',
      legs,
      maxProfit,
      maxLoss,
      breakeven,
      collateral: putStrike * quantity * 100,
      margin: putStrike * quantity * 100, // Need cash to buy stock if assigned
      description: `Sell put options with cash reserved to purchase stock if assigned`
    };
  }

  /**
   * Create a protective put strategy
   */
  createProtectivePut(
    underlying: string,
    stockQuantity: number,
    putStrike: number,
    expirationDate: string,
    putPrice: number,
    stockPrice: number
  ): OptionsStrategy {
    const legs: OptionsLeg[] = [
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'put', putStrike),
          contractType: 'put',
          strikePrice: putStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity: stockQuantity / 100,
        price: putPrice,
        side: 'long'
      }
    ];

    const maxProfit = Number.POSITIVE_INFINITY;
    const maxLoss = (stockPrice - putStrike + putPrice) * stockQuantity;
    const breakeven = [stockPrice + putPrice];

    return {
      name: `${underlying} Protective Put ${putStrike} ${expirationDate}`,
      type: 'protective_put',
      legs,
      maxProfit,
      maxLoss,
      breakeven,
      collateral: 0,
      margin: putPrice * stockQuantity,
      description: `Buy put options to protect existing stock position from downside risk`
    };
  }

  /**
   * Create a long straddle strategy
   */
  createLongStraddle(
    underlying: string,
    strike: number,
    expirationDate: string,
    callPrice: number,
    putPrice: number,
    quantity: number = 1
  ): OptionsStrategy {
    const legs: OptionsLeg[] = [
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'call', strike),
          contractType: 'call',
          strikePrice: strike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: callPrice,
        side: 'long'
      },
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'put', strike),
          contractType: 'put',
          strikePrice: strike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: putPrice,
        side: 'long'
      }
    ];

    const totalPremium = (callPrice + putPrice) * quantity * 100;
    const maxProfit = Number.POSITIVE_INFINITY;
    const maxLoss = totalPremium;
    const breakeven = [strike - (callPrice + putPrice), strike + (callPrice + putPrice)];

    return {
      name: `${underlying} Long Straddle ${strike} ${expirationDate}`,
      type: 'straddle',
      legs,
      maxProfit,
      maxLoss,
      breakeven,
      collateral: 0,
      margin: totalPremium,
      description: `Buy both call and put at same strike to profit from large moves in either direction`
    };
  }

  /**
   * Create a long strangle strategy
   */
  createLongStrangle(
    underlying: string,
    callStrike: number,
    putStrike: number,
    expirationDate: string,
    callPrice: number,
    putPrice: number,
    quantity: number = 1
  ): OptionsStrategy {
    const legs: OptionsLeg[] = [
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'call', callStrike),
          contractType: 'call',
          strikePrice: callStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: callPrice,
        side: 'long'
      },
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'put', putStrike),
          contractType: 'put',
          strikePrice: putStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: putPrice,
        side: 'long'
      }
    ];

    const totalPremium = (callPrice + putPrice) * quantity * 100;
    const maxProfit = Number.POSITIVE_INFINITY;
    const maxLoss = totalPremium;
    const breakeven = [putStrike - (callPrice + putPrice), callStrike + (callPrice + putPrice)];

    return {
      name: `${underlying} Long Strangle ${putStrike}/${callStrike} ${expirationDate}`,
      type: 'strangle',
      legs,
      maxProfit,
      maxLoss,
      breakeven,
      collateral: 0,
      margin: totalPremium,
      description: `Buy call and put at different strikes to profit from large moves in either direction`
    };
  }

  /**
   * Create an iron condor strategy
   */
  createIronCondor(
    underlying: string,
    putSellStrike: number,
    putBuyStrike: number,
    callSellStrike: number,
    callBuyStrike: number,
    expirationDate: string,
    prices: { putSell: number; putBuy: number; callSell: number; callBuy: number },
    quantity: number = 1
  ): OptionsStrategy {
    const legs: OptionsLeg[] = [
      // Sell put spread
      {
        action: 'sell_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'put', putSellStrike),
          contractType: 'put',
          strikePrice: putSellStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: prices.putSell,
        side: 'short'
      },
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'put', putBuyStrike),
          contractType: 'put',
          strikePrice: putBuyStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: prices.putBuy,
        side: 'long'
      },
      // Sell call spread
      {
        action: 'sell_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'call', callSellStrike),
          contractType: 'call',
          strikePrice: callSellStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: prices.callSell,
        side: 'short'
      },
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, 'call', callBuyStrike),
          contractType: 'call',
          strikePrice: callBuyStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: prices.callBuy,
        side: 'long'
      }
    ];

    const netCredit = (prices.putSell - prices.putBuy + prices.callSell - prices.callBuy) * quantity * 100;
    const maxProfit = netCredit;
    const maxLoss = Math.max(
      (putSellStrike - putBuyStrike) * quantity * 100 - netCredit,
      (callBuyStrike - callSellStrike) * quantity * 100 - netCredit
    );
    const breakeven = [
      putSellStrike - (netCredit / (quantity * 100)),
      callSellStrike + (netCredit / (quantity * 100))
    ];

    return {
      name: `${underlying} Iron Condor ${putBuyStrike}/${putSellStrike}/${callSellStrike}/${callBuyStrike} ${expirationDate}`,
      type: 'iron_condor',
      legs,
      maxProfit,
      maxLoss,
      breakeven,
      collateral: Math.max(
        (putSellStrike - putBuyStrike) * quantity * 100,
        (callBuyStrike - callSellStrike) * quantity * 100
      ),
      margin: maxLoss,
      description: `Sell both put and call spreads to profit from low volatility and range-bound movement`
    };
  }

  /**
   * Create a butterfly spread strategy
   */
  createButterflySpread(
    underlying: string,
    contractType: 'call' | 'put',
    lowerStrike: number,
    middleStrike: number,
    upperStrike: number,
    expirationDate: string,
    prices: { lower: number; middle: number; upper: number },
    quantity: number = 1
  ): OptionsStrategy {
    const legs: OptionsLeg[] = [
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, contractType, lowerStrike),
          contractType,
          strikePrice: lowerStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: prices.lower,
        side: 'long'
      },
      {
        action: 'sell_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, contractType, middleStrike),
          contractType,
          strikePrice: middleStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity: quantity * 2,
        price: prices.middle,
        side: 'short'
      },
      {
        action: 'buy_to_open',
        contract: {
          symbol: underlying,
          optionSymbol: this.generateOptionSymbol(underlying, expirationDate, contractType, upperStrike),
          contractType,
          strikePrice: upperStrike,
          expirationDate,
          multiplier: 100,
          exchange: 'OPRA',
          underlying
        },
        quantity,
        price: prices.upper,
        side: 'long'
      }
    ];

    const netDebit = (prices.lower - 2 * prices.middle + prices.upper) * quantity * 100;
    const maxProfit = (middleStrike - lowerStrike) * quantity * 100 - netDebit;
    const maxLoss = netDebit;
    const breakeven = [
      lowerStrike + (netDebit / (quantity * 100)),
      upperStrike - (netDebit / (quantity * 100))
    ];

    return {
      name: `${underlying} ${contractType.toUpperCase()} Butterfly ${lowerStrike}/${middleStrike}/${upperStrike} ${expirationDate}`,
      type: 'butterfly',
      legs,
      maxProfit,
      maxLoss,
      breakeven,
      collateral: 0,
      margin: netDebit,
      description: `Buy butterfly spread to profit from low volatility around the middle strike`
    };
  }

  /**
   * Analyze a strategy's risk/reward profile
   */
  private analyzeStrategy(
    legs: OptionsLeg[],
    marketData: { [symbol: string]: OptionQuote },
    underlyingPrice: number
  ): {
    maxProfit: number;
    maxLoss: number;
    breakeven: number[];
    collateral: number;
    marginRequirement: number;
  } {
    let totalCost = 0;
    let totalCredit = 0;
    let marginRequirement = 0;
    let collateral = 0;

    for (const leg of legs) {
      const cost = leg.price * leg.quantity * 100;
      
      if (leg.side === 'long') {
        totalCost += cost;
      } else {
        totalCredit += cost;
        
        // Calculate margin requirements for short positions
        if (leg.contract.contractType === 'put') {
          marginRequirement += leg.contract.strikePrice * leg.quantity * 100;
        } else {
          // Naked call margin requirement (simplified)
          marginRequirement += underlyingPrice * leg.quantity * 100 * 0.2;
        }
      }
    }

    const netDebit = totalCost - totalCredit;
    
    // Simplified analysis - in practice, this would be more complex
    return {
      maxProfit: netDebit < 0 ? Math.abs(netDebit) : Number.POSITIVE_INFINITY,
      maxLoss: netDebit > 0 ? netDebit : marginRequirement,
      breakeven: [], // Would need more complex calculation based on strategy type
      collateral,
      marginRequirement: Math.max(marginRequirement, netDebit)
    };
  }

  /**
   * Get strategy name based on type and legs
   */
  private getStrategyName(strategyType: string, legs: OptionsLeg[]): string {
    const underlying = legs[0]?.contract.underlying || 'UNKNOWN';
    const expiration = legs[0]?.contract.expirationDate || 'UNKNOWN';
    
    return `${underlying} ${strategyType.toUpperCase()} ${expiration}`;
  }

  /**
   * Get strategy description
   */
  private getStrategyDescription(strategyType: string, legs: OptionsLeg[]): string {
    const descriptions: { [key: string]: string } = {
      'single_leg': 'Single option position',
      'covered_call': 'Sell call options against owned stock to generate income',
      'cash_secured_put': 'Sell put options with cash reserved to buy stock',
      'protective_put': 'Buy put options to protect stock position',
      'straddle': 'Buy call and put at same strike for volatility play',
      'strangle': 'Buy call and put at different strikes for volatility play',
      'iron_condor': 'Sell put and call spreads for range-bound profit',
      'butterfly': 'Buy butterfly spread for low volatility profit',
      'collar': 'Combine covered call with protective put'
    };

    return descriptions[strategyType] || 'Custom options strategy';
  }

  /**
   * Generate option symbol in Alpaca format
   */
  private generateOptionSymbol(
    underlying: string,
    expirationDate: string,
    contractType: 'call' | 'put',
    strike: number
  ): string {
    const expDate = new Date(expirationDate);
    const year = expDate.getFullYear().toString().slice(-2);
    const month = (expDate.getMonth() + 1).toString().padStart(2, '0');
    const day = expDate.getDate().toString().padStart(2, '0');
    const typeChar = contractType === 'call' ? 'C' : 'P';
    const strikeStr = (strike * 1000).toString().padStart(8, '0');
    
    return `${underlying}${year}${month}${day}${typeChar}${strikeStr}`;
  }

  /**
   * Calculate strategy profit/loss at different underlying prices
   */
  calculatePnLProfile(
    strategy: OptionsStrategy,
    priceRange: { min: number; max: number; steps: number }
  ): Array<{ price: number; pnl: number }> {
    const results: Array<{ price: number; pnl: number }> = [];
    const stepSize = (priceRange.max - priceRange.min) / priceRange.steps;

    for (let i = 0; i <= priceRange.steps; i++) {
      const price = priceRange.min + (i * stepSize);
      const pnl = this.calculatePnLAtPrice(strategy, price);
      results.push({ price, pnl });
    }

    return results;
  }

  /**
   * Calculate P&L at a specific underlying price
   */
  private calculatePnLAtPrice(strategy: OptionsStrategy, underlyingPrice: number): number {
    let totalPnL = 0;

    for (const leg of strategy.legs) {
      const intrinsicValue = this.calculateIntrinsicValue(
        leg.contract.contractType,
        underlyingPrice,
        leg.contract.strikePrice
      );

      const legValue = intrinsicValue * leg.quantity * 100;
      const initialCost = leg.price * leg.quantity * 100;

      if (leg.side === 'long') {
        totalPnL += legValue - initialCost;
      } else {
        totalPnL += initialCost - legValue;
      }
    }

    return totalPnL;
  }

  /**
   * Calculate intrinsic value of an option
   */
  private calculateIntrinsicValue(
    contractType: 'call' | 'put',
    underlyingPrice: number,
    strikePrice: number
  ): number {
    if (contractType === 'call') {
      return Math.max(0, underlyingPrice - strikePrice);
    } else {
      return Math.max(0, strikePrice - underlyingPrice);
    }
  }

  /**
   * Validate strategy constraints and requirements
   */
  validateStrategy(strategy: OptionsStrategy, accountInfo: any): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check margin requirements
    if (strategy.margin > accountInfo.buyingPower) {
      errors.push(`Insufficient buying power. Required: $${strategy.margin}, Available: $${accountInfo.buyingPower}`);
    }

    // Check collateral requirements
    if (strategy.collateral > accountInfo.cash) {
      errors.push(`Insufficient collateral. Required: $${strategy.collateral}, Available: $${accountInfo.cash}`);
    }

    // Validate expiration dates
    for (const leg of strategy.legs) {
      const expDate = new Date(leg.contract.expirationDate);
      const today = new Date();
      
      if (expDate <= today) {
        errors.push(`Option ${leg.contract.optionSymbol} has expired`);
      }

      const daysToExpiration = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysToExpiration <= 7) {
        warnings.push(`Option ${leg.contract.optionSymbol} expires in ${daysToExpiration} days`);
      }
    }

    // Check for proper risk management
    if (strategy.maxLoss === Number.POSITIVE_INFINITY) {
      warnings.push('Strategy has unlimited risk. Consider risk management measures.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
} 