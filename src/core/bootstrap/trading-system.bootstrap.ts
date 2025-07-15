import { TradingConfigService } from '../config/trading-config';
import { LLMProviderFactory } from '../factories/llm-provider.factory';
import { TradingBrokerFactory } from '../factories/trading-broker.factory';
import { IntentRegistryService } from '../services/intent-registry.service';
import { TradingOrchestrator } from '../services/trading-orchestrator.service';

// Import concrete implementations
import { OpenAIProvider } from '../../providers/llm/openai-provider';
import { AlpacaBroker } from '../../providers/brokers/alpaca-broker';

// Import plugins
import { BasicTradePlugin } from '../../plugins/basic-trade.plugin';
import { AnalysisPlugin } from '../../plugins/analysis.plugin';

export class TradingSystemBootstrap {
  private configService: TradingConfigService;
  private orchestrator: TradingOrchestrator | null = null;

  constructor(configPath?: string) {
    this.configService = new TradingConfigService(configPath);
    this.registerProviders();
    this.registerPlugins();
  }

  async initialize(): Promise<TradingOrchestrator> {
    // Validate configuration
    const configValidation = this.configService.validateConfig();
    if (!configValidation.isValid) {
      throw new Error(`Configuration validation failed: ${configValidation.errors.join(', ')}`);
    }

    // Create LLM provider
    const llmProvider = LLMProviderFactory.create(this.configService.getLLMConfig());

    // Create trading broker
    const tradingBroker = TradingBrokerFactory.create(this.configService.getBrokerConfig());

    // Create intent registry
    const intentRegistry = new IntentRegistryService(this.configService.getIntentConfig());
    await intentRegistry.initialize();

    // Create orchestrator
    this.orchestrator = new TradingOrchestrator({
      llm: {
        provider: llmProvider,
        timeout: this.configService.getTimeouts().intentParsing,
        retries: this.configService.getRetryConfig().execution
      },
      broker: {
        provider: tradingBroker,
        timeout: this.configService.getTimeouts().tradeExecution,
        retries: this.configService.getRetryConfig().execution
      },
      intents: {
        registry: intentRegistry,
        timeout: this.configService.getTimeouts().intentParsing
      },
      validation: {
        required: this.configService.getOrchestratorConfig().validation?.required || true,
        timeout: this.configService.getTimeouts().tradeValidation
      },
      execution: {
        timeout: this.configService.getTimeouts().tradeExecution,
        retries: this.configService.getRetryConfig().execution
      }
    });

    // Health check
    const health = await this.orchestrator.healthCheck();
    if (!health.healthy) {
      throw new Error(`System health check failed: ${JSON.stringify(health.services)}`);
    }

    return this.orchestrator;
  }

  getOrchestrator(): TradingOrchestrator {
    if (!this.orchestrator) {
      throw new Error('System not initialized. Call initialize() first.');
    }
    return this.orchestrator;
  }

  getConfigService(): TradingConfigService {
    return this.configService;
  }

  async shutdown(): Promise<void> {
    if (this.orchestrator) {
      // Perform any cleanup
      console.log('Shutting down trading system...');
      // In a real implementation, you'd cleanup resources, close connections, etc.
    }
  }

  private registerProviders(): void {
    // Register LLM providers
    LLMProviderFactory.register('openai', OpenAIProvider);
    
    // Register trading brokers
    TradingBrokerFactory.register('alpaca', AlpacaBroker);
  }

  private registerPlugins(): void {
    // Plugins would be registered with the intent registry
    // This is handled in the intent registry initialization
  }

  // Utility methods for runtime configuration
  async updateLLMProvider(provider: string, config: any): Promise<void> {
    if (!this.orchestrator) {
      throw new Error('System not initialized');
    }

    this.configService.updateConfig({ llm: { ...this.configService.getLLMConfig(), provider, ...config } });
    
    // Reinitialize with new config
    await this.initialize();
  }

  async updateBrokerProvider(provider: string, config: any): Promise<void> {
    if (!this.orchestrator) {
      throw new Error('System not initialized');
    }

    this.configService.updateConfig({ broker: { ...this.configService.getBrokerConfig(), provider, ...config } });
    
    // Reinitialize with new config
    await this.initialize();
  }

  getSystemStats() {
    if (!this.orchestrator) {
      throw new Error('System not initialized');
    }

    return {
      orchestrator: this.orchestrator.getStats(),
      config: this.configService.getConfig(),
      features: {
        caching: this.configService.isFeatureEnabled('caching'),
        batchProcessing: this.configService.isFeatureEnabled('batchProcessing'),
        realTimeUpdates: this.configService.isFeatureEnabled('realTimeUpdates'),
        analytics: this.configService.isFeatureEnabled('analytics')
      }
    };
  }

  async performHealthCheck() {
    if (!this.orchestrator) {
      throw new Error('System not initialized');
    }

    return await this.orchestrator.healthCheck();
  }
}

// Export singleton instance
export const tradingSystem = new TradingSystemBootstrap();

// Export factory function for custom configurations
export function createTradingSystem(configPath?: string): TradingSystemBootstrap {
  return new TradingSystemBootstrap(configPath);
}