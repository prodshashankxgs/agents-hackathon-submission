import axios from 'axios';
import { MarketData } from '../types';
import { config } from '../config';

interface PolygonSnapshot {
  ticker: {
    ticker: string;
    todaysChangePerc: number;
    todaysChange: number;
    updated: number;
    day: {
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
      vw: number;
    };
    min: {
      av: number;
      t: number;
      n: number;
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
      vw: number;
    };
    prevDay: {
      o: number;
      h: number;
      l: number;
      c: number;
      v: number;
      vw: number;
    };
  };
  status: string;
}

interface PolygonAggregateBar {
  v: number;  // volume
  vw: number; // volume weighted average price
  o: number;  // open
  c: number;  // close
  h: number;  // high
  l: number;  // low
  t: number;  // timestamp
  n: number;  // number of transactions
}

interface PolygonTickerDetails {
  ticker: string;
  name: string;
  market: string;
  locale: string;
  primary_exchange: string;
  type: string;
  active: boolean;
  currency_name: string;
  market_cap?: number;
  description?: string;
  sic_description?: string;
  total_employees?: number;
  list_date?: string;
  homepage_url?: string;
  address?: {
    address1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
  };
}

/**
 * Service for fetching market data from Polygon.io
 */
export class PolygonService {
  private apiKey: string;
  private baseUrl: string = 'https://api.polygon.io';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout: number = 30000; // 30 seconds cache

  constructor() {
    this.apiKey = config.polygonApiKey;
    if (!this.apiKey) {
      console.warn('⚠️ Polygon API key not configured - market data features will not work');
    }
  }

  /**
   * Get current market data for a symbol using Polygon's snapshot API
   */
  async getMarketData(symbol: string): Promise<MarketData> {
    try {
      // Check cache first
      const cached = this.getFromCache(`market_${symbol}`);
      if (cached) {
        return cached;
      }

      // Fetch snapshot data from Polygon
      const response = await axios.get<PolygonSnapshot>(
        `${this.baseUrl}/v2/snapshot/locale/us/markets/stocks/tickers/${symbol.toUpperCase()}`,
        {
          params: { apiKey: this.apiKey },
          timeout: 10000
        }
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Failed to fetch market data for ${symbol}`);
      }

      const snapshot = response.data.ticker;
      
      // Transform to our MarketData format
      const marketData: MarketData = {
        symbol: snapshot.ticker,
        currentPrice: snapshot.min.c || snapshot.day.c || snapshot.prevDay.c,
        previousClose: snapshot.prevDay.c,
        changePercent: snapshot.todaysChangePerc || 0,
        volume: snapshot.day.v || 0,
        marketCap: undefined, // Polygon doesn't provide this in snapshot
        isMarketOpen: this.isMarketOpen()
      };

      // Cache the result
      this.setCache(`market_${symbol}`, marketData);
      
      return marketData;
    } catch (error: any) {
      console.error(`Failed to fetch market data for ${symbol}:`, error.message);
      
      // Return a default/error response
      throw new Error(`Unable to fetch market data for ${symbol}. ${error.message}`);
    }
  }

  /**
   * Get historical price data for a symbol
   */
  async getHistoricalData(
    symbol: string,
    from: string,
    to: string,
    timespan: 'minute' | 'hour' | 'day' | 'week' | 'month' = 'day',
    multiplier: number = 1
  ): Promise<any[]> {
    try {
      // Check cache
      const cacheKey = `history_${symbol}_${from}_${to}_${timespan}_${multiplier}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }

      const response = await axios.get(
        `${this.baseUrl}/v2/aggs/ticker/${symbol.toUpperCase()}/range/${multiplier}/${timespan}/${from}/${to}`,
        {
          params: {
            apiKey: this.apiKey,
            adjusted: true,
            sort: 'asc',
            limit: 50000
          },
          timeout: 15000
        }
      );

      if (response.data.status !== 'OK' || !response.data.results) {
        throw new Error(`No historical data available for ${symbol}`);
      }

      // Transform the data to match expected format
      const historicalData = response.data.results.map((bar: PolygonAggregateBar) => ({
        timestamp: new Date(bar.t).toISOString(),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        vwap: bar.vw
      }));

      // Cache the result
      this.setCache(cacheKey, historicalData);

      return historicalData;
    } catch (error: any) {
      console.error(`Failed to fetch historical data for ${symbol}:`, error.message);
      throw new Error(`Unable to fetch historical data for ${symbol}. ${error.message}`);
    }
  }

  /**
   * Get company details/info for a symbol
   */
  async getTickerDetails(symbol: string): Promise<PolygonTickerDetails | null> {
    try {
      const cached = this.getFromCache(`details_${symbol}`);
      if (cached) {
        return cached;
      }

      const response = await axios.get(
        `${this.baseUrl}/v3/reference/tickers/${symbol.toUpperCase()}`,
        {
          params: { apiKey: this.apiKey },
          timeout: 10000
        }
      );

      if (response.data.status !== 'OK' || !response.data.results) {
        return null;
      }

      const details = response.data.results;
      
      // Cache for longer (1 hour) since company details don't change frequently
      this.setCache(`details_${symbol}`, details, 3600000);
      
      return details;
    } catch (error: any) {
      console.error(`Failed to fetch ticker details for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Search for tickers
   */
  async searchTickers(query: string, limit: number = 10): Promise<any[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v3/reference/tickers`,
        {
          params: {
            apiKey: this.apiKey,
            search: query,
            active: true,
            sort: 'ticker',
            order: 'asc',
            limit
          },
          timeout: 10000
        }
      );

      if (response.data.status !== 'OK' || !response.data.results) {
        return [];
      }

      return response.data.results.map((ticker: any) => ({
        symbol: ticker.ticker,
        name: ticker.name,
        type: ticker.type,
        exchange: ticker.primary_exchange,
        active: ticker.active
      }));
    } catch (error: any) {
      console.error(`Failed to search tickers:`, error.message);
      return [];
    }
  }

  /**
   * Get real-time quote (last trade)
   */
  async getLastQuote(symbol: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v2/last/trade/${symbol.toUpperCase()}`,
        {
          params: { apiKey: this.apiKey },
          timeout: 5000
        }
      );

      if (response.data.status !== 'success') {
        throw new Error(`Failed to fetch last quote for ${symbol}`);
      }

      return {
        symbol: response.data.results.T,
        price: response.data.results.p,
        size: response.data.results.s,
        timestamp: new Date(response.data.results.t / 1000000).toISOString()
      };
    } catch (error: any) {
      console.error(`Failed to fetch last quote for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Check if market is currently open
   */
  private isMarketOpen(): boolean {
    const now = new Date();
    const day = now.getDay();
    
    // Market closed on weekends
    if (day === 0 || day === 6) return false;
    
    // Convert to ET (Eastern Time)
    const etOffset = -5; // EST offset (would need to handle DST properly in production)
    const utcHour = now.getUTCHours();
    const etHour = (utcHour + etOffset + 24) % 24;
    const etMinute = now.getUTCMinutes();
    const etTime = etHour * 100 + etMinute;
    
    // Market hours: 9:30 AM - 4:00 PM ET
    return etTime >= 930 && etTime < 1600;
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): any {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  private setCache(key: string, data: any, timeout?: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Clean up old cache entries periodically
    if (this.cache.size > 100) {
      const now = Date.now();
      const timeoutMs = timeout || this.cacheTimeout;
      for (const [k, v] of this.cache.entries()) {
        if (now - v.timestamp > timeoutMs) {
          this.cache.delete(k);
        }
      }
    }
  }

  /**
   * Clear cache for a specific symbol or all cache
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      const keysToDelete = Array.from(this.cache.keys()).filter(k => k.includes(symbol));
      keysToDelete.forEach(k => this.cache.delete(k));
    } else {
      this.cache.clear();
    }
  }
}

// Export singleton instance
export const polygonService = new PolygonService();