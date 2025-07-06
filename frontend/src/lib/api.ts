import axios from 'axios'

const API_BASE_URL = 'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 0, // No global timeout - let requests complete
  headers: {
    'Content-Type': 'application/json',
  },
})

// Types (matching backend)
export interface TradeIntent {
  action: 'buy' | 'sell'
  symbol: string
  amountType: 'dollars' | 'shares'
  amount: number
  orderType: 'market' | 'limit'
  limitPrice?: number
}

export interface TradeValidation {
  isValid: boolean
  errors: string[]
  warnings: string[]
  estimatedCost: number
  accountBalance: number
  currentPrice?: number
  estimatedShares?: number
}

export interface TradeResult {
  success: boolean
  orderId?: string
  executedPrice?: number
  executedShares?: number
  executedValue?: number
  timestamp: Date
  message: string
  error?: string
}

export interface AccountInfo {
  accountId: string
  buyingPower: number
  portfolioValue: number
  dayTradeCount: number
  positions: Position[]
}

export interface Position {
  symbol: string
  quantity: number
  marketValue: number
  costBasis: number
  unrealizedPnL: number
  side: 'long' | 'short'
}

export interface MarketData {
  symbol: string
  currentPrice: number
  previousClose: number
  changePercent: number
  volume: number
  marketCap?: number
  isMarketOpen: boolean
}

export interface HealthStatus {
  status: string
  mode: 'paper' | 'live'
  timestamp: string
}

export interface MarketStatus {
  isOpen: boolean
  timestamp: string
}

// Advanced trading types
export interface HedgeIntent {
  type: 'hedge'
  primarySymbol: string
  hedgeReason: string
  timeframe: string
  riskTolerance: 'conservative' | 'moderate' | 'aggressive'
}

export interface MarketAnalysisIntent {
  type: 'analysis'
  symbols: string[]
  analysisType: 'technical' | 'fundamental' | 'sentiment' | 'comprehensive'
  timeframe: string
  focusAreas: string[]
}

export interface TradeRecommendationIntent {
  type: 'recommendation'
  scenario: string
  symbols: string[]
  investmentAmount?: number
  riskTolerance: 'conservative' | 'moderate' | 'aggressive'
  timeframe: string
  strategyType: 'growth' | 'value' | 'income' | 'momentum' | 'general'
}

export type AdvancedTradeIntent = 
  | (TradeIntent & { type: 'trade' })
  | HedgeIntent 
  | MarketAnalysisIntent 
  | TradeRecommendationIntent

export interface HedgeRecommendation {
  strategy: string
  instruments: Array<{
    type: 'option' | 'etf' | 'future' | 'stock'
    symbol: string
    action: 'buy' | 'sell'
    quantity: number
    reasoning: string
  }>
  costEstimate: number
  riskReduction: number
  exitConditions: string[]
  timeline: string
}

export interface MarketAnalysis {
  symbol: string
  sentiment: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  riskFactors: string[]
  opportunities: string[]
  priceTarget: number
  recommendation: 'buy' | 'sell' | 'hold'
  reasoning: string
}

export interface ThirteenFHolding {
  symbol: string
  companyName: string
  shares: number
  marketValue: number
  percentOfPortfolio: number
  changeFromPrevious?: number
  changePercent?: number
}

export interface ThirteenFPortfolio {
  institution: string
  cik: string
  filingDate: string
  totalValue: number
  holdings: ThirteenFHolding[]
  quarterEndDate: string
}

export interface PortfolioBasket {
  id: string
  name: string
  institution: string
  createdAt: Date
  totalInvestment: number
  holdings: Array<{
    symbol: string
    targetWeight: number
    actualShares: number
    actualValue: number
    orderId?: string
  }>
  status: 'pending' | 'executed' | 'partial' | 'failed'
}

// API functions
export const apiService = {
  // Health check
  async getHealth(): Promise<HealthStatus> {
    const response = await api.get('/health')
    return response.data
  },

  // Trade operations
  async parseTradeIntent(input: string): Promise<{ intent: TradeIntent; summary: string }> {
    const response = await api.post('/trade/parse', { input })
    return response.data
  },

  async validateTrade(intent: TradeIntent): Promise<{ validation: TradeValidation; formattedResults: string }> {
    const response = await api.post('/trade/validate', { intent })
    return response.data
  },

  async executeTrade(intent: TradeIntent): Promise<{ result: TradeResult }> {
    const response = await api.post('/trade/execute', { intent })
    return response.data
  },

  // Account operations
  async getAccountInfo(): Promise<AccountInfo> {
    const response = await api.get('/account')
    return response.data
  },

  // Market data
  async getMarketData(symbol: string): Promise<MarketData> {
    const response = await api.get(`/market/${symbol}`)
    return response.data
  },

  async getMarketStatus(): Promise<MarketStatus> {
    const response = await api.get('/market/status')
    return response.data
  },

  // Portfolio history
  async getPortfolioHistory(period: string = '1M', timeframe: string = '1D'): Promise<{
    timestamp: number[]
    equity: number[]
    profit_loss: number[]
    profit_loss_pct: number[]
    base_value: number
    timeframe: string
  }> {
    const response = await api.get('/portfolio/history', {
      params: { period, timeframe }
    })
    return response.data
  },

  // New simplified command interface
  async parseCommand(command: string): Promise<{
    action: 'buy' | 'sell'
    symbol: string
    quantity?: number
    amount?: number
    orderType: 'market' | 'limit'
    limitPrice?: number
    isValid: boolean
    errors?: string[]
    warnings?: string[]
  }> {
    const response = await api.post('/command/parse', { command })
    return response.data
  },

  async executeCommand(command: string): Promise<{
    success: boolean
    message: string
    order?: any
    error?: string
  }> {
    const response = await api.post('/command/execute', { command })
    return response.data
  },

  // Advanced trading operations
  async parseAdvancedIntent(input: string): Promise<{ intent: AdvancedTradeIntent; type: string }> {
    const response = await api.post('/advanced/parse', { input }, { timeout: 0 }) // No timeout - let it complete
    return response.data
  },

  async getHedgeRecommendation(intent: HedgeIntent): Promise<{ recommendation: HedgeRecommendation }> {
    const response = await api.post('/advanced/hedge', { intent })
    return response.data
  },

  async analyzeMarket(intent: MarketAnalysisIntent): Promise<{ analyses: MarketAnalysis[] }> {
    const response = await api.post('/advanced/analyze', { intent })
    return response.data
  },

  async getTradeRecommendations(intent: TradeRecommendationIntent): Promise<{ recommendations: any }> {
    const response = await api.post('/advanced/recommend', { intent })
    return response.data
  },

  // 13F operations
  async get13FPortfolio(intent: any): Promise<{ portfolio: ThirteenFPortfolio }> {
    const response = await api.post('/advanced/13f', { intent })
    return response.data
  },

  async invest13FPortfolio(intent: any, investmentAmount: number): Promise<{ 
    basket: PortfolioBasket
    allocation: any[]
    tradeResults: any[]
  }> {
    const response = await api.post('/advanced/13f/invest', { intent, investmentAmount })
    return response.data
  },

  // Basket operations
  getBaskets(): Promise<{ baskets: PortfolioBasket[] }> {
    return api.get('/baskets').then(res => res.data)
  },

  getBasket(basketId: string): Promise<{ basket: PortfolioBasket }> {
    return api.get(`/baskets/${basketId}`).then(res => res.data)
  },

  deleteBasket(basketId: string): Promise<{ success: boolean }> {
    return api.delete(`/baskets/${basketId}`).then(res => res.data)
  },

  // CopyTrade operations
  queryCopyTrade(intent: any): Promise<{ 
    politician: string
    trades: any[]
    weightedSpread: any[]
    totalTrades: number
    lastUpdated: string
  }> {
    return api.post('/copytrade/query', {
      politician: intent.politician,
      timeframe: intent.timeframe || '6months'
    }).then(res => res.data)
  },

  investCopyTrade(intent: any, investmentAmount: number): Promise<{
    success: boolean
    basketId: string
    politician: string
    totalInvestment: number
    holdings: any[]
    status: string
  }> {
    return api.post('/copytrade/invest', {
      politician: intent.politician,
      investmentAmount,
      timeframe: intent.timeframe || '6months'
    }).then(res => res.data)
  },

  getCopyTradeBaskets(): Promise<any[]> {
    return api.get('/copytrade/baskets').then(res => res.data)
  },

  getCopyTradeBasket(basketId: string): Promise<any> {
    return api.get(`/copytrade/baskets/${basketId}`).then(res => res.data)
  },
}

// WebSocket connection for real-time data
export class TradingWebSocket {
  private ws: WebSocket | null = null
  private subscribers: Map<string, Set<(data: any) => void>> = new Map()
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  constructor(private url = 'ws://localhost:3001') {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.isConnected = true
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onclose = () => {
          console.log('WebSocket disconnected')
          this.isConnected = false
          this.attemptReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          reject(error)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case 'market_update':
        const symbolSubscribers = this.subscribers.get(message.symbol)
        if (symbolSubscribers) {
          symbolSubscribers.forEach(callback => callback(message.data))
        }
        break
      case 'pong':
        // Handle ping/pong for connection health
        break
      default:
        console.log('Unknown message type:', message.type)
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)
      
      setTimeout(() => {
        this.connect().catch(console.error)
      }, Math.pow(2, this.reconnectAttempts) * 1000) // Exponential backoff
    }
  }

  subscribe(symbol: string, callback: (data: MarketData) => void) {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set())
    }
    this.subscribers.get(symbol)!.add(callback)

    // Send subscription message to server
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }))
    }
  }

  unsubscribe(symbol: string, callback: (data: MarketData) => void) {
    const symbolSubscribers = this.subscribers.get(symbol)
    if (symbolSubscribers) {
      symbolSubscribers.delete(callback)
      
      if (symbolSubscribers.size === 0) {
        this.subscribers.delete(symbol)
        
        // Send unsubscribe message to server
        if (this.isConnected && this.ws) {
          this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }))
        }
      }
    }
  }

  ping() {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify({ type: 'ping' }))
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.subscribers.clear()
  }
}

// Global WebSocket instance
export const tradingWS = new TradingWebSocket()

// Request interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.error) {
      throw new Error(error.response.data.error)
    }
    throw error
  }
) 