import OpenAI from 'openai';
import { config } from '../config';
import { z } from 'zod';
import { TradeIntent, TradeIntentSchema, LLMError } from '../types';

/**
 * Unified LLM Trade Processor
 * 
 * Replaces the multi-tier parsing approach with a single, optimized
 * GPT-4o-mini based system that handles all buy/sell command processing
 * efficiently and accurately.
 */
export class UnifiedTradeProcessor {
  private openai: OpenAI;
  private cache: Map<string, { intent: TradeIntent; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
  }

  /**
   * Process any natural language trading command with optimal efficiency
   */
  async processTradeCommand(input: string): Promise<{
    intent: TradeIntent;
    confidence: number;
    processingTime: number;
    cached: boolean;
  }> {
    const startTime = Date.now();
    const normalizedInput = this.normalizeInput(input);
    const cacheKey = this.createCacheKey(normalizedInput);

    // Check cache first for repeated commands
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return {
        intent: cached,
        confidence: 1.0,
        processingTime: Date.now() - startTime,
        cached: true
      };
    }

    try {
      const intent = await this.parseWithLLM(normalizedInput);
      
      // Cache successful parse
      this.setCache(cacheKey, intent);
      
      return {
        intent,
        confidence: 0.95,
        processingTime: Date.now() - startTime,
        cached: false
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
  private async parseWithLLM(input: string): Promise<TradeIntent> {
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
  private getFromCache(key: string): TradeIntent | null {
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
  private setCache(key: string, intent: TradeIntent): void {
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
   * Batch process multiple commands for efficiency
   */
  async batchProcessCommands(inputs: string[]): Promise<Array<{
    input: string;
    intent?: TradeIntent;
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