import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { z } from 'zod';
import { TradeIntent, TradeIntentSchema, LLMError } from '../types';
import { cacheService } from '../cache/cache-service';

export class ClaudeService {
  private anthropic: Anthropic;
  
  // Service initialization timestamp for caching optimization
  private readonly initTimestamp = Date.now();

  // Claude model options
  private static readonly models = {
    fast: 'claude-3-haiku-20240307',
    standard: 'claude-3-sonnet-20240229', 
    complex: 'claude-3-opus-20240229'
  };

  private static readonly tradeParsingSystemPrompt: string = `You are a trading assistant that parses natural language trading commands.
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

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: config.anthropicApiKey,
    });
  }

  /**
   * Parse natural language trading command into structured TradeIntent
   */
  async parseTradeIntent(userInput: string): Promise<TradeIntent> {
    try {
      const normalizedInput = this.preprocessInput(userInput);
      
      // Check cache first
      const inputHash = cacheService.createHash(normalizedInput);
      const cached = cacheService.getParsedIntent(inputHash);
      if (cached) {
        return cached;
      }

      const response = await this.anthropic.messages.create({
        model: ClaudeService.models.standard,
        max_tokens: 1000,
        temperature: 0.1,
        system: ClaudeService.tradeParsingSystemPrompt,
        messages: [
          {
            role: 'user',
            content: `Parse this trading command and respond with a JSON object: "${normalizedInput}"`
          }
        ]
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new LLMError('Unexpected response type from Claude', {
          userInput,
          normalizedInput,
          responseType: content.type
        });
      }

      const responseText = content.text;
      
      // Parse the JSON response
      let args;
      try {
        args = JSON.parse(responseText);
      } catch (parseError) {
        throw new LLMError('Invalid JSON response from Claude', {
          userInput,
          normalizedInput,
          response: responseText,
          parseError: parseError instanceof Error ? parseError.message : 'Unknown parse error'
        });
      }

      // Validate required fields
      if (!args.action || !args.symbol || !args.amount_type || typeof args.amount !== 'number') {
        throw new LLMError('Incomplete trade parameters from Claude', {
          userInput,
          normalizedInput,
          response: args
        });
      }

      // Zod validation provides runtime type safety
      const tradeIntent = TradeIntentSchema.parse({
        action: args.action,
        symbol: args.symbol?.toUpperCase(),
        amountType: args.amount_type,
        amount: args.amount,
        orderType: args.order_type || 'market',
        limitPrice: args.limit_price,
      });

      // Cache the parsed intent
      cacheService.setParsedIntent(inputHash, normalizedInput, tradeIntent);

      return tradeIntent;
    } catch (error) {
      if (error instanceof z.ZodError) {
        // Provide detailed validation error messages
        const errorMessage = `Invalid trade parameters: ${error.issues.map((e: any) => e.message).join(', ')}`;
        throw new LLMError(errorMessage, {
          validationErrors: error.format(),
          userInput
        });
      }

      if (error instanceof LLMError) {
        throw error;
      }
      
      throw new LLMError('Failed to parse trade intent with Claude', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput
      });
    }
  }

  /**
   * Generate a human-readable summary of a trade intent
   */
  generateTradeSummary(intent: TradeIntent): string {
    const amountStr = intent.amountType === 'dollars' 
      ? `$${intent.amount}` 
      : `${intent.amount} shares`;
    
    const orderTypeStr = intent.orderType === 'limit' 
      ? ` at limit price $${intent.limitPrice}` 
      : ' at market price';

    return `${intent.action.toUpperCase()} ${amountStr} of ${intent.symbol}${orderTypeStr}`;
  }

  /**
   * Preprocess user input to normalize common variations
   */
  private preprocessInput(input: string): string {
    // Keep original casing for proper nouns but normalize structure
    let normalized = input;
    
    // Add spaces around currency symbols for better parsing
    normalized = normalized.replace(/\$/g, ' $ ');
    normalized = normalized.replace(/€/g, ' € ');
    normalized = normalized.replace(/£/g, ' £ ');
    
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  /**
   * Generate conversational responses for general queries
   */
  async generateResponse(
    message: string, 
    context?: { 
      accountInfo?: any; 
      conversationHistory?: Array<{ role: string; content: string }> 
    }
  ): Promise<string> {
    try {
      const contextInfo = context?.accountInfo 
        ? `Current context: User has $${context.accountInfo.buyingPower?.toFixed(2) || 'unknown'} buying power.`
        : '';

      const conversationContext = context?.conversationHistory?.slice(-5)
        .map(msg => `${msg.role}: ${msg.content}`)
        .join('\n') || '';

      let systemPrompt = `You are a helpful trading assistant. You can help users execute trades, check their account, and answer questions about the stock market.

Keep responses concise and friendly. If asked about specific trades, remind them to use clear commands like "buy $100 of AAPL".`;

      if (contextInfo) {
        systemPrompt += `\n\n${contextInfo}`;
      }

      let userPrompt = message;
      if (conversationContext) {
        userPrompt = `Recent conversation context:\n${conversationContext}\n\nCurrent message: ${message}`;
      }

      const response = await this.anthropic.messages.create({
        model: ClaudeService.models.standard,
        max_tokens: 500,
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
        throw new LLMError('Unexpected response type from Claude');
      }

      const responseText = content.text;
      
      if (!responseText) {
        throw new LLMError('Empty response from Claude');
      }

      return responseText;
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      
      throw new LLMError('Failed to generate response with Claude', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput: message
      });
    }
  }
}