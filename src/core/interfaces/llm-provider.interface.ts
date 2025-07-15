export interface LLMRequest<T = any> {
  id: string;
  input: string;
  schema: IntentSchema<T>;
  context?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface LLMResponse<T = any> {
  id: string;
  data: T;
  confidence: number;
  model: string;
  tokens: {
    input: number;
    output: number;
  };
  latency: number;
  cached: boolean;
}

export interface BatchRequest<T = any> {
  requests: LLMRequest<T>[];
  options?: {
    maxConcurrency?: number;
    timeout?: number;
    retries?: number;
  };
}

export interface BatchResult<T = any> {
  results: (LLMResponse<T> | Error)[];
  stats: {
    successful: number;
    failed: number;
    totalLatency: number;
    totalTokens: number;
  };
}

export interface IntentSchema<T = any> {
  type: string;
  description: string;
  validator: (data: any) => T;
  promptTemplate: string;
  examples: T[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  name: string;
  version: string;
  
  parseIntent<T>(request: LLMRequest<T>): Promise<LLMResponse<T>>;
  generateResponse(prompt: string, context?: any): Promise<string>;
  batchProcess<T>(batch: BatchRequest<T>): Promise<BatchResult<T>>;
  
  isHealthy(): Promise<boolean>;
  getCosts(): Promise<{
    inputCostPer1kTokens: number;
    outputCostPer1kTokens: number;
  }>;
}

export interface LLMProviderConfig {
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  retries?: number;
  rateLimits?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}