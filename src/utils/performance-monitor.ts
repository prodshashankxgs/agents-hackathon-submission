export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private activeTimers = new Map<string, number>();

  /**
   * Start timing an operation
   */
  startTimer(name: string): void {
    this.activeTimers.set(name, Date.now());
  }

  /**
   * End timing an operation and record the metric
   */
  endTimer(name: string, success: boolean = true, error?: string): number {
    const startTime = this.activeTimers.get(name);
    if (!startTime) {
      console.warn(`No timer found for operation: ${name}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.activeTimers.delete(name);

    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      success
    };

    if (error) {
      metric.error = error;
    }

    this.metrics.push(metric);

    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    return duration;
  }

  /**
   * Time an async operation
   */
  async timeOperation<T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> {
    this.startTimer(name);
    try {
      const result = await operation();
      this.endTimer(name, true);
      return result;
    } catch (error) {
      this.endTimer(name, false, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Get performance statistics
   */
  getStats(operationName?: string): {
    count: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
    recentAvg: number; // Last 10 operations
  } {
    let filteredMetrics = this.metrics;
    
    if (operationName) {
      filteredMetrics = this.metrics.filter(m => m.name === operationName);
    }

    if (filteredMetrics.length === 0) {
      return {
        count: 0,
        avgDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        successRate: 0,
        recentAvg: 0
      };
    }

    const durations = filteredMetrics.map(m => m.duration);
    const successCount = filteredMetrics.filter(m => m.success).length;
    const recent = filteredMetrics.slice(-10);
    const recentDurations = recent.map(m => m.duration);

    return {
      count: filteredMetrics.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      successRate: successCount / filteredMetrics.length,
      recentAvg: recentDurations.length > 0 
        ? recentDurations.reduce((a, b) => a + b, 0) / recentDurations.length 
        : 0
    };
  }

  /**
   * Get all operation names
   */
  getOperationNames(): string[] {
    const names = new Set(this.metrics.map(m => m.name));
    return Array.from(names);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.activeTimers.clear();
  }

  /**
   * Get recent slow operations (>1s)
   */
  getSlowOperations(threshold: number = 1000): PerformanceMetric[] {
    return this.metrics
      .filter(m => m.duration > threshold)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);
  }

  /**
   * Export metrics for analysis
   */
  exportMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

// Express middleware for automatic endpoint timing
export const performanceMiddleware = (req: any, res: any, next: any) => {
  const operationName = `${req.method} ${req.path}`;
  performanceMonitor.startTimer(operationName);
  
  const originalSend = res.send;
  res.send = function(data: any) {
    const success = res.statusCode < 400;
    const duration = performanceMonitor.endTimer(operationName, success);
    
    // Silent monitoring - no slow operation warnings
    
    originalSend.call(this, data);
  };
  
  next();
};