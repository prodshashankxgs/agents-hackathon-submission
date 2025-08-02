export class ConcurrencyLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  private maxConcurrency: number;

  constructor(maxConcurrency: number = 5) {
    this.maxConcurrency = maxConcurrency;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const task = async () => {
        try {
          this.running++;
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.running--;
          this.processQueue();
        }
      };

      if (this.running < this.maxConcurrency) {
        task();
      } else {
        this.queue.push(task);
      }
    });
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.maxConcurrency) {
      const task = this.queue.shift();
      if (task) {
        task();
      }
    }
  }

  getStats(): { running: number; queued: number } {
    return {
      running: this.running,
      queued: this.queue.length
    };
  }
}

// Global limiters
export const llmLimiter = new ConcurrencyLimiter(15);
export const llmMarketDataLimiter = new ConcurrencyLimiter(25);
export const brokerLimiter = new ConcurrencyLimiter(10);