import fetch from 'node-fetch';
import { config } from '../config';

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
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface PerplexityResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations?: string[];
  related_questions?: string[];
}

export interface StockResearchData {
  symbol: string;
  fundamentals: {
    marketCap: number;
    peRatio: number;
    pbRatio: number;
    debtToEquity: number;
    roe: number;
    revenue: number;
    revenueGrowth: number;
    earnings: number;
    earningsGrowth: number;
  };
  technicals: {
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    avgVolume: number;
    rsi: number;
    macd: number;
    sma50: number;
    sma200: number;
    support: number;
    resistance: number;
  };
  sentiment: {
    overall: 'bullish' | 'bearish' | 'neutral';
    score: number;
    factors: string[];
  };
  news: Array<{
    title: string;
    summary: string;
    sentiment: 'positive' | 'negative' | 'neutral';
    impact: 'high' | 'medium' | 'low';
    timestamp: Date;
    source: string;
  }>;
}

export class PerplexityService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.perplexity.ai';

  constructor() {
    this.apiKey = process.env.PERPLEXITY_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  PERPLEXITY_API_KEY not configured - Perplexity features will not work');
    }
  }

  async chat(request: PerplexityRequest): Promise<PerplexityResponse> {
    if (!this.apiKey) {
      throw new Error('Perplexity API key not configured');
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Perplexity API error: ${response.status} ${errorText}`);
      }

      const data = await response.json() as PerplexityResponse;
      return data;
    } catch (error) {
      console.error('Perplexity API request failed:', error);
      throw error;
    }
  }

  async conductStockResearch(symbol: string, query: string): Promise<StockResearchData> {
    const researchPrompt = `
    Conduct comprehensive research on ${symbol} stock. Provide detailed analysis covering:
    
    1. FUNDAMENTALS:
    - Market cap, P/E ratio, P/B ratio, debt-to-equity, ROE
    - Revenue and earnings data with growth rates
    - Financial health and profitability metrics
    
    2. TECHNICAL ANALYSIS:
    - Current price, volume, and trading patterns
    - Key support and resistance levels
    - RSI, MACD, and moving averages (50-day, 200-day)
    - Technical indicators and chart patterns
    
    3. MARKET SENTIMENT:
    - Overall sentiment (bullish/bearish/neutral)
    - Institutional investor sentiment
    - Analyst ratings and price targets
    - Social media and retail investor sentiment
    
    4. RECENT NEWS & EVENTS:
    - Latest earnings reports and guidance
    - Recent news impacting the stock
    - Upcoming events (earnings, product launches, etc.)
    - Industry developments and competitive landscape
    
    Focus on: ${query}
    
    Please provide specific numbers, dates, and sources where possible.
    `;

    const request: PerplexityRequest = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a professional financial analyst conducting comprehensive stock research. Provide accurate, up-to-date information with specific data points and analysis.'
        },
        {
          role: 'user',
          content: researchPrompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.1,
      return_citations: true,
      return_related_questions: true,
      search_recency_filter: 'week'
    };

    const response = await this.chat(request);
    const content = response.choices[0]?.message?.content || '';

    // Parse the response and structure the data
    // This would normally require more sophisticated parsing
    // For now, we'll create a structured response based on the content
    return this.parseStockResearchResponse(symbol, content, response.citations);
  }

  async generateMarketInsight(query: string): Promise<{
    summary: string;
    keyPoints: string[];
    marketData: any[];
    recommendations: any[];
    citations: string[];
  }> {
    const insightPrompt = `
    Provide comprehensive market insight and analysis for: ${query}
    
    Include:
    1. Current market conditions and trends
    2. Sector performance and rotation
    3. Economic indicators and their impact
    4. Key risks and opportunities
    5. Actionable investment recommendations
    6. Supporting data and specific metrics
    
    Focus on providing actionable insights with specific data points and rationale.
    `;

    const request: PerplexityRequest = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a senior market strategist providing institutional-quality market analysis and insights.'
        },
        {
          role: 'user',
          content: insightPrompt
        }
      ],
      max_tokens: 3000,
      temperature: 0.1,
      return_citations: true,
      return_related_questions: true,
      search_recency_filter: 'day'
    };

    const response = await this.chat(request);
    const content = response.choices[0]?.message?.content || '';

    return this.parseMarketInsightResponse(content, response.citations);
  }

  async createTradePlan(symbol: string, strategy: string, timeframe: string): Promise<{
    summary: string;
    entryPoints: any[];
    exitStrategy: any;
    riskManagement: any;
    marketAnalysis: string;
    citations: string[];
  }> {
    const tradePlanPrompt = `
    Create a detailed trading plan for ${symbol} with the following parameters:
    - Strategy: ${strategy}
    - Timeframe: ${timeframe}
    
    Provide:
    1. ENTRY STRATEGY:
    - Specific entry points with rationale
    - Technical levels to watch
    - Market conditions for entry
    
    2. EXIT STRATEGY:
    - Profit targets with percentages
    - Stop-loss levels
    - Trailing stop strategy
    
    3. RISK MANAGEMENT:
    - Position sizing recommendations
    - Risk-reward ratio
    - Maximum loss tolerance
    
    4. MARKET ANALYSIS:
    - Current market environment assessment
    - How this trade fits the broader market
    - Key catalysts and risks
    
    Include specific price levels, percentages, and timeframes.
    `;

    const request: PerplexityRequest = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a professional trader creating detailed trading plans with specific entry/exit criteria and risk management.'
        },
        {
          role: 'user',
          content: tradePlanPrompt
        }
      ],
      max_tokens: 3000,
      temperature: 0.1,
      return_citations: true,
      search_recency_filter: 'day'
    };

    const response = await this.chat(request);
    const content = response.choices[0]?.message?.content || '';

    return this.parseTradePlanResponse(content, response.citations);
  }

  private parseStockResearchResponse(symbol: string, content: string, citations?: string[]): StockResearchData {
    // This is a simplified parser - in production, you'd want more sophisticated parsing
    // You could use regex, NLP libraries, or structured prompts to extract specific data
    
    return {
      symbol,
      fundamentals: {
        marketCap: 0, // Would extract from content
        peRatio: 0,
        pbRatio: 0,
        debtToEquity: 0,
        roe: 0,
        revenue: 0,
        revenueGrowth: 0,
        earnings: 0,
        earningsGrowth: 0,
      },
      technicals: {
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        avgVolume: 0,
        rsi: 0,
        macd: 0,
        sma50: 0,
        sma200: 0,
        support: 0,
        resistance: 0,
      },
      sentiment: {
        overall: 'neutral',
        score: 0,
        factors: [],
      },
      news: [],
    };
  }

  private parseMarketInsightResponse(content: string, citations?: string[]): {
    summary: string;
    keyPoints: string[];
    marketData: any[];
    recommendations: any[];
    citations: string[];
  } {
    // Extract key insights from the content
    const lines = content.split('\n').filter(line => line.trim());
    const keyPoints = lines.filter(line => 
      line.includes('•') || line.includes('-') || line.includes('*')
    ).map(line => line.replace(/^[•\-*]\s*/, '').trim());

    return {
      summary: content.substring(0, 500) + '...',
      keyPoints: keyPoints.slice(0, 5),
      marketData: [],
      recommendations: [],
      citations: citations || [],
    };
  }

  private parseTradePlanResponse(content: string, citations?: string[]): {
    summary: string;
    entryPoints: any[];
    exitStrategy: any;
    riskManagement: any;
    marketAnalysis: string;
    citations: string[];
  } {
    return {
      summary: content.substring(0, 300) + '...',
      entryPoints: [],
      exitStrategy: {},
      riskManagement: {},
      marketAnalysis: content,
      citations: citations || [],
    };
  }
}

export const perplexityService = new PerplexityService();