// ============================================================================
// OPENAI LLM ADAPTER - INFRASTRUCTURE LAYER
// ============================================================================

import OpenAI from 'openai';
import { 
  ILLMAdapter, 
  ParsedIntent, 
  AnalysisRequest, 
  IntentClassification,
  TradeCommand,
  InfrastructureError,
  ILogger
} from '../../core/interfaces';
import { config } from '../../config';

export class OpenAILLMAdapter implements ILLMAdapter {
  private openai: OpenAI;
  private readonly models = {
    fast: 'gpt-4o-mini',
    standard: 'gpt-4o',
    complex: 'gpt-4-turbo'
  };

  constructor(private logger: ILogger) {
    if (!config.openaiApiKey) {
      throw new InfrastructureError(
        'OpenAI API key is required',
        'MISSING_API_KEY',
        'OpenAI'
      );
    }

    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });

    this.logger.info('OpenAILLMAdapter initialized');
  }

  async parseNaturalLanguage(input: string): Promise<ParsedIntent> {
    this.logger.debug('Parsing natural language input', { input });

    try {
      const normalizedInput = this.preprocessInput(input);
      
      // Select appropriate model based on input complexity
      const model = this.selectModel(input);
      this.logger.debug('Selected model for parsing', { model });

      const tools: OpenAI.ChatCompletionTool[] = [{
        type: 'function',
        function: {
          name: 'execute_trade',
          description: 'Execute a stock trade based on user input',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['buy', 'sell'],
                description: 'Whether to buy or sell the stock'
              },
              symbol: {
                type: 'string',
                description: 'The stock ticker symbol (e.g., AAPL, MSFT, GOOGL)'
              },
              amount_type: {
                type: 'string',
                enum: ['dollars', 'shares'],
                description: 'Whether the amount is in dollars or number of shares'
              },
              amount: {
                type: 'number',
                description: 'The amount to trade (either dollars or shares based on amount_type)'
              },
              order_type: {
                type: 'string',
                enum: ['market', 'limit'],
                default: 'market',
                description: 'The type of order to place'
              },
              limit_price: {
                type: 'number',
                description: 'The limit price for limit orders (required if order_type is limit)'
              }
            },
            required: ['action', 'symbol', 'amount_type', 'amount']
          }
        }
      }];

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: this.getSystemPrompt()
        },
        {
          role: 'user',
          content: normalizedInput
        }
      ];

      const response = await this.openai.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: { type: 'function', function: { name: 'execute_trade' } },
        temperature: 0.1,
        max_tokens: 500
      });

      const message = response.choices[0]?.message;
      
      if (!message?.tool_calls?.[0]) {
        const content = message?.content || '';
        let errorMessage = 'Could not parse trading intent from input';
        
        if (content.toLowerCase().includes('unclear') || content.toLowerCase().includes('ambiguous')) {
          errorMessage = 'Your trade request was ambiguous. Please specify the action (buy/sell), amount, and stock symbol clearly.';
        }
        
        throw new InfrastructureError(errorMessage, 'PARSE_FAILED', 'OpenAI', {
          input: normalizedInput,
          response: content
        });
      }

      const toolCall = message.tool_calls[0];
      
      if (toolCall.function.name !== 'execute_trade') {
        throw new InfrastructureError(
          'Unexpected function call',
          'UNEXPECTED_FUNCTION',
          'OpenAI',
          { functionName: toolCall.function.name }
        );
      }

      const args = JSON.parse(toolCall.function.arguments);

      // Map to our domain types
      const intent: TradeCommand = {
        action: args.action,
        symbol: args.symbol?.toUpperCase(),
        amountType: args.amount_type,
        amount: args.amount,
        orderType: args.order_type || 'market',
        limitPrice: args.limit_price
      };

      // Calculate confidence based on completeness and clarity
      const confidence = this.calculateConfidence(intent, args);

      const result: ParsedIntent = {
        intent,
        confidence,
        metadata: {
          model,
          originalInput: input,
          normalizedInput,
          processingTime: Date.now(),
          tokenUsage: response.usage?.total_tokens || 0
        }
      };

      this.logger.info('Natural language parsing successful', {
        confidence,
        symbol: intent.symbol,
        action: intent.action,
        model
      });

      return result;

    } catch (error) {
      if (error instanceof InfrastructureError) {
        throw error;
      }

      const errorMessage = `Failed to parse natural language: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Natural language parsing failed', error as Error, { input });
      
      throw new InfrastructureError(
        errorMessage,
        'LLM_PROCESSING_FAILED',
        'OpenAI',
        { input, originalError: error }
      );
    }
  }

  async generateAnalysis(request: AnalysisRequest): Promise<string> {
    this.logger.debug('Generating analysis', { request });

    try {
      const model = this.models.standard; // Use standard model for analysis
      
      const systemPrompt = this.getAnalysisSystemPrompt(request.analysisType);
      const userPrompt = this.buildAnalysisPrompt(request);

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      const response = await this.openai.chat.completions.create({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 1500
      });

      const analysis = response.choices[0]?.message?.content;
      
      if (!analysis) {
        throw new InfrastructureError(
          'Empty response from OpenAI',
          'EMPTY_RESPONSE',
          'OpenAI'
        );
      }

      this.logger.info('Analysis generated successfully', {
        symbols: request.symbols,
        analysisType: request.analysisType,
        model
      });

      return analysis;

    } catch (error) {
      if (error instanceof InfrastructureError) {
        throw error;
      }

      const errorMessage = `Failed to generate analysis: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Analysis generation failed', error as Error, { request });
      
      throw new InfrastructureError(
        errorMessage,
        'ANALYSIS_GENERATION_FAILED',
        'OpenAI',
        { request, originalError: error }
      );
    }
  }

  async classifyIntent(input: string): Promise<IntentClassification> {
    this.logger.debug('Classifying intent', { input });

    try {
      const model = this.models.fast; // Use fast model for classification
      
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `Classify this user input into one of these categories:
- "trade": Simple buy/sell orders
- "analysis": Market analysis or technical/fundamental analysis requests
- "portfolio": Portfolio management, positions, or performance requests
- "market_data": Market data or quote requests
- "unknown": Cannot be classified

Respond with just the category name and confidence (0.0-1.0) in JSON format:
{"type": "category", "confidence": 0.95}`
        },
        {
          role: 'user',
          content: input
        }
      ];

      const response = await this.openai.chat.completions.create({
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: 100
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new InfrastructureError(
          'Empty response from OpenAI',
          'EMPTY_RESPONSE',
          'OpenAI'
        );
      }

      const parsed = JSON.parse(content);
      
      const result: IntentClassification = {
        type: parsed.type || 'unknown',
        confidence: parsed.confidence || 0.5
      };

      this.logger.debug('Intent classified', result);
      return result;

    } catch (error) {
      this.logger.warn('Intent classification failed, defaulting to unknown', error as Error);
      
      // Return default classification instead of throwing
      return {
        type: 'unknown',
        confidence: 0.0
      };
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private preprocessInput(input: string): string {
    let normalized = input.trim();
    
    // Add spaces around currency symbols
    normalized = normalized.replace(/\$/g, ' $ ');
    normalized = normalized.replace(/€/g, ' € ');
    normalized = normalized.replace(/£/g, ' £ ');
    
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  private selectModel(input: string): string {
    // Simple heuristics for model selection
    const complexity = this.assessComplexity(input);
    
    if (complexity < 0.3) {
      return this.models.fast;
    } else if (complexity < 0.7) {
      return this.models.standard;
    } else {
      return this.models.complex;
    }
  }

  private assessComplexity(input: string): number {
    let complexity = 0.0;
    
    // Length complexity
    complexity += Math.min(input.length / 200, 0.3);
    
    // Keywords that indicate complexity
    const complexKeywords = [
      'analyze', 'recommend', 'strategy', 'hedge', 'options', 'portfolio', 
      'diversify', 'risk', 'correlation', 'volatility', 'technical', 'fundamental'
    ];
    
    const foundComplexKeywords = complexKeywords.filter(keyword => 
      input.toLowerCase().includes(keyword)
    ).length;
    
    complexity += (foundComplexKeywords / complexKeywords.length) * 0.5;
    
    // Question complexity
    const questionWords = ['why', 'how', 'what', 'when', 'where', 'which', 'should'];
    const foundQuestionWords = questionWords.filter(word => 
      input.toLowerCase().includes(word)
    ).length;
    
    complexity += (foundQuestionWords / questionWords.length) * 0.2;
    
    return Math.min(complexity, 1.0);
  }

  private calculateConfidence(intent: TradeCommand, args: any): number {
    let confidence = 0.8; // Base confidence
    
    // Increase confidence for complete information
    if (intent.symbol && intent.action && intent.amount && intent.amountType) {
      confidence += 0.1;
    }
    
    // Decrease confidence for unclear amounts
    if (intent.amount <= 0) {
      confidence -= 0.3;
    }
    
    // Decrease confidence for missing limit price on limit orders
    if (intent.orderType === 'limit' && !intent.limitPrice) {
      confidence -= 0.2;
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private getSystemPrompt(): string {
    return `You are a trading assistant that parses natural language trading commands.
Convert user input into structured trade parameters using the execute_trade function.

PARSING GUIDELINES:
1. Stock identification:
   - Accept both company names and ticker symbols
   - Use your knowledge to convert company names to their correct ticker symbols
   - Handle case-insensitive input (msft, MSFT, Msft -> MSFT)
   - For ambiguous names, use the most commonly traded stock

2. Amount parsing:
   - Currency: "$X", "X dollars", "X usd", "X bucks" -> amount_type: "dollars"
   - Shares: "X shares", "X stocks", "X units" -> amount_type: "shares"
   - Default: If just a number with "of" or "worth", assume dollars
   - Handle written numbers: "hundred" -> 100, "fifty" -> 50, etc.

3. Action identification:
   - Buy synonyms: "buy", "purchase", "get", "acquire", "invest in", "pick up"
   - Sell synonyms: "sell", "dispose", "get rid of", "dump", "liquidate"

4. Order type:
   - Default to "market" orders
   - Only use "limit" if user specifies a price like "at $X" or "limit price X"

5. Be flexible and intelligent:
   - Handle typos and variations
   - Understand context (e.g., "100 of Apple" likely means $100)
   - Parse natural language numbers and amounts

Always prioritize understanding the user's intent over strict pattern matching.`;
  }

  private getAnalysisSystemPrompt(analysisType: string): string {
    const basePrompt = `You are a senior financial analyst with expertise in market analysis.`;
    
    switch (analysisType) {
      case 'technical':
        return `${basePrompt} Provide technical analysis focusing on chart patterns, indicators, support/resistance levels, and price action.`;
      case 'fundamental':
        return `${basePrompt} Provide fundamental analysis focusing on financial metrics, earnings, company performance, and intrinsic value.`;
      case 'sentiment':
        return `${basePrompt} Provide sentiment analysis focusing on market sentiment, news impact, and investor psychology.`;
      default:
        return `${basePrompt} Provide comprehensive analysis covering technical, fundamental, and sentiment factors.`;
    }
  }

  private buildAnalysisPrompt(request: AnalysisRequest): string {
    let prompt = `Please analyze the following symbols: ${request.symbols.join(', ')}\n\n`;
    prompt += `Analysis Type: ${request.analysisType}\n`;
    prompt += `Timeframe: ${request.timeframe}\n`;
    
    if (request.criteria && request.criteria.length > 0) {
      prompt += `Focus Areas: ${request.criteria.join(', ')}\n`;
    }
    
    prompt += `\nProvide a detailed analysis with actionable insights and recommendations.`;
    
    return prompt;
  }
}