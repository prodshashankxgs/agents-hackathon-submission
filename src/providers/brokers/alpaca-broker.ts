import { 
  TradingBroker, 
  BrokerConfig, 
  TradeIntent, 
  ValidationResult, 
  ExecutionResult, 
  AccountInfo, 
  MarketData 
} from '../../core/interfaces';
import { BaseTradingBroker } from '../../core/factories/trading-broker.factory';

export class AlpacaBroker extends BaseTradingBroker {
  name = 'alpaca';
  version = '1.0.0';

  constructor(config: BrokerConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://paper-api.alpaca.markets/v2'
    });
    this.validateConfig();
  }

  async validateTrade(intent: TradeIntent): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];

    try {
      // Check risk limits
      const riskCheck = this.checkRiskLimits(intent);
      if (!riskCheck.passed) {
        errors.push(...riskCheck.errors.map(error => ({
          code: 'RISK_LIMIT_EXCEEDED',
          message: error,
          severity: 'error' as const
        })));
      }

      // Validate symbol
      if (!intent.symbol || intent.symbol.length === 0) {
        errors.push({
          code: 'INVALID_SYMBOL',
          message: 'Symbol is required',
          field: 'symbol',
          severity: 'error' as const
        });
      }

      // Validate quantity
      if (intent.quantity && intent.quantity <= 0) {
        errors.push({
          code: 'INVALID_QUANTITY',
          message: 'Quantity must be positive',
          field: 'quantity',
          severity: 'error' as const
        });
      }

      // Get account info for validation
      const account = await this.getAccount();
      
      // Check buying power
      if (intent.type === 'buy' && intent.quantity && intent.price) {
        const estimatedCost = intent.quantity * intent.price;
        if (estimatedCost > account.buyingPower) {
          errors.push({
            code: 'INSUFFICIENT_BUYING_POWER',
            message: `Insufficient buying power. Required: $${estimatedCost}, Available: $${account.buyingPower}`,
            severity: 'error' as const
          });
        }
      }

      // Check if we have position for sell orders
      if (intent.type === 'sell' && intent.quantity) {
        const position = account.positions.find(p => p.symbol === intent.symbol);
        if (!position || position.quantity < intent.quantity) {
          errors.push({
            code: 'INSUFFICIENT_POSITION',
            message: `Insufficient position. Required: ${intent.quantity}, Available: ${position?.quantity || 0}`,
            severity: 'error' as const
          });
        }
      }

      // Market data validation
      try {
        const marketData = await this.getMarketData(intent.symbol);
        if (!marketData) {
          warnings.push({
            code: 'NO_MARKET_DATA',
            message: 'No market data available for symbol',
            recommendation: 'Verify symbol is valid and markets are open'
          });
        }
      } catch (error) {
        warnings.push({
          code: 'MARKET_DATA_ERROR',
          message: 'Unable to retrieve market data',
          recommendation: 'Check symbol validity'
        });
      }

      const result: ValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings
      };
      
      if (intent.quantity && intent.price) {
        result.estimatedCost = intent.quantity * intent.price;
      }
      
      return result;

    } catch (error) {
      return {
        isValid: false,
        errors: [{
          code: 'VALIDATION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown validation error',
          severity: 'error' as const
        }],
        warnings: []
      };
    }
  }

  async executeTrade(intent: TradeIntent): Promise<ExecutionResult> {
    try {
      const orderData = this.buildOrderData(intent);
      
      const response = await this.makeRequest('/orders', orderData);
      
      return {
        success: true,
        orderId: response.id,
        executedPrice: response.filled_avg_price,
        executedQuantity: response.filled_qty,
        timestamp: new Date(response.created_at),
        metadata: {
          status: response.status,
          orderType: response.order_type,
          timeInForce: response.time_in_force
        }
      };
      
    } catch (error) {
      return {
        success: false,
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown execution error'
      };
    }
  }

  async getAccount(): Promise<AccountInfo> {
    const [account, positions, orders] = await Promise.all([
      this.makeRequest('/account', {}, { timeout: 10000 }),
      this.makeRequest('/positions', {}, { timeout: 10000 }),
      this.makeRequest('/orders', {}, { timeout: 10000 })
    ]);

    return {
      accountId: account.id,
      buyingPower: parseFloat(account.buying_power),
      cash: parseFloat(account.cash),
      portfolioValue: parseFloat(account.portfolio_value),
      dayTradingBuyingPower: parseFloat(account.daytrading_buying_power),
      positions: positions.map((pos: any) => ({
        symbol: pos.symbol,
        quantity: parseFloat(pos.qty),
        averagePrice: parseFloat(pos.avg_cost),
        currentPrice: parseFloat(pos.market_value) / parseFloat(pos.qty),
        unrealizedPnL: parseFloat(pos.unrealized_pl),
        marketValue: parseFloat(pos.market_value),
        side: parseFloat(pos.qty) > 0 ? 'long' as const : 'short' as const
      })),
      orders: orders.map((order: any) => ({
        id: order.id,
        symbol: order.symbol,
        quantity: parseFloat(order.qty),
        price: order.limit_price ? parseFloat(order.limit_price) : undefined,
        orderType: order.order_type,
        status: this.mapOrderStatus(order.status),
        timestamp: new Date(order.created_at)
      }))
    };
  }

  async getMarketData(symbol: string): Promise<MarketData> {
    try {
      const response = await this.makeRequest(`/stocks/${symbol}/quotes/latest`, {});
      
      return {
        symbol,
        price: (response.quote.bid_price + response.quote.ask_price) / 2,
        bid: response.quote.bid_price,
        ask: response.quote.ask_price,
        volume: response.quote.bid_size + response.quote.ask_size,
        timestamp: new Date(response.quote.timestamp),
        change: 0, // Would need historical data
        changePercent: 0 // Would need historical data
      };
    } catch (error) {
      throw new Error(`Failed to get market data for ${symbol}: ${error}`);
    }
  }

  async getMarketDataBatch(symbols: string[]): Promise<MarketData[]> {
    const results = await Promise.allSettled(
      symbols.map(symbol => this.getMarketData(symbol))
    );

    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<MarketData>).value);
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/account', {}, { timeout: 5000, retries: 1 });
      return response && response.id;
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    // Alpaca doesn't require explicit connection, but we can validate credentials
    const healthy = await this.isHealthy();
    if (!healthy) {
      throw new Error('Failed to connect to Alpaca API');
    }
  }

  async disconnect(): Promise<void> {
    // Alpaca doesn't require explicit disconnection
  }

  private buildOrderData(intent: TradeIntent): any {
    const orderData: any = {
      symbol: intent.symbol,
      qty: intent.quantity,
      side: intent.type === 'buy' ? 'buy' : 'sell',
      type: intent.orderType || 'market',
      time_in_force: intent.timeInForce || 'day'
    };

    if (intent.price && intent.orderType !== 'market') {
      orderData.limit_price = intent.price;
    }

    return orderData;
  }

  private mapOrderStatus(status: string): 'pending' | 'filled' | 'canceled' | 'rejected' {
    switch (status) {
      case 'filled':
        return 'filled';
      case 'canceled':
        return 'canceled';
      case 'rejected':
        return 'rejected';
      default:
        return 'pending';
    }
  }

  protected async makeRequest(endpoint: string, data: any, options: any = {}): Promise<any> {
    const { timeout = this.config.timeout || 30000, retries = this.config.retries || 3 } = options;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const url = `${this.config.baseUrl}${endpoint}`;
        const method = Object.keys(data).length > 0 ? 'POST' : 'GET';
        
        const fetchOptions: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'APCA-API-KEY-ID': this.config.apiKey,
            'APCA-API-SECRET-KEY': this.config.secretKey!
          },
          signal: controller.signal
        };
        
        if (method === 'POST') {
          fetchOptions.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, fetchOptions);

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }
}