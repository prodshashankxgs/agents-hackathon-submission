import { 
  IntentPlugin, 
  IntentProcessor, 
  IntentValidator, 
  IntentSchema, 
  TradeIntent 
} from '../core/interfaces';

interface BasicTradeData {
  type: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  price?: number;
  orderType?: 'market' | 'limit';
}

class BasicTradeProcessor implements IntentProcessor<BasicTradeData> {
  async process(data: BasicTradeData, context?: any): Promise<TradeIntent> {
    const tradeIntent: TradeIntent = {
      id: `trade-${Date.now()}`,
      type: data.type,
      symbol: data.symbol.toUpperCase(),
      quantity: data.quantity,
      orderType: data.orderType || 'market',
      timeInForce: 'day',
      context: {
        reasoning: 'Basic trade execution',
        confidence: 0.8,
        riskLevel: 'medium'
      }
    };
    
    if (data.price !== undefined) {
      tradeIntent.price = data.price;
    }
    
    return tradeIntent;
  }

  validate(data: BasicTradeData): boolean {
    return !!(data.type && data.symbol && data.quantity > 0);
  }

  transform(data: BasicTradeData): TradeIntent {
    const tradeIntent: TradeIntent = {
      id: `trade-${Date.now()}`,
      type: data.type,
      symbol: data.symbol.toUpperCase(),
      quantity: data.quantity,
      orderType: data.orderType || 'market'
    };
    
    if (data.price !== undefined) {
      tradeIntent.price = data.price;
    }
    
    return tradeIntent;
  }
}

class BasicTradeValidator implements IntentValidator<BasicTradeData> {
  validate(data: BasicTradeData): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!data.type || !['buy', 'sell'].includes(data.type)) {
      errors.push('Invalid trade type. Must be "buy" or "sell"');
    }

    if (!data.symbol || data.symbol.length === 0) {
      errors.push('Symbol is required');
    }

    if (!data.quantity || data.quantity <= 0) {
      errors.push('Quantity must be positive');
    }

    if (data.price && data.price <= 0) {
      errors.push('Price must be positive');
    }

    if (data.orderType && !['market', 'limit'].includes(data.orderType)) {
      warnings.push('Unknown order type, defaulting to market');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  sanitize(data: BasicTradeData): BasicTradeData {
    const sanitized: BasicTradeData = {
      type: data.type,
      symbol: data.symbol.toUpperCase().trim(),
      quantity: Math.abs(data.quantity),
      orderType: data.orderType || 'market'
    };
    
    if (data.price !== undefined && data.price > 0) {
      sanitized.price = data.price;
    }
    
    return sanitized;
  }
}

export class BasicTradePlugin implements IntentPlugin<BasicTradeData> {
  type = 'basic_trade';
  version = '1.0.0';
  description = 'Handles basic buy/sell trading commands';
  priority = 50;
  enabled = true;

  schema: IntentSchema<BasicTradeData> = {
    type: 'basic_trade',
    description: 'Parse basic trading commands like "buy 100 shares of AAPL"',
    validator: (data: any) => {
      const validator = new BasicTradeValidator();
      const validated = validator.validate(data);
      if (!validated.isValid) {
        throw new Error(validated.errors.join(', '));
      }
      return validator.sanitize(data);
    },
    promptTemplate: `
Parse the following trading command and extract the trade details:
"{input}"

Extract:
- type: "buy" or "sell"
- symbol: the stock symbol
- quantity: number of shares
- price: limit price (if specified)
- orderType: "market" or "limit"

Return JSON with these fields.
    `,
    examples: [
      { type: 'buy', symbol: 'AAPL', quantity: 100, orderType: 'market' },
      { type: 'sell', symbol: 'TSLA', quantity: 50, price: 250, orderType: 'limit' }
    ]
  };

  processor = new BasicTradeProcessor();
  validator = new BasicTradeValidator();

  canHandle(input: string): boolean {
    const lowerInput = input.toLowerCase();
    return (
      (lowerInput.includes('buy') || lowerInput.includes('sell')) &&
      /\b[A-Z]{1,5}\b/.test(input) && // Contains a stock symbol pattern
      /\d+/.test(input) // Contains a number (quantity)
    );
  }

  getComplexity(input: string): number {
    // Simple complexity scoring
    let complexity = 10; // Base complexity
    
    if (input.toLowerCase().includes('limit')) complexity += 5;
    if (input.toLowerCase().includes('stop')) complexity += 10;
    if (input.split(' ').length > 10) complexity += 5;
    
    return complexity;
  }

  getEstimatedCost(input: string): number {
    // Estimated cost in tokens
    return Math.max(50, input.length * 0.5);
  }

  async initialize(): Promise<void> {
    // Plugin initialization logic
  }

  async cleanup(): Promise<void> {
    // Plugin cleanup logic
  }
}