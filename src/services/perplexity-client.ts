import fetch from 'node-fetch';
import { config } from '../config';
import { TradingError } from '../types';

export interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
      role: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
  created: number;
}

export interface PerplexityRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  return_citations?: boolean;
  search_domain_filter?: string[];
  return_images?: boolean;
  return_related_questions?: boolean;
  search_recency_filter?: 'month' | 'week' | 'day' | 'hour';
  top_k?: number;
  stream?: boolean;
}

export interface RequestMetrics {
  requestId: string;
  timestamp: number;
  duration: number;
  tokensUsed: number;
  model: string;
  success: boolean;
  error?: string;
}

export class PerplexityClient {
  private readonly baseUrl = 'https://api.perplexity.ai';
  private readonly timeout = 30000;
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000;
  
  // Rate limiting
  private requestQueue: Array<() => Promise<void>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 1000; // 1 second between requests
  
  // Metrics tracking
  private metrics: RequestMetrics[] = [];
  private readonly maxMetricsHistory = 1000;
  
  constructor() {
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!config.perplexityApiKey) {
      throw new TradingError(
        'Perplexity API key is required. Please set PERPLEXITY_API_KEY environment variable.',
        'MISSING_API_KEY'
      );
    }
  }

  /**
   * Make a request to Perplexity API with comprehensive error handling
   */
  async request(payload: PerplexityRequest): Promise<PerplexityResponse> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    try {
      // Add request to queue for rate limiting
      const response = await this.enqueueRequest(async () => {
        return await this.makeRequest(payload, requestId);
      });
      
      // Track successful request
      this.trackMetrics({
        requestId,
        timestamp: startTime,
        duration: Date.now() - startTime,
        tokensUsed: response.usage.total_tokens,
        model: payload.model,
        success: true
      });
      
      return response;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Track failed request
      this.trackMetrics({
        requestId,
        timestamp: startTime,
        duration: Date.now() - startTime,
        tokensUsed: 0,
        model: payload.model,
        success: false,
        error: errorMessage
      });
      
      throw error;
    }
  }

  /**
   * Specialized request for 13F filing analysis
   */
  async analyze13F(institution: string, options: {
    maxHoldings?: number;
    includeAnalysis?: boolean;
    recency?: 'month' | 'week' | 'day';
  } = {}): Promise<PerplexityResponse> {
    const { maxHoldings = 50, includeAnalysis = true, recency = 'month' } = options;
    
    const systemPrompt = `You are a financial analyst specializing in SEC 13F filings. 
    Provide accurate, structured information about institutional holdings based on the most recent SEC filings.
    Format your response as structured data that can be easily parsed.
    Include company names, stock symbols, share counts, market values, and portfolio percentages.`;
    
    const userPrompt = `Analyze the latest 13F filing for ${institution}. Provide:
    1. Filing date and quarter end date
    2. Top ${maxHoldings} holdings with:
       - Stock symbol (e.g., AAPL, MSFT)
       - Company name
       - Number of shares held
       - Market value of holding
       - Percentage of total portfolio
       - Changes from previous quarter (if available)
    ${includeAnalysis ? '3. Brief analysis of portfolio changes and strategy' : ''}
    
    Focus on the most recent filing and provide accurate data from SEC records.`;

    return await this.request({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.1,
      return_citations: true,
      search_recency_filter: recency,
      search_domain_filter: ['sec.gov', 'edgar.sec.gov']
    });
  }

  /**
   * Specialized request for VIP investor profile analysis
   */
  async analyzeInvestorProfile(personName: string, options: {
    includeStrategy?: boolean;
    includePerformance?: boolean;
    recency?: 'month' | 'week' | 'day';
  } = {}): Promise<PerplexityResponse> {
    const { includeStrategy = true, includePerformance = true, recency = 'month' } = options;
    
    const systemPrompt = `You are a financial research analyst specializing in institutional investors and fund managers.
    Provide comprehensive, factual information about investment professionals based on public records and filings.
    Focus on their investment approach, notable holdings, and track record.`;
    
    const userPrompt = `Analyze investor profile for ${personName}. Provide:
    1. Current position and firm affiliation
    2. Investment philosophy and strategy
    3. Notable current holdings and recent moves
    4. Track record and performance history
    ${includeStrategy ? '5. Investment strategy and approach' : ''}
    ${includePerformance ? '6. Historical performance metrics (if publicly available)' : ''}
    7. Recent news or developments
    
    Base information on SEC filings, public statements, and credible financial sources.`;

    return await this.request({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 1500,
      temperature: 0.2,
      return_citations: true,
      search_recency_filter: recency,
      search_domain_filter: ['sec.gov', 'edgar.sec.gov', 'bloomberg.com', 'reuters.com', 'wsj.com']
    });
  }

  /**
   * Queue management for rate limiting
   */
  private async enqueueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }
    
    this.processing = true;
    
    while (this.requestQueue.length > 0) {
      // Rate limiting
      await this.enforceRateLimit();
      
      const request = this.requestQueue.shift();
      if (request) {
        await request();
      }
    }
    
    this.processing = false;
  }

  private async enforceRateLimit(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest)
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Make the actual HTTP request with retry logic
   */
  private async makeRequest(
    payload: PerplexityRequest, 
    requestId: string, 
    attempt = 0
  ): Promise<PerplexityResponse> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.perplexityApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'NLP-Trading-App/1.0'
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new TradingError(
          `Perplexity API error: ${response.status} ${response.statusText}`,
          'PERPLEXITY_API_ERROR',
          {
            status: response.status,
            statusText: response.statusText,
            requestId,
            attempt,
            errorData
          }
        );
      }

      const data = await response.json() as PerplexityResponse;
      
      // Validate response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new TradingError(
          'Invalid Perplexity API response structure',
          'INVALID_RESPONSE_FORMAT',
          { requestId, data }
        );
      }

      return data;
      
    } catch (error) {
      if (attempt < this.maxRetries && this.shouldRetry(error)) {
        console.log(`🔄 Retrying Perplexity request ${requestId} (attempt ${attempt + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * Math.pow(2, attempt)));
        return this.makeRequest(payload, requestId, attempt + 1);
      }
      
      throw error;
    }
  }

  private shouldRetry(error: any): boolean {
    if (error instanceof TradingError) {
      const status = error.details?.status;
      // Retry on temporary errors
      return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
    }
    
    // Retry on network errors
    return error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT';
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private trackMetrics(metrics: RequestMetrics): void {
    this.metrics.push(metrics);
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * Get API usage statistics
   */
  getUsageStats(): {
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    totalTokensUsed: number;
    requestsLast24h: number;
    errorRate: number;
    mostUsedModel: string;
  } {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);
    
    const recentMetrics = this.metrics.filter(m => m.timestamp >= last24h);
    const successfulRequests = this.metrics.filter(m => m.success);
    
    const modelUsage = this.metrics.reduce((acc, m) => {
      acc[m.model] = (acc[m.model] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const mostUsedModel = Object.entries(modelUsage)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';
    
    return {
      totalRequests: this.metrics.length,
      successRate: this.metrics.length > 0 ? (successfulRequests.length / this.metrics.length) * 100 : 0,
      averageResponseTime: successfulRequests.length > 0 
        ? successfulRequests.reduce((sum, m) => sum + m.duration, 0) / successfulRequests.length 
        : 0,
      totalTokensUsed: this.metrics.reduce((sum, m) => sum + m.tokensUsed, 0),
      requestsLast24h: recentMetrics.length,
      errorRate: this.metrics.length > 0 ? ((this.metrics.length - successfulRequests.length) / this.metrics.length) * 100 : 0,
      mostUsedModel
    };
  }

  /**
   * Clear metrics history
   */
  clearMetrics(): void {
    this.metrics = [];
  }
}