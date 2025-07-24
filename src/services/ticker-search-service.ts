import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { cacheService } from '../cache/cache-service';

export interface TickerSearchResult {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: string;
  status: string;
  tradable: boolean;
}

export interface TickerSuggestion {
  symbol: string;
  name: string;
  exchange: string;
  match: {
    type: 'symbol' | 'name';
    score: number;
  };
}

export class TickerSearchService {
  private broker: AlpacaAdapter;
  private symbolCache: Map<string, TickerSearchResult> = new Map();
  private popularTickers: string[] = [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'BRK.B',
    'AVGO', 'LLY', 'WMT', 'JPM', 'XOM', 'UNH', 'ORCL', 'MA', 'PG',
    'COST', 'HD', 'JNJ', 'V', 'NFLX', 'CRM', 'BAC', 'ABBV', 'KO',
    'PEP', 'TMO', 'MRK', 'ADBE', 'ACN', 'CVX', 'TMUS', 'LIN', 'AMD',
    'ABT', 'WFC', 'DHR', 'NEE', 'DIS', 'TXN', 'VZ', 'NKE', 'PM',
    'RTX', 'UPS', 'LOW', 'SPGI', 'COP', 'T', 'QCOM', 'HON', 'GE'
  ];

  constructor() {
    this.broker = new AlpacaAdapter();
  }

  /**
   * Search for tickers using fuzzy matching
   */
  async searchTickers(query: string, limit: number = 10): Promise<TickerSuggestion[]> {
    console.log(`[TickerSearch] Starting search for query: "${query}", limit: ${limit}`);
    
    if (!query || query.trim().length === 0) {
      console.log(`[TickerSearch] Empty query, returning popular tickers`);
      return this.getPopularTickers(limit);
    }

    const normalizedQuery = query.trim().toUpperCase();
    console.log(`[TickerSearch] Normalized query: "${normalizedQuery}"`);
    
    // Check cache first
    const cacheKey = `ticker_search_${normalizedQuery}_${limit}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      console.log(`[TickerSearch] Found cached results for "${normalizedQuery}": ${(cached as TickerSuggestion[]).length} items`);
      return cached as TickerSuggestion[];
    }

    try {
      const suggestions: TickerSuggestion[] = [];
      console.log(`[TickerSearch] No cache found, starting fresh search`);

      // First, try to get exact symbol match
      if (this.isValidSymbolFormat(normalizedQuery)) {
        console.log(`[TickerSearch] "${normalizedQuery}" matches valid symbol format, trying exact match`);
        try {
          const exactMatch = await this.getTickerInfo(normalizedQuery);
          if (exactMatch && exactMatch.tradable) {
            console.log(`[TickerSearch] Exact match found for "${normalizedQuery}": ${exactMatch.name} (${exactMatch.exchange})`);
            suggestions.push({
              symbol: exactMatch.symbol,
              name: exactMatch.name,
              exchange: exactMatch.exchange,
              match: {
                type: 'symbol',
                score: 1.0
              }
            });
          } else {
            console.log(`[TickerSearch] Exact match failed for "${normalizedQuery}": ${exactMatch ? 'not tradable' : 'not found'}`);
          }
        } catch (error) {
          console.error(`[TickerSearch] Error in exact match for "${normalizedQuery}":`, error);
        }
      } else {
        console.log(`[TickerSearch] "${normalizedQuery}" does not match valid symbol format, skipping exact match`);
      }

      // Add popular tickers that match the query
      console.log(`[TickerSearch] Searching popular tickers for matches with "${normalizedQuery}"`);
      const popularMatches = this.popularTickers
        .filter(symbol => {
          const includes = symbol.includes(normalizedQuery);
          const distance = this.calculateStringDistance(symbol, normalizedQuery);
          const matches = includes || distance <= 2;
          if (matches) {
            console.log(`[TickerSearch] Popular ticker "${symbol}" matches: includes=${includes}, distance=${distance}`);
          }
          return matches;
        })
        .slice(0, limit - suggestions.length);

      console.log(`[TickerSearch] Found ${popularMatches.length} popular ticker matches: [${popularMatches.join(', ')}]`);

      for (const symbol of popularMatches) {
        if (!suggestions.find(s => s.symbol === symbol)) {
          console.log(`[TickerSearch] Getting info for popular ticker: ${symbol}`);
          try {
            const tickerInfo = await this.getTickerInfo(symbol);
            if (tickerInfo && tickerInfo.tradable) {
              console.log(`[TickerSearch] Successfully got info for ${symbol}: ${tickerInfo.name}`);
              suggestions.push({
                symbol: tickerInfo.symbol,
                name: tickerInfo.name,
                exchange: tickerInfo.exchange,
                match: {
                  type: symbol.startsWith(normalizedQuery) ? 'symbol' : 'symbol',
                  score: this.calculateMatchScore(symbol, normalizedQuery)
                }
              });
            } else {
              console.log(`[TickerSearch] Ticker info for ${symbol} failed: ${tickerInfo ? 'not tradable' : 'not found'}`);
            }
          } catch (error) {
            console.error(`[TickerSearch] Error getting info for popular ticker ${symbol}:`, error);
            continue;
          }
        } else {
          console.log(`[TickerSearch] Skipping ${symbol} - already in suggestions`);
        }
      }

      // Sort by match score
      console.log(`[TickerSearch] Sorting ${suggestions.length} suggestions by match score`);
      suggestions.sort((a, b) => b.match.score - a.match.score);

      // Limit results
      const results = suggestions.slice(0, limit);
      console.log(`[TickerSearch] Final results for "${normalizedQuery}": ${results.length} items`);
      results.forEach((result, index) => {
        console.log(`[TickerSearch] Result ${index + 1}: ${result.symbol} (${result.name}) - score: ${result.match.score}`);
      });

      // Cache results for 5 minutes
      cacheService.set(cacheKey, results, 300000);
      console.log(`[TickerSearch] Cached results for "${normalizedQuery}"`);
      
      return results;
    } catch (error) {
      console.error(`[TickerSearch] Error searching tickers for "${normalizedQuery}":`, error);
      console.log(`[TickerSearch] Falling back to popular tickers due to error`);
      return this.getPopularTickers(limit);
    }
  }

  /**
   * Get detailed information about a specific ticker
   */
  async getTickerInfo(symbol: string): Promise<TickerSearchResult | null> {
    const normalizedSymbol = symbol.toUpperCase();
    console.log(`[TickerInfo] Getting ticker info for: ${normalizedSymbol}`);
    
    // Check cache first
    if (this.symbolCache.has(normalizedSymbol)) {
      console.log(`[TickerInfo] Found cached info for ${normalizedSymbol}`);
      return this.symbolCache.get(normalizedSymbol)!;
    }

    try {
      console.log(`[TickerInfo] No cache found, calling Alpaca API for ${normalizedSymbol}`);
      
      // Use Alpaca API to get asset information
      const asset = await (this.broker as any).alpaca.getAsset(normalizedSymbol);
      console.log(`[TickerInfo] Alpaca API response for ${normalizedSymbol}:`, {
        symbol: asset.symbol,
        name: asset.name,
        exchange: asset.exchange,
        class: asset.class,
        status: asset.status,
        tradable: asset.tradable
      });
      
      const result: TickerSearchResult = {
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        exchange: asset.exchange || 'NASDAQ',
        assetClass: asset.class || 'us_equity',
        status: asset.status || 'active',
        tradable: asset.tradable !== false
      };

      console.log(`[TickerInfo] Processed result for ${normalizedSymbol}:`, result);

      // Cache the result
      this.symbolCache.set(normalizedSymbol, result);
      console.log(`[TickerInfo] Cached result for ${normalizedSymbol}`);
      
      return result;
    } catch (error) {
      console.error(`[TickerInfo] Error getting ticker info for ${normalizedSymbol}:`, error);
      
      // Log more details about the error
      if (error instanceof Error) {
        console.error(`[TickerInfo] Error details - Message: ${error.message}, Stack: ${error.stack}`);
      }
      
      return null;
    }
  }

  /**
   * Get popular tickers as default suggestions
   */
  async getPopularTickers(limit: number = 10): Promise<TickerSuggestion[]> {
    const cacheKey = `popular_tickers_${limit}`;
    const cached = cacheService.get(cacheKey);
    if (cached) {
      return cached as TickerSuggestion[];
    }

    const suggestions: TickerSuggestion[] = [];
    
    for (const symbol of this.popularTickers.slice(0, limit)) {
      try {
        const info = await this.getTickerInfo(symbol);
        if (info && info.tradable) {
          suggestions.push({
            symbol: info.symbol,
            name: info.name,
            exchange: info.exchange,
            match: {
              type: 'symbol',
              score: 0.9
            }
          });
        }
      } catch (error) {
        // Skip this ticker
        continue;
      }
    }

    // Cache popular tickers for 1 hour
    cacheService.set(cacheKey, suggestions, 3600000);
    
    return suggestions;
  }

  /**
   * Get ticker suggestions with market data
   */
  async getTickerSuggestionsWithMarketData(query: string, limit: number = 10) {
    const suggestions = await this.searchTickers(query, limit);
    
    const results = await Promise.all(
      suggestions.map(async (suggestion) => {
        try {
          const marketData = await this.broker.getMarketData(suggestion.symbol);
          return {
            ...suggestion,
            marketData: {
              currentPrice: marketData.currentPrice,
              previousClose: marketData.previousClose,
              changePercent: marketData.changePercent,
              volume: marketData.volume,
              isMarketOpen: marketData.isMarketOpen
            }
          };
        } catch (error) {
          return suggestion;
        }
      })
    );

    return results;
  }

  /**
   * Validate if a string looks like a valid stock symbol
   */
  private isValidSymbolFormat(symbol: string): boolean {
    return /^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol);
  }

  /**
   * Calculate string edit distance for fuzzy matching
   */
  private calculateStringDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Calculate match score between 0 and 1
   */
  private calculateMatchScore(symbol: string, query: string): number {
    if (symbol === query) return 1.0;
    if (symbol.startsWith(query)) return 0.9;
    
    const distance = this.calculateStringDistance(symbol, query);
    const maxLength = Math.max(symbol.length, query.length);
    
    return Math.max(0, 1 - (distance / maxLength));
  }

  /**
   * Clear the symbol cache
   */
  clearCache(): void {
    this.symbolCache.clear();
  }
}