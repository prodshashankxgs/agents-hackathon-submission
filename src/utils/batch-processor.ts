export interface BatchItem<T> {
  id: string;
  data: T;
}

export interface BatchResult<T, R> {
  id: string;
  success: boolean;
  result?: R;
  error?: string;
}

export class BatchProcessor<T, R> {
  private batchSize: number;
  private delayMs: number;

  constructor(batchSize: number = 10, delayMs: number = 100) {
    this.batchSize = batchSize;
    this.delayMs = delayMs;
  }

  async processBatch(
    items: BatchItem<T>[],
    processor: (item: T) => Promise<R>
  ): Promise<BatchResult<T, R>[]> {
    const results: BatchResult<T, R>[] = [];
    
    for (let i = 0; i < items.length; i += this.batchSize) {
      const batch = items.slice(i, i + this.batchSize);
      
      const batchPromises = batch.map(async (item) => {
        try {
          const result = await processor(item.data);
          return {
            id: item.id,
            success: true,
            result
          };
        } catch (error) {
          return {
            id: item.id,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches to avoid overwhelming APIs
      if (i + this.batchSize < items.length && this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
    }

    return results;
  }

  /**
   * Process items with retry logic
   */
  async processBatchWithRetry(
    items: BatchItem<T>[],
    processor: (item: T) => Promise<R>,
    maxRetries: number = 3
  ): Promise<BatchResult<T, R>[]> {
    let attempts = 0;
    let remainingItems = [...items];
    const successfulResults: BatchResult<T, R>[] = [];

    while (attempts < maxRetries && remainingItems.length > 0) {
      attempts++;
      
      const results = await this.processBatch(remainingItems, processor);
      
      // Separate successful and failed results
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      successfulResults.push(...successful);
      
      if (failed.length === 0) {
        break;
      }
      
      // Prepare failed items for retry
      remainingItems = failed.map(failedResult => {
        const originalItem = remainingItems.find(item => item.id === failedResult.id);
        return originalItem!;
      });
      
      // If this isn't the last attempt, wait before retrying
      if (attempts < maxRetries && remainingItems.length > 0) {
        const backoffDelay = Math.min(1000 * Math.pow(2, attempts - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    // Add any remaining failed items to results
    const finalFailedResults = remainingItems.map(item => ({
      id: item.id,
      success: false as const,
      error: `Failed after ${maxRetries} attempts`
    }));

    return [...successfulResults, ...finalFailedResults];
  }
}

// Specialized batch processor for market data
export class MarketDataBatchProcessor extends BatchProcessor<string, any> {
  constructor() {
    super(5, 200); // 5 symbols per batch, 200ms delay
  }

  async fetchMarketDataBatch(
    symbols: string[],
    fetcher: (symbol: string) => Promise<any>
  ): Promise<Map<string, any>> {
    const items: BatchItem<string>[] = symbols.map(symbol => ({
      id: symbol,
      data: symbol
    }));

    const results = await this.processBatchWithRetry(items, fetcher);
    
    const resultMap = new Map<string, any>();
    results.forEach(result => {
      if (result.success && result.result) {
        resultMap.set(result.id, result.result);
      }
    });

    return resultMap;
  }
}