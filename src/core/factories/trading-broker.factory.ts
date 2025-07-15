import { TradingBroker, BrokerConfig } from '../interfaces';

export class TradingBrokerFactory {
  private static brokers = new Map<string, new (config: BrokerConfig) => TradingBroker>();

  static register(name: string, brokerClass: new (config: BrokerConfig) => TradingBroker): void {
    this.brokers.set(name, brokerClass);
  }

  static create(config: BrokerConfig): TradingBroker {
    const BrokerClass = this.brokers.get(config.provider);
    
    if (!BrokerClass) {
      throw new Error(`Unknown trading broker: ${config.provider}`);
    }

    return new BrokerClass(config);
  }

  static getSupportedBrokers(): string[] {
    return Array.from(this.brokers.keys());
  }

  static isSupported(provider: string): boolean {
    return this.brokers.has(provider);
  }
}

// Base class for trading brokers
export abstract class BaseTradingBroker implements TradingBroker {
  abstract name: string;
  abstract version: string;

  constructor(protected config: BrokerConfig) {}

  abstract validateTrade(intent: any): Promise<any>;
  abstract executeTrade(intent: any): Promise<any>;
  abstract getAccount(): Promise<any>;
  abstract getMarketData(symbol: string): Promise<any>;
  abstract getMarketDataBatch(symbols: string[]): Promise<any>;
  abstract isHealthy(): Promise<boolean>;
  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  protected async makeRequest(
    endpoint: string, 
    data: any, 
    options: { timeout?: number; retries?: number } = {}
  ): Promise<any> {
    const { timeout = this.config.timeout || 30000, retries = this.config.retries || 3 } = options;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify(data),
          signal: controller.signal
        });

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

  protected validateConfig(): void {
    if (!this.config.apiKey) {
      throw new Error('API key is required');
    }
    
    if (!this.config.baseUrl) {
      throw new Error('Base URL is required');
    }
  }

  protected checkRiskLimits(intent: any): { passed: boolean; errors: string[] } {
    const errors: string[] = [];
    const limits = this.config.riskLimits;

    if (!limits) {
      return { passed: true, errors: [] };
    }

    // Check position size limit
    if (limits.maxPositionSize && intent.quantity > limits.maxPositionSize) {
      errors.push(`Position size ${intent.quantity} exceeds maximum of ${limits.maxPositionSize}`);
    }

    // Additional risk checks would go here
    
    return {
      passed: errors.length === 0,
      errors
    };
  }
}