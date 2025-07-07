import OpenAI from 'openai';
import { config } from '../config';
import { 
  AdvancedTradeIntent, 
  HedgeIntent, 
  MarketAnalysisIntent, 
  TradeRecommendationIntent,
  ThirteenFIntent,
  HedgeRecommendation,
  MarketAnalysis,
  LLMError,
  AccountInfo,
  Position
} from '../types';
import { OpenAIService } from './openai-service';

export class AdvancedTradingService {
  private openai: OpenAI;
  private basicService: OpenAIService;
  private intentCache = new Map<string, { intent: AdvancedTradeIntent; timestamp: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes (increased for better performance)

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.basicService = new OpenAIService();
  }

  /**
   * Extract JSON from LLM response text
   * Handles cases where the LLM returns extra text before/after the JSON
   */
  private extractJSON(text: string): any {
    try {
      // First try direct parsing
      return JSON.parse(text);
    } catch (error) {
      // Try to find JSON object in the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch (e) {
          // If that fails, try to find and parse the last valid JSON object
          const matches = text.match(/\{[^{}]*\}/g);
          if (matches && matches.length > 0) {
            for (let i = matches.length - 1; i >= 0; i--) {
              try {
                const match = matches[i];
                if (match) {
                  return JSON.parse(match);
                }
              } catch (e) {
                continue;
              }
            }
          }
        }
      }
      
      // Try to find JSON array
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try {
          return JSON.parse(arrayMatch[0]);
        } catch (e) {
          // Continue to throw error below
        }
      }
      
      throw new Error(`Failed to extract JSON from response: ${text.substring(0, 200)}...`);
    }
  }

  /**
   * Parse complex natural language trading requests with direct LLM processing
   */
  async parseAdvancedIntent(userInput: string, accountInfo?: AccountInfo): Promise<AdvancedTradeIntent> {
    // Check cache first
    const cacheKey = `${userInput}-${accountInfo?.accountId || 'no-account'}`;
    const cached = this.intentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.intent;
    }

    try {
      // Use direct LLM classification for best accuracy
      const intentType = await this.classifyIntent(userInput);
      
      let result: AdvancedTradeIntent;

      // Parse based on classified type
      if (intentType === 'trade') {
        const tradeIntent = await this.basicService.parseTradeIntent(userInput);
        result = { ...tradeIntent, type: 'trade' as const };
      } else if (intentType === 'hedge') {
        result = await this.parseHedgeIntent(userInput, accountInfo);
      } else if (intentType === 'analysis') {
        result = await this.parseAnalysisIntent(userInput);
      } else if (intentType === 'recommendation') {
        result = await this.parseRecommendationIntent(userInput);
      } else if (intentType === '13f') {
        result = await this.parse13FIntent(userInput);
      } else {
        // Fallback to trade
        const tradeIntent = await this.basicService.parseTradeIntent(userInput);
        result = { ...tradeIntent, type: 'trade' as const };
      }

      // Cache the result
      this.intentCache.set(cacheKey, { intent: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Advanced intent parsing failed:', error);
      
      // Fallback to basic trade parsing
      try {
        const tradeIntent = await this.basicService.parseTradeIntent(userInput);
        const result = { ...tradeIntent, type: 'trade' as const };
        this.intentCache.set(cacheKey, { intent: result, timestamp: Date.now() });
        return result;
      } catch (fallbackError) {
        throw new LLMError(`Failed to parse intent: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Classify user intent using LLM
   */
  private async classifyIntent(userInput: string): Promise<string> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Classify this trading request into one of these categories:
- "trade": Simple buy/sell orders
- "hedge": Hedging or risk management requests
- "analysis": Market analysis or technical/fundamental analysis
- "recommendation": Investment recommendations or "what should I buy/sell" questions
- "13f": Questions about institutional holdings or 13F filings

Respond with just the category name (e.g., "trade", "hedge", etc.)`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 50,
      temperature: 0
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      return content.trim().toLowerCase();
    }
    
    return 'trade'; // Default fallback
  }

  /**
   * Parse hedging intent from natural language
   */
  private async parseHedgeIntent(userInput: string, accountInfo?: AccountInfo): Promise<HedgeIntent> {
    const positionsContext = accountInfo?.positions && accountInfo.positions.length > 0
      ? `\nUser's current positions: ${accountInfo.positions.map(p => 
          `${p.symbol}: ${p.quantity} shares`).join(', ')}`
      : '';

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Parse this hedging request and extract the key information.

Respond with a JSON object containing:
{
  "primary_symbol": "TICKER_SYMBOL",
  "hedge_reason": "reason for hedging (e.g., earnings risk, market volatility, tariffs)",
  "timeframe": "timeframe for the hedge (e.g., '1 week', 'until earnings', 'Q1')",
  "risk_tolerance": "conservative" | "moderate" | "aggressive"
}

If timeframe or risk_tolerance aren't specified, use reasonable defaults.`
      },
      {
        role: 'user',
        content: `${userInput}${positionsContext}`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = this.extractJSON(content);
    
    return {
      type: 'hedge',
      primarySymbol: parsed.primary_symbol,
      hedgeReason: parsed.hedge_reason,
      timeframe: parsed.timeframe,
      riskTolerance: parsed.risk_tolerance
    };
  }

  /**
   * Parse market analysis intent from natural language
   */
  private async parseAnalysisIntent(userInput: string): Promise<MarketAnalysisIntent> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Parse this market analysis request and extract the key information.

Respond with a JSON object containing:
{
  "symbols": ["SYMBOL1", "SYMBOL2"],
  "analysis_type": "technical" | "fundamental" | "sentiment" | "comprehensive",
  "timeframe": "timeframe for analysis (e.g., '1 week', '1 month', '3 months')",
  "focus_areas": ["area1", "area2"] // e.g., ["earnings", "competition", "sector trends"]
}

Extract all relevant stock symbols mentioned. If no specific timeframe is given, use "1 month".`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = this.extractJSON(content);

    return {
      type: 'analysis',
      symbols: parsed.symbols,
      analysisType: parsed.analysis_type || 'comprehensive',
      timeframe: parsed.timeframe || '1 month',
      focusAreas: parsed.focus_areas || []
    };
  }

  /**
   * Parse 13F intent from natural language
   */
  private async parse13FIntent(userInput: string): Promise<ThirteenFIntent> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Parse this 13F/institutional holdings request and extract the key information.

Respond with a JSON object containing:
{
  "institution": "name of the institution (e.g., 'Berkshire Hathaway', 'Warren Buffett')",
  "action": "query" or "invest", // "query" for just asking about holdings, "invest" for wanting to copy the portfolio
  "investment_amount": number // only if action is "invest" and amount is specified
}

If the user is asking about holdings/13F without mentioning investment, use action "query".
If they want to invest or copy the portfolio, use action "invest".`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = this.extractJSON(content);

    return {
      type: '13f',
      institution: parsed.institution,
      action: parsed.action,
      investmentAmount: parsed.investment_amount
    };
  }

  /**
   * Parse trade recommendation intent from natural language
   */
  private async parseRecommendationIntent(userInput: string): Promise<TradeRecommendationIntent> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Parse this trade recommendation request and extract the key information.

Respond with a JSON object containing:
{
  "scenario": "description of the scenario or question",
  "symbols": ["SYMBOL1", "SYMBOL2"], // if specific symbols mentioned
  "investment_amount": number, // if mentioned, otherwise null
  "risk_tolerance": "conservative" | "moderate" | "aggressive",
  "timeframe": "investment timeframe (e.g., 'short-term', 'long-term', '1 year')",
  "strategy_type": "growth" | "value" | "income" | "momentum" | "general"
}

If specific details aren't mentioned, use reasonable defaults or null.`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = this.extractJSON(content);

    return {
      type: 'recommendation',
      scenario: parsed.scenario,
      symbols: parsed.symbols || [],
      investmentAmount: parsed.investment_amount,
      riskTolerance: parsed.risk_tolerance || 'moderate',
      timeframe: parsed.timeframe || 'medium-term',
      strategyType: parsed.strategy_type || 'general'
    };
  }

  /**
   * Generate hedge recommendations using Claude
   */
  async generateHedgeRecommendation(
    hedgeIntent: HedgeIntent, 
    marketData: any
  ): Promise<HedgeRecommendation> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert financial advisor specializing in risk management and hedging strategies.

Generate a comprehensive hedging recommendation for:
- Primary Position: ${hedgeIntent.primarySymbol}
- Hedge Reason: ${hedgeIntent.hedgeReason}
- Timeframe: ${hedgeIntent.timeframe}
- Risk Tolerance: ${hedgeIntent.riskTolerance}

Current market context: ${JSON.stringify(marketData, null, 2)}

Provide a detailed hedge recommendation including:
1. Recommended hedging strategy
2. Specific instruments to use (options, ETFs, etc.)
3. Position sizing
4. Expected costs
5. Risk reduction percentage
6. Exit conditions

Respond with a JSON object:
{
  "strategy": "detailed strategy description",
  "instruments": [
    {
      "type": "option" | "etf" | "future" | "stock",
      "symbol": "SYMBOL",
      "action": "buy" | "sell",
      "quantity": number,
      "reasoning": "why this instrument"
    }
  ],
  "cost_estimate": number,
  "risk_reduction": number,
  "exit_conditions": ["condition1", "condition2"],
  "timeline": "expected timeline for the hedge"
}`
      },
      {
        role: 'user',
        content: `Please provide a hedge recommendation for ${hedgeIntent.primarySymbol} based on the parameters above.`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1000,
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = this.extractJSON(content);

    return {
      strategy: parsed.strategy,
      instruments: parsed.instruments,
      costEstimate: parsed.cost_estimate,
      riskReduction: parsed.risk_reduction,
      exitConditions: parsed.exit_conditions,
      timeline: parsed.timeline
    };
  }

  /**
   * Perform market analysis using OpenAI
   */
  async performMarketAnalysis(
    analysisIntent: MarketAnalysisIntent,
    marketData: any
  ): Promise<MarketAnalysis[]> {
    const analysisPromises = analysisIntent.symbols.map(async (symbol) => {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are an expert financial analyst. Perform a ${analysisIntent.analysisType} analysis for ${symbol}.

Analysis parameters:
- Symbol: ${symbol}
- Analysis Type: ${analysisIntent.analysisType}
- Timeframe: ${analysisIntent.timeframe}
- Focus Areas: ${analysisIntent.focusAreas.join(', ')}

Market data: ${JSON.stringify(marketData[symbol] || {}, null, 2)}

Provide a comprehensive analysis including:
1. Current market sentiment
2. Key risk factors
3. Growth opportunities
4. Price targets and recommendations

Respond with a JSON object:
{
  "symbol": "${symbol}",
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": number, // 0-100
  "risk_factors": ["risk1", "risk2"],
  "opportunities": ["opportunity1", "opportunity2"],
  "price_target": number,
  "recommendation": "buy" | "sell" | "hold",
  "reasoning": "detailed reasoning for the recommendation"
}`
        },
        {
          role: 'user',
          content: `Please analyze ${symbol} based on the parameters above.`
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 800,
        temperature: 0.2
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new LLMError(`Empty market analysis response from OpenAI for ${symbol}`);
      }

      const parsed = this.extractJSON(content);

      return {
        symbol: parsed.symbol,
        sentiment: parsed.sentiment,
        confidence: parsed.confidence,
        riskFactors: parsed.risk_factors,
        opportunities: parsed.opportunities,
        priceTarget: parsed.price_target,
        recommendation: parsed.recommendation,
        reasoning: parsed.reasoning
      };
    });

    return Promise.all(analysisPromises);
  }

  /**
   * Generate trade recommendations using OpenAI
   */
  async generateTradeRecommendations(
    intent: TradeRecommendationIntent,
    accountInfo: AccountInfo
  ): Promise<any> {
    const accountContext = `
Account Information:
- Buying Power: $${accountInfo.buyingPower?.toFixed(2) || 'unknown'}
- Day Trading Power: $${accountInfo.dayTradingBuyingPower?.toFixed(2) || 'unknown'}
- Current Positions: ${accountInfo.positions?.map(p => `${p.symbol}: ${p.quantity} shares`).join(', ') || 'None'}`;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert financial advisor providing personalized trading recommendations.

Request Details:
- Scenario: ${intent.scenario}
- Symbols of Interest: ${intent.symbols.join(', ') || 'None specified'}
- Investment Amount: ${intent.investmentAmount ? `$${intent.investmentAmount}` : 'Not specified'}
- Risk Tolerance: ${intent.riskTolerance}
- Timeframe: ${intent.timeframe}
- Strategy Type: ${intent.strategyType}

${accountContext}

Provide comprehensive trading recommendations including:
1. Specific trade suggestions
2. Position sizing recommendations
3. Risk management strategies
4. Market timing considerations

Respond with a JSON object:
{
  "recommendations": [
    {
      "symbol": "SYMBOL",
      "action": "buy" | "sell",
      "quantity": number,
      "reasoning": "detailed reasoning",
      "risk_level": "low" | "medium" | "high",
      "expected_return": number,
      "stop_loss": number,
      "take_profit": number
    }
  ],
  "portfolio_allocation": {
    "cash_percentage": number,
    "equity_percentage": number,
    "sector_diversification": ["sector1", "sector2"]
  },
  "risk_management": {
    "max_position_size": number,
    "diversification_notes": "notes on diversification",
    "exit_strategy": "exit strategy details"
  },
  "market_outlook": "overall market outlook and timing"
}`
      },
      {
        role: 'user',
        content: `Please provide trading recommendations based on the parameters above.`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1200,
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    return this.extractJSON(content);
  }


} 