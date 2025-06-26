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
  primaryPosition: {
    symbol: string;
    currentValue?: number;
    shares?: number;
  };
  hedgeReason: string;
  timeframe?: string;
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
}

export interface MarketAnalysisIntent {
  type: 'analysis';
  symbols: string[];
  analysisType: 'fundamental' | 'technical' | 'sentiment' | 'risk';
  context?: string;
  timeframe?: string;
}

export interface TradeRecommendationIntent {
  type: 'recommendation';
  scenario: string;
  constraints?: {
    maxRisk?: number;
    sectors?: string[];
    excludeSymbols?: string[];
  };
}

export type AdvancedTradeIntent = 
  | (TradeIntent & { type: 'trade' })
  | HedgeIntent 
  | MarketAnalysisIntent 
  | TradeRecommendationIntent;

export interface HedgeRecommendation {
  strategy: string;
  instruments: Array<{
    symbol: string;
    action: 'buy' | 'sell';
    quantity: number;
    rationale: string;
  }>;
  estimatedCost: number;
  riskReduction: string;
  explanation: string;
}

export interface MarketAnalysis {
  symbol: string;
  currentPrice: number;
  analysis: {
    sentiment: 'bullish' | 'bearish' | 'neutral';
    riskFactors: string[];
    opportunities: string[];
    recommendation: string;
  };
  relatedNews?: Array<{
    title: string;
    summary: string;
    impact: 'positive' | 'negative' | 'neutral';
  }>;
} 