import { ClassificationResult } from './command-classifier';

export interface ModelConfig {
  name: string;
  complexity: 'simple' | 'medium' | 'complex';
  cost: number;
  latency: number;
  contextWindow: number;
  maxTokens: number;
  recommended: boolean;
}

export interface ModelSelection {
  name: string;
  complexity: 'simple' | 'medium' | 'complex';
  reason: string;
  estimatedCost: number;
  estimatedLatency: number;
}

export class ModelRouter {
  private models: Record<string, ModelConfig> = {
    'gpt-4o-mini': {
      name: 'gpt-4o-mini',
      complexity: 'simple',
      cost: 0.00015, // per 1k tokens (input)
      latency: 150, // ms average
      contextWindow: 128000,
      maxTokens: 16384,
      recommended: true
    },
    'gpt-4o': {
      name: 'gpt-4o',
      complexity: 'medium',
      cost: 0.0025, // per 1k tokens (input)
      latency: 300, // ms average
      contextWindow: 128000,
      maxTokens: 4096,
      recommended: true
    },
    'gpt-4-turbo': {
      name: 'gpt-4-turbo',
      complexity: 'complex',
      cost: 0.01, // per 1k tokens (input)
      latency: 800, // ms average
      contextWindow: 128000,
      maxTokens: 4096,
      recommended: false // More expensive, use sparingly
    },
    'gpt-3.5-turbo': {
      name: 'gpt-3.5-turbo',
      complexity: 'simple',
      cost: 0.0005, // per 1k tokens (input)
      latency: 100, // ms average
      contextWindow: 16385,
      maxTokens: 4096,
      recommended: false // Less accurate for trading commands
    }
  };

  private usageStats = {
    totalRequests: 0,
    modelUsage: {} as Record<string, number>,
    costSavings: 0,
    latencySavings: 0
  };

  /**
   * Select optimal model based on input complexity and requirements
   */
  async selectModel(
    input: string, 
    classification: ClassificationResult,
    requirements?: {
      maxLatency?: number;
      maxCost?: number;
      preferAccuracy?: boolean;
      preferSpeed?: boolean;
    }
  ): Promise<ModelSelection> {
    
    const inputTokens = this.estimateTokens(input);
    const baseComplexity = this.assessInputComplexity(input, classification);
    
    // Apply requirements filters
    const eligibleModels = this.filterModelsByRequirements(requirements);
    
    // Score models based on complexity, cost, and latency
    const scoredModels = eligibleModels.map(model => ({
      model,
      score: this.scoreModel(model, baseComplexity, inputTokens, requirements)
    }));
    
    // Sort by score (highest first)
    scoredModels.sort((a, b) => b.score - a.score);
    
    const selectedModel = scoredModels[0]?.model;
    if (!selectedModel) {
      throw new Error('No suitable model found');
    }
    const estimatedCost = this.calculateCost(selectedModel, inputTokens);
    
    // Update usage stats
    this.updateUsageStats(selectedModel.name, estimatedCost);
    
    return {
      name: selectedModel.name,
      complexity: selectedModel.complexity,
      reason: this.getSelectionReason(selectedModel, baseComplexity, requirements),
      estimatedCost,
      estimatedLatency: selectedModel.latency
    };
  }

  /**
   * Get model recommendations for different scenarios
   */
  getRecommendations(): {
    quickParsing: string;
    accurateParsing: string;
    complexAnalysis: string;
    batchProcessing: string;
  } {
    return {
      quickParsing: 'gpt-4o-mini', // Fast, cheap, good for simple commands
      accurateParsing: 'gpt-4o', // Balanced accuracy and speed
      complexAnalysis: 'gpt-4-turbo', // High accuracy for complex scenarios
      batchProcessing: 'gpt-4o-mini' // Cost-effective for high volume
    };
  }

  /**
   * Analyze cost optimization opportunities
   */
  analyzeCostOptimization(): {
    currentDistribution: Record<string, number>;
    potentialSavings: number;
    recommendations: string[];
  } {
    const distribution = { ...this.usageStats.modelUsage };
    const total = Object.values(distribution).reduce((sum, count) => sum + count, 0);
    
    // Calculate percentage distribution
    const percentageDistribution: Record<string, number> = {};
    for (const [model, count] of Object.entries(distribution)) {
      percentageDistribution[model] = total > 0 ? (count / total) * 100 : 0;
    }

    // Calculate potential savings if we used optimal routing
    const currentCost = this.calculateCurrentCost();
    const optimalCost = this.calculateOptimalCost();
    const potentialSavings = Math.max(0, currentCost - optimalCost);

    const recommendations: string[] = [];
    
    // Generate recommendations
    if (percentageDistribution['gpt-4-turbo'] && percentageDistribution['gpt-4-turbo'] > 20) {
      recommendations.push('Consider using gpt-4o for medium complexity tasks instead of gpt-4-turbo');
    }
    
    if (percentageDistribution['gpt-4o-mini'] && percentageDistribution['gpt-4o-mini'] < 50) {
      recommendations.push('Route more simple commands to gpt-4o-mini for cost savings');
    }
    
    if (this.usageStats.totalRequests > 100 && potentialSavings > 1) {
      recommendations.push(`Potential monthly savings: $${potentialSavings.toFixed(2)}`);
    }

    return {
      currentDistribution: percentageDistribution,
      potentialSavings,
      recommendations
    };
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    totalRequests: number;
    modelUsage: Record<string, number>;
    averageCost: number;
    averageLatency: number;
    costSavings: number;
  } {
    const totalRequests = this.usageStats.totalRequests;
    const totalCost = this.calculateCurrentCost();
    const averageCost = totalRequests > 0 ? totalCost / totalRequests : 0;
    
    // Calculate weighted average latency
    let totalLatency = 0;
    let totalWeight = 0;
    
    for (const [modelName, usage] of Object.entries(this.usageStats.modelUsage)) {
      const model = this.models[modelName];
      if (model) {
        totalLatency += model.latency * usage;
        totalWeight += usage;
      }
    }
    
    const averageLatency = totalWeight > 0 ? totalLatency / totalWeight : 0;

    return {
      totalRequests,
      modelUsage: { ...this.usageStats.modelUsage },
      averageCost,
      averageLatency,
      costSavings: this.usageStats.costSavings
    };
  }

  /**
   * Add or update model configuration
   */
  addModel(config: ModelConfig): void {
    this.models[config.name] = config;
  }

  /**
   * Get model configuration
   */
  getModel(name: string): ModelConfig | undefined {
    return this.models[name];
  }

  /**
   * List all available models
   */
  listModels(): ModelConfig[] {
    return Object.values(this.models);
  }

  private assessInputComplexity(input: string, classification: ClassificationResult): number {
    let complexity = classification.confidence;
    
    // Adjust based on input characteristics
    const wordCount = input.split(' ').length;
    const hasMultipleActions = (input.match(/\b(buy|sell|analyze|hedge|recommend)\b/gi) || []).length > 1;
    const hasConditionals = /\b(if|when|unless|after|before)\b/i.test(input);
    const hasMultipleSymbols = (input.match(/\b[A-Z]{1,5}\b/g) || []).length > 1;
    
    // Complexity adjustments
    if (wordCount > 15) complexity += 0.2;
    if (hasMultipleActions) complexity += 0.3;
    if (hasConditionals) complexity += 0.4;
    if (hasMultipleSymbols) complexity += 0.2;
    
    return Math.min(1.0, complexity);
  }

  private filterModelsByRequirements(requirements?: {
    maxLatency?: number;
    maxCost?: number;
    preferAccuracy?: boolean;
    preferSpeed?: boolean;
  }): ModelConfig[] {
    
    let eligibleModels = Object.values(this.models);
    
    if (requirements?.maxLatency) {
      eligibleModels = eligibleModels.filter(m => m.latency <= requirements.maxLatency!);
    }
    
    if (requirements?.maxCost) {
      eligibleModels = eligibleModels.filter(m => m.cost <= requirements.maxCost!);
    }
    
    // If no models pass requirements, fall back to recommended models
    if (eligibleModels.length === 0) {
      eligibleModels = Object.values(this.models).filter(m => m.recommended);
    }
    
    return eligibleModels;
  }

  private scoreModel(
    model: ModelConfig, 
    complexity: number, 
    tokenCount: number,
    requirements?: {
      maxLatency?: number;
      maxCost?: number;
      preferAccuracy?: boolean;
      preferSpeed?: boolean;
    }
  ): number {
    let score = 0;
    
    // Base score based on complexity matching
    const complexityScore = this.getComplexityScore(model, complexity);
    score += complexityScore * 0.4;
    
    // Cost efficiency score (lower cost = higher score)
    const costScore = 1 - (model.cost / Math.max(...Object.values(this.models).map(m => m.cost)));
    score += costScore * 0.3;
    
    // Speed score (lower latency = higher score)
    const speedScore = 1 - (model.latency / Math.max(...Object.values(this.models).map(m => m.latency)));
    score += speedScore * 0.2;
    
    // Recommendation boost
    if (model.recommended) {
      score += 0.1;
    }
    
    // Apply preference modifiers
    if (requirements?.preferAccuracy && model.complexity === 'complex') {
      score += 0.2;
    }
    
    if (requirements?.preferSpeed && model.latency < 200) {
      score += 0.2;
    }
    
    return score;
  }

  private getComplexityScore(model: ModelConfig, inputComplexity: number): number {
    const complexityMap = { simple: 0.2, medium: 0.6, complex: 1.0 };
    const modelComplexity = complexityMap[model.complexity];
    
    // Perfect match gets highest score
    if (Math.abs(modelComplexity - inputComplexity) < 0.2) {
      return 1.0;
    }
    
    // Slight mismatch gets medium score
    if (Math.abs(modelComplexity - inputComplexity) < 0.4) {
      return 0.7;
    }
    
    // Large mismatch gets low score
    return 0.3;
  }

  private getSelectionReason(
    model: ModelConfig, 
    complexity: number,
    requirements?: any
  ): string {
    const reasons: string[] = [];
    
    if (complexity < 0.3) {
      reasons.push('Simple command detected');
    } else if (complexity > 0.7) {
      reasons.push('Complex command requires advanced model');
    } else {
      reasons.push('Medium complexity command');
    }
    
    if (model.cost < 0.001) {
      reasons.push('cost-optimized');
    }
    
    if (model.latency < 200) {
      reasons.push('speed-optimized');
    }
    
    if (requirements?.preferAccuracy) {
      reasons.push('accuracy preferred');
    }
    
    return reasons.join(', ');
  }

  private estimateTokens(input: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(input.length / 4) + 500; // Add base system prompt tokens
  }

  private calculateCost(model: ModelConfig, tokenCount: number): number {
    return (tokenCount / 1000) * model.cost;
  }

  private updateUsageStats(modelName: string, cost: number): void {
    this.usageStats.totalRequests++;
    this.usageStats.modelUsage[modelName] = (this.usageStats.modelUsage[modelName] || 0) + 1;
    
    // Calculate savings compared to always using most expensive model
    const mostExpensiveModel = Object.values(this.models).reduce((max, model) => 
      model.cost > max.cost ? model : max
    );
    const maxCost = this.calculateCost(mostExpensiveModel, this.estimateTokens(''));
    this.usageStats.costSavings += Math.max(0, maxCost - cost);
  }

  private calculateCurrentCost(): number {
    let totalCost = 0;
    for (const [modelName, usage] of Object.entries(this.usageStats.modelUsage)) {
      const model = this.models[modelName];
      if (model) {
        totalCost += usage * model.cost;
      }
    }
    return totalCost;
  }

  private calculateOptimalCost(): number {
    // Simplified calculation assuming optimal routing
    const totalRequests = this.usageStats.totalRequests;
    const cheapestModel = Object.values(this.models).reduce((min, model) => 
      model.cost < min.cost ? model : min
    );
    return totalRequests * cheapestModel.cost;
  }
}

// Global model router instance
export const modelRouter = new ModelRouter();