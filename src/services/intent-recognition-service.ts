import { UnifiedTradeProcessor } from '../llm/unified-trade-processor';
import { OptionsTradeIntent, TradeIntent, UnifiedTradeIntent } from '../types';

/**
 * Advanced Intent Recognition Service for Options Trading
 * 
 * Transforms natural language commands into sophisticated options strategy recommendations
 * following the guided strategy design workflow from OPTIONS-ARCHITECTURE.md
 */

export interface RecognizedIntent {
  action: 'long' | 'short' | 'hedge' | 'income';
  underlying: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe?: 'short_term' | 'medium_term' | 'long_term' | undefined;
  riskTolerance?: 'low' | 'medium' | 'high' | undefined;
  suggestedStrategies: StrategyOption[];
  originalIntent: UnifiedTradeIntent;
}

export interface StrategyOption {
  name: string;
  type: 'long_call' | 'long_put' | 'bull_spread' | 'bear_spread' | 'cash_secured_put' | 'covered_call' | 'protective_put' | 'collar' | 'iron_condor' | 'butterfly' | 'straddle' | 'strangle';
  riskLevel: 'low' | 'medium' | 'high';
  complexityLevel: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  expectedOutcome: string;
  marketView: string;
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
  idealMarketConditions: string[];
  pros: string[];
  cons: string[];
  capitalRequirement: 'low' | 'medium' | 'high';
  timeDecayImpact: 'positive' | 'negative' | 'neutral';
  volatilityImpact: 'positive' | 'negative' | 'neutral';
}

export class IntentRecognitionService {
  private tradeProcessor: UnifiedTradeProcessor;
  private strategyDatabase: Map<string, StrategyOption[]>;

  constructor() {
    this.tradeProcessor = new UnifiedTradeProcessor();
    this.strategyDatabase = new Map();
    this.initializeStrategyDatabase();
  }

  /**
   * Parse natural language command and recognize trading intent
   * Example: "I want to long NVDA" → { action: 'long', underlying: 'NVDA', sentiment: 'bullish' }
   */
  async parseCommand(command: string): Promise<RecognizedIntent> {
    try {
      // Use existing UnifiedTradeProcessor for initial parsing
      const parseResult = await this.tradeProcessor.processTradeCommand(command);
      const intent = parseResult.intent;

      // Determine high-level action and sentiment
      const { action, sentiment, timeframe, riskTolerance } = this.analyzeIntent(command, intent);
      
      // Get underlying symbol
      const underlying = this.extractUnderlying(intent);
      
      // Generate strategy suggestions based on intent
      const suggestedStrategies = await this.suggestStrategies({
        action,
        underlying,
        sentiment,
        timeframe,
        riskTolerance,
        originalIntent: intent
      });

      return {
        action,
        underlying,
        sentiment,
        confidence: parseResult.confidence,
        timeframe,
        riskTolerance,
        suggestedStrategies,
        originalIntent: intent
      };

    } catch (error) {
      throw new Error(`Failed to parse command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Suggest appropriate options strategies based on recognized intent
   */
  async suggestStrategies(params: {
    action: 'long' | 'short' | 'hedge' | 'income';
    underlying: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    timeframe?: string | undefined;
    riskTolerance?: string | undefined;
    originalIntent: UnifiedTradeIntent;
  }): Promise<StrategyOption[]> {
    
    const { action, sentiment, timeframe = 'medium_term', riskTolerance = 'medium' } = params;
    
    // Get base strategies for the action/sentiment combination
    const baseStrategies = this.getStrategiesForSentiment(action, sentiment);
    
    // Filter and rank strategies based on user profile
    const rankedStrategies = this.rankStrategiesByProfile(baseStrategies, {
      timeframe: timeframe as any,
      riskTolerance: riskTolerance as any
    });

    // Return top 4 strategies for guided selection
    return rankedStrategies.slice(0, 4);
  }

  /**
   * Analyze the natural language command to extract high-level intent
   */
  private analyzeIntent(command: string, parsedIntent: UnifiedTradeIntent): {
    action: 'long' | 'short' | 'hedge' | 'income';
    sentiment: 'bullish' | 'bearish' | 'neutral';
    timeframe?: 'short_term' | 'medium_term' | 'long_term' | undefined;
    riskTolerance?: 'low' | 'medium' | 'high' | undefined;
  } {
    const lowerCommand = command.toLowerCase();
    
    // Determine action
    let action: 'long' | 'short' | 'hedge' | 'income' = 'long';
    if (lowerCommand.includes('short') || lowerCommand.includes('bearish') || lowerCommand.includes('put')) {
      action = 'short';
    } else if (lowerCommand.includes('hedge') || lowerCommand.includes('protect')) {
      action = 'hedge';
    } else if (lowerCommand.includes('income') || lowerCommand.includes('covered') || lowerCommand.includes('cash secured')) {
      action = 'income';
    }
    
    // Determine sentiment
    let sentiment: 'bullish' | 'bearish' | 'neutral' = 'bullish';
    if (lowerCommand.includes('bearish') || lowerCommand.includes('fall') || lowerCommand.includes('drop') || action === 'short') {
      sentiment = 'bearish';
    } else if (lowerCommand.includes('neutral') || lowerCommand.includes('sideways') || action === 'income') {
      sentiment = 'neutral';
    }
    
    // Determine timeframe
    let timeframe: 'short_term' | 'medium_term' | 'long_term' | undefined;
    if (lowerCommand.includes('week') || lowerCommand.includes('0dte') || lowerCommand.includes('daily')) {
      timeframe = 'short_term';
    } else if (lowerCommand.includes('month') || lowerCommand.includes('quarter')) {
      timeframe = 'medium_term';
    } else if (lowerCommand.includes('year') || lowerCommand.includes('leap')) {
      timeframe = 'long_term';
    }
    
    // Determine risk tolerance
    let riskTolerance: 'low' | 'medium' | 'high' | undefined;
    if (lowerCommand.includes('conservative') || lowerCommand.includes('safe') || lowerCommand.includes('limited risk')) {
      riskTolerance = 'low';
    } else if (lowerCommand.includes('aggressive') || lowerCommand.includes('high risk') || lowerCommand.includes('unlimited')) {
      riskTolerance = 'high';
    }

    return { action, sentiment, timeframe, riskTolerance };
  }

  /**
   * Extract underlying symbol from parsed intent
   */
  private extractUnderlying(intent: UnifiedTradeIntent): string {
    if ('underlying' in intent) {
      return intent.underlying;
    } else if ('symbol' in intent) {
      return intent.symbol;
    }
    return '';
  }

  /**
   * Get strategies for specific action/sentiment combination
   */
  private getStrategiesForSentiment(action: string, sentiment: string): StrategyOption[] {
    const key = `${action}_${sentiment}`;
    return this.strategyDatabase.get(key) || [];
  }

  /**
   * Rank strategies based on user profile
   */
  private rankStrategiesByProfile(strategies: StrategyOption[], profile: {
    timeframe: 'short_term' | 'medium_term' | 'long_term';
    riskTolerance: 'low' | 'medium' | 'high';
  }): StrategyOption[] {
    return strategies.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      // Risk tolerance matching
      if (a.riskLevel === profile.riskTolerance) scoreA += 3;
      if (b.riskLevel === profile.riskTolerance) scoreB += 3;

      // Time decay considerations for short-term strategies
      if (profile.timeframe === 'short_term') {
        if (a.timeDecayImpact === 'positive') scoreA += 2;
        if (b.timeDecayImpact === 'positive') scoreB += 2;
      }

      // Prefer simpler strategies for beginners
      if (profile.riskTolerance === 'low') {
        if (a.complexityLevel === 'beginner') scoreA += 2;
        if (b.complexityLevel === 'beginner') scoreB += 2;
      }

      return scoreB - scoreA;
    });
  }

  /**
   * Initialize comprehensive strategy database
   */
  private initializeStrategyDatabase(): void {
    // Bullish strategies for "long" action
    this.strategyDatabase.set('long_bullish', [
      {
        name: 'Long Call',
        type: 'long_call',
        riskLevel: 'medium',
        complexityLevel: 'beginner',
        description: 'Buy call options to profit from upward price movement',
        expectedOutcome: 'Profit from stock price increases above strike + premium',
        marketView: 'Moderately to strongly bullish',
        maxProfit: 'Unlimited',
        maxLoss: 'Premium paid',
        breakeven: 'Strike price + premium paid',
        idealMarketConditions: ['Rising stock price', 'Low to moderate volatility', 'Time until expiration'],
        pros: ['Unlimited profit potential', 'Limited downside risk', 'Leverage'],
        cons: ['Time decay', 'Can lose entire premium', 'Requires significant price movement'],
        capitalRequirement: 'low',
        timeDecayImpact: 'negative',
        volatilityImpact: 'positive'
      },
      {
        name: 'Bull Call Spread',
        type: 'bull_spread',
        riskLevel: 'low',
        complexityLevel: 'intermediate',
        description: 'Buy lower strike call, sell higher strike call',
        expectedOutcome: 'Profit from moderate upward movement with limited risk',
        marketView: 'Moderately bullish',
        maxProfit: 'Difference in strikes minus net premium',
        maxLoss: 'Net premium paid',
        breakeven: 'Lower strike + net premium',
        idealMarketConditions: ['Moderate upward movement', 'Lower volatility', 'Time stability'],
        pros: ['Lower cost than long call', 'Defined risk', 'Less time decay impact'],
        cons: ['Limited profit potential', 'Requires precision in timing', 'Complex to manage'],
        capitalRequirement: 'low',
        timeDecayImpact: 'neutral',
        volatilityImpact: 'negative'
      }
    ]);

    // Bearish strategies for "short" action
    this.strategyDatabase.set('short_bearish', [
      {
        name: 'Long Put',
        type: 'long_put',
        riskLevel: 'medium',
        complexityLevel: 'beginner',
        description: 'Buy put options to profit from downward price movement',
        expectedOutcome: 'Profit from stock price decreases below strike minus premium',
        marketView: 'Moderately to strongly bearish',
        maxProfit: 'Strike price minus premium (if stock goes to zero)',
        maxLoss: 'Premium paid',
        breakeven: 'Strike price minus premium paid',
        idealMarketConditions: ['Falling stock price', 'Low to moderate volatility', 'Time until expiration'],
        pros: ['High profit potential', 'Limited downside risk', 'Leverage on downside'],
        cons: ['Time decay', 'Can lose entire premium', 'Requires significant price movement'],
        capitalRequirement: 'low',
        timeDecayImpact: 'negative',
        volatilityImpact: 'positive'
      },
      {
        name: 'Bear Put Spread',
        type: 'bear_spread',
        riskLevel: 'low',
        complexityLevel: 'intermediate',
        description: 'Buy higher strike put, sell lower strike put',
        expectedOutcome: 'Profit from moderate downward movement with limited risk',
        marketView: 'Moderately bearish',
        maxProfit: 'Difference in strikes minus net premium',
        maxLoss: 'Net premium paid',
        breakeven: 'Higher strike minus net premium',
        idealMarketConditions: ['Moderate downward movement', 'Lower volatility', 'Time stability'],
        pros: ['Lower cost than long put', 'Defined risk', 'Less time decay impact'],
        cons: ['Limited profit potential', 'Requires precision in timing', 'Complex to manage'],
        capitalRequirement: 'low',
        timeDecayImpact: 'neutral',
        volatilityImpact: 'negative'
      }
    ]);

    // Income strategies
    this.strategyDatabase.set('income_neutral', [
      {
        name: 'Cash-Secured Put',
        type: 'cash_secured_put',
        riskLevel: 'low',
        complexityLevel: 'beginner',
        description: 'Sell put options while holding cash to secure the position',
        expectedOutcome: 'Collect premium income, potentially acquire stock at discount',
        marketView: 'Neutral to mildly bullish',
        maxProfit: 'Premium received',
        maxLoss: 'Strike price minus premium (if assigned)',
        breakeven: 'Strike price minus premium received',
        idealMarketConditions: ['Stable to rising prices', 'High implied volatility', 'Short time to expiration'],
        pros: ['Generate income', 'Lower entry cost if assigned', 'Time decay works in favor'],
        cons: ['Requires significant capital', 'Unlimited downside if assigned', 'Opportunity cost'],
        capitalRequirement: 'high',
        timeDecayImpact: 'positive',
        volatilityImpact: 'positive'
      },
      {
        name: 'Covered Call',
        type: 'covered_call',
        riskLevel: 'low',
        complexityLevel: 'beginner',
        description: 'Sell call options while owning the underlying stock',
        expectedOutcome: 'Generate income from stock holdings',
        marketView: 'Neutral to mildly bullish',
        maxProfit: 'Premium received + potential stock appreciation to strike',
        maxLoss: 'Stock value minus premium received',
        breakeven: 'Stock purchase price minus premium received',
        idealMarketConditions: ['Stable to moderate upward movement', 'High implied volatility', 'Owned stock position'],
        pros: ['Generate income', 'Reduce cost basis', 'Time decay works in favor'],
        cons: ['Caps upside potential', 'Still exposed to downside', 'May be called away'],
        capitalRequirement: 'high',
        timeDecayImpact: 'positive',
        volatilityImpact: 'positive'
      }
    ]);

    // Hedging strategies
    this.strategyDatabase.set('hedge_bearish', [
      {
        name: 'Protective Put',
        type: 'protective_put',
        riskLevel: 'low',
        complexityLevel: 'beginner',
        description: 'Buy put options to protect existing stock position',
        expectedOutcome: 'Insurance against downward movement while maintaining upside',
        marketView: 'Own stock but concerned about downside',
        maxProfit: 'Unlimited (stock appreciation minus put premium)',
        maxLoss: 'Stock price to put strike minus premium',
        breakeven: 'Current stock price + put premium',
        idealMarketConditions: ['Market uncertainty', 'Earnings approaching', 'Want downside protection'],
        pros: ['Downside protection', 'Maintain upside potential', 'Peace of mind'],
        cons: ['Costs premium', 'Reduces overall returns', 'Time decay'],
        capitalRequirement: 'medium',
        timeDecayImpact: 'negative',
        volatilityImpact: 'positive'
      }
    ]);

    // Add more strategy combinations...
    this.addVolatilityStrategies();
    this.addAdvancedStrategies();
  }

  /**
   * Add volatility-based strategies
   */
  private addVolatilityStrategies(): void {
    // Neutral strategies for high volatility
    this.strategyDatabase.set('long_neutral', [
      {
        name: 'Long Straddle',
        type: 'straddle',
        riskLevel: 'medium',
        complexityLevel: 'intermediate',
        description: 'Buy call and put at same strike, expecting big move in either direction',
        expectedOutcome: 'Profit from large price movements regardless of direction',
        marketView: 'Expect high volatility, unsure of direction',
        maxProfit: 'Unlimited',
        maxLoss: 'Total premium paid for both options',
        breakeven: 'Strike ± total premium paid',
        idealMarketConditions: ['High volatility expected', 'Earnings announcements', 'Major news pending'],
        pros: ['Profit from big moves either way', 'Unlimited profit potential', 'Good for uncertain events'],
        cons: ['High cost', 'Time decay', 'Requires significant movement'],
        capitalRequirement: 'medium',
        timeDecayImpact: 'negative',
        volatilityImpact: 'positive'
      },
      {
        name: 'Long Strangle',
        type: 'strangle',
        riskLevel: 'medium',
        complexityLevel: 'intermediate',
        description: 'Buy call and put at different strikes, expecting big move',
        expectedOutcome: 'Profit from large movements at lower cost than straddle',
        marketView: 'Expect high volatility, unsure of direction',
        maxProfit: 'Unlimited',
        maxLoss: 'Total premium paid for both options',
        breakeven: 'Call strike + premium, Put strike - premium',
        idealMarketConditions: ['High volatility expected', 'Lower cost than straddle', 'Wide price range expected'],
        pros: ['Lower cost than straddle', 'Profit from big moves either way', 'Flexible strikes'],
        cons: ['Requires larger movement', 'Time decay', 'Double the positions to manage'],
        capitalRequirement: 'medium',
        timeDecayImpact: 'negative',
        volatilityImpact: 'positive'
      }
    ]);
  }

  /**
   * Add advanced multi-leg strategies
   */
  private addAdvancedStrategies(): void {
    this.strategyDatabase.set('income_advanced', [
      {
        name: 'Iron Condor',
        type: 'iron_condor',
        riskLevel: 'medium',
        complexityLevel: 'advanced',
        description: 'Sell put spread and call spread to profit from low volatility',
        expectedOutcome: 'Generate income when stock stays within a range',
        marketView: 'Neutral - expect low volatility and range-bound movement',
        maxProfit: 'Net premium received',
        maxLoss: 'Strike width minus net premium',
        breakeven: 'Short strikes ± net premium received',
        idealMarketConditions: ['Low volatility', 'Range-bound stock', 'Time decay beneficial'],
        pros: ['Generate income in sideways market', 'Defined risk/reward', 'High probability trade'],
        cons: ['Limited profit potential', 'Complex management', 'Four legs to track'],
        capitalRequirement: 'medium',
        timeDecayImpact: 'positive',
        volatilityImpact: 'negative'
      }
    ]);
  }

  /**
   * Get strategy recommendation summary for display
   */
  getStrategyRecommendationSummary(intent: RecognizedIntent): string {
    const strategies = intent.suggestedStrategies.map(s => s.name).join(', ');
    return `Based on your ${intent.sentiment} outlook on ${intent.underlying}, I recommend considering: ${strategies}. Each strategy has different risk/reward profiles and complexity levels.`;
  }
}