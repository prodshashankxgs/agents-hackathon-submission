import { TradeIntent, LLMError } from '../types';
import { OpenAIService } from '../llm/openai-service';
import { ClaudeService } from '../llm/claude-service';
import { commandClassifier, ClassificationResult } from './command-classifier';
import { ruleBasedParser, ParseResult } from './rule-based-parser';
import { semanticCache } from './semantic-cache';
import { inputPreprocessor } from './input-preprocessor';
import { modelRouter } from './model-router';
import { parsingMetrics } from './parsing-metrics';

export interface OptimizedParseResult {
  intent: TradeIntent;
  method: 'rule-based' | 'semantic-cache' | 'llm';
  confidence: number;
  processingTime: number;
  tokenUsage?: number;
  cacheHit?: boolean;
  provider?: 'openai' | 'claude'; // Track which LLM provider was used
}

export class OptimizedParsingService {
  private openaiService: OpenAIService;
  private claudeService: ClaudeService;
  private preprocessor: typeof inputPreprocessor;
  private modelRouter: typeof modelRouter;
  private metrics: typeof parsingMetrics;
  private llmProvider: 'openai' | 'claude';

  constructor(llmProvider: 'openai' | 'claude' = 'openai') {
    this.openaiService = new OpenAIService();
    this.claudeService = new ClaudeService();
    this.preprocessor = inputPreprocessor;
    this.modelRouter = modelRouter;
    this.metrics = parsingMetrics;
    this.llmProvider = llmProvider;
  }

  /**
   * Switch the LLM provider
   */
  setLLMProvider(provider: 'openai' | 'claude'): void {
    this.llmProvider = provider;
    console.log(`🔄 Switched LLM provider to: ${provider}`);
  }

  /**
   * Get current LLM provider
   */
  getLLMProvider(): 'openai' | 'claude' {
    return this.llmProvider;
  }

  /**
   * Main parsing method with multi-tier strategy
   */
  async parseTradeIntent(userInput: string): Promise<OptimizedParseResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Preprocess input
      const preprocessedInput = await this.preprocessor.preprocess(userInput);
      console.log(`🔄 Preprocessed: "${userInput}" → "${preprocessedInput}"`);

      // Step 2: Classify input complexity
      const classification = commandClassifier.classify(preprocessedInput);
      console.log(`🏷️ Classification: ${classification.type} (${classification.confidence.toFixed(3)} confidence)`);

      // Step 3: Route to appropriate parser based on classification
      let result: OptimizedParseResult;

      switch (classification.suggestedParser) {
        case 'rule-based':
          result = await this.parseWithRules(preprocessedInput, startTime);
          break;
          
        case 'semantic':
          result = await this.parseWithSemanticCache(preprocessedInput, startTime);
          break;
          
        case 'llm':
        default:
          result = await this.parseWithLLM(preprocessedInput, startTime, classification);
          break;
      }

      // Step 4: Cache successful results
      if (result.confidence > 0.8 && result.method === 'llm') {
        await semanticCache.cacheWithEmbedding(preprocessedInput, result.intent);
      }

      // Step 5: Update metrics
      this.metrics.trackParsing(result.method, result.processingTime, result.tokenUsage || 0);

      console.log(`✅ Parsed via ${result.method} in ${result.processingTime}ms (confidence: ${result.confidence.toFixed(3)})`);
      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.metrics.trackError(error instanceof Error ? error.message : 'Unknown error');
      
      if (error instanceof LLMError) {
        throw error;
      }
      
      throw new LLMError('Failed to parse trade intent', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userInput,
        processingTime
      });
    }
  }

  /**
   * Batch parse multiple inputs for efficiency
   */
  async parseBatch(inputs: string[]): Promise<OptimizedParseResult[]> {
    const startTime = Date.now();
    console.log(`📦 Batch parsing ${inputs.length} inputs...`);

    // Classify all inputs first
    const classifications = inputs.map(input => ({
      input,
      classification: commandClassifier.classify(input)
    }));

    // Group by suggested parser
    const ruleBasedInputs = classifications.filter(c => c.classification.suggestedParser === 'rule-based');
    const semanticInputs = classifications.filter(c => c.classification.suggestedParser === 'semantic');
    const llmInputs = classifications.filter(c => c.classification.suggestedParser === 'llm');

    // Process each group
    const results: OptimizedParseResult[] = [];

    

    // Rule-based (fastest, parallel)
    const ruleResults = await Promise.all(
      ruleBasedInputs.map(async ({ input }) => 
        this.parseWithRules(input, Date.now())
      )
    );
    results.push(...ruleResults);

    // Semantic cache (parallel)
    const semanticResults = await Promise.all(
      semanticInputs.map(async ({ input }) => 
        this.parseWithSemanticCache(input, Date.now())
      )
    );
    results.push(...semanticResults);

    // LLM (batched for efficiency)
    if (llmInputs.length > 0) {
      const llmResults = await this.batchLLMParsing(llmInputs.map(i => i.input));
      results.push(...llmResults);
    }

    const totalTime = Date.now() - startTime;
    console.log(`Batch parsing complete: ${results.length} results in ${totalTime}ms`);

    return results;
  }

  /**
   * Get parsing performance statistics
   */
  getPerformanceStats(): {
    metrics: any;
    cacheStats: any;
    recommendations: string[];
  } {
    const metrics = this.metrics.getStats();
    const cacheStats = semanticCache.getCacheStats();
    const recommendations = this.metrics.getOptimizationSuggestions();

    return {
      metrics,
      cacheStats,
      recommendations
    };
  }

  /**
   * Warm caches with common patterns
   */
  async warmCaches(): Promise<void> {
    const commonPatterns = [
      { input: 'buy $100 AAPL', intent: { action: 'buy', symbol: 'AAPL', amountType: 'dollars', amount: 100, orderType: 'market' } as TradeIntent },
      { input: 'sell 10 shares TSLA', intent: { action: 'sell', symbol: 'TSLA', amountType: 'shares', amount: 10, orderType: 'market' } as TradeIntent },
      { input: 'buy $500 worth of MSFT', intent: { action: 'buy', symbol: 'MSFT', amountType: 'dollars', amount: 500, orderType: 'market' } as TradeIntent },
      { input: 'sell all GOOGL', intent: { action: 'sell', symbol: 'GOOGL', amountType: 'shares', amount: -1, orderType: 'market' } as TradeIntent },
      { input: 'purchase 5 shares of AMZN', intent: { action: 'buy', symbol: 'AMZN', amountType: 'shares', amount: 5, orderType: 'market' } as TradeIntent }
    ];

    await semanticCache.warmCache(commonPatterns);
    console.log('🔥 Cache warming complete');
  }

  private async parseWithRules(input: string, startTime: number): Promise<OptimizedParseResult> {
    const parseResult = ruleBasedParser.parse(input);
    const processingTime = Date.now() - startTime;

    if (parseResult.confidence > 0.8 && parseResult.intent) {
      return {
        intent: parseResult.intent,
        method: 'rule-based',
        confidence: parseResult.confidence,
        processingTime,
        cacheHit: false
      };
    }

    // Fallback to semantic cache
    console.log(`Rule-based parsing failed (confidence: ${parseResult.confidence.toFixed(3)}), trying semantic cache...`);
    return this.parseWithSemanticCache(input, startTime);
  }

  private async parseWithSemanticCache(input: string, startTime: number): Promise<OptimizedParseResult> {
    const cachedIntent = await semanticCache.getSemanticMatch(input);
    const processingTime = Date.now() - startTime;

    if (cachedIntent) {
      return {
        intent: cachedIntent,
        method: 'semantic-cache',
        confidence: 0.9, // High confidence for semantic matches
        processingTime,
        cacheHit: true
      };
    }

    // Fallback to LLM
    console.log(`⚠️ No semantic cache match found, falling back to LLM...`);
    return this.parseWithLLM(input, startTime, { type: 'complex', confidence: 0.5 });
  }

  private async parseWithLLM(input: string, startTime: number, classification: ClassificationResult): Promise<OptimizedParseResult> {
    // Select optimal model based on complexity
    const selectedModel = await this.modelRouter.selectModel(input, classification);
    console.log(`🤖 Using model: ${selectedModel.name} (complexity: ${selectedModel.complexity})`);

    // Use selected LLM service
    console.log(`🤖 Using LLM provider: ${this.llmProvider}`);
    let intent: TradeIntent;
    
    if (this.llmProvider === 'claude') {
      intent = await this.claudeService.parseTradeIntent(input);
    } else {
      intent = await this.openaiService.parseTradeIntent(input);
    }
    const processingTime = Date.now() - startTime;

    // Estimate token usage
    const estimatedTokens = Math.ceil(input.length / 4) + 500; // Rough estimation

    return {
      intent,
      method: 'llm',
      confidence: 0.95, // LLM results are generally high confidence
      processingTime,
      tokenUsage: estimatedTokens,
      cacheHit: false,
      provider: this.llmProvider
    };
  }

  private async batchLLMParsing(inputs: string[]): Promise<OptimizedParseResult[]> {
    const startTime = Date.now();
    console.log(`🚀 Batch LLM parsing ${inputs.length} inputs...`);

    // For now, process sequentially. In production, implement actual batching
    const results: OptimizedParseResult[] = [];
    
    for (const input of inputs) {
      try {
        const result = await this.parseWithLLM(input, Date.now(), { type: 'complex', confidence: 0.5 });
        results.push(result);
      } catch (error) {
        console.error(`Failed to parse input: ${input}`, error);
        // Add error result
        results.push({
          intent: { action: 'buy', symbol: 'UNKNOWN', amountType: 'dollars', amount: 0, orderType: 'market' } as TradeIntent,
          method: 'llm',
          confidence: 0,
          processingTime: Date.now() - startTime,
          cacheHit: false
        });
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Batch LLM parsing complete in ${totalTime}ms`);

    return results;
  }

  /**
   * Generate a human-readable summary of a trade intent
   */
  generateTradeSummary(intent: TradeIntent): string {
    if (this.llmProvider === 'claude') {
      return this.claudeService.generateTradeSummary(intent);
    } else {
      return this.openaiService.generateTradeSummary(intent);
    }
  }

  /**
   * Force a specific parsing method (for testing/debugging)
   */
  async parseWithMethod(input: string, method: 'rule-based' | 'semantic-cache' | 'llm'): Promise<OptimizedParseResult> {
    const startTime = Date.now();
    
    switch (method) {
      case 'rule-based':
        return this.parseWithRules(input, startTime);
      case 'semantic-cache':
        return this.parseWithSemanticCache(input, startTime);
      case 'llm':
        return this.parseWithLLM(input, startTime, { type: 'complex', confidence: 0.5 });
      default:
        throw new Error(`Unknown parsing method: ${method}`);
    }
  }
}

// Global optimized parsing service instance
export const optimizedParsingService = new OptimizedParsingService();