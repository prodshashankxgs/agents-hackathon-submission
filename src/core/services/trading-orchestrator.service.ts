import { 
  LLMProvider, 
  TradingBroker, 
  IntentRegistry, 
  ProcessedIntent,
  TradeIntent,
  ValidationResult,
  ExecutionResult,
  TradingOrchestratorConfig
} from '../interfaces';

export interface TradingRequest {
  id: string;
  input: string;
  userId?: string;
  context?: Record<string, any>;
  options?: {
    dryRun?: boolean;
    skipValidation?: boolean;
    timeout?: number;
  };
}

export interface TradingResult {
  requestId: string;
  success: boolean;
  intent?: ProcessedIntent;
  validation?: ValidationResult;
  execution?: ExecutionResult;
  error?: string;
  metadata: {
    processingTime: number;
    costs: {
      llm: number;
      broker: number;
    };
    steps: string[];
  };
}


export class TradingOrchestrator {
  private stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalProcessingTime: 0,
    totalCosts: 0
  };

  constructor(private config: TradingOrchestratorConfig) {}

  async processTradingRequest(request: TradingRequest): Promise<TradingResult> {
    const startTime = Date.now();
    const result: TradingResult = {
      requestId: request.id,
      success: false,
      metadata: {
        processingTime: 0,
        costs: { llm: 0, broker: 0 },
        steps: []
      }
    };

    try {
      this.stats.totalRequests++;
      
      // Step 1: Parse Intent
      result.metadata.steps.push('parsing_intent');
      const intent = await this.parseIntent(request);
      result.intent = intent;
      result.metadata.costs.llm += this.estimateLLMCost(intent);

      // Step 2: Validate Trade (if not skipped)
      if (!request.options?.skipValidation && this.config.validation.required) {
        result.metadata.steps.push('validating_trade');
        const validation = await this.validateTrade(intent.intent);
        result.validation = validation;
        
        if (!validation.isValid) {
          result.error = `Validation failed: ${validation.errors.map(e => e.message).join(', ')}`;
          return result;
        }
      }

      // Step 3: Execute Trade (if not dry run)
      if (!request.options?.dryRun) {
        result.metadata.steps.push('executing_trade');
        const execution = await this.executeTrade(intent.intent);
        result.execution = execution;
        result.metadata.costs.broker += this.estimateBrokerCost(execution);
        
        if (!execution.success) {
          result.error = `Execution failed: ${execution.error}`;
          return result;
        }
      }

      result.success = true;
      this.stats.successfulRequests++;
      
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      this.stats.failedRequests++;
    } finally {
      const endTime = Date.now();
      result.metadata.processingTime = endTime - startTime;
      this.stats.totalProcessingTime += result.metadata.processingTime;
      this.stats.totalCosts += result.metadata.costs.llm + result.metadata.costs.broker;
    }

    return result;
  }

  async batchProcessTradingRequests(requests: TradingRequest[]): Promise<TradingResult[]> {
    const results = await Promise.allSettled(
      requests.map(request => this.processTradingRequest(request))
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          requestId: requests[index]?.id || `unknown-${index}`,
          success: false,
          error: result.reason?.message || 'Unknown error',
          metadata: {
            processingTime: 0,
            costs: { llm: 0, broker: 0 },
            steps: ['error']
          }
        };
      }
    });
  }

  private async parseIntent(request: TradingRequest): Promise<ProcessedIntent> {
    const timeout = request.options?.timeout || this.config.intents.timeout;
    
    return Promise.race([
      this.config.intents.registry.process(request.input, request.context),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Intent parsing timeout')), timeout)
      )
    ]);
  }

  private async validateTrade(intent: TradeIntent): Promise<ValidationResult> {
    const timeout = this.config.validation.timeout;
    
    return Promise.race([
      this.config.broker.provider.validateTrade(intent),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Trade validation timeout')), timeout)
      )
    ]);
  }

  private async executeTrade(intent: TradeIntent): Promise<ExecutionResult> {
    const timeout = this.config.execution.timeout;
    const retries = this.config.execution.retries;
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await Promise.race([
          this.config.broker.provider.executeTrade(intent),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Trade execution timeout')), timeout)
          )
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }

  private estimateLLMCost(intent: ProcessedIntent): number {
    // Simple cost estimation based on tokens
    return intent.metadata.tokens * 0.00001; // $0.01 per 1k tokens
  }

  private estimateBrokerCost(execution: ExecutionResult): number {
    // Simple cost estimation based on execution
    return execution.success ? 0.5 : 0; // $0.50 per successful trade
  }

  getStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalRequests > 0 
        ? this.stats.successfulRequests / this.stats.totalRequests 
        : 0,
      averageProcessingTime: this.stats.totalRequests > 0 
        ? this.stats.totalProcessingTime / this.stats.totalRequests 
        : 0,
      averageCost: this.stats.totalRequests > 0 
        ? this.stats.totalCosts / this.stats.totalRequests 
        : 0
    };
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    services: Record<string, boolean>;
  }> {
    const [llmHealthy, brokerHealthy] = await Promise.allSettled([
      this.config.llm.provider.isHealthy(),
      this.config.broker.provider.isHealthy()
    ]);

    return {
      healthy: llmHealthy.status === 'fulfilled' && llmHealthy.value && 
               brokerHealthy.status === 'fulfilled' && brokerHealthy.value,
      services: {
        llm: llmHealthy.status === 'fulfilled' && llmHealthy.value,
        broker: brokerHealthy.status === 'fulfilled' && brokerHealthy.value
      }
    };
  }
}