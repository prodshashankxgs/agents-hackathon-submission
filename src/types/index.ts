import { z } from 'zod';

// Core trading types

// Zod schema for TradeIntent, providing runtime validation
export const TradeIntentSchema = z.object({
  action: z.enum(['buy', 'sell']),
  symbol: z.string().min(1, 'Symbol cannot be empty.').max(10, 'Symbol is too long.'),
  amountType: z.enum(['dollars', 'shares']),
  amount: z.number().positive('Amount must be a positive number.'),
  orderType: z.enum(['market', 'limit']),
  limitPrice: z.number().positive('Limit price must be a positive number.').optional(),
}).refine(data => {
  // Custom validation: if orderType is 'limit', limitPrice must be provided.
  if (data.orderType === 'limit') {
    return typeof data.limitPrice === 'number';
  }
  return true;
}, {
  message: 'Limit price is required for limit orders.',
  path: ['limitPrice'],
});

// Infer the TypeScript type from the Zod schema
export type TradeIntent = z.infer<typeof TradeIntentSchema>;

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
  quiverApiKey: string;
  perplexityApiKey: string;
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

export interface ThirteenFIntent {
  type: '13f';
  institution: string;
  action: 'query' | 'invest';
  investmentAmount?: number;
}



export type AdvancedTradeIntent = 
  | (TradeIntent & { type: 'trade' })
  | HedgeIntent 
  | MarketAnalysisIntent 
  | TradeRecommendationIntent
  | ThirteenFIntent;

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