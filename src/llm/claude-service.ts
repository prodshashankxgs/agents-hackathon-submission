import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { TradeIntent, LLMError } from '../types';

export class ClaudeService {
  private anthropic: Anthropic;

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
      
      const prompt = `You are a trading assistant that parses natural language trading commands.
Convert user input into structured trade parameters.

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

User input: "${normalizedInput}"

Respond with a JSON object containing:
{
  "action": "buy" or "sell",
  "symbol": "TICKER_SYMBOL",
  "amount_type": "dollars" or "shares",
  "amount": number,
  "order_type": "market" or "limit",
  "limit_price": number (only if order_type is "limit")
}

If you cannot parse the input, respond with:
{
  "error": "explanation of what went wrong"
}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (!response.content || response.content.length === 0) {
        throw new LLMError('Empty response from Claude');
      }

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new LLMError('Unexpected response type from Claude');
      }

      const textContent = content as { type: 'text'; text: string };
      const result = JSON.parse(textContent.text);
      
      if (result.error) {
        throw new LLMError(result.error, {
          userInput,
          normalizedInput,
          response: textContent.text
        });
      }

      // Map the response to TradeIntent
      const tradeIntent: TradeIntent = {
        action: result.action,
        symbol: result.symbol.toUpperCase(),
        amountType: result.amount_type,
        amount: result.amount,
        orderType: result.order_type || 'market',
        limitPrice: result.limit_price
      };

      // Validate the parsed intent
      this.validateTradeIntent(tradeIntent);

      return tradeIntent;
    } catch (error) {
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
   * Validate the parsed trade intent
   */
  private validateTradeIntent(intent: TradeIntent): void {
    if (!intent.symbol || intent.symbol.length === 0) {
      throw new LLMError('Invalid stock symbol');
    }

    if (intent.amount <= 0) {
      throw new LLMError('Trade amount must be greater than zero');
    }

    if (intent.orderType === 'limit' && !intent.limitPrice) {
      throw new LLMError('Limit price is required for limit orders');
    }

    if (intent.limitPrice && intent.limitPrice <= 0) {
      throw new LLMError('Limit price must be greater than zero');
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

      const prompt = `You are a helpful trading assistant. You can help users execute trades, check their account, and answer questions about the stock market.

Keep responses concise and friendly. If asked about specific trades, remind them to use clear commands like "buy $100 of AAPL".

${contextInfo}

${conversationContext ? `Recent conversation:\n${conversationContext}\n` : ''}

User: ${message}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      });

      if (!response.content || response.content.length === 0) {
        throw new LLMError('Empty response from Claude');
      }

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new LLMError('Unexpected response type from Claude');
      }

      const textContent = content as { type: 'text'; text: string };
      return textContent.text;
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