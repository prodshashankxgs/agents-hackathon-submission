import { ThirteenFPortfolio, ThirteenFHolding } from '../services/13f-service';
import { VIPInvestorProfile } from '../services/vip-profile-service';

/**
 * Database schema definitions for VIP investor data
 * These models are designed to be database-agnostic and can be used with
 * SQLite, PostgreSQL, or any other SQL database
 */

export interface VIPInvestorEntity {
  id: string;
  name: string;
  title: string;
  firm: string;
  firm_cik: string | null;
  biography: string;
  investment_philosophy: string;
  strategy: string;
  aum?: number;
  founded?: string;
  headquarters?: string;
  
  // Investment approach (stored as JSON)
  approach: string; // JSON string of approach object
  
  // Performance metrics (stored as JSON)
  performance: string; // JSON string of performance object
  
  // Communications (stored as JSON)
  communications: string; // JSON string of communications object
  
  // Metadata
  data_source: string;
  confidence: number;
  created_at: string;
  updated_at: string;
  cache_expiry: string;
}

export interface VIPHoldingEntity {
  id: string;
  investor_id: string; // Foreign key to VIPInvestorEntity
  symbol: string;
  company_name: string;
  position: string;
  rationale?: string;
  created_at: string;
  updated_at: string;
}

export interface VIPRecentMoveEntity {
  id: string;
  investor_id: string; // Foreign key to VIPInvestorEntity
  type: 'buy' | 'sell' | 'increase' | 'decrease';
  symbol: string;
  company_name: string;
  description: string;
  move_date?: string;
  impact?: string;
  created_at: string;
}

export interface VIPNewsEntity {
  id: string;
  investor_id: string; // Foreign key to VIPInvestorEntity
  headline: string;
  source: string;
  news_date: string;
  summary: string;
  url?: string;
  created_at: string;
}

export interface ThirteenFPortfolioEntity {
  id: string;
  institution: string;
  cik: string;
  filing_date: string;
  quarter_end_date: string;
  total_value: number;
  form_type?: string;
  document_count?: number;
  amendment_flag?: boolean;
  
  // Analytics (stored as JSON)
  analytics?: string; // JSON string of analytics object
  
  // Metadata
  data_source: string;
  last_updated: string;
  cache_expiry: string;
  processing_time: number;
  
  created_at: string;
  updated_at: string;
}

export interface ThirteenFHoldingEntity {
  id: string;
  portfolio_id: string; // Foreign key to ThirteenFPortfolioEntity
  symbol: string;
  company_name: string;
  shares: number;
  market_value: number;
  percent_of_portfolio: number;
  change_from_previous?: number;
  change_percent?: number;
  cusip?: string;
  price_per_share?: number;
  sector?: string;
  industry?: string;
  market_cap?: number;
  
  created_at: string;
  updated_at: string;
}

export interface RequestMetricsEntity {
  id: string;
  request_id: string;
  timestamp: number;
  duration: number;
  tokens_used: number;
  model: string;
  success: boolean;
  error?: string;
  endpoint: string;
  user_query?: string;
  
  created_at: string;
}

export interface CacheEntity {
  id: string;
  cache_key: string;
  data: string; // JSON string of cached data
  timestamp: number;
  expiry: number;
  data_type: 'vip_profile' | '13f_portfolio' | 'search_results';
  
  created_at: string;
  updated_at: string;
}

/**
 * SQL DDL statements for creating tables
 */
export const CREATE_TABLES_SQL = {
  vip_investors: `
    CREATE TABLE IF NOT EXISTS vip_investors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      firm TEXT NOT NULL,
      firm_cik TEXT,
      biography TEXT,
      investment_philosophy TEXT,
      strategy TEXT,
      aum REAL,
      founded TEXT,
      headquarters TEXT,
      approach TEXT, -- JSON
      performance TEXT, -- JSON
      communications TEXT, -- JSON
      data_source TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cache_expiry TEXT NOT NULL
    );
  `,
  
  vip_holdings: `
    CREATE TABLE IF NOT EXISTS vip_holdings (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT NOT NULL,
      position TEXT NOT NULL,
      rationale TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (investor_id) REFERENCES vip_investors(id) ON DELETE CASCADE
    );
  `,
  
  vip_recent_moves: `
    CREATE TABLE IF NOT EXISTS vip_recent_moves (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('buy', 'sell', 'increase', 'decrease')),
      symbol TEXT NOT NULL,
      company_name TEXT NOT NULL,
      description TEXT NOT NULL,
      move_date TEXT,
      impact TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (investor_id) REFERENCES vip_investors(id) ON DELETE CASCADE
    );
  `,
  
  vip_news: `
    CREATE TABLE IF NOT EXISTS vip_news (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      headline TEXT NOT NULL,
      source TEXT NOT NULL,
      news_date TEXT NOT NULL,
      summary TEXT NOT NULL,
      url TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (investor_id) REFERENCES vip_investors(id) ON DELETE CASCADE
    );
  `,
  
  thirteenf_portfolios: `
    CREATE TABLE IF NOT EXISTS thirteenf_portfolios (
      id TEXT PRIMARY KEY,
      institution TEXT NOT NULL,
      cik TEXT NOT NULL,
      filing_date TEXT NOT NULL,
      quarter_end_date TEXT NOT NULL,
      total_value REAL NOT NULL,
      form_type TEXT,
      document_count INTEGER,
      amendment_flag BOOLEAN,
      analytics TEXT, -- JSON
      data_source TEXT NOT NULL,
      last_updated TEXT NOT NULL,
      cache_expiry TEXT NOT NULL,
      processing_time INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `,
  
  thirteenf_holdings: `
    CREATE TABLE IF NOT EXISTS thirteenf_holdings (
      id TEXT PRIMARY KEY,
      portfolio_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      company_name TEXT NOT NULL,
      shares INTEGER NOT NULL,
      market_value REAL NOT NULL,
      percent_of_portfolio REAL NOT NULL,
      change_from_previous REAL,
      change_percent REAL,
      cusip TEXT,
      price_per_share REAL,
      sector TEXT,
      industry TEXT,
      market_cap REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (portfolio_id) REFERENCES thirteenf_portfolios(id) ON DELETE CASCADE
    );
  `,
  
  request_metrics: `
    CREATE TABLE IF NOT EXISTS request_metrics (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      duration INTEGER NOT NULL,
      tokens_used INTEGER NOT NULL,
      model TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      error TEXT,
      endpoint TEXT NOT NULL,
      user_query TEXT,
      created_at TEXT NOT NULL
    );
  `,
  
  cache: `
    CREATE TABLE IF NOT EXISTS cache (
      id TEXT PRIMARY KEY,
      cache_key TEXT UNIQUE NOT NULL,
      data TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      expiry INTEGER NOT NULL,
      data_type TEXT NOT NULL CHECK (data_type IN ('vip_profile', '13f_portfolio', 'search_results')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `
};

/**
 * Index creation statements for better query performance
 */
export const CREATE_INDEXES_SQL = {
  vip_investors: [
    'CREATE INDEX IF NOT EXISTS idx_vip_investors_name ON vip_investors(name);',
    'CREATE INDEX IF NOT EXISTS idx_vip_investors_firm ON vip_investors(firm);',
    'CREATE INDEX IF NOT EXISTS idx_vip_investors_cache_expiry ON vip_investors(cache_expiry);',
    'CREATE INDEX IF NOT EXISTS idx_vip_investors_updated_at ON vip_investors(updated_at);'
  ],
  
  vip_holdings: [
    'CREATE INDEX IF NOT EXISTS idx_vip_holdings_investor_id ON vip_holdings(investor_id);',
    'CREATE INDEX IF NOT EXISTS idx_vip_holdings_symbol ON vip_holdings(symbol);'
  ],
  
  vip_recent_moves: [
    'CREATE INDEX IF NOT EXISTS idx_vip_recent_moves_investor_id ON vip_recent_moves(investor_id);',
    'CREATE INDEX IF NOT EXISTS idx_vip_recent_moves_symbol ON vip_recent_moves(symbol);',
    'CREATE INDEX IF NOT EXISTS idx_vip_recent_moves_type ON vip_recent_moves(type);'
  ],
  
  vip_news: [
    'CREATE INDEX IF NOT EXISTS idx_vip_news_investor_id ON vip_news(investor_id);',
    'CREATE INDEX IF NOT EXISTS idx_vip_news_date ON vip_news(news_date);',
    'CREATE INDEX IF NOT EXISTS idx_vip_news_source ON vip_news(source);'
  ],
  
  thirteenf_portfolios: [
    'CREATE INDEX IF NOT EXISTS idx_thirteenf_portfolios_institution ON thirteenf_portfolios(institution);',
    'CREATE INDEX IF NOT EXISTS idx_thirteenf_portfolios_cik ON thirteenf_portfolios(cik);',
    'CREATE INDEX IF NOT EXISTS idx_thirteenf_portfolios_filing_date ON thirteenf_portfolios(filing_date);',
    'CREATE INDEX IF NOT EXISTS idx_thirteenf_portfolios_cache_expiry ON thirteenf_portfolios(cache_expiry);'
  ],
  
  thirteenf_holdings: [
    'CREATE INDEX IF NOT EXISTS idx_thirteenf_holdings_portfolio_id ON thirteenf_holdings(portfolio_id);',
    'CREATE INDEX IF NOT EXISTS idx_thirteenf_holdings_symbol ON thirteenf_holdings(symbol);',
    'CREATE INDEX IF NOT EXISTS idx_thirteenf_holdings_market_value ON thirteenf_holdings(market_value);'
  ],
  
  request_metrics: [
    'CREATE INDEX IF NOT EXISTS idx_request_metrics_timestamp ON request_metrics(timestamp);',
    'CREATE INDEX IF NOT EXISTS idx_request_metrics_endpoint ON request_metrics(endpoint);',
    'CREATE INDEX IF NOT EXISTS idx_request_metrics_success ON request_metrics(success);'
  ],
  
  cache: [
    'CREATE INDEX IF NOT EXISTS idx_cache_cache_key ON cache(cache_key);',
    'CREATE INDEX IF NOT EXISTS idx_cache_data_type ON cache(data_type);',
    'CREATE INDEX IF NOT EXISTS idx_cache_expiry ON cache(expiry);'
  ]
};

/**
 * Utility functions for data transformation
 */
export class VIPDataTransformer {
  static profileToEntity(profile: VIPInvestorProfile): VIPInvestorEntity {
    return {
      id: this.generateId(),
      name: profile.name,
      title: profile.title,
      firm: profile.firm,
      firm_cik: profile.firmCik || null,
      biography: profile.biography,
      investment_philosophy: profile.investmentPhilosophy,
      strategy: profile.strategy,
      aum: profile.aum,
      founded: profile.founded,
      headquarters: profile.headquarters,
      approach: JSON.stringify(profile.approach),
      performance: JSON.stringify(profile.performance),
      communications: JSON.stringify(profile.communications),
      data_source: profile.metadata.dataSource,
      confidence: profile.metadata.confidence,
      created_at: new Date().toISOString(),
      updated_at: profile.metadata.lastUpdated,
      cache_expiry: profile.metadata.cacheExpiry
    };
  }
  
  static entityToProfile(entity: VIPInvestorEntity): VIPInvestorProfile {
    return {
      name: entity.name,
      title: entity.title,
      firm: entity.firm,
      firmCik: entity.firm_cik,
      biography: entity.biography,
      investmentPhilosophy: entity.investment_philosophy,
      strategy: entity.strategy,
      aum: entity.aum,
      founded: entity.founded,
      headquarters: entity.headquarters,
      approach: JSON.parse(entity.approach),
      performance: JSON.parse(entity.performance),
      communications: JSON.parse(entity.communications),
      notableHoldings: [], // Will be populated from separate table
      recentMoves: [], // Will be populated from separate table
      recentNews: [], // Will be populated from separate table
      metadata: {
        dataSource: entity.data_source,
        confidence: entity.confidence,
        lastUpdated: entity.updated_at,
        cacheExpiry: entity.cache_expiry
      }
    };
  }
  
  static portfolioToEntity(portfolio: ThirteenFPortfolio): ThirteenFPortfolioEntity {
    return {
      id: this.generateId(),
      institution: portfolio.institution,
      cik: portfolio.cik,
      filing_date: portfolio.filingDate,
      quarter_end_date: portfolio.quarterEndDate,
      total_value: portfolio.totalValue,
      form_type: portfolio.formType,
      document_count: portfolio.documentCount,
      amendment_flag: portfolio.amendmentFlag,
      analytics: portfolio.analytics ? JSON.stringify(portfolio.analytics) : undefined,
      data_source: portfolio.metadata?.dataSource || 'perplexity',
      last_updated: portfolio.metadata?.lastUpdated || new Date().toISOString(),
      cache_expiry: portfolio.metadata?.cacheExpiry || new Date(Date.now() + 14400000).toISOString(),
      processing_time: portfolio.metadata?.processingTime || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  
  static entityToPortfolio(entity: ThirteenFPortfolioEntity): ThirteenFPortfolio {
    return {
      institution: entity.institution,
      cik: entity.cik,
      filingDate: entity.filing_date,
      quarterEndDate: entity.quarter_end_date,
      totalValue: entity.total_value,
      formType: entity.form_type,
      documentCount: entity.document_count,
      amendmentFlag: entity.amendment_flag,
      holdings: [], // Will be populated from separate table
      analytics: entity.analytics ? JSON.parse(entity.analytics) : undefined,
      metadata: {
        dataSource: entity.data_source,
        lastUpdated: entity.last_updated,
        cacheExpiry: entity.cache_expiry,
        processingTime: entity.processing_time
      }
    };
  }
  
  static holdingToEntity(holding: ThirteenFHolding, portfolioId: string): ThirteenFHoldingEntity {
    return {
      id: this.generateId(),
      portfolio_id: portfolioId,
      symbol: holding.symbol,
      company_name: holding.companyName,
      shares: holding.shares,
      market_value: holding.marketValue,
      percent_of_portfolio: holding.percentOfPortfolio,
      change_from_previous: holding.changeFromPrevious,
      change_percent: holding.changePercent,
      cusip: holding.cusip,
      price_per_share: holding.pricePerShare,
      sector: holding.sector,
      industry: holding.industry,
      market_cap: holding.marketCap,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }
  
  static entityToHolding(entity: ThirteenFHoldingEntity): ThirteenFHolding {
    return {
      symbol: entity.symbol,
      companyName: entity.company_name,
      shares: entity.shares,
      marketValue: entity.market_value,
      percentOfPortfolio: entity.percent_of_portfolio,
      changeFromPrevious: entity.change_from_previous,
      changePercent: entity.change_percent,
      cusip: entity.cusip,
      pricePerShare: entity.price_per_share,
      sector: entity.sector,
      industry: entity.industry,
      marketCap: entity.market_cap
    };
  }
  
  private static generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Database query helpers
 */
export const QUERIES = {
  // VIP Investors
  GET_VIP_BY_NAME: 'SELECT * FROM vip_investors WHERE name = ? ORDER BY updated_at DESC LIMIT 1',
  GET_VIP_BY_FIRM: 'SELECT * FROM vip_investors WHERE firm LIKE ? ORDER BY updated_at DESC',
  GET_EXPIRED_VIP_PROFILES: 'SELECT * FROM vip_investors WHERE cache_expiry < ?',
  SEARCH_VIP_INVESTORS: 'SELECT * FROM vip_investors WHERE name LIKE ? OR firm LIKE ? ORDER BY confidence DESC, updated_at DESC',
  
  // 13F Portfolios
  GET_PORTFOLIO_BY_INSTITUTION: 'SELECT * FROM thirteenf_portfolios WHERE institution = ? ORDER BY filing_date DESC LIMIT 1',
  GET_PORTFOLIO_BY_CIK: 'SELECT * FROM thirteenf_portfolios WHERE cik = ? ORDER BY filing_date DESC LIMIT 1',
  GET_EXPIRED_PORTFOLIOS: 'SELECT * FROM thirteenf_portfolios WHERE cache_expiry < ?',
  GET_RECENT_PORTFOLIOS: 'SELECT * FROM thirteenf_portfolios ORDER BY filing_date DESC LIMIT ?',
  
  // Holdings
  GET_HOLDINGS_BY_PORTFOLIO: 'SELECT * FROM thirteenf_holdings WHERE portfolio_id = ? ORDER BY market_value DESC',
  GET_HOLDINGS_BY_SYMBOL: 'SELECT h.*, p.institution FROM thirteenf_holdings h JOIN thirteenf_portfolios p ON h.portfolio_id = p.id WHERE h.symbol = ? ORDER BY h.market_value DESC',
  
  // VIP Holdings
  GET_VIP_HOLDINGS: 'SELECT * FROM vip_holdings WHERE investor_id = ? ORDER BY created_at DESC',
  GET_VIP_RECENT_MOVES: 'SELECT * FROM vip_recent_moves WHERE investor_id = ? ORDER BY created_at DESC',
  GET_VIP_NEWS: 'SELECT * FROM vip_news WHERE investor_id = ? ORDER BY news_date DESC',
  
  // Analytics
  GET_TOP_HOLDINGS_BY_SYMBOL: `
    SELECT h.symbol, h.company_name, COUNT(*) as institution_count, 
           SUM(h.market_value) as total_value, AVG(h.percent_of_portfolio) as avg_weight
    FROM thirteenf_holdings h 
    JOIN thirteenf_portfolios p ON h.portfolio_id = p.id 
    WHERE p.cache_expiry > ? 
    GROUP BY h.symbol, h.company_name 
    ORDER BY institution_count DESC, total_value DESC
  `,
  
  GET_INSTITUTION_PERFORMANCE: `
    SELECT institution, filing_date, total_value, 
           LAG(total_value) OVER (PARTITION BY institution ORDER BY filing_date) as previous_value
    FROM thirteenf_portfolios 
    WHERE institution = ? 
    ORDER BY filing_date DESC
  `,
  
  // Cache management
  CLEANUP_EXPIRED_CACHE: 'DELETE FROM cache WHERE expiry < ?',
  GET_CACHE_STATS: 'SELECT data_type, COUNT(*) as count, AVG(expiry - timestamp) as avg_ttl FROM cache GROUP BY data_type'
};