import { LLMProvider, LLMProviderConfig } from '../interfaces';

export class LLMProviderFactory {
  private static providers = new Map<string, new (config: LLMProviderConfig) => LLMProvider>();

  static register(name: string, providerClass: new (config: LLMProviderConfig) => LLMProvider): void {
    this.providers.set(name, providerClass);
  }

  static create(config: LLMProviderConfig): LLMProvider {
    const ProviderClass = this.providers.get(config.provider);
    
    if (!ProviderClass) {
      throw new Error(`Unknown LLM provider: ${config.provider}`);
    }

    return new ProviderClass(config);
  }

  static getSupportedProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  static isSupported(provider: string): boolean {
    return this.providers.has(provider);
  }
}

// Base class for LLM providers
export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;
  abstract version: string;

  constructor(protected config: LLMProviderConfig) {}

  abstract parseIntent<T>(request: any): Promise<any>;
  abstract generateResponse(prompt: string, context?: any): Promise<string>;
  abstract batchProcess<T>(batch: any): Promise<any>;
  abstract isHealthy(): Promise<boolean>;
  abstract getCosts(): Promise<{ inputCostPer1kTokens: number; outputCostPer1kTokens: number; }>;

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
}