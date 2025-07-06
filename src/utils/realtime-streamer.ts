import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { config } from '../config';
import { performanceMonitor } from './performance-monitor';

interface StreamSubscription {
  symbols: Set<string>;
  callback: (data: any) => void;
  subscriptionId: string;
}

interface MarketUpdate {
  symbol: string;
  price: number;
  timestamp: number;
  volume?: number;
  change?: number;
  changePercent?: number;
}

export class RealTimeStreamer extends EventEmitter {
  private alpacaWs: WebSocket | null = null;
  private subscriptions = new Map<string, StreamSubscription>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 1000;
  private isConnecting = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat = 0;
  private subscribedSymbols = new Set<string>();

  constructor() {
    super();
    this.connect();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting || this.alpacaWs?.readyState === WebSocket.OPEN) {
      return;
    }

    this.isConnecting = true;
    const startTime = Date.now();

    try {
      // Use Alpaca's WebSocket API for real-time data
      const wsUrl = config.alpacaBaseUrl.includes('paper') 
        ? 'wss://stream.data.alpaca.markets/v2/iex'  // Paper trading uses IEX data
        : 'wss://stream.data.alpaca.markets/v2/sip'; // Live trading can use SIP data

      this.alpacaWs = new WebSocket(wsUrl);

      this.alpacaWs.on('open', () => {
        console.log('📡 Real-time data stream connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.authenticate();
        this.startHeartbeat();
        
        performanceMonitor.endTimer('ws_connect', true);
        this.emit('connected');
      });

      this.alpacaWs.on('message', (data: Buffer) => {
        try {
          const messages = JSON.parse(data.toString());
          this.handleMessages(Array.isArray(messages) ? messages : [messages]);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      });

      this.alpacaWs.on('close', (code: number, reason: Buffer) => {
        console.log(`📡 WebSocket connection closed: ${code} ${reason.toString()}`);
        this.cleanup();
        this.scheduleReconnect();
      });

      this.alpacaWs.on('error', (error: Error) => {
        console.error('📡 WebSocket error:', error);
        performanceMonitor.endTimer('ws_connect', false, error.message);
        this.cleanup();
        this.scheduleReconnect();
      });

      performanceMonitor.startTimer('ws_connect');

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private authenticate(): void {
    if (!this.alpacaWs || this.alpacaWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const authMessage = {
      action: 'auth',
      key: config.alpacaApiKey,
      secret: config.alpacaSecretKey
    };

    this.alpacaWs.send(JSON.stringify(authMessage));
  }

  private handleMessages(messages: any[]): void {
    for (const message of messages) {
      switch (message.T) {
        case 'success':
          if (message.msg === 'authenticated') {
            console.log('📡 WebSocket authenticated successfully');
            this.resubscribeToSymbols();
          }
          break;

        case 'error':
          console.error('📡 WebSocket error message:', message);
          break;

        case 't': // Trade update
          this.handleTradeUpdate(message);
          break;

        case 'q': // Quote update
          this.handleQuoteUpdate(message);
          break;

        case 'subscription':
          console.log('📡 Subscription confirmed:', message);
          break;

        default:
          // Handle other message types as needed
          break;
      }
    }
  }

  private handleTradeUpdate(trade: any): void {
    const marketUpdate: MarketUpdate = {
      symbol: trade.S,
      price: trade.p,
      timestamp: new Date(trade.t).getTime(),
      volume: trade.s
    };

    this.notifySubscribers(marketUpdate);
    this.emit('trade', marketUpdate);
  }

  private handleQuoteUpdate(quote: any): void {
    const marketUpdate: MarketUpdate = {
      symbol: quote.S,
      price: (quote.bp + quote.ap) / 2, // Mid price
      timestamp: new Date(quote.t).getTime()
    };

    this.notifySubscribers(marketUpdate);
    this.emit('quote', marketUpdate);
  }

  private notifySubscribers(update: MarketUpdate): void {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.symbols.has(update.symbol)) {
        try {
          subscription.callback(update);
        } catch (error) {
          console.error('Error in subscription callback:', error);
        }
      }
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.alpacaWs?.readyState === WebSocket.OPEN) {
        const now = Date.now();
        this.alpacaWs.send(JSON.stringify({ action: 'ping' }));
        this.lastHeartbeat = now;
      }
    }, 30000); // Send heartbeat every 30 seconds
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.alpacaWs) {
      this.alpacaWs.removeAllListeners();
      if (this.alpacaWs.readyState === WebSocket.OPEN) {
        this.alpacaWs.close();
      }
      this.alpacaWs = null;
    }

    this.isConnecting = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('📡 Max reconnection attempts reached');
      this.emit('maxReconnectAttemptsReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`📡 Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private resubscribeToSymbols(): void {
    if (this.subscribedSymbols.size > 0) {
      this.subscribeToSymbols(Array.from(this.subscribedSymbols));
    }
  }

  private subscribeToSymbols(symbols: string[]): void {
    if (!this.alpacaWs || this.alpacaWs.readyState !== WebSocket.OPEN) {
      console.warn('📡 Cannot subscribe: WebSocket not connected');
      return;
    }

    const subscribeMessage = {
      action: 'subscribe',
      trades: symbols,
      quotes: symbols
    };

    this.alpacaWs.send(JSON.stringify(subscribeMessage));
    
    symbols.forEach(symbol => this.subscribedSymbols.add(symbol));
    console.log(`📡 Subscribed to real-time data for: ${symbols.join(', ')}`);
  }

  private unsubscribeFromSymbols(symbols: string[]): void {
    if (!this.alpacaWs || this.alpacaWs.readyState !== WebSocket.OPEN) {
      return;
    }

    const unsubscribeMessage = {
      action: 'unsubscribe',
      trades: symbols,
      quotes: symbols
    };

    this.alpacaWs.send(JSON.stringify(unsubscribeMessage));
    
    symbols.forEach(symbol => this.subscribedSymbols.delete(symbol));
    console.log(`📡 Unsubscribed from real-time data for: ${symbols.join(', ')}`);
  }

  // Public API

  subscribe(symbols: string[], callback: (data: MarketUpdate) => void): string {
    const subscriptionId = Math.random().toString(36).substring(7);
    const symbolSet = new Set(symbols.map(s => s.toUpperCase()));

    this.subscriptions.set(subscriptionId, {
      symbols: symbolSet,
      callback,
      subscriptionId
    });

    // Subscribe to new symbols
    const newSymbols = symbols.filter(symbol => !this.subscribedSymbols.has(symbol.toUpperCase()));
    if (newSymbols.length > 0) {
      this.subscribeToSymbols(newSymbols.map(s => s.toUpperCase()));
    }

    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    this.subscriptions.delete(subscriptionId);

    // Check if any symbols are no longer needed
    const stillNeededSymbols = new Set<string>();
    for (const sub of this.subscriptions.values()) {
      sub.symbols.forEach(symbol => stillNeededSymbols.add(symbol));
    }

    const symbolsToUnsubscribe = Array.from(subscription.symbols)
      .filter(symbol => !stillNeededSymbols.has(symbol));

    if (symbolsToUnsubscribe.length > 0) {
      this.unsubscribeFromSymbols(symbolsToUnsubscribe);
    }
  }

  isConnected(): boolean {
    return this.alpacaWs?.readyState === WebSocket.OPEN;
  }

  getStats(): {
    connected: boolean;
    subscriptions: number;
    subscribedSymbols: number;
    reconnectAttempts: number;
    lastHeartbeat: number;
  } {
    return {
      connected: this.isConnected(),
      subscriptions: this.subscriptions.size,
      subscribedSymbols: this.subscribedSymbols.size,
      reconnectAttempts: this.reconnectAttempts,
      lastHeartbeat: this.lastHeartbeat
    };
  }

  disconnect(): void {
    console.log('📡 Disconnecting real-time streamer');
    this.cleanup();
    this.subscribedSymbols.clear();
    this.subscriptions.clear();
  }
}

// Global instance
export const realTimeStreamer = new RealTimeStreamer();

// Graceful shutdown
process.on('SIGINT', () => {
  realTimeStreamer.disconnect();
});

process.on('SIGTERM', () => {
  realTimeStreamer.disconnect();
});