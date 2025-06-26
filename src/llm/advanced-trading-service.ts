import OpenAI from 'openai';
import { config } from '../config';
import { 
  AdvancedTradeIntent, 
  HedgeIntent, 
  MarketAnalysisIntent, 
  TradeRecommendationIntent,
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

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.basicService = new OpenAIService();
  }

  /**
   * Parse complex natural language trading requests
   */
  async parseAdvancedIntent(userInput: string, accountInfo?: AccountInfo): Promise<AdvancedTradeIntent> {
    try {
      const tools: OpenAI.ChatCompletionTool[] = [
        {
          type: 'function',
          function: {
            name: 'classify_intent',
            description: 'Classify the type of trading request',
            parameters: {
              type: 'object',
              properties: {
                intent_type: {
                  type: 'string',
                  enum: ['trade', 'hedge', 'analysis', 'recommendation'],
                  description: 'The type of trading intent'
                },
                reasoning: {
                  type: 'string',
                  description: 'Brief explanation of why this intent type was chosen'
                }
              },
              required: ['intent_type', 'reasoning']
            }
          }
        }
      ];

      const classificationMessages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are an expert trading assistant that classifies user requests.

Classify requests as:
- "trade": Direct buy/sell orders (e.g., "buy 100 shares of AAPL")
- "hedge": Hedging strategies or risk management (e.g., "how to hedge my LULU position for earnings")
- "analysis": Market analysis or opinions (e.g., "what's the outlook for tech stocks?")
- "recommendation": Trade recommendations based on scenarios (e.g., "what should I buy if inflation rises?")

Be intelligent about classification - focus on the primary intent.`
        },
        {
          role: 'user',
          content: userInput
        }
      ];

      const classificationResponse = await this.openai.chat.completions.create({
        model: 'gpt-4-0125-preview',
        messages: classificationMessages,
        tools,
        tool_choice: { type: 'function', function: { name: 'classify_intent' } },
        temperature: 0.1
      });

      const classification = JSON.parse(
        classificationResponse.choices[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'
      );

      // Route to appropriate parser based on classification
      switch (classification.intent_type) {
        case 'trade':
          const tradeIntent = await this.basicService.parseTradeIntent(userInput);
          return { ...tradeIntent, type: 'trade' };
        
        case 'hedge':
          return await this.parseHedgeIntent(userInput, accountInfo);
        
        case 'analysis':
          return await this.parseAnalysisIntent(userInput);
        
        case 'recommendation':
          return await this.parseRecommendationIntent(userInput);
        
        default:
          throw new LLMError('Unable to classify trading intent');
      }
    } catch (error) {
      throw new LLMError('Failed to parse advanced trading intent', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput
      });
    }
  }

  /**
   * Parse hedging intent from natural language
   */
  private async parseHedgeIntent(userInput: string, accountInfo?: AccountInfo): Promise<HedgeIntent> {
    const tools: OpenAI.ChatCompletionTool[] = [{
      type: 'function',
      function: {
        name: 'parse_hedge_request',
        description: 'Parse a hedging request',
        parameters: {
          type: 'object',
          properties: {
            primary_symbol: {
              type: 'string',
              description: 'The ticker symbol of the position to hedge'
            },
            hedge_reason: {
              type: 'string',
              description: 'The reason for hedging (e.g., earnings risk, market volatility, tariffs)'
            },
            timeframe: {
              type: 'string',
              description: 'The timeframe for the hedge (e.g., "1 week", "until earnings", "Q1")'
            },
            risk_tolerance: {
              type: 'string',
              enum: ['conservative', 'moderate', 'aggressive'],
              description: 'Risk tolerance level for the hedge'
            }
          },
          required: ['primary_symbol', 'hedge_reason']
        }
      }
    }];

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert trading assistant parsing hedge requests.
Extract the key information about what position needs hedging and why.
Consider the user's current positions if provided.`
      },
      {
        role: 'user',
        content: userInput
      }
    ];

    if (accountInfo?.positions && accountInfo.positions.length > 0) {
      messages.push({
        role: 'system',
        content: `User's current positions: ${accountInfo.positions.map(p => 
          `${p.symbol}: ${p.quantity} shares`).join(', ')}`
      });
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-0125-preview',
      messages,
      tools,
      tool_choice: { type: 'function', function: { name: 'parse_hedge_request' } },
      temperature: 0.1
    });

    const args = JSON.parse(
      response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'
    );

    // Find position details if available
    const position = accountInfo?.positions.find(p => 
      p.symbol.toUpperCase() === args.primary_symbol.toUpperCase()
    );

    const primaryPosition: HedgeIntent['primaryPosition'] = {
      symbol: args.primary_symbol.toUpperCase()
    };
    
    if (position?.marketValue !== undefined) {
      primaryPosition.currentValue = position.marketValue;
    }
    if (position?.quantity !== undefined) {
      primaryPosition.shares = position.quantity;
    }

    return {
      type: 'hedge',
      primaryPosition,
      hedgeReason: args.hedge_reason,
      timeframe: args.timeframe,
      riskTolerance: args.risk_tolerance || 'moderate'
    };
  }

  /**
   * Parse market analysis intent
   */
  private async parseAnalysisIntent(userInput: string): Promise<MarketAnalysisIntent> {
    const tools: OpenAI.ChatCompletionTool[] = [{
      type: 'function',
      function: {
        name: 'parse_analysis_request',
        description: 'Parse a market analysis request',
        parameters: {
          type: 'object',
          properties: {
            symbols: {
              type: 'array',
              items: { type: 'string' },
              description: 'Stock ticker symbols to analyze'
            },
            analysis_type: {
              type: 'string',
              enum: ['fundamental', 'technical', 'sentiment', 'risk'],
              description: 'Type of analysis requested'
            },
            context: {
              type: 'string',
              description: 'Additional context for the analysis'
            },
            timeframe: {
              type: 'string',
              description: 'Timeframe for the analysis'
            }
          },
          required: ['symbols', 'analysis_type']
        }
      }
    }];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-0125-preview',
      messages: [
        {
          role: 'system',
          content: 'Parse market analysis requests. Extract symbols and analysis type.'
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      tools,
      tool_choice: { type: 'function', function: { name: 'parse_analysis_request' } },
      temperature: 0.1
    });

    const args = JSON.parse(
      response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'
    );

    return {
      type: 'analysis',
      symbols: args.symbols.map((s: string) => s.toUpperCase()),
      analysisType: args.analysis_type,
      context: args.context,
      timeframe: args.timeframe
    };
  }

  /**
   * Parse trade recommendation intent
   */
  private async parseRecommendationIntent(userInput: string): Promise<TradeRecommendationIntent> {
    const tools: OpenAI.ChatCompletionTool[] = [{
      type: 'function',
      function: {
        name: 'parse_recommendation_request',
        description: 'Parse a trade recommendation request',
        parameters: {
          type: 'object',
          properties: {
            scenario: {
              type: 'string',
              description: 'The market scenario or condition'
            },
            max_risk: {
              type: 'number',
              description: 'Maximum risk amount in dollars'
            },
            sectors: {
              type: 'array',
              items: { type: 'string' },
              description: 'Preferred sectors'
            },
            exclude_symbols: {
              type: 'array',
              items: { type: 'string' },
              description: 'Symbols to exclude'
            }
          },
          required: ['scenario']
        }
      }
    }];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-0125-preview',
      messages: [
        {
          role: 'system',
          content: 'Parse trade recommendation requests. Extract the scenario and any constraints.'
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      tools,
      tool_choice: { type: 'function', function: { name: 'parse_recommendation_request' } },
      temperature: 0.1
    });

    const args = JSON.parse(
      response.choices[0]?.message?.tool_calls?.[0]?.function?.arguments || '{}'
    );

    return {
      type: 'recommendation',
      scenario: args.scenario,
      constraints: {
        maxRisk: args.max_risk,
        sectors: args.sectors,
        excludeSymbols: args.exclude_symbols?.map((s: string) => s.toUpperCase())
      }
    };
  }

  /**
   * Generate hedge recommendations based on position and market conditions
   */
  async generateHedgeRecommendation(
    hedgeIntent: HedgeIntent, 
    marketData: any
  ): Promise<HedgeRecommendation> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are an expert hedge fund manager providing hedging strategies.
        
Consider:
1. The specific risk being hedged (earnings, tariffs, market volatility)
2. Cost-effective hedging instruments (options, inverse ETFs, correlated assets)
3. The user's risk tolerance
4. Current market conditions
5. Time horizon

Provide practical, actionable hedging strategies. Return your response as a JSON object with the following structure:
{
  "strategy": "Brief description of the recommended strategy",
  "instruments": [
    {
      "symbol": "TICKER",
      "action": "buy|sell",
      "quantity": 100,
      "rationale": "Why this instrument helps hedge the risk"
    }
  ],
  "estimatedCost": 1000,
  "riskReduction": "High|Moderate|Low",
  "explanation": "Detailed explanation of how this hedge works"
}`
      },
      {
        role: 'user',
        content: `I need to hedge my position in ${hedgeIntent.primaryPosition.symbol}.
Reason: ${hedgeIntent.hedgeReason}
Timeframe: ${hedgeIntent.timeframe || 'Not specified'}
Risk tolerance: ${hedgeIntent.riskTolerance}
Current position value: $${hedgeIntent.primaryPosition.currentValue || 'Unknown'}

Please provide a JSON response with hedging recommendations.`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-0125-preview',
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 1000
    });

    const recommendation = JSON.parse(response.choices[0]?.message?.content || '{}');
    
    return {
      strategy: recommendation.strategy || 'Options collar strategy',
      instruments: recommendation.instruments || [],
      estimatedCost: recommendation.estimatedCost || 0,
      riskReduction: recommendation.riskReduction || 'Moderate',
      explanation: recommendation.explanation || 'Hedging strategy to reduce risk'
    };
  }

  /**
   * Perform market analysis on requested symbols
   */
  async performMarketAnalysis(
    analysisIntent: MarketAnalysisIntent,
    marketData: any
  ): Promise<MarketAnalysis[]> {
    const analyses: MarketAnalysis[] = [];

    for (const symbol of analysisIntent.symbols) {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a senior market analyst providing ${analysisIntent.analysisType} analysis.
          
Consider:
1. Current market conditions and trends
2. Company/sector specific factors
3. Macroeconomic influences
4. Risk factors and opportunities
5. Recent news and events

Provide balanced, professional analysis. Return your response as a JSON object with this structure:
{
  "sentiment": "bullish|bearish|neutral",
  "riskFactors": ["Risk factor 1", "Risk factor 2"],
  "opportunities": ["Opportunity 1", "Opportunity 2"],
  "recommendation": "Detailed recommendation text",
  "relatedNews": [
    {
      "title": "News headline",
      "summary": "Brief summary",
      "impact": "positive|negative|neutral"
    }
  ]
}`
        },
        {
          role: 'user',
          content: `Perform ${analysisIntent.analysisType} analysis on ${symbol}.
Context: ${analysisIntent.context || 'General market conditions'}
Timeframe: ${analysisIntent.timeframe || 'Short to medium term'}

Please provide a JSON response with your analysis.`
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-0125-preview',
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" },
        max_tokens: 800
      });

      const analysis = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      analyses.push({
        symbol,
        currentPrice: marketData[symbol]?.currentPrice || 0,
        analysis: {
          sentiment: analysis.sentiment || 'neutral',
          riskFactors: analysis.riskFactors || [],
          opportunities: analysis.opportunities || [],
          recommendation: analysis.recommendation || 'Hold'
        },
        relatedNews: analysis.relatedNews
      });
    }

    return analyses;
  }

  /**
   * Generate trade recommendations based on scenarios
   */
  async generateTradeRecommendations(
    intent: TradeRecommendationIntent,
    accountInfo: AccountInfo
  ): Promise<any> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a professional investment advisor providing trade recommendations.
        
Consider:
1. The specific scenario or market condition
2. Risk management and position sizing
3. Diversification across sectors
4. Entry and exit strategies
5. Current portfolio composition

Provide specific, actionable recommendations with clear rationale. Return your response as a JSON object with this structure:
{
  "recommendations": [
    {
      "symbol": "TICKER",
      "action": "buy|sell",
      "allocation": "Dollar amount or percentage",
      "rationale": "Why this trade makes sense",
      "targetPrice": 100.50,
      "stopLoss": 95.00
    }
  ],
  "strategy": "Overall strategy explanation",
  "risks": ["Risk 1", "Risk 2"]
}`
      },
      {
        role: 'user',
        content: `Scenario: ${intent.scenario}
Available capital: $${accountInfo.buyingPower}
Current portfolio value: $${accountInfo.portfolioValue}
${intent.constraints?.maxRisk ? `Max risk: $${intent.constraints.maxRisk}` : ''}
${intent.constraints?.sectors ? `Preferred sectors: ${intent.constraints.sectors.join(', ')}` : ''}
${intent.constraints?.excludeSymbols ? `Exclude: ${intent.constraints.excludeSymbols.join(', ')}` : ''}

Please provide a JSON response with trade recommendations.`
      }
    ];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-0125-preview',
      messages,
      temperature: 0.3,
      response_format: { type: "json_object" },
      max_tokens: 1000
    });

    return JSON.parse(response.choices[0]?.message?.content || '{}');
  }
} 