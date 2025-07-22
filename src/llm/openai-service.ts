import OpenAI from 'openai';
import { config } from '../config';
import { z } from 'zod';
import { TradeIntent, TradeIntentSchema, LLMError } from '../types';
import { cacheService } from '../cache/cache-service';

export class OpenAIService {
  private openai: OpenAI;

  // Static OpenAI chat configuration for trade parsing to avoid re-creation per request
  private static readonly tradeParsingTools: OpenAI.ChatCompletionTool[] = [{
    type: 'function',
    function: {
      name: 'execute_trade',
      description: 'Execute a stock trade based on user input',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['buy', 'sell'], description: 'Whether to buy or sell the stock' },
          symbol: { type: 'string', description: 'The stock ticker symbol (e.g., AAPL, MSFT, GOOGL)' },
          amount_type: { type: 'string', enum: ['dollars', 'shares'], description: 'Whether the amount is in dollars or number of shares' },
          amount: { type: 'number', description: 'The amount to trade (either dollars or shares based on amount_type)' },
          order_type: { type: 'string', enum: ['market', 'limit'], default: 'market', description: 'The type of order to place' },
          limit_price: { type: 'number', description: 'The limit price for limit orders (required if order_type is limit)' }
        },
        required: ['action', 'symbol', 'amount_type', 'amount']
      }
    }
  }];

  private static readonly tradeParsingSystemMessage: string = `You are a trading assistant that parses natural language trading commands.
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

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
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
          content: `You are a trading assistant that parses natural language trading commands.
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

Always prioritize understanding the user's intent over strict pattern matching.`
        },
        {
          role: 'user',
          content: normalizedInput
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        tools,
        tool_choice: { type: 'function', function: { name: 'execute_trade' } },
        temperature: 0.1,
        max_tokens: 500
      });

      const message = response.choices[0]?.message;
      
      if (!message?.tool_calls?.[0]) {
        // If no tool call, try to understand why
        const content = message?.content || '';
        let errorMessage = 'Could not parse trading intent from input';
        
        if (content.toLowerCase().includes('unclear') || content.toLowerCase().includes('ambiguous')) {
          errorMessage = 'Your trade request was ambiguous. Please specify the action (buy/sell), amount, and stock symbol clearly.';
        }
        
        throw new LLMError(errorMessage, {
          userInput,
          normalizedInput,
          response: content
        });
      }

      const toolCall = message.tool_calls[0];
      
      if (toolCall.function.name !== 'execute_trade') {
        throw new LLMError('Unexpected function call', {
          functionName: toolCall.function.name
        });
      }

      const args = JSON.parse(toolCall.function.arguments);

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
        const errorMessage = `Invalid trade parameters: ${error.errors.map(e => e.message).join(', ')}`;
        throw new LLMError(errorMessage, {
          validationErrors: error.format(),
          userInput
        });
      }

      if (error instanceof LLMError) {
        throw error;
      }
      
      throw new LLMError('Failed to parse trade intent', {
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

      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: 'system',
          content: `You are a helpful trading assistant. You can help users execute trades, check their account, and answer questions about the stock market.

Keep responses concise and friendly. If asked about specific trades, remind them to use clear commands like "buy $100 of AAPL".

${contextInfo}`
        }
      ];

      // Add conversation history if available
      if (conversationContext) {
        messages.push({
          role: 'assistant',
          content: `Recent conversation context:\n${conversationContext}`
        });
      }

      messages.push({
        role: 'user',
        content: message
      });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.1,
        max_tokens: 500
      });

      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        throw new LLMError('Empty response from OpenAI');
      }

      return content;
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      
      throw new LLMError('Failed to generate response', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput: message
      });
    }
  }
} 