import
  OpenAI from 'openai';
import { config } from '../config';
import { z } from 'zod';
import { TradeIntent, TradeIntentSchema, LLMError, OptionsTradeIntent, OptionsTradeIntentSchema, UnifiedTradeIntent } from '../types';

/**
 * Unified LLM Trade Processor
 * 
 * Optimized LLM-based system that handles all buy/sell command processing
 * efficiently and accurately. Now supports both stocks and options trading
 * with multi-LLM provider support (OpenAI + Anthropic Claude).
 */
export class UnifiedTradeProcessor {
  private openai: OpenAI;
  private cache: Map<string, { intent: UnifiedTradeIntent; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Process any natural language trading command with optimal efficiency
   * Supports both stocks and options trading
   */
  async processTradeCommand(input: string): Promise<{
    intent: UnifiedTradeIntent;
    confidence: number;
    processingTime: number;
    cached: boolean;
    tradeType: 'stock' | 'option';
  }> {
    
    const startTime = Date.now();
    const normalizedInput = this.normalizeInput(input);
    const cacheKey = this.createCacheKey(normalizedInput);

    // Check the cache first for repeated commands
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        intent: cached,
        confidence: 1.0,
        processingTime: Date.now() - startTime,
        cached: true,
        tradeType: this.isOptionsIntent(cached) ? 'option' : 'stock'
      };
    }

    try {
      // Determine if this is likely an options command
      const isLikelyOptions = this.detectOptionsIntent(normalizedInput);
      
      let intent: UnifiedTradeIntent;
      
      if (isLikelyOptions) {
        intent = await this.parseOptionsWithLLM(normalizedInput);
      } else {
        intent = await this.parseWithLLM(normalizedInput);
      }
      
      // Cache successful parse
      this.setCache(cacheKey, intent);
      
      return {
        intent,
        confidence: 0.95,
        processingTime: Date.now() - startTime,
        cached: false,
        tradeType: this.isOptionsIntent(intent) ? 'option' : 'stock'
      };
    } catch (error) {
      throw new LLMError('Failed to process trade command', {
        originalInput: input,
        normalizedInput,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Optimized LLM parsing with enhanced system prompt
   */
  private async parseWithLLM(input: string): Promise<UnifiedTradeIntent> {
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
              pattern: '^[A-Z]{1,5}$',
              description: 'The stock ticker symbol (e.g., AAPL, MSFT, GOOGL)'
            },
            amount_type: {
              type: 'string',
              enum: ['dollars', 'shares'],
              description: 'Whether the amount is in dollars or number of shares'
            },
            amount: {
              type: 'number',
              minimum: 0.01,
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
              minimum: 0.01,
              description: 'The limit price for limit orders (required if order_type is limit)'
            }
          },
          required: ['action', 'symbol', 'amount_type', 'amount']
        }
      }
    }];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `You are an expert trading command parser. Convert natural language to structured trade parameters using the execute_trade function.

PARSING RULES:
1. Stock Symbols: Accept company names or tickers. Convert to uppercase ticker symbols.
   - Common mappings: Apple→AAPL, Microsoft→MSFT, Google→GOOGL, Tesla→TSLA, Amazon→AMZN
   - Handle variations: "apple stock", "msft shares", "Google"

2. Actions: Identify buy/sell intent from context
   - Buy: buy, purchase, get, acquire, invest, pick up, go long
   - Sell: sell, dump, exit, liquidate, close, get rid of, go short

3. Amounts: Distinguish between dollar amounts and share quantities
   - Dollar: $100, 100 dollars, 100 bucks, 100 usd → amount_type: "dollars"
   - Shares: 100 shares, 100 stocks, 100 units → amount_type: "shares"
   - Context clues: "worth of" suggests dollars, standalone numbers often mean shares

4. Order Types: Default to market unless limit price specified
   - Limit indicators: "at $X", "limit $X", "when it hits $X"

5. Handle variations and typos intelligently
   - Natural language: "I want to buy one hundred dollars of Apple"
   - Abbreviations: "buy 100 AAPL", "sell 50 TSLA"
   - Conversational: "get me some Microsoft stock for 200 bucks"

Be precise but flexible. Always extract the most likely intent.`
      }, {
        role: 'user',
        content: input
      }],
      tools,
      tool_choice: { type: 'function', function: { name: 'execute_trade' } },
      temperature: 0.1,
      max_tokens: 300
    });

    const message = response.choices[0]?.message;
    
    if (!message?.tool_calls?.[0]) {
      throw new LLMError('Unable to parse trade command - please specify action, symbol, and amount clearly');
    }

    const toolCall = message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    // Enhanced validation with error messages
    const tradeIntent = TradeIntentSchema.parse({
      action: args.action,
      symbol: args.symbol?.toUpperCase(),
      amountType: args.amount_type,
      amount: args.amount,
      orderType: args.order_type || 'market',
      limitPrice: args.limit_price,
    });

    // Additional business logic validation
    this.validateBusinessRules(tradeIntent);

    return tradeIntent;
  }

  /**
   * Parse options trading commands with LLM
   */
  private async parseOptionsWithLLM(input: string): Promise<OptionsTradeIntent> {
    const tools: OpenAI.ChatCompletionTool[] = [{
      type: 'function',
      function: {
        name: 'execute_options_trade',
        description: 'Execute an options trade based on user input',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['buy_to_open', 'sell_to_open', 'buy_to_close', 'sell_to_close'],
              description: 'The options action: buy_to_open (open long position), sell_to_open (open short position), buy_to_close (close short position), sell_to_close (close long position)'
            },
            underlying: {
              type: 'string',
              pattern: '^[A-Z]{1,5}$',
              description: 'The underlying stock ticker symbol (e.g., AAPL, MSFT, GOOGL)'
            },
            contract_type: {
              type: 'string',
              enum: ['call', 'put'],
              description: 'The type of option contract'
            },
            strike_price: {
              type: 'number',
              minimum: 0.01,
              description: 'The strike price of the option'
            },
            expiration_date: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}-\\d{2}$',
              description: 'The expiration date in YYYY-MM-DD format'
            },
            quantity: {
              type: 'number',
              minimum: 1,
              description: 'The number of option contracts'
            },
            order_type: {
              type: 'string',
              enum: ['market', 'limit'],
              default: 'market',
              description: 'The type of order to place'
            },
            limit_price: {
              type: 'number',
              minimum: 0.01,
              description: 'The limit price for limit orders (required if order_type is limit)'
            },
            strategy: {
              type: 'string',
              enum: ['single_leg', 'covered_call', 'cash_secured_put', 'protective_put', 'collar', 'iron_condor', 'butterfly', 'straddle', 'strangle'],
              default: 'single_leg',
              description: 'The options strategy being implemented'
            }
          },
          required: ['action', 'underlying', 'contract_type', 'strike_price', 'expiration_date', 'quantity']
        }
      }
    }];

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'system',
        content: `You are an expert options trading command parser. Convert natural language to structured options trade parameters using the execute_options_trade function.

PARSING RULES FOR OPTIONS:

1. Underlying Symbols: Accept company names or tickers. Convert to uppercase ticker symbols.
   - Common mappings: Apple→AAPL, Microsoft→MSFT, Google→GOOGL, Tesla→TSLA, Amazon→AMZN

2. Options Actions: Identify the specific options action from context
   - Opening long positions: "buy", "buy to open", "long", "purchase" → buy_to_open
   - Opening short positions: "sell", "sell to open", "short", "write" → sell_to_open  
   - Closing long positions: "sell to close", "close long", "exit long" → sell_to_close
   - Closing short positions: "buy to close", "close short", "cover" → buy_to_close

3. Contract Types: Identify call or put options
   - Calls: "call", "call option", bullish sentiment
   - Puts: "put", "put option", bearish sentiment

4. Strike Prices: Extract numerical strike price
   - "$150 strike", "150 strike", "strike 150" → 150
   - Handle decimals: "$150.50 strike" → 150.50

5. Expiration Dates: Parse various date formats
   - "January 15, 2024" → 2024-01-15
   - "Jan 15" → current year, 2024-01-15
   - "15 Jan 2024" → 2024-01-15
   - "next Friday" → calculate next Friday's date
   - "weekly" or "0DTE" → nearest Friday
   - "monthly" → third Friday of next month

6. Quantity: Default to 1 contract if not specified
   - "10 contracts", "10 options" → 10
   - No quantity specified → 1

7. Order Types: Default to market unless limit price specified
   - "at $5", "limit $5", "for $5" → limit order with limit_price: 5

8. Common Options Strategies:
   - "covered call" → sell_to_open call + indicate strategy
   - "cash secured put" → sell_to_open put + indicate strategy
   - "protective put" → buy_to_open put + indicate strategy

Handle natural language variations and be intelligent about context.

Examples:
- "Buy AAPL 150 call expiring next Friday" → buy_to_open AAPL call, strike 150, next Friday
- "Sell to open TSLA 250 put for January 15" → sell_to_open TSLA put, strike 250, 2024-01-15
- "Close my MSFT 300 call position" → sell_to_close MSFT call, strike 300`
      }, {
        role: 'user',
        content: input
      }],
      tools,
      tool_choice: { type: 'function', function: { name: 'execute_options_trade' } },
      temperature: 0.1,
      max_tokens: 500
    });

    const message = response.choices[0]?.message;
    
    if (!message?.tool_calls?.[0]) {
      throw new LLMError('Unable to parse options command - please specify action, underlying, contract type, strike, and expiration clearly');
    }

    const toolCall = message.tool_calls[0];
    const args = JSON.parse(toolCall.function.arguments);

    // Validate and transform the response
    try {
      const optionsIntent: OptionsTradeIntent = {
        action: args.action,
        underlying: args.underlying?.toUpperCase(),
        contractType: args.contract_type,
        strikePrice: args.strike_price,
        expirationDate: args.expiration_date,
        quantity: args.quantity,
        orderType: args.order_type || 'market',
        limitPrice: args.limit_price,
        strategy: args.strategy || 'single_leg'
      };

      // Validate using Zod schema
      const validated = OptionsTradeIntentSchema.parse(optionsIntent);
      return validated;
    } catch (validationError) {
      throw new LLMError('Invalid options trade parameters extracted from command', {
        extractedArgs: args,
        validationError: validationError instanceof Error ? validationError.message : 'Unknown validation error'
      });
    }
  }

  /**
   * Detect if input is likely referring to options trading
   */
  private detectOptionsIntent(input: string): boolean {
    const optionsKeywords = [
      'call', 'put', 'option', 'strike', 'expiration', 'expiry', 'exp',
      'buy to open', 'sell to open', 'buy to close', 'sell to close',
      'covered call', 'cash secured put', 'protective put', 'collar',
      'iron condor', 'butterfly', 'straddle', 'strangle', 'spread'
    ];
    
    const lowerInput = input.toLowerCase();
    return optionsKeywords.some(keyword => lowerInput.includes(keyword));
  }

  /**
   * Check if an intent is an options intent
   */
  private isOptionsIntent(intent: UnifiedTradeIntent): boolean {
    return 'contractType' in intent;
  }

  /**
   * Validate business rules for trades
   */
  private validateBusinessRules(intent: TradeIntent): void {
    // Validate symbol format
    if (!/^[A-Z]{1,5}$/.test(intent.symbol)) {
      throw new LLMError(`Invalid stock symbol: ${intent.symbol}. Use 1-5 letter ticker symbols.`);
    }

    // Validate amounts
    if (intent.amountType === 'shares' && !Number.isInteger(intent.amount)) {
      intent.amount = Math.round(intent.amount);
    }

    if (intent.amountType === 'dollars' && intent.amount < 1) {
      throw new LLMError('Minimum trade amount is $1');
    }

    if (intent.amountType === 'shares' && intent.amount < 1) {
      throw new LLMError('Must trade at least 1 share');
    }

    // Validate limit orders
    if (intent.orderType === 'limit' && !intent.limitPrice) {
      throw new LLMError('Limit orders require a limit price');
    }

    if (intent.limitPrice && intent.limitPrice <= 0) {
      throw new LLMError('Limit price must be greater than 0');
    }
  }

  /**
   * Normalize input for consistent processing
   */
  private normalizeInput(input: string): string {
    return input
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[""'']/g, '"') // Normalize quotes
      .toLowerCase();
  }

  /**
   * Create cache key from normalized input
   */
  private createCacheKey(input: string): string {
    return Buffer.from(input).toString('base64');
  }

  /**
   * Get from cache if not expired
   */
  private getFromCache(key: string): UnifiedTradeIntent | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.intent;
  }

  /**
   * Set cache with timestamp
   */
  private setCache(key: string, intent: UnifiedTradeIntent): void {
    this.cache.set(key, {
      intent,
      timestamp: Date.now()
    });

    // Clean old cache entries periodically
    if (this.cache.size > 100) {
      this.cleanCache();
    }
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Generate human-readable summary of trade intent
   */
  generateTradeSummary(intent: UnifiedTradeIntent): string {
    if (this.isOptionsIntent(intent)) {
      const optionsIntent = intent as OptionsTradeIntent;
      const quantityStr = optionsIntent.quantity > 1 ? `${optionsIntent.quantity} contracts` : '1 contract';
      const orderTypeStr = optionsIntent.orderType === 'limit' 
        ? ` at limit price $${optionsIntent.limitPrice}` 
        : ' at market price';

      return `${optionsIntent.action.toUpperCase()} ${quantityStr} of ${optionsIntent.underlying} ${optionsIntent.contractType.toUpperCase()} ${optionsIntent.strikePrice} expiring ${optionsIntent.expirationDate}${orderTypeStr}`;
    } else {
      const stockIntent = intent as TradeIntent;
      const amountStr = stockIntent.amountType === 'dollars' 
        ? `$${stockIntent.amount}` 
        : `${stockIntent.amount} shares`;
      
      const orderTypeStr = stockIntent.orderType === 'limit' 
        ? ` at limit price $${stockIntent.limitPrice}` 
        : ' at market price';

      return `${stockIntent.action.toUpperCase()} ${amountStr} of ${stockIntent.symbol}${orderTypeStr}`;
    }
  }

  /**
   * Batch process multiple commands for efficiency
   */
  async batchProcessCommands(inputs: string[]): Promise<Array<{
    input: string;
    intent?: UnifiedTradeIntent;
    error?: string;
    processingTime: number;
  }>> {
    const results = await Promise.allSettled(
      inputs.map(async (input) => {
        const startTime = Date.now();
        try {
          const result = await this.processTradeCommand(input);
          return {
            input,
            intent: result.intent,
            processingTime: Date.now() - startTime
          };
        } catch (error) {
          return {
            input,
            error: error instanceof Error ? error.message : 'Unknown error',
            processingTime: Date.now() - startTime
          };
        }
      })
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          input: inputs[index] || '',
          error: result.reason?.message || 'Processing failed',
          processingTime: 0
        };
      }
    });
  }

  /**
   * Get processing statistics
   */
  getStats(): {
    cacheSize: number;
    cacheHitRate: number; // Would need to track hits/misses in practice
    averageProcessingTime: number; // Would need to track in practice
  } {
    return {
      cacheSize: this.cache.size,
      cacheHitRate: 0, // Placeholder - would track in production
      averageProcessingTime: 0 // Placeholder - would track in production
    };
  }

  /**
   * Clear cache manually if needed
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Preload common patterns into cache for faster response
   */
  async preloadCommonPatterns(): Promise<void> {
    const commonPatterns = [
      'buy 100 shares of AAPL',
      'buy $1000 of TSLA', 
      'sell 50 shares of MSFT',
      'buy $500 worth of Amazon',
      'sell all GOOGL',
      'purchase 25 shares of NVDA'
    ];

    await Promise.all(
      commonPatterns.map(pattern => 
        this.processTradeCommand(pattern).catch(() => {
          // Ignore preload errors
        })
      )
    );
  }
}