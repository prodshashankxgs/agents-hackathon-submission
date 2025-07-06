interface BatchRequest<T> {
  key: string;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  timestamp: number;
}

interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number;
  deduplicationWindow: number;
}

export class RequestBatcher<T> {
  private batches = new Map<string, BatchRequest<T>[]>();
  private pendingRequests = new Map<string, BatchRequest<T>>();
  private timers = new Map<string, NodeJS.Timeout>();
  private config: BatchConfig;

  constructor(config: Partial<BatchConfig> = {}) {
    this.config = {
      maxBatchSize: 10,
      maxWaitTime: 100, // 100ms
      deduplicationWindow: 5000, // 5 seconds
      ...config
    };
  }

  async addRequest<K extends string>(
    batchKey: K,
    requestKey: string,
    executor: (keys: string[]) => Promise<Map<string, T>>
  ): Promise<T> {
    // Check for duplicate request within deduplication window
    const existingRequest = this.pendingRequests.get(requestKey);
    if (existingRequest && Date.now() - existingRequest.timestamp < this.config.deduplicationWindow) {
      return new Promise<T>((resolve, reject) => {
        // Share the same promise as the existing request
        const originalResolve = existingRequest.resolve;
        const originalReject = existingRequest.reject;
        
        existingRequest.resolve = (value: T) => {
          resolve(value);
          originalResolve(value);
        };
        
        existingRequest.reject = (error: any) => {
          reject(error);
          originalReject(error);
        };
      });
    }

    return new Promise<T>((resolve, reject) => {
      const request: BatchRequest<T> = {
        key: requestKey,
        resolve,
        reject,
        timestamp: Date.now()
      };

      // Add to pending requests for deduplication
      this.pendingRequests.set(requestKey, request);

      // Add to batch
      if (!this.batches.has(batchKey)) {
        this.batches.set(batchKey, []);
      }

      const batch = this.batches.get(batchKey)!;
      batch.push(request);

      // Execute batch if it reaches max size
      if (batch.length >= this.config.maxBatchSize) {
        this.executeBatch(batchKey, executor);
      } else {
        // Set timer for batch execution if not already set
        if (!this.timers.has(batchKey)) {
          const timer = setTimeout(() => {
            this.executeBatch(batchKey, executor);
          }, this.config.maxWaitTime);
          
          this.timers.set(batchKey, timer);
        }
      }
    });
  }

  private async executeBatch<K extends string>(
    batchKey: K,
    executor: (keys: string[]) => Promise<Map<string, T>>
  ): Promise<void> {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) return;

    // Clear timer and batch
    const timer = this.timers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(batchKey);
    }
    this.batches.delete(batchKey);

    // Extract unique keys
    const keys = Array.from(new Set(batch.map(req => req.key)));

    try {
      const results = await executor(keys);
      
      // Resolve all requests in the batch
      for (const request of batch) {
        const result = results.get(request.key);
        if (result !== undefined) {
          request.resolve(result);
        } else {
          request.reject(new Error(`No result for key: ${request.key}`));
        }
        
        // Remove from pending requests
        this.pendingRequests.delete(request.key);
      }
    } catch (error) {
      // Reject all requests in the batch
      for (const request of batch) {
        request.reject(error);
        this.pendingRequests.delete(request.key);
      }
    }
  }

  // Clean up old pending requests
  cleanup(): void {
    const now = Date.now();
    for (const [key, request] of this.pendingRequests) {
      if (now - request.timestamp > this.config.deduplicationWindow) {
        this.pendingRequests.delete(key);
      }
    }
  }

  getStats(): {
    pendingRequests: number;
    activeBatches: number;
    activeTimers: number;
  } {
    return {
      pendingRequests: this.pendingRequests.size,
      activeBatches: this.batches.size,
      activeTimers: this.timers.size
    };
  }
}

// Specialized market data batcher
export class MarketDataBatcher extends RequestBatcher<any> {
  constructor() {
    super({
      maxBatchSize: 20, // Batch up to 20 symbols
      maxWaitTime: 50,  // Wait max 50ms
      deduplicationWindow: 1000 // 1 second deduplication
    });

    // Auto cleanup every 30 seconds
    setInterval(() => this.cleanup(), 30000);
  }

  async getMarketData(
    symbol: string,
    fetcher: (symbols: string[]) => Promise<Map<string, any>>
  ): Promise<any> {
    return this.addRequest('marketData', symbol.toUpperCase(), fetcher);
  }
}

// Account info batcher for multiple account requests
export class AccountInfoBatcher extends RequestBatcher<any> {
  private lastFetch = 0;
  private cachedResult: any = null;
  private readonly cacheTTL = 30000; // 30 seconds

  constructor() {
    super({
      maxBatchSize: 1, // Account info is singular
      maxWaitTime: 10,  // Very short wait
      deduplicationWindow: 30000 // 30 second deduplication
    });
  }

  async getAccountInfo(
    fetcher: () => Promise<any>
  ): Promise<any> {
    // Return cached result if still valid
    if (this.cachedResult && Date.now() - this.lastFetch < this.cacheTTL) {
      return this.cachedResult;
    }

    return this.addRequest('account', 'accountInfo', async () => {
      const result = await fetcher();
      this.cachedResult = result;
      this.lastFetch = Date.now();
      return new Map([['accountInfo', result]]);
    });
  }
}

// Global instances
export const marketDataBatcher = new MarketDataBatcher();
export const accountInfoBatcher = new AccountInfoBatcher();