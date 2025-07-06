interface QueueItem<T> {
  data: T;
  priority: number;
  timestamp: number;
  retries: number;
  maxRetries: number;
  id: string;
}

interface QueueConfig {
  maxSize: number;
  defaultPriority: number;
  maxRetries: number;
  retryDelay: number;
  processingDelay: number;
}

export enum Priority {
  CRITICAL = 100,
  HIGH = 75,
  NORMAL = 50,
  LOW = 25,
  BACKGROUND = 10
}

export class PriorityQueue<T> {
  private queue: QueueItem<T>[] = [];
  private processing = false;
  private config: QueueConfig;
  private processors = new Map<string, (item: T) => Promise<void>>();

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultPriority: Priority.NORMAL,
      maxRetries: 3,
      retryDelay: 1000,
      processingDelay: 10,
      ...config
    };
  }

  /**
   * Add item to queue with priority
   */
  enqueue(
    data: T,
    priority: number = this.config.defaultPriority,
    maxRetries: number = this.config.maxRetries
  ): string {
    if (this.queue.length >= this.config.maxSize) {
      // Remove lowest priority item if queue is full
      this.queue.sort((a, b) => a.priority - b.priority);
      this.queue.shift();
    }

    const id = Math.random().toString(36).substring(7);
    const item: QueueItem<T> = {
      data,
      priority,
      timestamp: Date.now(),
      retries: 0,
      maxRetries,
      id
    };

    this.queue.push(item);
    this.sortQueue();
    
    // Start processing if not already running
    if (!this.processing) {
      setImmediate(() => this.processQueue());
    }

    return id;
  }

  /**
   * Remove item from queue by ID
   */
  dequeue(id: string): boolean {
    const index = this.queue.findIndex(item => item.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Register a processor function for queue items
   */
  registerProcessor(name: string, processor: (item: T) => Promise<void>): void {
    this.processors.set(name, processor);
  }

  /**
   * Process queue items by priority
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0 || this.processors.size === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.queue.length > 0) {
        this.sortQueue();
        const item = this.queue.shift();
        
        if (!item) break;

        try {
          // Try all registered processors until one succeeds
          let processed = false;
          for (const [name, processor] of this.processors) {
            try {
              await processor(item.data);
              processed = true;
              break;
            } catch (error) {
              console.warn(`Processor ${name} failed for item ${item.id}:`, error);
            }
          }

          if (!processed) {
            throw new Error('All processors failed');
          }

        } catch (error) {
          // Handle retry logic
          if (item.retries < item.maxRetries) {
            item.retries++;
            item.priority -= 5; // Slightly lower priority on retry
            
            // Exponential backoff delay
            const delay = this.config.retryDelay * Math.pow(2, item.retries - 1);
            
            setTimeout(() => {
              this.queue.push(item);
              this.sortQueue();
            }, delay);
            
            console.log(`Retrying item ${item.id} (attempt ${item.retries}/${item.maxRetries}) after ${delay}ms`);
          } else {
            console.error(`Item ${item.id} failed after ${item.maxRetries} retries:`, error);
          }
        }

        // Small delay between processing items to prevent blocking
        if (this.config.processingDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.config.processingDelay));
        }
      }
    } finally {
      this.processing = false;
      
      // Schedule next processing cycle if queue has items
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * Sort queue by priority (highest first) and then by timestamp
   */
  private sortQueue(): void {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // Higher priority first
      }
      return a.timestamp - b.timestamp; // Earlier timestamp first for same priority
    });
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    size: number;
    processing: boolean;
    averagePriority: number;
    oldestItem: number;
    processors: number;
  } {
    const totalPriority = this.queue.reduce((sum, item) => sum + item.priority, 0);
    const oldestTimestamp = this.queue.length > 0 
      ? Math.min(...this.queue.map(item => item.timestamp))
      : 0;

    return {
      size: this.queue.length,
      processing: this.processing,
      averagePriority: this.queue.length > 0 ? totalPriority / this.queue.length : 0,
      oldestItem: oldestTimestamp > 0 ? Date.now() - oldestTimestamp : 0,
      processors: this.processors.size
    };
  }

  /**
   * Clear all items from queue
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get items by priority range
   */
  getItemsByPriority(minPriority: number, maxPriority: number): QueueItem<T>[] {
    return this.queue.filter(item => 
      item.priority >= minPriority && item.priority <= maxPriority
    );
  }

  /**
   * Update item priority
   */
  updatePriority(id: string, newPriority: number): boolean {
    const item = this.queue.find(item => item.id === id);
    if (item) {
      item.priority = newPriority;
      this.sortQueue();
      return true;
    }
    return false;
  }
}

// Specialized queue for different request types
export class APIRequestQueue extends PriorityQueue<any> {
  constructor() {
    super({
      maxSize: 500,
      defaultPriority: Priority.NORMAL,
      maxRetries: 3,
      retryDelay: 1000,
      processingDelay: 50 // 50ms between API calls
    });
  }

  /**
   * Add market data request with high priority
   */
  addMarketDataRequest(symbol: string, callback: () => Promise<void>): string {
    return this.enqueue({
      type: 'marketData',
      symbol,
      callback
    }, Priority.HIGH);
  }

  /**
   * Add account request with critical priority
   */
  addAccountRequest(callback: () => Promise<void>): string {
    return this.enqueue({
      type: 'account',
      callback
    }, Priority.CRITICAL);
  }

  /**
   * Add order execution with critical priority
   */
  addOrderRequest(orderId: string, callback: () => Promise<void>): string {
    return this.enqueue({
      type: 'order',
      orderId,
      callback
    }, Priority.CRITICAL);
  }

  /**
   * Add portfolio history with low priority
   */
  addPortfolioHistoryRequest(callback: () => Promise<void>): string {
    return this.enqueue({
      type: 'portfolioHistory',
      callback
    }, Priority.LOW);
  }
}

// Global instances
export const apiRequestQueue = new APIRequestQueue();

// Register default processor
apiRequestQueue.registerProcessor('default', async (item: any) => {
  if (item.callback && typeof item.callback === 'function') {
    await item.callback();
  } else {
    throw new Error('No callback function provided');
  }
});

// Auto-start processing
setTimeout(() => {
  // Initial processing trigger
  apiRequestQueue.enqueue({ type: 'init' }, Priority.BACKGROUND);
}, 100);