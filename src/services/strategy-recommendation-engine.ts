import { IntentRecognitionService, RecognizedIntent, StrategyOption } from './intent-recognition-service';
import { OptionsStrategyEngine } from '../trading/options-strategy-engine';
import { OptionsMarketDataService } from '../data/options-market-data';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { GreeksCalculatorService } from '../trading/greeks-calculator';
import { OptionsStrategy, OptionsMarketData, MarketData } from '../types';

/**
 * Advanced Strategy Recommendation Engine
 * 
 * Implements the sophisticated recommendation logic from OPTIONS-ARCHITECTURE.md
 * Analyzes market conditions, user profile, and intent to provide intelligent strategy suggestions
 */

export interface MarketConditions {
  impliedVolatilityRank: number; // 0-100, current IV compared to 1-year range
  historicalVolatility: number;
  volumeProfile: 'low' | 'average' | 'high';
  trend: 'upward' | 'downward' | 'sideways';
  momentum: 'strong' | 'moderate' | 'weak';
  technicalSignals: TechnicalSignal[];
  earningsDate?: Date;
  divexDate?: Date;
  marketRegime: 'bull' | 'bear' | 'neutral';
}

export interface TechnicalSignal {
  indicator: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-1
  description: string;
}

export interface UserProfile {
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  riskTolerance: 'low' | 'medium' | 'high';
  preferredComplexity: 'simple' | 'moderate' | 'complex';
  capitalAvailable: number;
  tradingObjective: 'income' | 'growth' | 'speculation' | 'hedging';
  timeHorizon: 'short_term' | 'medium_term' | 'long_term';
}

export interface StrategyRecommendation {
  strategy: StrategyOption;
  reasoning: string;
  marketFit: number; // 0-1 score
  riskReward: {
    expectedReturn: number;
    riskAdjustedReturn: number;
    probabilityOfProfit: number;
    maxDrawdown: number;
  };
  implementation: {
    legs: StrategyLeg[];
    totalCost: number;
    marginRequirement: number;
    breakeven: number[];
  };
  warnings: string[];
  alternatives: string[];
}

export interface StrategyLeg {
  action: 'buy' | 'sell';
  contractType: 'call' | 'put';
  strike: number;
  expiration: string;
  quantity: number;
  price: number;
  delta: number;
  reasoning: string;
}

export class StrategyRecommendationEngine {
  private intentRecognition: IntentRecognitionService;
  private strategyEngine: OptionsStrategyEngine;
  private marketDataService: OptionsMarketDataService;
  private broker: AlpacaAdapter;
  private greeksCalculator: GreeksCalculatorService;

  constructor() {
    this.intentRecognition = new IntentRecognitionService();
    this.strategyEngine = new OptionsStrategyEngine();
    this.marketDataService = new OptionsMarketDataService();
    this.broker = new AlpacaAdapter();
    this.greeksCalculator = new GreeksCalculatorService();
  }

  /**
   * Main recommendation method - analyzes intent and market conditions to provide intelligent suggestions
   */
  async recommendStrategy(
    command: string,
    userProfile: UserProfile,
    marketConditions?: MarketConditions
  ): Promise<StrategyRecommendation[]> {
    try {
      // Step 1: Parse intent
      const recognizedIntent = await this.intentRecognition.parseCommand(command);
      
      // Step 2: Analyze market conditions
      const conditions = marketConditions || await this.analyzeMarketConditions(recognizedIntent.underlying);
      
      // Step 3: Get base strategy suggestions
      const baseStrategies = recognizedIntent.suggestedStrategies;
      
      // Step 4: Enhance recommendations with market analysis
      const recommendations = await Promise.all(
        baseStrategies.map(strategy => 
          this.enhanceStrategyRecommendation(strategy, recognizedIntent, conditions, userProfile)
        )
      );

      // Step 5: Rank by suitability
      return this.rankRecommendations(recommendations, conditions, userProfile);

    } catch (error) {
      throw new Error(`Failed to generate recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze current market conditions for the underlying
   */
  private async analyzeMarketConditions(underlying: string): Promise<MarketConditions> {
    try {
      const [optionsData, marketData] = await Promise.all([
        this.broker.getOptionsMarketData(underlying),
        this.broker.getMarketData(underlying)
      ]);

      // Calculate IV rank (simplified - would use historical IV data in production)
      const impliedVolatilityRank = Math.min(100, Math.max(0, optionsData.impliedVolatility * 100));
      
      // Determine trend from price action
      const trend = this.analyzeTrend(marketData);
      
      // Volume analysis
      const volumeProfile = this.analyzeVolume(marketData.volume);
      
      // Generate technical signals (simplified)
      const technicalSignals = await this.generateTechnicalSignals(underlying, marketData);

      return {
        impliedVolatilityRank,
        historicalVolatility: optionsData.historicalVolatility,
        volumeProfile,
        trend,
        momentum: 'moderate', // Would calculate from price momentum
        technicalSignals,
        marketRegime: this.determineMarketRegime(marketData, optionsData)
      };

    } catch (error) {
      // Return conservative default conditions
      return {
        impliedVolatilityRank: 50,
        historicalVolatility: 0.3,
        volumeProfile: 'average',
        trend: 'sideways',
        momentum: 'moderate',
        technicalSignals: [],
        marketRegime: 'neutral'
      };
    }
  }

  /**
   * Enhance base strategy with detailed implementation and market analysis
   */
  private async enhanceStrategyRecommendation(
    strategy: StrategyOption,
    intent: RecognizedIntent,
    conditions: MarketConditions,
    userProfile: UserProfile
  ): Promise<StrategyRecommendation> {
    
    // Calculate market fit score
    const marketFit = this.calculateMarketFit(strategy, conditions);
    
    // Generate implementation details
    const implementation = await this.generateImplementation(strategy, intent.underlying, conditions, userProfile);
    
    // Calculate risk/reward metrics
    const riskReward = this.calculateRiskReward(strategy, implementation, conditions);
    
    // Generate reasoning
    const reasoning = this.generateReasoning(strategy, conditions, marketFit);
    
    // Identify warnings
    const warnings = this.identifyWarnings(strategy, conditions, userProfile);
    
    // Suggest alternatives
    const alternatives = this.suggestAlternatives(strategy, conditions);

    return {
      strategy,
      reasoning,
      marketFit,
      riskReward,
      implementation,
      warnings,
      alternatives
    };
  }

  /**
   * Calculate how well a strategy fits current market conditions
   */
  private calculateMarketFit(strategy: StrategyOption, conditions: MarketConditions): number {
    let score = 0.5; // Base score
    
    // Volatility fit
    if (strategy.volatilityImpact === 'positive' && conditions.impliedVolatilityRank > 70) {
      score += 0.2; // High IV benefits vol-positive strategies
    } else if (strategy.volatilityImpact === 'negative' && conditions.impliedVolatilityRank < 30) {
      score += 0.2; // Low IV benefits vol-negative strategies
    }
    
    // Trend fit
    if (strategy.type === 'long_call' && conditions.trend === 'upward') {
      score += 0.2;
    } else if (strategy.type === 'long_put' && conditions.trend === 'downward') {
      score += 0.2;
    } else if ((strategy.type === 'iron_condor' || strategy.type === 'butterfly') && conditions.trend === 'sideways') {
      score += 0.2;
    }
    
    // Time decay fit
    if (strategy.timeDecayImpact === 'positive' && conditions.trend === 'sideways') {
      score += 0.1; // Time decay strategies work well in range-bound markets
    }

    return Math.min(1.0, Math.max(0.0, score));
  }

  /**
   * Generate specific implementation for a strategy
   */
  private async generateImplementation(
    strategy: StrategyOption,
    underlying: string,
    conditions: MarketConditions,
    userProfile: UserProfile
  ): Promise<{
    legs: StrategyLeg[];
    totalCost: number;
    marginRequirement: number;
    breakeven: number[];
  }> {
    
    try {
      // Get current market data
      const marketData = await this.broker.getMarketData(underlying);
      const currentPrice = marketData.currentPrice;
      
      // Generate legs based on strategy type
      const legs = await this.generateStrategyLegs(strategy, currentPrice, conditions, userProfile);
      
      // Calculate total cost and margin requirement
      let totalCost = 0;
      let marginRequirement = 0;
      
      for (const leg of legs) {
        if (leg.action === 'buy') {
          totalCost += leg.price * leg.quantity * 100;
        } else {
          totalCost -= leg.price * leg.quantity * 100;
          // Estimate margin requirement for short positions
          marginRequirement += leg.strike * leg.quantity * 100 * 0.2; // Simplified margin calc
        }
      }
      
      // Calculate breakeven points
      const breakeven = this.calculateBreakeven(legs, strategy.type);
      
      return {
        legs,
        totalCost,
        marginRequirement,
        breakeven
      };

    } catch (error) {
      // Return simplified implementation
      return {
        legs: [],
        totalCost: 0,
        marginRequirement: 0,
        breakeven: []
      };
    }
  }

  /**
   * Generate strategy legs with optimal strike selection
   */
  private async generateStrategyLegs(
    strategy: StrategyOption,
    currentPrice: number,
    conditions: MarketConditions,
    userProfile: UserProfile
  ): Promise<StrategyLeg[]> {
    
    const legs: StrategyLeg[] = [];
    
    // Determine optimal expiration (simplified)
    const expiration = this.selectOptimalExpiration(userProfile.timeHorizon, conditions);
    
    // Generate legs based on strategy type
    switch (strategy.type) {
      case 'long_call':
        legs.push({
          action: 'buy',
          contractType: 'call',
          strike: this.selectCallStrike(currentPrice, conditions, userProfile),
          expiration,
          quantity: 1,
          price: this.estimateOptionPrice('call', currentPrice, conditions),
          delta: 0.5, // Simplified
          reasoning: 'ATM call for balanced risk/reward'
        });
        break;
        
      case 'long_put':
        legs.push({
          action: 'buy',
          contractType: 'put',
          strike: this.selectPutStrike(currentPrice, conditions, userProfile),
          expiration,
          quantity: 1,
          price: this.estimateOptionPrice('put', currentPrice, conditions),
          delta: -0.5, // Simplified
          reasoning: 'ATM put for balanced risk/reward'
        });
        break;
        
      case 'bull_spread':
        const lowerStrike = this.selectCallStrike(currentPrice, conditions, userProfile);
        const higherStrike = lowerStrike + (currentPrice * 0.05); // 5% spread
        
        legs.push(
          {
            action: 'buy',
            contractType: 'call',
            strike: lowerStrike,
            expiration,
            quantity: 1,
            price: this.estimateOptionPrice('call', lowerStrike, conditions),
            delta: 0.6,
            reasoning: 'Long lower strike for upside exposure'
          },
          {
            action: 'sell',
            contractType: 'call',
            strike: higherStrike,
            expiration,
            quantity: 1,
            price: this.estimateOptionPrice('call', higherStrike, conditions),
            delta: 0.3,
            reasoning: 'Short higher strike to reduce cost'
          }
        );
        break;
        
      // Add more strategy implementations...
      default:
        break;
    }
    
    return legs;
  }

  /**
   * Helper methods for strike selection
   */
  private selectCallStrike(currentPrice: number, conditions: MarketConditions, userProfile: UserProfile): number {
    // ATM for moderate risk, ITM for conservative, OTM for aggressive
    const multiplier = userProfile.riskTolerance === 'low' ? 0.95 : 
                      userProfile.riskTolerance === 'high' ? 1.05 : 1.0;
    return Math.round(currentPrice * multiplier);
  }

  private selectPutStrike(currentPrice: number, conditions: MarketConditions, userProfile: UserProfile): number {
    const multiplier = userProfile.riskTolerance === 'low' ? 1.05 : 
                      userProfile.riskTolerance === 'high' ? 0.95 : 1.0;
    return Math.round(currentPrice * multiplier);
  }

  private selectOptimalExpiration(timeHorizon: string, conditions: MarketConditions): string {
    const baseDate = new Date();
    let daysToAdd = 30; // Default 1 month
    
    switch (timeHorizon) {
      case 'short_term':
        daysToAdd = 14; // 2 weeks
        break;
      case 'medium_term':
        daysToAdd = 45; // 6-7 weeks
        break;
      case 'long_term':
        daysToAdd = 90; // 3 months
        break;
    }
    
    // Adjust for earnings if known
    if (conditions.earningsDate) {
      const earningsDays = Math.floor((conditions.earningsDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (earningsDays > 0 && earningsDays < daysToAdd) {
        daysToAdd = Math.max(7, earningsDays + 1); // After earnings
      }
    }
    
    const expirationDate = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
    return expirationDate.toISOString().split('T')[0] || '';
  }

  private estimateOptionPrice(type: 'call' | 'put', strike: number, conditions: MarketConditions): number {
    // Simplified option pricing - would use Black-Scholes in production
    const volatility = conditions.impliedVolatilityRank / 100;
    const timeValue = 0.5; // Simplified time value
    const intrinsicValue = type === 'call' ? Math.max(0, strike - strike) : Math.max(0, strike - strike);
    
    return Math.max(0.05, intrinsicValue + timeValue + volatility);
  }

  private calculateBreakeven(legs: StrategyLeg[], strategyType: string): number[] {
    // Simplified breakeven calculation
    const netCost = legs.reduce((sum, leg) => {
      return sum + (leg.action === 'buy' ? leg.price : -leg.price);
    }, 0);
    
    // Return simplified breakeven - would be more complex for multi-leg strategies
    const strike = legs[0]?.strike || 0;
    return [strike + (legs[0]?.contractType === 'call' ? netCost : -netCost)];
  }

  /**
   * Calculate risk/reward metrics
   */
  private calculateRiskReward(
    strategy: StrategyOption, 
    implementation: any, 
    conditions: MarketConditions
  ): {
    expectedReturn: number;
    riskAdjustedReturn: number;
    probabilityOfProfit: number;
    maxDrawdown: number;
  } {
    // Simplified risk/reward calculation
    const expectedReturn = Math.abs(implementation.totalCost) * 0.2; // 20% expected return
    const volatilityAdjustment = conditions.impliedVolatilityRank / 100;
    
    return {
      expectedReturn,
      riskAdjustedReturn: expectedReturn / (1 + volatilityAdjustment),
      probabilityOfProfit: Math.min(0.8, 0.4 + (0.4 * (1 - volatilityAdjustment))),
      maxDrawdown: Math.abs(implementation.totalCost)
    };
  }

  /**
   * Generate human-readable reasoning for the recommendation
   */
  private generateReasoning(strategy: StrategyOption, conditions: MarketConditions, marketFit: number): string {
    const reasons = [];
    
    reasons.push(`This ${strategy.name} strategy is ${this.getMarketFitDescription(marketFit)} for current market conditions.`);
    
    if (conditions.impliedVolatilityRank > 70 && strategy.volatilityImpact === 'positive') {
      reasons.push('High implied volatility (IV > 70%) favors strategies that benefit from volatility.');
    } else if (conditions.impliedVolatilityRank < 30 && strategy.volatilityImpact === 'negative') {
      reasons.push('Low implied volatility (IV < 30%) favors strategies that benefit from volatility contraction.');
    }
    
    if (conditions.trend === 'upward' && strategy.type.includes('call')) {
      reasons.push('Upward trend supports bullish options strategies.');
    } else if (conditions.trend === 'downward' && strategy.type.includes('put')) {
      reasons.push('Downward trend supports bearish options strategies.');
    }
    
    reasons.push(`Risk level: ${strategy.riskLevel}, Complexity: ${strategy.complexityLevel}.`);
    
    return reasons.join(' ');
  }

  private getMarketFitDescription(score: number): string {
    if (score >= 0.8) return 'excellent';
    if (score >= 0.6) return 'good';
    if (score >= 0.4) return 'fair';
    return 'poor';
  }

  /**
   * Identify potential warnings for the strategy
   */
  private identifyWarnings(strategy: StrategyOption, conditions: MarketConditions, userProfile: UserProfile): string[] {
    const warnings = [];
    
    if (strategy.complexityLevel === 'advanced' && userProfile.experienceLevel === 'beginner') {
      warnings.push('This is an advanced strategy - consider starting with simpler options.');
    }
    
    if (strategy.riskLevel === 'high' && userProfile.riskTolerance === 'low') {
      warnings.push('This strategy has high risk - may not match your risk tolerance.');
    }
    
    if (conditions.earningsDate) {
      const daysToEarnings = Math.floor((conditions.earningsDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysToEarnings <= 7) {
        warnings.push('Earnings announcement within a week - expect high volatility.');
      }
    }
    
    if (conditions.impliedVolatilityRank < 20 && strategy.volatilityImpact === 'positive') {
      warnings.push('Very low IV may limit profit potential for this strategy.');
    }
    
    return warnings;
  }

  /**
   * Suggest alternative strategies
   */
  private suggestAlternatives(strategy: StrategyOption, conditions: MarketConditions): string[] {
    const alternatives = [];
    
    if (strategy.type === 'long_call' && conditions.impliedVolatilityRank > 70) {
      alternatives.push('Bull call spread to reduce cost in high IV environment');
    }
    
    if (strategy.type === 'long_put' && conditions.impliedVolatilityRank > 70) {
      alternatives.push('Bear put spread to reduce cost in high IV environment');
    }
    
    if (strategy.capitalRequirement === 'high' && conditions.trend === 'sideways') {
      alternatives.push('Iron condor for defined risk income strategy');
    }
    
    return alternatives;
  }

  /**
   * Rank recommendations by overall suitability
   */
  private rankRecommendations(
    recommendations: StrategyRecommendation[], 
    conditions: MarketConditions, 
    userProfile: UserProfile
  ): StrategyRecommendation[] {
    
    return recommendations.sort((a, b) => {
      let scoreA = a.marketFit;
      let scoreB = b.marketFit;
      
      // Adjust for risk tolerance match
      if (a.strategy.riskLevel === userProfile.riskTolerance) scoreA += 0.2;
      if (b.strategy.riskLevel === userProfile.riskTolerance) scoreB += 0.2;
      
      // Adjust for experience level match
      if (a.strategy.complexityLevel === this.mapExperienceToComplexity(userProfile.experienceLevel)) scoreA += 0.1;
      if (b.strategy.complexityLevel === this.mapExperienceToComplexity(userProfile.experienceLevel)) scoreB += 0.1;
      
      // Adjust for capital requirements
      if (a.implementation.totalCost <= userProfile.capitalAvailable) scoreA += 0.1;
      if (b.implementation.totalCost <= userProfile.capitalAvailable) scoreB += 0.1;
      
      return scoreB - scoreA;
    });
  }

  private mapExperienceToComplexity(experience: string): string {
    switch (experience) {
      case 'beginner': return 'beginner';
      case 'intermediate': return 'intermediate';
      case 'advanced': return 'advanced';
      default: return 'beginner';
    }
  }

  /**
   * Helper methods for market analysis
   */
  private analyzeTrend(marketData: MarketData): 'upward' | 'downward' | 'sideways' {
    const changePercent = marketData.changePercent;
    if (changePercent > 2) return 'upward';
    if (changePercent < -2) return 'downward';
    return 'sideways';
  }

  private analyzeVolume(volume: number): 'low' | 'average' | 'high' {
    // Simplified volume analysis - would use historical averages in production
    if (volume > 1000000) return 'high';
    if (volume < 100000) return 'low';
    return 'average';
  }

  private async generateTechnicalSignals(underlying: string, marketData: MarketData): Promise<TechnicalSignal[]> {
    // Simplified technical analysis - would use proper technical indicators in production
    const signals: TechnicalSignal[] = [];
    
    if (marketData.changePercent > 3) {
      signals.push({
        indicator: 'Price Momentum',
        signal: 'bullish',
        strength: 0.7,
        description: 'Strong positive price movement'
      });
    } else if (marketData.changePercent < -3) {
      signals.push({
        indicator: 'Price Momentum',
        signal: 'bearish',
        strength: 0.7,
        description: 'Strong negative price movement'
      });
    }
    
    return signals;
  }

  private determineMarketRegime(marketData: MarketData, optionsData: OptionsMarketData): 'bull' | 'bear' | 'neutral' {
    // Simplified market regime determination
    if (marketData.changePercent > 5) return 'bull';
    if (marketData.changePercent < -5) return 'bear';
    return 'neutral';
  }
}