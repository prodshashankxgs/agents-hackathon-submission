export interface ParseMetrics {
  method: 'rule-based' | 'semantic-cache' | 'llm';
  processingTime: number;
  timestamp: number;
  tokenUsage: number;
  success: boolean;
  confidence: number;
  inputLength: number;
  cacheHit?: boolean;
}

export interface AggregatedMetrics {
  totalRequests: number;
  averageLatency: number;
  successRate: number;
  cacheHitRate: number;
  costPerRequest: number;
  methodDistribution: Record<string, number>;
  latencyDistribution: Record<string, number>;
  errorRate: number;
  tokenUsageTotal: number;
  averageTokensPerRequest: number;
}

export class ParsingMetrics {
  private metrics: ParseMetrics[] = [];
  private errors: Array<{ timestamp: number; error: string; method?: string }> = [];
  private readonly MAX_METRICS_HISTORY = 10000;
  private readonly LATENCY_BUCKETS = [10, 50, 100, 200, 500, 1000, 2000];
  
  // Real-time counters for performance
  private counters = {
    totalRequests: 0,
    successfulRequests: 0,
    cacheHits: 0,
    totalLatency: 0,
    totalTokens: 0,
    errorCount: 0,
    ruleBasedCount: 0,
    semanticCacheCount: 0,
    llmCount: 0
  };

  /**
   * Track a parsing operation
   */
  trackParsing(
    method: 'rule-based' | 'semantic-cache' | 'llm',
    processingTime: number,
    tokenUsage: number = 0,
    options?: {
      success?: boolean;
      confidence?: number;
      inputLength?: number;
      cacheHit?: boolean;
    }
  ): void {
    const metric: ParseMetrics = {
      method,
      processingTime,
      timestamp: Date.now(),
      tokenUsage,
      success: options?.success ?? true,
      confidence: options?.confidence ?? 1.0,
      inputLength: options?.inputLength ?? 0,
      cacheHit: options?.cacheHit ?? false
    };

    // Add to history (with size limit)
    this.metrics.push(metric);
    if (this.metrics.length > this.MAX_METRICS_HISTORY) {
      this.metrics.shift();
    }

    // Update real-time counters
    this.updateCounters(metric);

    // Log significant events
    this.logSignificantEvents(metric);
  }

  /**
   * Track parsing errors
   */
  trackError(error: string, method?: 'rule-based' | 'semantic-cache' | 'llm'): void {
    const errorRecord: { timestamp: number; error: string; method?: string } = {
      timestamp: Date.now(),
      error
    };
    
    if (method) {
      errorRecord.method = method;
    }
    
    this.errors.push(errorRecord);

    // Keep only recent errors
    if (this.errors.length > 1000) {
      this.errors.shift();
    }

    this.counters.errorCount++;
    this.counters.totalRequests++;

    console.warn(`🚨 Parsing error (${method || 'unknown'}): ${error}`);
  }

  /**
   * Get current performance statistics
   */
  getStats(): AggregatedMetrics {
    const recentMetrics = this.getRecentMetrics(60000); // Last minute
    
    if (recentMetrics.length === 0) {
      return this.getEmptyStats();
    }

    const totalRequests = this.counters.totalRequests;
    const successfulRequests = recentMetrics.filter(m => m.success).length;
    const cacheHits = recentMetrics.filter(m => m.cacheHit).length;
    const totalLatency = recentMetrics.reduce((sum, m) => sum + m.processingTime, 0);
    const totalTokens = recentMetrics.reduce((sum, m) => sum + m.tokenUsage, 0);

    const methodCounts = this.getMethodDistribution(recentMetrics);
    const latencyBuckets = this.getLatencyDistribution(recentMetrics);

    return {
      totalRequests,
      averageLatency: totalLatency / recentMetrics.length,
      successRate: successfulRequests / recentMetrics.length,
      cacheHitRate: cacheHits / recentMetrics.length,
      costPerRequest: this.calculateAverageCost(recentMetrics),
      methodDistribution: methodCounts,
      latencyDistribution: latencyBuckets,
      errorRate: this.counters.errorCount / Math.max(1, totalRequests),
      tokenUsageTotal: totalTokens,
      averageTokensPerRequest: totalTokens / Math.max(1, recentMetrics.length)
    };
  }

  /**
   * Get optimization suggestions based on current metrics
   */
  getOptimizationSuggestions(): string[] {
    const stats = this.getStats();
    const suggestions: string[] = [];

    // Cache optimization
    if (stats.cacheHitRate < 0.3 && stats.totalRequests > 50) {
      suggestions.push('Low cache hit rate - consider expanding semantic cache or improving rule patterns');
    }

    // Latency optimization
    if (stats.averageLatency > 500) {
      suggestions.push('High average latency - consider routing more requests to rule-based parser');
    }

    // Cost optimization
    if (stats.methodDistribution['llm'] && stats.methodDistribution['llm'] > 0.5 && stats.totalRequests > 100) {
      suggestions.push('High LLM usage - optimize classification to route more simple commands to rule-based parser');
    }

    // Error rate optimization
    if (stats.errorRate > 0.1) {
      suggestions.push('High error rate - review input validation and error handling');
    }

    // Token usage optimization
    if (stats.averageTokensPerRequest > 1000) {
      suggestions.push('High token usage - consider prompt optimization or input preprocessing');
    }

    // Method distribution optimization
    const idealDistribution = { 'rule-based': 0.6, 'semantic-cache': 0.3, 'llm': 0.1 };
    for (const [method, ideal] of Object.entries(idealDistribution)) {
      const actual = stats.methodDistribution[method] || 0;
      if (Math.abs(actual - ideal) > 0.2) {
        if (actual < ideal) {
          suggestions.push(`Increase ${method} usage - currently ${(actual * 100).toFixed(1)}%, target ${(ideal * 100).toFixed(1)}%`);
        }
      }
    }

    return suggestions;
  }

  /**
   * Get detailed performance report
   */
  getPerformanceReport(timeRange: number = 3600000): {
    summary: AggregatedMetrics;
    trends: {
      latencyTrend: number;
      successRateTrend: number;
      cacheHitTrend: number;
    };
    topErrors: Array<{ error: string; count: number }>;
    recommendations: string[];
  } {
    const metrics = this.getRecentMetrics(timeRange);
    const summary = this.getStats();
    
    // Calculate trends (compare first half vs second half of time period)
    const midpoint = metrics.length / 2;
    const firstHalf = metrics.slice(0, midpoint);
    const secondHalf = metrics.slice(midpoint);

    const trends = {
      latencyTrend: this.calculateTrend(firstHalf, secondHalf, 'processingTime'),
      successRateTrend: this.calculateSuccessTrend(firstHalf, secondHalf),
      cacheHitTrend: this.calculateCacheHitTrend(firstHalf, secondHalf)
    };

    // Get top errors
    const errorCounts = new Map<string, number>();
    this.errors
      .filter(e => Date.now() - e.timestamp < timeRange)
      .forEach(e => {
        errorCounts.set(e.error, (errorCounts.get(e.error) || 0) + 1);
      });

    const topErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      summary,
      trends,
      topErrors,
      recommendations: this.getOptimizationSuggestions()
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.metrics = [];
    this.errors = [];
    this.counters = {
      totalRequests: 0,
      successfulRequests: 0,
      cacheHits: 0,
      totalLatency: 0,
      totalTokens: 0,
      errorCount: 0,
      ruleBasedCount: 0,
      semanticCacheCount: 0,
      llmCount: 0
    };
  }

  /**
   * Export metrics for external analysis
   */
  exportMetrics(timeRange: number = 3600000): {
    metrics: ParseMetrics[];
    errors: Array<{ timestamp: number; error: string; method?: string }>;
    summary: AggregatedMetrics;
  } {
    const metrics = this.getRecentMetrics(timeRange);
    const errors = this.errors.filter(e => Date.now() - e.timestamp < timeRange);
    const summary = this.getStats();

    return { metrics, errors, summary };
  }

  private updateCounters(metric: ParseMetrics): void {
    this.counters.totalRequests++;
    this.counters.totalLatency += metric.processingTime;
    this.counters.totalTokens += metric.tokenUsage;

    if (metric.success) {
      this.counters.successfulRequests++;
    }

    if (metric.cacheHit) {
      this.counters.cacheHits++;
    }

    switch (metric.method) {
      case 'rule-based':
        this.counters.ruleBasedCount++;
        break;
      case 'semantic-cache':
        this.counters.semanticCacheCount++;
        break;
      case 'llm':
        this.counters.llmCount++;
        break;
    }
  }

  private logSignificantEvents(metric: ParseMetrics): void {
    // Log slow requests
    if (metric.processingTime > 1000) {
      console.warn(`🐌 Slow parsing request: ${metric.processingTime}ms (${metric.method})`);
    }

    // Log high token usage
    if (metric.tokenUsage > 2000) {
      console.warn(`💰 High token usage: ${metric.tokenUsage} tokens (${metric.method})`);
    }

    // Log failures
    if (!metric.success) {
      console.error(`❌ Parsing failed using ${metric.method}`);
    }

    // Log cache performance
    if (metric.method === 'semantic-cache' && metric.cacheHit) {
      console.log(`🎯 Semantic cache hit in ${metric.processingTime}ms`);
    }
  }

  private getRecentMetrics(timeRange: number): ParseMetrics[] {
    const cutoff = Date.now() - timeRange;
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  private getEmptyStats(): AggregatedMetrics {
    return {
      totalRequests: 0,
      averageLatency: 0,
      successRate: 0,
      cacheHitRate: 0,
      costPerRequest: 0,
      methodDistribution: {},
      latencyDistribution: {},
      errorRate: 0,
      tokenUsageTotal: 0,
      averageTokensPerRequest: 0
    };
  }

  private getMethodDistribution(metrics: ParseMetrics[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    const total = metrics.length;

    metrics.forEach(m => {
      distribution[m.method] = (distribution[m.method] || 0) + 1;
    });

    // Convert to percentages
    for (const method in distribution) {
      if (distribution[method] !== undefined) {
        distribution[method] /= total;
      }
    }

    return distribution;
  }

  private getLatencyDistribution(metrics: ParseMetrics[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    this.LATENCY_BUCKETS.forEach((bucket, index) => {
      const label = index === 0 ? `<${bucket}ms` : 
                   index === this.LATENCY_BUCKETS.length - 1 ? `>${this.LATENCY_BUCKETS[index - 1]}ms` :
                   `${this.LATENCY_BUCKETS[index - 1]}-${bucket}ms`;
      distribution[label] = 0;
    });

    metrics.forEach(m => {
      const latency = m.processingTime;
      for (let i = 0; i < this.LATENCY_BUCKETS.length; i++) {
        const currentBucket = this.LATENCY_BUCKETS[i];
        const previousBucket = this.LATENCY_BUCKETS[i - 1];
        if (currentBucket !== undefined && latency < currentBucket) {
          const label = i === 0 ? `<${currentBucket}ms` : 
                       `${previousBucket}-${currentBucket}ms`;
          if (distribution[label] !== undefined) {
            distribution[label]++;
          }
          break;
        }
      }
      const lastBucket = this.LATENCY_BUCKETS[this.LATENCY_BUCKETS.length - 1];
      if (lastBucket !== undefined && latency >= lastBucket) {
        const label = `>${lastBucket}ms`;
        if (distribution[label] !== undefined) {
          distribution[label]++;
        }
      }
    });

    return distribution;
  }

  private calculateAverageCost(metrics: ParseMetrics[]): number {
    // Simplified cost calculation based on token usage and method
    const costPerToken = 0.00002; // Average cost per token
    const totalTokens = metrics.reduce((sum, m) => sum + m.tokenUsage, 0);
    return totalTokens * costPerToken / Math.max(1, metrics.length);
  }

  private calculateTrend(firstHalf: ParseMetrics[], secondHalf: ParseMetrics[], field: keyof ParseMetrics): number {
    if (firstHalf.length === 0 || secondHalf.length === 0) return 0;

    const firstAvg = firstHalf.reduce((sum, m) => sum + (m[field] as number), 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, m) => sum + (m[field] as number), 0) / secondHalf.length;

    return ((secondAvg - firstAvg) / firstAvg) * 100; // Percentage change
  }

  private calculateSuccessTrend(firstHalf: ParseMetrics[], secondHalf: ParseMetrics[]): number {
    if (firstHalf.length === 0 || secondHalf.length === 0) return 0;

    const firstSuccessRate = firstHalf.filter(m => m.success).length / firstHalf.length;
    const secondSuccessRate = secondHalf.filter(m => m.success).length / secondHalf.length;

    return ((secondSuccessRate - firstSuccessRate) / firstSuccessRate) * 100;
  }

  private calculateCacheHitTrend(firstHalf: ParseMetrics[], secondHalf: ParseMetrics[]): number {
    if (firstHalf.length === 0 || secondHalf.length === 0) return 0;

    const firstCacheRate = firstHalf.filter(m => m.cacheHit).length / firstHalf.length;
    const secondCacheRate = secondHalf.filter(m => m.cacheHit).length / secondHalf.length;

    if (firstCacheRate === 0) return 0;
    return ((secondCacheRate - firstCacheRate) / firstCacheRate) * 100;
  }
}

// Global parsing metrics instance
export const parsingMetrics = new ParsingMetrics();