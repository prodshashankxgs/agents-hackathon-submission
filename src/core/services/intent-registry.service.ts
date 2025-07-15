import { 
  IntentRegistry, 
  IntentPlugin, 
  ProcessedIntent, 
  IntentRegistryConfig 
} from '../interfaces';

export class IntentRegistryService implements IntentRegistry {
  private plugins = new Map<string, IntentPlugin>();
  private stats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    totalLatency: 0,
    pluginUsage: new Map<string, number>()
  };

  constructor(private config: IntentRegistryConfig) {}

  async initialize(): Promise<void> {
    // Initialize all enabled plugins
    for (const pluginConfig of this.config.plugins) {
      if (pluginConfig.enabled) {
        try {
          const plugin = await this.loadPlugin(pluginConfig.type, pluginConfig.config);
          await plugin.initialize();
          this.plugins.set(plugin.type, plugin);
        } catch (error) {
          console.error(`Failed to initialize plugin ${pluginConfig.type}:`, error);
        }
      }
    }
  }

  register(plugin: IntentPlugin): void {
    this.plugins.set(plugin.type, plugin);
    this.stats.pluginUsage.set(plugin.type, 0);
  }

  unregister(type: string): void {
    const plugin = this.plugins.get(type);
    if (plugin) {
      plugin.cleanup();
      this.plugins.delete(type);
      this.stats.pluginUsage.delete(type);
    }
  }

  async process(input: string, context?: any): Promise<ProcessedIntent> {
    const startTime = Date.now();
    this.stats.totalProcessed++;

    try {
      // Find the best plugin for this input
      const plugin = await this.selectBestPlugin(input);
      
      if (!plugin) {
        throw new Error(`No plugin found to handle input: ${input}`);
      }

      // Update usage stats
      const currentUsage = this.stats.pluginUsage.get(plugin.type) || 0;
      this.stats.pluginUsage.set(plugin.type, currentUsage + 1);

      // Process the intent
      const result = await this.processWithPlugin(plugin, input, context);
      
      this.stats.successful++;
      this.stats.totalLatency += Date.now() - startTime;
      
      return result;
      
    } catch (error) {
      this.stats.failed++;
      
      // Try fallback strategy
      if (this.config.fallbackStrategy === 'best_effort') {
        return this.processBestEffort(input, context);
      } else if (this.config.fallbackStrategy === 'default' && this.config.defaultPlugin) {
        const defaultPlugin = this.plugins.get(this.config.defaultPlugin);
        if (defaultPlugin) {
          return this.processWithPlugin(defaultPlugin, input, context);
        }
      }
      
      throw error;
    }
  }

  async batchProcess(inputs: string[], context?: any): Promise<ProcessedIntent[]> {
    const batches = this.createBatches(inputs, this.config.maxConcurrency);
    const results: ProcessedIntent[] = [];

    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(input => this.process(input, context))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result
          results.push({
            intent: {
              id: `error-${Date.now()}`,
              type: 'custom',
              symbol: 'ERROR',
              metadata: { error: result.reason?.message }
            },
            confidence: 0,
            processingTime: 0,
            metadata: {
              plugin: 'error',
              version: '1.0.0',
              model: 'none',
              tokens: 0
            }
          });
        }
      }
    }

    return results;
  }

  supports(type: string): boolean {
    return this.plugins.has(type);
  }

  getPlugin(type: string): IntentPlugin | undefined {
    return this.plugins.get(type);
  }

  listPlugins(): IntentPlugin[] {
    return Array.from(this.plugins.values());
  }

  getStats() {
    return {
      totalProcessed: this.stats.totalProcessed,
      successRate: this.stats.totalProcessed > 0 
        ? this.stats.successful / this.stats.totalProcessed 
        : 0,
      averageLatency: this.stats.successful > 0 
        ? this.stats.totalLatency / this.stats.successful 
        : 0,
      pluginUsage: Object.fromEntries(this.stats.pluginUsage.entries())
    };
  }

  private async selectBestPlugin(input: string): Promise<IntentPlugin | null> {
    const candidates = Array.from(this.plugins.values())
      .filter(plugin => plugin.enabled && plugin.canHandle(input))
      .sort((a, b) => {
        // Sort by priority first, then by complexity score
        const priorityDiff = b.priority - a.priority;
        if (priorityDiff !== 0) return priorityDiff;
        
        const complexityDiff = a.getComplexity(input) - b.getComplexity(input);
        return complexityDiff;
      });

    return candidates[0] || null;
  }

  private async processWithPlugin(
    plugin: IntentPlugin, 
    input: string, 
    context?: any
  ): Promise<ProcessedIntent> {
    const startTime = Date.now();
    
    // Create LLM request
    const llmRequest = {
      id: `req-${Date.now()}`,
      input,
      schema: plugin.schema,
      context
    };

    // Get LLM provider (this would be injected in real implementation)
    const llmProvider = this.getLLMProvider();
    
    // Parse with LLM
    const llmResponse = await llmProvider.parseIntent(llmRequest);
    
    // Validate parsed data
    const validation = plugin.validator.validate(llmResponse.data);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Process intent
    const intent = await plugin.processor.process(llmResponse.data, context);
    
    const processingTime = Date.now() - startTime;
    
    return {
      intent,
      confidence: llmResponse.confidence,
      processingTime,
      metadata: {
        plugin: plugin.type,
        version: plugin.version,
        model: llmResponse.model,
        tokens: llmResponse.tokens.input + llmResponse.tokens.output
      }
    };
  }

  private async processBestEffort(input: string, context?: any): Promise<ProcessedIntent> {
    // Simple fallback implementation
    const fallbackIntent = {
      id: `fallback-${Date.now()}`,
      type: 'custom' as const,
      symbol: 'UNKNOWN',
      metadata: { 
        fallback: true,
        originalInput: input 
      }
    };

    return {
      intent: fallbackIntent,
      confidence: 0.1,
      processingTime: 0,
      metadata: {
        plugin: 'fallback',
        version: '1.0.0',
        model: 'none',
        tokens: 0
      }
    };
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  private async loadPlugin(type: string, config: Record<string, any>): Promise<IntentPlugin> {
    // In a real implementation, this would dynamically load plugins
    // For now, we'll use a plugin factory
    return this.createPlugin(type, config);
  }

  private createPlugin(type: string, config: Record<string, any>): IntentPlugin {
    // Plugin factory - in real implementation, this would be more sophisticated
    throw new Error(`Plugin type ${type} not implemented`);
  }

  private getLLMProvider(): any {
    // In real implementation, this would be injected
    throw new Error('LLM provider not configured');
  }
}