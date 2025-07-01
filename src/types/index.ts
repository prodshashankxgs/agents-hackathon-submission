// Core trading types
export interface TradeIntent {
  action: 'buy' | 'sell';
  symbol: string;
  amountType: 'dollars' | 'shares';
  amount: number;
  orderType: 'market' | 'limit';
  limitPrice?: number;
}

export interface TradeValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedCost: number;
  accountBalance: number;
  currentPrice?: number;
  estimatedShares?: number;
}

export interface TradeResult {
  success: boolean;
  orderId?: string;
  executedPrice?: number;
  executedShares?: number;
  executedValue?: number;
  timestamp: Date;
  message: string;
  error?: string;
}

export interface AccountInfo {
  accountId: string;
  buyingPower: number;
  dayTradingBuyingPower?: number;
  portfolioValue: number;
  dayTradeCount: number;
  positions: Position[];
}

export interface Position {
  symbol: string;
  quantity: number;
  marketValue: number;
  costBasis: number;
  unrealizedPnL: number;
  side: 'long' | 'short';
}

export interface MarketData {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  isMarketOpen: boolean;
}

// Broker adapter interface
export interface BrokerAdapter {
  validateOrder(order: TradeIntent): Promise<TradeValidation>;
  executeOrder(order: TradeIntent): Promise<TradeResult>;
  getAccountInfo(): Promise<AccountInfo>;
  getMarketData(symbol: string): Promise<MarketData>;
  isMarketOpen(): Promise<boolean>;
  getPortfolioHistory(period?: string, timeframe?: string): Promise<any>;
}

// OpenAI function calling types
export interface OpenAIFunctionCall {
  name: string;
  arguments: string;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function';
  content: string;
  function_call?: OpenAIFunctionCall;
}

// Configuration types
export interface AppConfig {
  openaiApiKey: string;
  anthropicApiKey: string;
  alpacaApiKey: string;
  alpacaSecretKey: string;
  alpacaBaseUrl: string;
  maxDailySpending: number;
  maxPositionSize: number;
  nodeEnv: string;
  logLevel: string;
}

// CLI types
export interface CLIOptions {
  verbose?: boolean;
  dryRun?: boolean;
  interactive?: boolean;
}

// Error types
export class TradingError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'TradingError';
  }
}

export class ValidationError extends TradingError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class BrokerError extends TradingError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BROKER_ERROR', details);
    this.name = 'BrokerError';
  }
}

export class LLMError extends TradingError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'LLM_ERROR', details);
    this.name = 'LLMError';
  }
}

// Advanced trading intent types
export interface HedgeIntent {
  type: 'hedge';
  primarySymbol: string;
  hedgeReason: string;
  timeframe: string;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
}

export interface MarketAnalysisIntent {
  type: 'analysis';
  symbols: string[];
  analysisType: 'technical' | 'fundamental' | 'sentiment' | 'comprehensive';
  timeframe: string;
  focusAreas: string[];
}

export interface TradeRecommendationIntent {
  type: 'recommendation';
  scenario: string;
  symbols: string[];
  investmentAmount?: number;
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  timeframe: string;
  strategyType: 'growth' | 'value' | 'income' | 'momentum' | 'general';
}

export type AdvancedTradeIntent = 
  | (TradeIntent & { type: 'trade' })
  | HedgeIntent 
  | MarketAnalysisIntent 
  | TradeRecommendationIntent;

export interface HedgeRecommendation {
  strategy: string;
  instruments: Array<{
    type: 'option' | 'etf' | 'future' | 'stock';
    symbol: string;
    action: 'buy' | 'sell';
    quantity: number;
    reasoning: string;
  }>;
  costEstimate: number;
  riskReduction: number;
  exitConditions: string[];
  timeline: string;
}

export interface MarketAnalysis {
  symbol: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  riskFactors: string[];
  opportunities: string[];
  priceTarget: number;
  recommendation: 'buy' | 'sell' | 'hold';
  reasoning: string;
} 