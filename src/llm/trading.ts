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
import { PoliticianService } from '../services/politician-service-simple';
import { PerplexityClient } from '../services/perplexity-client';
import { CacheManager } from '../services/cache-manager';

export interface PoliticianIntent {
  type: 'politician';
  politician: string;
  queryType: 'holdings' | 'trades' | 'profile' | 'analysis';
  timeframe?: 'week' | 'month' | 'quarter' | 'year';
  confidence: number;
}
import { OpenAIService } from './openai-service';

export class AdvancedTradingService {
  private openai: OpenAI;
  private basicService: OpenAIService;
  private politicianService: PoliticianService;
  private liteModel = 'gpt-4o-mini';
  private heavyModel = 'gpt-4-turbo';
  private intentCache = new Map<string, { intent: AdvancedTradeIntent; timestamp: number }>();
  private generativeCache = new Map<string, { response: any; timestamp: number }>();
  private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.basicService = new OpenAIService();
    
    // Initialize politician service
    const perplexityClient = new PerplexityClient();
    const cacheManager = new CacheManager();
    this.politicianService = new PoliticianService(perplexityClient, cacheManager);
  }

  /**
   * Parse complex natural language trading requests
   */
  async parseAdvancedIntent(userInput: string, accountInfo?: AccountInfo): Promise<AdvancedTradeIntent> {
    const cacheKey = `${userInput}-${accountInfo?.accountId || 'no-account'}`;
    const cached = this.intentCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.intent;
    }

    try {
      const intentType = await this.classifyIntent(userInput);
      let result: AdvancedTradeIntent;

      switch (intentType) {
        case 'hedge':
          result = await this.parseHedgeIntent(userInput, accountInfo);
          break;
        case 'analysis':
          result = await this.parseAnalysisIntent(userInput);
          break;
        case 'recommendation':
          result = await this.parseRecommendationIntent(userInput);
          break;
        case '13f':
          result = await this.parse13FIntent(userInput);
          break;
        case 'politician':
          result = await this.parsePoliticianIntent(userInput);
          break;
        default:
          const tradeIntent = await this.basicService.parseTradeIntent(userInput);
          result = { ...tradeIntent, type: 'trade' as const };
      }

      this.intentCache.set(cacheKey, { intent: result, timestamp: Date.now() });
      return result;
    } catch (error) {
      console.error('Advanced intent parsing failed, falling back to basic parsing:', error);
      const tradeIntent = await this.basicService.parseTradeIntent(userInput);
      const result = { ...tradeIntent, type: 'trade' as const };
      this.intentCache.set(cacheKey, { intent: result, timestamp: Date.now() });
      return result;
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
- "politician": Questions about politician stock holdings, congressional trades, or political figures' investments

Respond with just the category name (e.g., "trade", "hedge", "politician", etc.)`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: this.liteModel,
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
      model: this.liteModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    return {
      type: 'hedge',
      primarySymbol: parsed.primary_symbol,
      hedgeReason: parsed.hedge_reason,
      timeframe: parsed.timeframe,
      riskTolerance: parsed.risk_tolerance
    };
  }

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
      model: this.liteModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);

    return {
      type: 'analysis',
      symbols: parsed.symbols,
      analysisType: parsed.analysis_type || 'comprehensive',
      timeframe: parsed.timeframe || '1 month',
      focusAreas: parsed.focus_areas || []
    };
  }

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
      model: this.liteModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);

    return {
      type: '13f',
      institution: parsed.institution,
      action: parsed.action,
      investmentAmount: parsed.investment_amount
    };
  }

  private async parsePoliticianIntent(userInput: string): Promise<PoliticianIntent> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `Parse this politician stock query and extract the key information.

Respond with a JSON object containing:
{
  "politician": "name of the politician (e.g., 'Nancy Pelosi', 'Josh Hawley')",
  "query_type": "holdings" | "trades" | "profile" | "analysis",
  "timeframe": "week" | "month" | "quarter" | "year" // if mentioned, otherwise "month"
}

Query type guide:
- "holdings": Current stock holdings/portfolio
- "trades": Recent trading activity
- "profile": General information about the politician
- "analysis": Performance analysis or trading patterns

Examples:
- "What stocks does Nancy Pelosi own?" -> holdings
- "Nancy Pelosi recent trades" -> trades
- "How has AOC performed in the market?" -> analysis`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: this.liteModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);

    return {
      type: 'politician',
      politician: parsed.politician,
      queryType: parsed.query_type,
      timeframe: parsed.timeframe || 'month',
      confidence: 0.85
    };
  }

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
      model: this.liteModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.1
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);

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
   * Generate hedge recommendations using OpenAI
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
      "symbol": "INSTRUMENT_SYMBOL",
      "type": "option" | "etf" | "stock",
      "action": "buy" | "sell",
      "allocation_percentage": number
    }
  ],
  "cost_usd": number,
  "confidence_score": number, // 0 to 1
  "summary": "brief summary of the recommendation"
}`
      },
      {
        role: 'user',
        content: `Provide a hedge recommendation for ${hedgeIntent.primarySymbol}.`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: this.heavyModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 1200,
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    return JSON.parse(content);
  }

  /**
   * Perform market analysis using OpenAI
   */
  async performMarketAnalysis(
    analysisIntent: MarketAnalysisIntent,
    marketData: any[]
  ): Promise<MarketAnalysis> {
    const cacheKey = `analysis:${analysisIntent.symbols.join(',')}:${analysisIntent.analysisType}`;
    const cached = this.generativeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.response;
    }

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a senior market analyst. Provide a detailed market analysis based on the following request.

Analysis Request:
- Symbols: ${analysisIntent.symbols.join(', ')}
- Analysis Type: ${analysisIntent.analysisType}
- Timeframe: ${analysisIntent.timeframe}
- Focus Areas: ${analysisIntent.focusAreas.join(', ')}

Current Market Data:
${JSON.stringify(marketData, null, 2)}

Please provide a detailed analysis in the following JSON format:
{
  "summary": "Overall summary of the analysis",
  "technical_analysis": {
    "trend": "up" | "down" | "sideways",
    "support_levels": [number, number],
    "resistance_levels": [number, number],
    "key_indicators": {
      "RSI": number,
      "MACD": "bullish_cross" | "bearish_cross" | "neutral"
    }
  },
  "fundamental_analysis": {
    "pe_ratio": number,
    "earnings_growth_yoy": number,
    "analyst_rating": "buy" | "hold" | "sell",
    "fair_value_estimate": number
  },
  "sentiment_analysis": {
    "news_sentiment": "positive" | "negative" | "neutral",
    "social_media_sentiment": "bullish" | "bearish" | "neutral"
  },
  "recommendation": {
    "action": "buy" | "sell" | "hold",
    "confidence_score": number // 0 to 1
  }
}`
      },
      {
        role: 'user',
        content: `Analyze ${analysisIntent.symbols.join(', ')}.`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: this.heavyModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const jsonResponse = JSON.parse(content);
    this.generativeCache.set(cacheKey, { response: jsonResponse, timestamp: Date.now() });
    return jsonResponse;
  }

  /**
   * Generate trade recommendations using OpenAI
   */
  async generateTradeRecommendations(
    intent: TradeRecommendationIntent,
    accountInfo: AccountInfo
  ): Promise<any> {
    const cacheKey = `recommendations:${intent.scenario}:${accountInfo.accountId}`;
    const cached = this.generativeCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.response;
    }

    const accountContext = `
Account Information:
- Buying Power: $${accountInfo.buyingPower?.toFixed(2) || 'unknown'}
- Day Trading Power: $${accountInfo.dayTradingBuyingPower?.toFixed(2) || 'unknown'}
- Current Portfolio Value: $${accountInfo.portfolioValue?.toFixed(2) || 'unknown'}
- Existing Positions: ${accountInfo.positions?.map(p => `${p.quantity} of ${p.symbol}`).join(', ') || 'None'}
    `;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert financial advisor providing personalized trading recommendations.

Request Details:
- Scenario: ${intent.scenario}
- Symbols of Interest: ${intent.symbols?.join(', ') || 'None'}
- Investment Amount: $${intent.investmentAmount || 'Not specified'}
- Risk Tolerance: ${intent.riskTolerance}
- Timeframe: ${intent.timeframe}
- Strategy: ${intent.strategyType}

${accountContext}

Provide comprehensive trading recommendations in the following JSON format:
{
  "recommendations": [
    {
      "symbol": "TICKER",
      "action": "buy" | "sell" | "hold",
      "reasoning": "Detailed reasoning for the recommendation.",
      "confidence_score": number, // 0 to 1
      "position_sizing_percentage": number, // % of portfolio
      "stop_loss_price": number,
      "take_profit_price": number
    }
  ],
  "summary": "Overall summary of the recommended strategy."
}`
      },
      {
        role: 'user',
        content: `Please provide trading recommendations based on the parameters above.`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: this.heavyModel,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 1500,
      temperature: 0.2
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new LLMError('Empty response from OpenAI');
    }

    const jsonResponse = JSON.parse(content);
    this.generativeCache.set(cacheKey, { response: jsonResponse, timestamp: Date.now() });
    return jsonResponse;
  }
}