import { PerplexityClient } from './perplexity-client';
import { TradingError } from '../types';

export interface VIPInvestorProfile {
  name: string;
  title: string;
  firm: string;
  firmCik?: string;
  biography: string;
  investmentPhilosophy: string;
  strategy: string;
  aum?: number; // Assets Under Management
  founded?: string;
  headquarters?: string;
  
  // Investment approach
  approach: {
    style: string[]; // e.g., ['value', 'growth', 'contrarian']
    sectors: string[];
    marketCap: string[]; // e.g., ['large-cap', 'mid-cap']
    geographicFocus: string[];
    timeHorizon: string; // e.g., 'long-term', 'medium-term'
  };
  
  // Performance metrics
  performance: {
    annualizedReturn?: number;
    sharpeRatio?: number;
    maxDrawdown?: number;
    volatility?: number;
    benchmark?: string;
    trackRecord?: string;
  };
  
  // Notable holdings and moves
  notableHoldings: {
    symbol: string;
    companyName: string;
    position: string; // e.g., 'top holding', 'recent addition'
    rationale?: string;
  }[];
  
  recentMoves: {
    type: 'buy' | 'sell' | 'increase' | 'decrease';
    symbol: string;
    companyName: string;
    description: string;
    date?: string;
    impact?: string;
  }[];
  
  // News and insights
  recentNews: {
    headline: string;
    source: string;
    date: string;
    summary: string;
    url?: string;
  }[];
  
  // Social media and communications
  communications: {
    letterToShareholders?: string;
    interviews?: string[];
    socialMedia?: {
      twitter?: string;
      linkedin?: string;
    };
  };
  
  // Metadata
  metadata: {
    lastUpdated: string;
    dataSource: string;
    confidence: number; // 0-100
    cacheExpiry: string;
  };
}

export interface VIPSearchResult {
  name: string;
  title: string;
  firm: string;
  prominence: number; // 0-100
  aum?: number;
  recentNews: number;
  lastFiling?: string;
}

export class VIPProfileService {
  private readonly cache = new Map<string, {
    data: VIPInvestorProfile;
    timestamp: number;
    expiry: number;
  }>();
  
  private readonly CACHE_DURATION = 1000 * 60 * 60 * 12; // 12 hours
  
  constructor(private perplexityClient: PerplexityClient) {}
  
  /**
   * Get detailed profile for a VIP investor
   */
  async getProfile(name: string, options: {
    useCache?: boolean;
    includePerformance?: boolean;
    includeStrategy?: boolean;
    recency?: 'month' | 'week' | 'day';
  } = {}): Promise<VIPInvestorProfile> {
    const {
      useCache = true,
      includePerformance = true,
      includeStrategy = true,
      recency = 'month'
    } = options;
    
    const cacheKey = `vip-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    
    // Check cache first
    if (useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      if (Date.now() < cached.expiry) {
        console.log(`📋 Using cached VIP profile for ${name}`);
        return cached.data;
      }
      this.cache.delete(cacheKey);
    }
    
    console.log(`🔍 Fetching VIP profile for ${name}`);
    
    try {
      const response = await this.perplexityClient.analyzeInvestorProfile(name, {
        includeStrategy,
        includePerformance,
        recency
      });
      
      const profile = await this.parseProfileResponse(response.choices[0].message.content, name);
      
      // Cache the result
      if (useCache) {
        this.cache.set(cacheKey, {
          data: profile,
          timestamp: Date.now(),
          expiry: Date.now() + this.CACHE_DURATION
        });
      }
      
      return profile;
      
    } catch (error) {
      console.error(`❌ Error fetching VIP profile for ${name}:`, error);
      
      // Fallback to cached data if available
      if (this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        console.log(`🔄 Using expired cache as fallback for ${name}`);
        return cached.data;
      }
      
      throw error;
    }
  }
  
  /**
   * Search for VIP investors by name or firm
   */
  async searchVIPs(query: string, options: {
    limit?: number;
    minAUM?: number;
    sectors?: string[];
  } = {}): Promise<VIPSearchResult[]> {
    const { limit = 10, minAUM = 0, sectors = [] } = options;
    
    const searchPrompt = `Search for prominent institutional investors, fund managers, or investment professionals related to: ${query}
    
    Provide a ranked list of up to ${limit} results with:
    1. Full name
    2. Current title and position
    3. Firm or organization
    4. Assets under management (if available)
    5. Recent prominence or news activity
    6. Most recent SEC filing date (if applicable)
    
    Focus on individuals with significant market influence, large AUM, or notable investment track records.
    ${sectors.length > 0 ? `Prioritize those with expertise in: ${sectors.join(', ')}` : ''}
    ${minAUM > 0 ? `Only include those managing at least $${minAUM.toLocaleString()} million` : ''}`;
    
    const response = await this.perplexityClient.request({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a financial research assistant specializing in institutional investors and fund managers. Provide accurate, factual information about investment professionals.'
        },
        {
          role: 'user',
          content: searchPrompt
        }
      ],
      max_tokens: 1000,
      temperature: 0.2,
      return_citations: true,
      search_domain_filter: ['sec.gov', 'bloomberg.com', 'reuters.com', 'wsj.com']
    });
    
    return this.parseSearchResults(response.choices[0].message.content);
  }
  
  /**
   * Get trending VIP investors based on recent activity
   */
  async getTrendingVIPs(options: {
    limit?: number;
    timeframe?: 'week' | 'month' | 'quarter';
    activityType?: 'filings' | 'news' | 'performance';
  } = {}): Promise<VIPSearchResult[]> {
    const { limit = 10, timeframe = 'month', activityType = 'news' } = options;
    
    const trendingPrompt = `Identify the most prominent institutional investors and fund managers who have been in the news or showing significant activity in the past ${timeframe}.
    
    Focus on those with:
    - Major portfolio changes or new positions
    - Significant market commentary or predictions
    - Notable performance or returns
    - Recent SEC filings or disclosures
    - Media appearances or interviews
    
    Provide up to ${limit} results ranked by recent prominence and market impact.
    Include their current positions, firms, and why they're trending.`;
    
    const response = await this.perplexityClient.request({
      model: 'sonar-pro',
      messages: [
        {
          role: 'system',
          content: 'You are a financial news analyst tracking institutional investor activity and market influence.'
        },
        {
          role: 'user',
          content: trendingPrompt
        }
      ],
      max_tokens: 1200,
      temperature: 0.2,
      return_citations: true,
      search_recency_filter: timeframe === 'week' ? 'week' : 'month'
    });
    
    return this.parseSearchResults(response.choices[0].message.content);
  }
  
  /**
   * Parse Perplexity response into VIP profile structure
   */
  private async parseProfileResponse(content: string, name: string): Promise<VIPInvestorProfile> {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    
    // Initialize profile with defaults
    const profile: VIPInvestorProfile = {
      name,
      title: '',
      firm: '',
      biography: '',
      investmentPhilosophy: '',
      strategy: '',
      approach: {
        style: [],
        sectors: [],
        marketCap: [],
        geographicFocus: [],
        timeHorizon: 'long-term'
      },
      performance: {},
      notableHoldings: [],
      recentMoves: [],
      recentNews: [],
      communications: {},
      metadata: {
        lastUpdated: new Date().toISOString(),
        dataSource: 'perplexity',
        confidence: 75,
        cacheExpiry: new Date(Date.now() + this.CACHE_DURATION).toISOString()
      }
    };
    
    // Parse structured content
    let currentSection = '';
    let currentContent = '';
    
    for (const line of lines) {
      if (line.match(/^(Position|Title|Firm|Biography|Philosophy|Strategy|Performance|Holdings|Recent|News):/i)) {
        // Process previous section
        if (currentSection && currentContent) {
          this.processSection(profile, currentSection, currentContent);
        }
        
        // Start new section
        const [section, ...contentParts] = line.split(':');
        currentSection = section.toLowerCase();
        currentContent = contentParts.join(':').trim();
      } else {
        currentContent += ' ' + line;
      }
    }
    
    // Process final section
    if (currentSection && currentContent) {
      this.processSection(profile, currentSection, currentContent);
    }
    
    // Extract additional information using regex patterns
    this.extractAdditionalInfo(profile, content);
    
    return profile;
  }
  
  private processSection(profile: VIPInvestorProfile, section: string, content: string): void {
    const cleanContent = content.trim();
    
    switch (section) {
      case 'position':
      case 'title':
        profile.title = cleanContent;
        break;
      case 'firm':
        profile.firm = cleanContent;
        break;
      case 'biography':
        profile.biography = cleanContent;
        break;
      case 'philosophy':
        profile.investmentPhilosophy = cleanContent;
        break;
      case 'strategy':
        profile.strategy = cleanContent;
        this.extractStrategyInfo(profile, cleanContent);
        break;
      case 'performance':
        this.extractPerformanceInfo(profile, cleanContent);
        break;
      case 'holdings':
        this.extractHoldingsInfo(profile, cleanContent);
        break;
      case 'recent':
        this.extractRecentMoves(profile, cleanContent);
        break;
      case 'news':
        this.extractNewsInfo(profile, cleanContent);
        break;
    }
  }
  
  private extractAdditionalInfo(profile: VIPInvestorProfile, content: string): void {
    // Extract AUM
    const aumMatch = content.match(/(?:AUM|assets under management|manages?.*?)\$?(\d+(?:\.\d+)?)\s*(billion|million|B|M)/i);
    if (aumMatch) {
      let aum = parseFloat(aumMatch[1]);
      if (aumMatch[2].toLowerCase().includes('b')) {
        aum *= 1000000000;
      } else if (aumMatch[2].toLowerCase().includes('m')) {
        aum *= 1000000;
      }
      profile.aum = aum;
    }
    
    // Extract founded date
    const foundedMatch = content.match(/founded.*?(\d{4})/i);
    if (foundedMatch) {
      profile.founded = foundedMatch[1];
    }
    
    // Extract headquarters
    const hqMatch = content.match(/(?:headquarters|based in|located in)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (hqMatch) {
      profile.headquarters = hqMatch[1];
    }
  }
  
  private extractStrategyInfo(profile: VIPInvestorProfile, content: string): void {
    const lowerContent = content.toLowerCase();
    
    // Investment styles
    const styles = ['value', 'growth', 'momentum', 'contrarian', 'activist', 'quantitative', 'fundamental'];
    profile.approach.style = styles.filter(style => lowerContent.includes(style));
    
    // Time horizon
    if (lowerContent.includes('long-term') || lowerContent.includes('long term')) {
      profile.approach.timeHorizon = 'long-term';
    } else if (lowerContent.includes('short-term') || lowerContent.includes('short term')) {
      profile.approach.timeHorizon = 'short-term';
    }
    
    // Market cap focus
    const marketCaps = ['large-cap', 'mid-cap', 'small-cap'];
    profile.approach.marketCap = marketCaps.filter(cap => lowerContent.includes(cap));
  }
  
  private extractPerformanceInfo(profile: VIPInvestorProfile, content: string): void {
    // Extract performance metrics using regex
    const returnMatch = content.match(/(?:return|performance).*?(\d+(?:\.\d+)?)%/i);
    if (returnMatch) {
      profile.performance.annualizedReturn = parseFloat(returnMatch[1]);
    }
    
    const sharpeMatch = content.match(/sharpe.*?(\d+(?:\.\d+)?)/i);
    if (sharpeMatch) {
      profile.performance.sharpeRatio = parseFloat(sharpeMatch[1]);
    }
    
    const volatilityMatch = content.match(/volatility.*?(\d+(?:\.\d+)?)%/i);
    if (volatilityMatch) {
      profile.performance.volatility = parseFloat(volatilityMatch[1]);
    }
  }
  
  private extractHoldingsInfo(profile: VIPInvestorProfile, content: string): void {
    // Extract notable holdings
    const holdings = content.split(/[,;]/).map(holding => holding.trim()).filter(Boolean);
    
    for (const holding of holdings.slice(0, 10)) { // Limit to top 10
      const symbolMatch = holding.match(/([A-Z]{1,5})/);
      if (symbolMatch) {
        profile.notableHoldings.push({
          symbol: symbolMatch[1],
          companyName: holding.replace(symbolMatch[1], '').trim(),
          position: 'notable holding'
        });
      }
    }
  }
  
  private extractRecentMoves(profile: VIPInvestorProfile, content: string): void {
    // Extract recent moves
    const moves = content.split(/[.]/).map(move => move.trim()).filter(Boolean);
    
    for (const move of moves.slice(0, 5)) { // Limit to 5 recent moves
      const symbolMatch = move.match(/([A-Z]{1,5})/);
      if (symbolMatch) {
        let type: 'buy' | 'sell' | 'increase' | 'decrease' = 'buy';
        const lowerMove = move.toLowerCase();
        
        if (lowerMove.includes('sold') || lowerMove.includes('exit')) {
          type = 'sell';
        } else if (lowerMove.includes('increased') || lowerMove.includes('added')) {
          type = 'increase';
        } else if (lowerMove.includes('decreased') || lowerMove.includes('reduced')) {
          type = 'decrease';
        }
        
        profile.recentMoves.push({
          type,
          symbol: symbolMatch[1],
          companyName: move.replace(symbolMatch[1], '').trim(),
          description: move
        });
      }
    }
  }
  
  private extractNewsInfo(profile: VIPInvestorProfile, content: string): void {
    // Extract recent news items
    const newsItems = content.split(/[.]/).map(item => item.trim()).filter(Boolean);
    
    for (const item of newsItems.slice(0, 5)) { // Limit to 5 news items
      if (item.length > 20) { // Filter out very short items
        profile.recentNews.push({
          headline: item,
          source: 'Various',
          date: new Date().toISOString().split('T')[0],
          summary: item.substring(0, 200) + (item.length > 200 ? '...' : '')
        });
      }
    }
  }
  
  private parseSearchResults(content: string): VIPSearchResult[] {
    const results: VIPSearchResult[] = [];
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);
    
    for (const line of lines) {
      if (line.match(/^\d+\.|^-|^\*/) && line.length > 20) {
        const nameMatch = line.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        const firmMatch = line.match(/(?:at|of|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        
        if (nameMatch) {
          const result: VIPSearchResult = {
            name: nameMatch[1],
            title: 'Investment Professional',
            firm: firmMatch ? firmMatch[1] : 'Unknown',
            prominence: Math.floor(Math.random() * 40) + 60, // 60-100
            recentNews: Math.floor(Math.random() * 10) + 1
          };
          
          // Extract AUM if mentioned
          const aumMatch = line.match(/\$(\d+(?:\.\d+)?)\s*(billion|million|B|M)/i);
          if (aumMatch) {
            let aum = parseFloat(aumMatch[1]);
            if (aumMatch[2].toLowerCase().includes('b')) {
              aum *= 1000000000;
            } else if (aumMatch[2].toLowerCase().includes('m')) {
              aum *= 1000000;
            }
            result.aum = aum;
          }
          
          results.push(result);
        }
      }
    }
    
    return results.slice(0, 10); // Return top 10 results
  }
  
  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🧹 VIP profile cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; size: number } {
    return {
      entries: this.cache.size,
      size: JSON.stringify([...this.cache.entries()]).length
    };
  }
}