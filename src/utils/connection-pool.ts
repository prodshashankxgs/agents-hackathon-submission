import fetch from 'node-fetch';

interface PooledConnection {
  id: string;
  lastUsed: number;
  inUse: boolean;
  requests: number;
}

interface QueuedRequest {
  resolve: (value: any) => void;
  reject: (error: any) => void;
  url: string;
  options: any;
  priority: number;
  timestamp: number;
}

export class ConnectionPool {
  private connections = new Map<string, PooledConnection>();
  private requestQueue: QueuedRequest[] = [];
  private maxConnections: number;
  private maxRequestsPerConnection: number;
  private connectionTimeout: number;
  private processing = false;

  constructor(
    maxConnections: number = 10,
    maxRequestsPerConnection: number = 100,
    connectionTimeout: number = 30000
  ) {
    this.maxConnections = maxConnections;
    this.maxRequestsPerConnection = maxRequestsPerConnection;
    this.connectionTimeout = connectionTimeout;

    // Cleanup stale connections every 30 seconds
    setInterval(() => this.cleanup(), 30000);
  }

  async request(url: string, options: any = {}, priority: number = 1): Promise<any> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({
        resolve,
        reject,
        url,
        options,
        priority,
        timestamp: Date.now()
      });

      // Sort queue by priority (higher numbers = higher priority)
      this.requestQueue.sort((a, b) => b.priority - a.priority);

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const availableConnection = this.getAvailableConnection();
      
      if (!availableConnection) {
        // If no connections available, wait and try again
        await new Promise(resolve => setTimeout(resolve, 10));
        continue;
      }

      const request = this.requestQueue.shift();
      if (!request) break;

      this.executeRequest(request, availableConnection);
    }

    this.processing = false;
  }

  private getAvailableConnection(): PooledConnection | null {
    // Find an existing available connection
    for (const [id, conn] of this.connections) {
      if (!conn.inUse && conn.requests < this.maxRequestsPerConnection) {
        return conn;
      }
    }

    // Create new connection if under limit
    if (this.connections.size < this.maxConnections) {
      const newConn: PooledConnection = {
        id: Math.random().toString(36).substring(7),
        lastUsed: Date.now(),
        inUse: false,
        requests: 0
      };
      this.connections.set(newConn.id, newConn);
      return newConn;
    }

    return null;
  }

  private async executeRequest(request: QueuedRequest, connection: PooledConnection): Promise<void> {
    connection.inUse = true;
    connection.requests++;
    connection.lastUsed = Date.now();

    try {
      const response = await this.makeRequest(request.url, request.options);
      request.resolve(response);
    } catch (error) {
      request.reject(error);
    } finally {
      connection.inUse = false;
      
      // If connection has reached max requests, remove it
      if (connection.requests >= this.maxRequestsPerConnection) {
        this.connections.delete(connection.id);
      }

      // Continue processing queue
      setImmediate(() => this.processQueue());
    }
  }

  private async makeRequest(url: string, options: any): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.connectionTimeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, conn] of this.connections) {
      // Remove connections that haven't been used in the last 5 minutes
      if (!conn.inUse && now - conn.lastUsed > 300000) {
        this.connections.delete(id);
      }
    }
  }

  getStats(): {
    activeConnections: number;
    totalConnections: number;
    queuedRequests: number;
    averageRequestsPerConnection: number;
  } {
    const totalRequests = Array.from(this.connections.values())
      .reduce((sum, conn) => sum + conn.requests, 0);

    return {
      activeConnections: Array.from(this.connections.values()).filter(c => c.inUse).length,
      totalConnections: this.connections.size,
      queuedRequests: this.requestQueue.length,
      averageRequestsPerConnection: this.connections.size > 0 ? totalRequests / this.connections.size : 0
    };
  }
}

// Retry logic with exponential backoff
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === maxRetries) {
          throw lastError;
        }

        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  static async withRetryOnStatus<T>(
    operation: () => Promise<T>,
    retryableStatuses: number[] = [429, 502, 503, 504],
    maxRetries: number = 3
  ): Promise<T> {
    return this.withRetry(async () => {
      try {
        return await operation();
      } catch (error: any) {
        // Check if it's a retryable HTTP status
        if (error.status && retryableStatuses.includes(error.status)) {
          throw error;
        }
        
        // Check for rate limit in message
        if (error.message && error.message.toLowerCase().includes('rate limit')) {
          throw error;
        }

        // Don't retry for other errors
        throw error;
      }
    }, maxRetries);
  }
}