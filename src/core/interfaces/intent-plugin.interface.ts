import { TradeIntent } from './trading-broker.interface';
import { LLMProvider, IntentSchema } from './llm-provider.interface';

export interface ProcessedIntent {
  intent: TradeIntent;
  confidence: number;
  processingTime: number;
  metadata: {
    plugin: string;
    version: string;
    model: string;
    tokens: number;
  };
}

export interface IntentProcessor<T = any> {
  process(data: T, context?: any): Promise<TradeIntent>;
  validate(data: T): boolean;
  transform(data: T): TradeIntent;
}

export interface IntentValidator<T = any> {
  validate(data: T): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };
  sanitize(data: T): T;
}

export interface IntentPlugin<T = any> {
  type: string;
  version: string;
  description: string;
  priority: number;
  enabled: boolean;
  
  schema: IntentSchema<T>;
  processor: IntentProcessor<T>;
  validator: IntentValidator<T>;
  
  canHandle(input: string): boolean;
  getComplexity(input: string): number;
  getEstimatedCost(input: string): number;
  
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface IntentRegistryConfig {
  plugins: IntentPluginConfig[];
  defaultPlugin?: string;
  fallbackStrategy: 'error' | 'default' | 'best_effort';
  maxConcurrency: number;
  timeout: number;
}

export interface IntentPluginConfig {
  type: string;
  enabled: boolean;
  priority: number;
  config: Record<string, any>;
}

export interface IntentRegistry {
  register(plugin: IntentPlugin): void;
  unregister(type: string): void;
  
  process(input: string, context?: any): Promise<ProcessedIntent>;
  batchProcess(inputs: string[], context?: any): Promise<ProcessedIntent[]>;
  
  supports(type: string): boolean;
  getPlugin(type: string): IntentPlugin | undefined;
  listPlugins(): IntentPlugin[];
  
  getStats(): {
    totalProcessed: number;
    successRate: number;
    averageLatency: number;
    pluginUsage: Record<string, number>;
  };
}