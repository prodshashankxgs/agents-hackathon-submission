import { PerplexityClient } from './perplexity-client';
import { CacheManager } from './cache-manager';

export interface PoliticianHolding {
  symbol: string;
  companyName: string;
  estimatedValue: number;
  lastUpdated: string;
}

export interface PoliticianTrade {
  symbol: string;
  companyName: string;
  tradeType: 'buy' | 'sell';
  amount: number;
  date: string;
  disclosed: boolean;
  source: string;
  confidence: number;
}

export interface PoliticianProfile {
  name: string;
  title: string;
  party: string;
  office: string;
  holdings: PoliticianHolding[];
  recentTrades: PoliticianTrade[];
  totalPortfolioValue?: number;
  metadata: {
    lastUpdated: string;
    dataSource: string;
    confidence: number;
  };
}

export class PoliticianService {
  private readonly cache = new Map<string, any>();
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 2; // 2 hours
  
  constructor(
    private perplexityClient: PerplexityClient,
    private cacheManager: CacheManager
  ) {}
  
  async getPoliticianProfile(name: string): Promise<PoliticianProfile> {
    const cacheKey = `politician-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    
    // Check cache first
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() < cached.expiry) {
        return cached.data;
      }
    }
    
    // Fetch from Perplexity
    const response = await this.perplexityClient.request({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a financial analyst specializing in congressional stock trading. Provide accurate information about politician stock holdings based on official disclosures.'
        },
        {
          role: 'user',
          content: `What are ${name}'s current stock holdings and recent trades? Include stock symbols, company names, and estimated values based on congressional disclosure filings.`
        }
      ],
      max_tokens: 1500,
      temperature: 0.1,
      return_citations: true
    });
    
    const profile = this.parseProfileResponse(response.choices[0]?.message?.content || '', name);
    
    // Cache the result
    this.cache.set(cacheKey, {
      data: profile,
      expiry: Date.now() + this.CACHE_DURATION
    });
    
    return profile;
  }
  
  async getPoliticianHoldings(name: string): Promise<PoliticianHolding[]> {
    const profile = await this.getPoliticianProfile(name);
    return profile.holdings;
  }
  
  async getPoliticianTrades(name: string): Promise<PoliticianTrade[]> {
    const profile = await this.getPoliticianProfile(name);
    return profile.recentTrades;
  }
  
  private parseProfileResponse(content: string, name: string): PoliticianProfile {
    const profile: PoliticianProfile = {
      name,
      title: 'Congressional Representative',
      party: 'Unknown',
      office: 'Congress',
      holdings: [],
      recentTrades: [],
      metadata: {
        lastUpdated: new Date().toISOString(),
        dataSource: 'perplexity',
        confidence: 75
      }
    };
    
    // Parse holdings from content
    const lines = content.split('\n');
    for (const line of lines) {
      const holdingMatch = line.match(/([A-Z]{1,5}).*?(\$?[\d,]+)/);
      if (holdingMatch) {
        const symbol = holdingMatch[1];
        const valueStr = holdingMatch[2]?.replace(/[$,]/g, '') || '0';
        const value = parseFloat(valueStr);
        
        if (symbol && value > 0) {
          profile.holdings.push({
            symbol,
            companyName: `${symbol} Corporation`,
            estimatedValue: value,
            lastUpdated: new Date().toISOString()
          });
        }
      }
    }
    
    // Calculate total portfolio value
    profile.totalPortfolioValue = profile.holdings.reduce((sum, h) => sum + h.estimatedValue, 0);
    
    return profile;
  }
  
  clearCache(): void {
    this.cache.clear();
  }
  
  getCacheStats(): { entries: number; size: number } {
    return {
      entries: this.cache.size,
      size: JSON.stringify([...this.cache.entries()]).length
    };
  }
}