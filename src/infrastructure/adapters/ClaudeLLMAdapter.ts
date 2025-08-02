// ============================================================================
// CLAUDE LLM ADAPTER - INFRASTRUCTURE LAYER
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';
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

export class ClaudeLLMAdapter implements ILLMAdapter {
  private anthropic: Anthropic;
  
  // Claude 3 model configuration with latest versions
  private readonly models = {
    fast: 'claude-3-haiku-20240307',
    standard: 'claude-3-sonnet-20240229',
    complex: 'claude-3-opus-20240229'
  };

  constructor(private logger: ILogger) {
    if (!config.anthropicApiKey) {
      throw new InfrastructureError(
        'Anthropic API key is required',
        'MISSING_API_KEY',
        'Claude'
      );
    }

    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });

    this.logger.info('ClaudeLLMAdapter initialized');
  }

  async parseNaturalLanguage(input: string): Promise<ParsedIntent> {
    this.logger.debug('Parsing natural language input with Claude', { input });

    try {
      const normalizedInput = this.preprocessInput(input);
      
      // Select appropriate model based on input complexity
      const model = this.selectModel(input);
      this.logger.debug('Selected model for parsing', { model });

      const systemPrompt = this.getSystemPrompt();
      const userPrompt = this.buildTradeParsingPrompt(normalizedInput);

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1000,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new InfrastructureError(
          'Unexpected response type from Claude',
          'UNEXPECTED_RESPONSE_TYPE',
          'Claude'
        );
      }

      const responseText = content.text;
      
      // Parse the JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        throw new InfrastructureError(
          'Invalid JSON response from Claude',
          'INVALID_JSON_RESPONSE',
          'Claude',
          { response: responseText, parseError }
        );
      }

      // Validate the response structure
      if (!parsedResponse.action || !parsedResponse.symbol || !parsedResponse.amount_type || !parsedResponse.amount) {
        throw new InfrastructureError(
          'Incomplete trade parameters from Claude',
          'INCOMPLETE_TRADE_PARAMS',
          'Claude',
          { response: parsedResponse }
        );
      }

      // Map to our domain types
      const intent: TradeCommand = {
        action: parsedResponse.action,
        symbol: parsedResponse.symbol?.toUpperCase(),
        amountType: parsedResponse.amount_type,
        amount: parsedResponse.amount,
        orderType: parsedResponse.order_type || 'market',
        limitPrice: parsedResponse.limit_price
      };

      // Calculate confidence based on completeness and clarity
      const confidence = this.calculateConfidence(intent, parsedResponse);

      const result: ParsedIntent = {
        intent,
        confidence,
        metadata: {
          model,
          originalInput: input,
          normalizedInput,
          processingTime: Date.now(),
          tokenUsage: response.usage?.input_tokens + response.usage?.output_tokens || 0
        }
      };

      this.logger.info('Natural language parsing successful with Claude', {
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

      const errorMessage = `Failed to parse natural language with Claude: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Natural language parsing failed', error as Error, { input });
      
      throw new InfrastructureError(
        errorMessage,
        'LLM_PROCESSING_FAILED',
        'Claude',
        { input, originalError: error }
      );
    }
  }

  async generateAnalysis(request: AnalysisRequest): Promise<string> {
    this.logger.debug('Generating analysis with Claude', { request });

    try {
      const model = this.models.standard; // Use standard model for analysis
      
      const systemPrompt = this.getAnalysisSystemPrompt(request.analysisType);
      const userPrompt = this.buildAnalysisPrompt(request);

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 2000,
        temperature: 0.2,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new InfrastructureError(
          'Unexpected response type from Claude',
          'UNEXPECTED_RESPONSE_TYPE',
          'Claude'
        );
      }

      const analysis = content.text;
      
      if (!analysis) {
        throw new InfrastructureError(
          'Empty response from Claude',
          'EMPTY_RESPONSE',
          'Claude'
        );
      }

      this.logger.info('Analysis generated successfully with Claude', {
        symbols: request.symbols,
        analysisType: request.analysisType,
        model
      });

      return analysis;

    } catch (error) {
      if (error instanceof InfrastructureError) {
        throw error;
      }

      const errorMessage = `Failed to generate analysis with Claude: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Analysis generation failed', error as Error, { request });
      
      throw new InfrastructureError(
        errorMessage,
        'ANALYSIS_GENERATION_FAILED',
        'Claude',
        { request, originalError: error }
      );
    }
  }

  async classifyIntent(input: string): Promise<IntentClassification> {
    this.logger.debug('Classifying intent with Claude', { input });

    try {
      const model = this.models.fast; // Use fast model for classification
      
      const systemPrompt = `Classify this user input into one of these categories:
- "trade": Simple buy/sell orders
- "analysis": Market analysis or technical/fundamental analysis requests
- "portfolio": Portfolio management, positions, or performance requests
- "market_data": Market data or quote requests
- "unknown": Cannot be classified

Respond with a JSON object containing the category and confidence (0.0-1.0):
{"type": "category", "confidence": 0.95}`;

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 100,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: input
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new InfrastructureError(
          'Unexpected response type from Claude',
          'UNEXPECTED_RESPONSE_TYPE',
          'Claude'
        );
      }

      let parsed;
      try {
        parsed = JSON.parse(content.text);
      } catch (parseError) {
        this.logger.warn('Intent classification failed with Claude, defaulting to unknown', parseError as Error);
        return {
          type: 'unknown',
          confidence: 0.0
        };
      }
      
      const result: IntentClassification = {
        type: parsed.type || 'unknown',
        confidence: parsed.confidence || 0.5
      };

      this.logger.debug('Intent classified with Claude', result);
      return result;

    } catch (error) {
      this.logger.warn('Intent classification failed with Claude, defaulting to unknown', error as Error);
      
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
Convert user input into structured trade parameters and respond with a JSON object.

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

5. Response format:
   Always respond with a JSON object in this exact format:
   {
     "action": "buy" or "sell",
     "symbol": "TICKER_SYMBOL",
     "amount_type": "dollars" or "shares",
     "amount": numeric_value,
     "order_type": "market" or "limit",
     "limit_price": numeric_value (only if order_type is "limit")
   }

Be flexible and intelligent in parsing. Handle typos, variations, and understand context.
Always prioritize understanding the user's intent over strict pattern matching.`;
  }

  private buildTradeParsingPrompt(input: string): string {
    return `Parse this trading command and respond with a JSON object: "${input}"`;
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