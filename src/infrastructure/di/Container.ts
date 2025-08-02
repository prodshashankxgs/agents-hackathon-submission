// ============================================================================
// DEPENDENCY INJECTION CONTAINER - INFRASTRUCTURE LAYER
// ============================================================================

import { 
  ILogger,
  ICacheService,
  IEventBus,
  IBrokerAdapter,
  ILLMAdapter,
  IParsingService,
  IValidationService,
  IRiskManagementService,
  ITradeOrchestrator,
  IPortfolioService,
  IMarketDataService,
  IAnalyticsService,
  InfrastructureError
} from '../../core/interfaces';

// Infrastructure implementations
import { ConsoleLogger } from '../logging/ConsoleLogger';
import { RedisCacheService } from '../caching/RedisCacheService';
import { InMemoryEventBus } from '../events/InMemoryEventBus';
import { AlpacaBrokerAdapter } from '../adapters/AlpacaBrokerAdapter';
import { OpenAILLMAdapter } from '../adapters/OpenAILLMAdapter';
import { ClaudeLLMAdapter } from '../adapters/ClaudeLLMAdapter';

// Domain services
import { ParsingService } from '../../domain/services/ParsingService';
import { ValidationService } from '../../domain/services/ValidationService';
import { RiskManagementService } from '../../domain/services/RiskManagementService';

// Application services
import { TradeOrchestrator } from '../../application/orchestrators/TradeOrchestrator';
import { PortfolioService } from '../../application/services/PortfolioService';

export class Container {
  private services = new Map<string, any>();
  private singletons = new Map<string, any>();
  private factories = new Map<string, () => any>();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Register a singleton service
   */
  registerSingleton<T>(token: string, implementation: new (...args: any[]) => T, dependencies: string[] = []): void {
    this.factories.set(token, () => {
      if (this.singletons.has(token)) {
        return this.singletons.get(token);
      }

      const deps = dependencies.map(dep => this.resolve(dep));
      const instance = new implementation(...deps);
      this.singletons.set(token, instance);
      
      return instance;
    });
  }

  /**
   * Register a transient service (new instance each time)
   */
  registerTransient<T>(token: string, implementation: new (...args: any[]) => T, dependencies: string[] = []): void {
    this.factories.set(token, () => {
      const deps = dependencies.map(dep => this.resolve(dep));
      return new implementation(...deps);
    });
  }

  /**
   * Register an instance directly
   */
  registerInstance<T>(token: string, instance: T): void {
    this.singletons.set(token, instance);
    this.factories.set(token, () => instance);
  }

  /**
   * Register a factory function
   */
  registerFactory<T>(token: string, factory: () => T): void {
    this.factories.set(token, factory);
  }

  /**
   * Resolve a service by token
   */
  resolve<T>(token: string): T {
    const factory = this.factories.get(token);
    
    if (!factory) {
      throw new InfrastructureError(
        `Service not registered: ${token}`,
        'SERVICE_NOT_REGISTERED',
        'Container',
        { token }
      );
    }

    try {
      return factory();
    } catch (error) {
      throw new InfrastructureError(
        `Failed to resolve service: ${token}`,
        'SERVICE_RESOLUTION_FAILED',
        'Container',
        { token, originalError: error }
      );
    }
  }

  /**
   * Check if a service is registered
   */
  has(token: string): boolean {
    return this.factories.has(token);
  }

  /**
   * Get all registered service tokens
   */
  getServiceTokens(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.services.clear();
    this.singletons.clear();
    this.factories.clear();
  }

  /**
   * Create a child container with inherited services
   */
  createChild(): Container {
    const child = new Container();
    
    // Copy parent registrations
    for (const [token, factory] of this.factories) {
      child.factories.set(token, factory);
    }
    
    // Copy singleton instances
    for (const [token, instance] of this.singletons) {
      child.singletons.set(token, instance);
    }
    
    return child;
  }

  // ===== PRIVATE METHODS =====

  private registerDefaults(): void {
    // Infrastructure Services (Singletons)
    this.registerSingleton('ILogger', ConsoleLogger, []);
    
    this.registerSingleton('ICacheService', RedisCacheService, ['ILogger']);
    
    this.registerSingleton('IEventBus', InMemoryEventBus, ['ILogger']);
    
    this.registerSingleton('IBrokerAdapter', AlpacaBrokerAdapter, ['ILogger']);
    
    // Register OpenAI as default LLM adapter
    this.registerSingleton('ILLMAdapter', OpenAILLMAdapter, ['ILogger']);
    
    // Register individual LLM adapters for specific use cases
    this.registerSingleton('OpenAILLMAdapter', OpenAILLMAdapter, ['ILogger']);
    this.registerSingleton('ClaudeLLMAdapter', ClaudeLLMAdapter, ['ILogger']);

    // Domain Services (Singletons)
    this.registerSingleton('IParsingService', ParsingService, [
      'ILLMAdapter',
      'ICacheService', 
      'ILogger'
    ]);

    this.registerSingleton('IValidationService', ValidationService, [
      'IBrokerAdapter',
      'ICacheService',
      'ILogger'
    ]);

    this.registerSingleton('IRiskManagementService', RiskManagementService, [
      'IBrokerAdapter',
      'ICacheService',
      'ILogger'
    ]);

    // Application Services (Singletons)
    this.registerSingleton('ITradeOrchestrator', TradeOrchestrator, [
      'IParsingService',
      'IValidationService',
      'IRiskManagementService',
      'IBrokerAdapter',
      'IEventBus',
      'ICacheService',
      'ILogger'
    ]);

    this.registerSingleton('IPortfolioService', PortfolioService, [
      'IBrokerAdapter',
      'ICacheService',
      'IEventBus',
      'ILogger'
    ]);
  }
}

// ===== SERVICE TOKENS (for type safety) =====
export const SERVICE_TOKENS = {
  // Infrastructure
  ILogger: 'ILogger',
  ICacheService: 'ICacheService',
  IEventBus: 'IEventBus',
  IBrokerAdapter: 'IBrokerAdapter',
  ILLMAdapter: 'ILLMAdapter',
  OpenAILLMAdapter: 'OpenAILLMAdapter',
  ClaudeLLMAdapter: 'ClaudeLLMAdapter',

  // Domain Services
  IParsingService: 'IParsingService',
  IValidationService: 'IValidationService',
  IRiskManagementService: 'IRiskManagementService',

  // Application Services  
  ITradeOrchestrator: 'ITradeOrchestrator',
  IPortfolioService: 'IPortfolioService',
  IMarketDataService: 'IMarketDataService',
  IAnalyticsService: 'IAnalyticsService'
} as const;

// ===== GLOBAL CONTAINER INSTANCE =====
export const container = new Container();

// ===== TYPED RESOLVER FUNCTIONS =====
export function resolveLogger(): ILogger {
  return container.resolve<ILogger>(SERVICE_TOKENS.ILogger);
}

export function resolveCacheService(): ICacheService {
  return container.resolve<ICacheService>(SERVICE_TOKENS.ICacheService);
}

export function resolveEventBus(): IEventBus {
  return container.resolve<IEventBus>(SERVICE_TOKENS.IEventBus);
}

export function resolveBrokerAdapter(): IBrokerAdapter {
  return container.resolve<IBrokerAdapter>(SERVICE_TOKENS.IBrokerAdapter);
}

export function resolveLLMAdapter(): ILLMAdapter {
  return container.resolve<ILLMAdapter>(SERVICE_TOKENS.ILLMAdapter);
}

export function resolveOpenAILLMAdapter(): ILLMAdapter {
  return container.resolve<ILLMAdapter>(SERVICE_TOKENS.OpenAILLMAdapter);
}

export function resolveClaudeLLMAdapter(): ILLMAdapter {
  return container.resolve<ILLMAdapter>(SERVICE_TOKENS.ClaudeLLMAdapter);
}

export function resolveParsingService(): IParsingService {
  return container.resolve<IParsingService>(SERVICE_TOKENS.IParsingService);
}

export function resolveValidationService(): IValidationService {
  return container.resolve<IValidationService>(SERVICE_TOKENS.IValidationService);
}

export function resolveRiskManagementService(): IRiskManagementService {
  return container.resolve<IRiskManagementService>(SERVICE_TOKENS.IRiskManagementService);
}

export function resolveTradeOrchestrator(): ITradeOrchestrator {
  return container.resolve<ITradeOrchestrator>(SERVICE_TOKENS.ITradeOrchestrator);
}

export function resolvePortfolioService(): IPortfolioService {
  return container.resolve<IPortfolioService>(SERVICE_TOKENS.IPortfolioService);
}

// ===== CONFIGURATION HELPERS =====

/**
 * Configure container for testing with mocks
 */
export function configureTestContainer(testServices: Partial<Record<keyof typeof SERVICE_TOKENS, any>>): Container {
  const testContainer = container.createChild();
  
  // Register test doubles
  for (const [token, service] of Object.entries(testServices)) {
    if (SERVICE_TOKENS.hasOwnProperty(token)) {
      testContainer.registerInstance(SERVICE_TOKENS[token as keyof typeof SERVICE_TOKENS], service);
    }
  }
  
  return testContainer;
}

/**
 * Configure container for production with specific implementations
 */
export function configureProductionContainer(config?: {
  enableRedis?: boolean;
  enableAdvancedLogging?: boolean;
  llmProvider?: 'openai' | 'claude';
}): Container {
  const prodContainer = container.createChild();
  
  if (config?.enableRedis) {
    // Would register real Redis cache service here
    // prodContainer.registerSingleton('ICacheService', RealRedisCacheService, ['ILogger']);
  }
  
  if (config?.enableAdvancedLogging) {
    // Would register structured logger here
    // prodContainer.registerSingleton('ILogger', StructuredLogger, []);
  }

  // Configure LLM provider
  if (config?.llmProvider === 'claude') {
    prodContainer.registerSingleton('ILLMAdapter', ClaudeLLMAdapter, ['ILogger']);
  } else {
    // Default to OpenAI
    prodContainer.registerSingleton('ILLMAdapter', OpenAILLMAdapter, ['ILogger']);
  }
  
  return prodContainer;
}

/**
 * Switch the default LLM provider
 */
export function configureLLMProvider(provider: 'openai' | 'claude'): void {
  if (provider === 'claude') {
    container.registerSingleton('ILLMAdapter', ClaudeLLMAdapter, ['ILogger']);
  } else {
    container.registerSingleton('ILLMAdapter', OpenAILLMAdapter, ['ILogger']);
  }
}