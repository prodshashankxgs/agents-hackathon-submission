// ============================================================================
// CORE INTERFACES - LAYERED ARCHITECTURE
// ============================================================================

// ===== DOMAIN ENTITIES =====
export interface TradeEntity {
  id: string;
  userId?: string;
  symbol: string;
  action: 'buy' | 'sell';
  quantity: number;
  price?: number;
  orderType: 'market' | 'limit';
  status: 'pending' | 'executed' | 'failed' | 'cancelled';
  timestamp: Date;
  executedAt?: Date;
  executedPrice?: number;
  executedQuantity?: number;
}

export interface PositionEntity {
  id: string;
  userId?: string;
  symbol: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  unrealizedPnL: number;
  realizedPnL: number;
  side: 'long' | 'short';
  lastUpdated: Date;
}

export interface AccountEntity {
  id: string;
  userId?: string;
  accountNumber: string;
  buyingPower: number;
  portfolioValue: number;
  totalEquity: number;
  dayTradeCount: number;
  status: 'active' | 'restricted' | 'suspended';
  lastUpdated: Date;
}

export interface MarketDataEntity {
  symbol: string;
  currentPrice: number;
  previousClose: number;
  changeAmount: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  isMarketOpen: boolean;
  timestamp: Date;
}

export interface OptionContractEntity {
  id: string;
  symbol: string;
  underlying: string;
  contractType: 'call' | 'put';
  strikePrice: number;
  expirationDate: string;
  multiplier: number;
  exchange: string;
}

// Value Objects
export interface TradeCommand {
  symbol: string;
  action: 'buy' | 'sell';
  amountType: 'dollars' | 'shares';
  amount: number;
  orderType: 'market' | 'limit';
  limitPrice?: number;
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
  estimatedCost?: number;
  requiredBuyingPower?: number;
}

export interface ValidationError {
  code: string;
  message: string;
  field?: string;
  severity: 'error' | 'warning';
}
export interface ValidationType {
  type: 'true' | 'false' | 'partial'
}

export interface ParseResult {
  command: TradeCommand;
  confidence: number;
  method: 'rule-based' | 'semantic-cache' | 'llm';
  processingTime: number;
  metadata?: Record<string, any>;
}

// ===== DOMAIN SERVICES INTERFACES =====
export interface IParsingService {
  parseCommand(input: string): Promise<ParseResult>;
  validateSyntax(input: string): boolean;
  extractSymbols(input: string): string[];
}

export interface IValidationService {
  validateTrade(command: TradeCommand, account: AccountEntity): Promise<ValidationResult>;
  validateMarketHours(): Promise<boolean>;
  validateSymbol(symbol: string): Promise<boolean>;
}

export interface IRiskManagementService {
  assessRisk(command: TradeCommand, portfolio: PositionEntity[]): Promise<RiskAssessment>;
  checkPositionLimits(symbol: string, quantity: number): Promise<boolean>;
  calculateMaxPosition(symbol: string, account: AccountEntity): Promise<number>;
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  riskFactors: string[];
  recommendedPositionSize?: number;
  warnings: string[];
}

// ===== APPLICATION SERVICES INTERFACES =====
export interface ITradeOrchestrator {
  executeTrade(input: string): Promise<TradeExecutionResult>;
  previewTrade(input: string): Promise<TradePreview>;
  cancelTrade(tradeId: string): Promise<boolean>;
}

export interface IPortfolioService {
  getPortfolio(): Promise<Portfolio>;
  getPositions(): Promise<PositionEntity[]>;
  getPerformanceMetrics(period: string): Promise<PerformanceMetrics>;
  rebalancePortfolio(targets: PortfolioTarget[]): Promise<RebalanceResult>;
}

export interface IMarketDataService {
  getMarketData(symbol: string): Promise<MarketDataEntity>;
  getQuote(symbol: string): Promise<Quote>;
  subscribeToMarketData(symbols: string[], callback: (data: MarketDataEntity) => void): void;
  unsubscribeFromMarketData(symbols: string[]): void;
}

export interface IAnalyticsService {
  analyzeMarket(symbols: string[]): Promise<MarketAnalysisResult>;
  generateRecommendations(criteria: RecommendationCriteria): Promise<Recommendation[]>;
  backtestStrategy(strategy: TradingStrategy, period: TimePeriod): Promise<BacktestResult>;
}

// ===== INFRASTRUCTURE INTERFACES =====
export interface IBrokerAdapter {
  executeOrder(order: OrderRequest): Promise<OrderResult>;
  getAccountInfo(): Promise<AccountEntity>;
  getPositions(): Promise<PositionEntity[]>;
  getMarketData(symbol: string): Promise<MarketDataEntity>;
  cancelOrder(orderId: string): Promise<boolean>;
  isMarketOpen(): Promise<boolean>;
}

export interface ILLMAdapter {
  parseNaturalLanguage(input: string): Promise<ParsedIntent>;
  generateAnalysis(request: AnalysisRequest): Promise<string>;
  classifyIntent(input: string): Promise<IntentClassification>;
}

export interface ICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  has(key: string): Promise<boolean>;
}

export interface IEventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void;
  unsubscribe(eventType: string, handler: EventHandler<any>): void;
}

export interface ILogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, error?: Error, meta?: any): void;
}

// ===== REPOSITORY INTERFACES =====
export interface ITradeRepository {
  save(trade: TradeEntity): Promise<TradeEntity>;
  findById(id: string): Promise<TradeEntity | null>;
  findByUserId(userId: string): Promise<TradeEntity[]>;
  findBySymbol(symbol: string): Promise<TradeEntity[]>;
  update(trade: TradeEntity): Promise<TradeEntity>;
  delete(id: string): Promise<boolean>;
}

export interface IPositionRepository {
  save(position: PositionEntity): Promise<PositionEntity>;
  findById(id: string): Promise<PositionEntity | null>;
  findByUserId(userId: string): Promise<PositionEntity[]>;
  findBySymbol(symbol: string): Promise<PositionEntity[]>;
  update(position: PositionEntity): Promise<PositionEntity>;
  delete(id: string): Promise<boolean>;
}

export interface IAccountRepository {
  save(account: AccountEntity): Promise<AccountEntity>;
  findById(id: string): Promise<AccountEntity | null>;
  findByUserId(userId: string): Promise<AccountEntity | null>;
  update(account: AccountEntity): Promise<AccountEntity>;
  delete(id: string): Promise<boolean>;
}

// ===== SUPPORTING TYPES =====
export interface TradeExecutionResult {
  success: boolean;
  trade?: TradeEntity;
  orderId?: string;
  executedPrice?: number | undefined;
  executedQuantity?: number | undefined;
  message: string;
  error?: string;
  timestamp: Date;
}

export interface TradePreview {
  command: TradeCommand;
  validation: ValidationResult;
  estimatedCost: number;
  estimatedShares?: number;
  marketPrice?: number;
  impact: MarketImpact;
}

export interface MarketImpact {
  priceImpact: number;
  liquidityScore: number;
  timing: 'good' | 'fair' | 'poor';
  alternatives?: string[];
}

export interface Portfolio {
  totalValue: number;
  totalCost: number;
  totalReturn: number;
  totalReturnPercent: number;
  positions: PositionEntity[];
  cash: number;
  dayChange: number;
  dayChangePercent: number;
}

export interface PerformanceMetrics {
  period: string;
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
}

export interface PortfolioTarget {
  symbol: string;
  targetPercent: number;
  currentPercent: number;
  action: 'buy' | 'sell' | 'hold';
  quantity: number;
}

export interface RebalanceResult {
  success: boolean;
  trades: TradeEntity[];
  totalCost: number;
  message: string;
}

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  spread: number;
  timestamp: Date;
}

export interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  price?: number;
  stopPrice?: number;
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  clientOrderId?: string;
}

export interface OrderResult {
  success: boolean;
  orderId: string;
  status: string;
  executedQuantity: number;
  executedPrice?: number;
  message: string;
  timestamp: Date;
}

export interface ParsedIntent {
  intent: TradeCommand;
  confidence: number;
  alternatives?: TradeCommand[];
  metadata?: Record<string, any>;
}

export interface AnalysisRequest {
  symbols: string[];
  analysisType: 'technical' | 'fundamental' | 'sentiment';
  timeframe: string;
  criteria?: string[];
}

export interface IntentClassification {
  type: 'trade' | 'analysis' | 'portfolio' | 'market_data' | 'unknown';
  confidence: number;
  subType?: string;
}

export interface MarketAnalysisResult {
  symbols: string[];
  analysis: string;
  recommendations: Recommendation[];
  riskFactors: string[];
  confidence: number;
}

export interface Recommendation {
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  reasoning: string;
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  timeHorizon: 'short' | 'medium' | 'long';
}

export interface RecommendationCriteria {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  timeHorizon: 'short' | 'medium' | 'long';
  sectors?: string[];
  excludeSymbols?: string[];
  maxPositions?: number;
  investmentAmount?: number;
}

export interface TradingStrategy {
  name: string;
  description: string;
  parameters: Record<string, any>;
  signals: TradingSignal[];
}

export interface TradingSignal {
  type: 'buy' | 'sell';
  condition: string;
  strength: number;
}

export interface TimePeriod {
  start: Date;
  end: Date;
}

export interface BacktestResult {
  strategy: string;
  period: TimePeriod;
  totalReturn: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  trades: BacktestTrade[];
}

export interface BacktestTrade {
  symbol: string;
  action: 'buy' | 'sell';
  quantity: number;
  price: number;
  date: Date;
  pnl: number;
}

// ===== DOMAIN EVENTS =====
export interface DomainEvent {
  id: string;
  type: string;
  aggregateId: string;
  aggregateType: string;
  data: any;
  timestamp: Date;
  version: number;
}

export interface TradeExecutedEvent extends DomainEvent {
  type: 'TradeExecuted';
  data: {
    tradeId: string;
    symbol: string;
    action: 'buy' | 'sell';
    quantity: number;
    executedPrice: number;
    executedAt: Date;
  };
}

export interface PositionUpdatedEvent extends DomainEvent {
  type: 'PositionUpdated';
  data: {
    positionId: string;
    symbol: string;
    previousQuantity: number;
    newQuantity: number;
    change: number;
  };
}

export interface MarketDataUpdatedEvent extends DomainEvent {
  type: 'MarketDataUpdated';
  data: {
    symbol: string;
    previousPrice: number;
    newPrice: number;
    changePercent: number;
  };
}

export type EventHandler<T extends DomainEvent> = (event: T) => Promise<void> | void;

// ===== ERROR TYPES =====
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ValidationDomainError extends DomainError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationDomainError';
  }
}

export class InfrastructureError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly source: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'InfrastructureError';
  }
}

export class ApplicationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

// LLM Provider Management
export interface LLMProvider {
  provider: 'openai' | 'claude'
  timestamp?: string
}

export interface LLMProviderResponse {
  success: boolean
  provider?: 'openai' | 'claude'
  previousProvider?: 'openai' | 'claude'
  currentProvider?: 'openai' | 'claude'
  message?: string
  timestamp: string
}

