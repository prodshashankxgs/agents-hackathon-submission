export interface TradeIntent {
  id: string;
  type: 'buy' | 'sell' | 'hedge' | 'analysis' | 'recommendation' | 'custom';
  symbol: string;
  quantity?: number;
  price?: number;
  orderType?: 'market' | 'limit' | 'stop' | 'stop_limit';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  metadata?: Record<string, any>;
  context?: {
    reasoning?: string;
    confidence?: number;
    riskLevel?: 'low' | 'medium' | 'high';
  };
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  estimatedCost?: number;
  riskScore?: number;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  code: string;
  message: string;
  field?: string;
  recommendation?: string;
}

export interface ExecutionResult {
  success: boolean;
  orderId?: string;
  executedPrice?: number;
  executedQuantity?: number;
  timestamp: Date;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AccountInfo {
  accountId: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  dayTradingBuyingPower: number;
  positions: Position[];
  orders: Order[];
}

export interface Position {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  marketValue: number;
  side: 'long' | 'short';
}

export interface Order {
  id: string;
  symbol: string;
  quantity: number;
  price?: number;
  orderType: string;
  status: 'pending' | 'filled' | 'canceled' | 'rejected';
  timestamp: Date;
}

export interface MarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: Date;
  change: number;
  changePercent: number;
}

export interface TradingBroker {
  name: string;
  version: string;
  
  validateTrade(intent: TradeIntent): Promise<ValidationResult>;
  executeTrade(intent: TradeIntent): Promise<ExecutionResult>;
  
  getAccount(): Promise<AccountInfo>;
  getMarketData(symbol: string): Promise<MarketData>;
  getMarketDataBatch(symbols: string[]): Promise<MarketData[]>;
  
  isHealthy(): Promise<boolean>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export interface BrokerConfig {
  provider: string;
  apiKey: string;
  secretKey?: string;
  baseUrl?: string;
  sandbox?: boolean;
  timeout?: number;
  retries?: number;
  rateLimits?: {
    requestsPerSecond: number;
    ordersPerDay: number;
  };
  riskLimits?: {
    maxDailySpending: number;
    maxPositionSize: number;
    maxDailyTrades: number;
  };
}