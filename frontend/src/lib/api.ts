import axios from 'axios'

const API_BASE_URL = 'http://localhost:3001/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
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
  primaryPosition: {
    symbol: string
    currentValue?: number
    shares?: number
  }
  hedgeReason: string
  timeframe?: string
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive'
}

export interface MarketAnalysisIntent {
  type: 'analysis'
  symbols: string[]
  analysisType: 'fundamental' | 'technical' | 'sentiment' | 'risk'
  context?: string
  timeframe?: string
}

export interface TradeRecommendationIntent {
  type: 'recommendation'
  scenario: string
  constraints?: {
    maxRisk?: number
    sectors?: string[]
    excludeSymbols?: string[]
  }
}

export type AdvancedTradeIntent = 
  | (TradeIntent & { type: 'trade' })
  | HedgeIntent 
  | MarketAnalysisIntent 
  | TradeRecommendationIntent

export interface HedgeRecommendation {
  strategy: string
  instruments: Array<{
    symbol: string
    action: 'buy' | 'sell'
    quantity: number
    rationale: string
  }>
  estimatedCost: number
  riskReduction: string
  explanation: string
}

export interface MarketAnalysis {
  symbol: string
  currentPrice: number
  analysis: {
    sentiment: 'bullish' | 'bearish' | 'neutral'
    riskFactors: string[]
    opportunities: string[]
    recommendation: string
  }
  relatedNews?: Array<{
    title: string
    summary: string
    impact: 'positive' | 'negative' | 'neutral'
  }>
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
    const response = await api.post('/advanced/parse', { input })
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