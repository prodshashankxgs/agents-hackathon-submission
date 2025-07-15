import { 
  LLMProviderConfig, 
  BrokerConfig, 
  IntentRegistryConfig,
  TradingOrchestratorConfig 
} from '../interfaces';

export interface TradingSystemConfig {
  llm: LLMProviderConfig;
  broker: BrokerConfig;
  intents: IntentRegistryConfig;
  orchestrator: {
    timeouts: {
      intentParsing: number;
      tradeValidation: number;
      tradeExecution: number;
    };
    retries: {
      execution: number;
      validation: number;
    };
    validation: {
      required: boolean;
    };
  };
  features: {
    caching: boolean;
    batchProcessing: boolean;
    realTimeUpdates: boolean;
    analytics: boolean;
  };
}

export class TradingConfigService {
  private config: TradingSystemConfig;

  constructor(configPath?: string) {
    this.config = this.loadConfig(configPath);
  }

  private loadConfig(configPath?: string): TradingSystemConfig {
    // In a real implementation, this would load from file system
    // For now, we'll use environment variables and defaults
    
    return {
      llm: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 1000,
        timeout: 30000,
        retries: 3,
        rateLimits: {
          requestsPerMinute: 100,
          tokensPerMinute: 50000
        }
      },
      broker: {
        provider: 'alpaca',
        apiKey: process.env.ALPACA_API_KEY || '',
        secretKey: process.env.ALPACA_SECRET_KEY || '',
        baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets/v2',
        sandbox: true,
        timeout: 30000,
        retries: 3,
        rateLimits: {
          requestsPerSecond: 10,
          ordersPerDay: 1000
        },
        riskLimits: {
          maxDailySpending: parseFloat(process.env.MAX_DAILY_SPENDING || '1000'),
          maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '500'),
          maxDailyTrades: 100
        }
      },
      intents: {
        plugins: [
          {
            type: 'basic_trade',
            enabled: true,
            priority: 50,
            config: {}
          },
          {
            type: 'analysis',
            enabled: true,
            priority: 30,
            config: {}
          }
        ],
        defaultPlugin: 'basic_trade',
        fallbackStrategy: 'best_effort',
        maxConcurrency: 10,
        timeout: 30000
      },
      orchestrator: {
        timeouts: {
          intentParsing: 30000,
          tradeValidation: 10000,
          tradeExecution: 30000
        },
        retries: {
          execution: 3,
          validation: 2
        },
        validation: {
          required: true
        }
      },
      features: {
        caching: true,
        batchProcessing: true,
        realTimeUpdates: true,
        analytics: true
      }
    };
  }

  getConfig(): TradingSystemConfig {
    return this.config;
  }

  getLLMConfig(): LLMProviderConfig {
    return this.config.llm;
  }

  getBrokerConfig(): BrokerConfig {
    return this.config.broker;
  }

  getIntentConfig(): IntentRegistryConfig {
    return this.config.intents;
  }

  getOrchestratorConfig(): Partial<TradingOrchestratorConfig> {
    return {
      validation: {
        required: this.config.orchestrator.validation.required,
        timeout: this.config.orchestrator.timeouts.tradeValidation
      },
      execution: {
        timeout: this.config.orchestrator.timeouts.tradeExecution,
        retries: this.config.orchestrator.retries.execution
      }
    };
  }

  updateConfig(updates: Partial<TradingSystemConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate LLM config
    if (!this.config.llm.apiKey) {
      errors.push('LLM API key is required');
    }

    // Validate broker config
    if (!this.config.broker.apiKey) {
      errors.push('Broker API key is required');
    }

    if (this.config.broker.provider === 'alpaca' && !this.config.broker.secretKey) {
      errors.push('Alpaca secret key is required');
    }

    // Validate risk limits
    if (this.config.broker.riskLimits) {
      if (this.config.broker.riskLimits.maxDailySpending <= 0) {
        errors.push('Max daily spending must be positive');
      }
      if (this.config.broker.riskLimits.maxPositionSize <= 0) {
        errors.push('Max position size must be positive');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  isFeatureEnabled(feature: keyof TradingSystemConfig['features']): boolean {
    return this.config.features[feature];
  }

  getTimeouts() {
    return this.config.orchestrator.timeouts;
  }

  getRetryConfig() {
    return this.config.orchestrator.retries;
  }

  getRiskLimits() {
    return this.config.broker.riskLimits;
  }

  getRateLimits() {
    return {
      llm: this.config.llm.rateLimits,
      broker: this.config.broker.rateLimits
    };
  }
}