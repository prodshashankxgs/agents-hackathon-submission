import { TradeIntent } from '../types';

export interface ClassificationResult {
  type: 'simple' | 'complex';
  confidence: number;
  suggestedParser?: 'rule-based' | 'semantic' | 'llm';
}

export class CommandClassifier {
  private simplePatterns = {
    // Basic buy/sell patterns
    simpleBuy: /(?:buy|purchase|get)\s+(?:\$?\d+(?:\.\d{2})?|\d+\s+(?:shares?|stocks?))\s+(?:of\s+|worth\s+of\s+)?([A-Z]{1,5})/i,
    simpleSell: /(?:sell|dispose|liquidate)\s+(?:\$?\d+(?:\.\d{2})?|\d+\s+(?:shares?|stocks?))\s+(?:of\s+)?([A-Z]{1,5})/i,
    
    // Account queries
    account: /^(?:account|balance|portfolio|positions?|holdings?)(?:\s+info)?$/i,
    
    // Market data queries
    marketPrice: /^(?:price|quote|current\s+price)\s+(?:of\s+|for\s+)?([A-Z]{1,5})$/i,
    marketStatus: /^(?:market\s+(?:status|open|closed)|is\s+market\s+open)$/i,
    
    // Portfolio queries
    portfolioHistory: /^(?:portfolio\s+(?:history|performance|chart)|show\s+(?:portfolio|performance))$/i,
  };

  private complexPatterns = {
    // Advanced trading concepts
    hedging: /(?:hedge|hedging|protect|protection|risk\s+management)/i,
    analysis: /(?:analyz|research|due\s+diligence|technical|fundamental|sentiment)/i,
    recommendations: /(?:recommend|suggest|what\s+should\s+i|advice|opinion)/i,
    institutionalHoldings: /(?:13f|institutional|holdings|berkshire|buffett|ark|cathie)/i,
    
    // Politician/Congressional queries
    politician: /(?:politician|congress|senate|representative|congressman|congresswoman|senator|nancy\s+pelosi|aoc|elizabeth\s+warren|josh\s+hawley|ted\s+cruz|marco\s+rubio|chuck\s+schumer|mitch\s+mcconnell|paul\s+ryan|kevin\s+mccarthy|hakeem\s+jeffries|political|congressional|house\s+of\s+representatives|congress\s+member|elected\s+official)/i,
    
    // Complex market concepts
    options: /(?:option|put|call|strike|expir)/i,
    derivatives: /(?:derivative|future|swap|forward)/i,
    
    // Multi-part commands
    multiSymbol: /(?:[A-Z]{1,5}(?:\s+and\s+|\s*,\s*)[A-Z]{1,5})/i,
    conditional: /(?:if|when|unless|provided|assuming)/i,
  };

  private companyNames = {
    'apple': 'AAPL',
    'microsoft': 'MSFT', 
    'google': 'GOOGL',
    'alphabet': 'GOOGL',
    'amazon': 'AMZN',
    'tesla': 'TSLA',
    'meta': 'META',
    'facebook': 'META',
    'netflix': 'NFLX',
    'nvidia': 'NVDA',
    'intel': 'INTC',
    'amd': 'AMD',
    'disney': 'DIS',
    'walmart': 'WMT',
    'coca cola': 'KO',
    'pepsi': 'PEP',
    'johnson': 'JNJ',
    'visa': 'V',
    'mastercard': 'MA',
    'jp morgan': 'JPM',
    'bank of america': 'BAC'
  };

  private politicianNames = {
    'nancy pelosi': 'Nancy Pelosi',
    'aoc': 'Alexandria Ocasio-Cortez',
    'alexandria ocasio-cortez': 'Alexandria Ocasio-Cortez',
    'elizabeth warren': 'Elizabeth Warren',
    'josh hawley': 'Josh Hawley',
    'ted cruz': 'Ted Cruz',
    'marco rubio': 'Marco Rubio',
    'chuck schumer': 'Chuck Schumer',
    'mitch mcconnell': 'Mitch McConnell',
    'paul ryan': 'Paul Ryan',
    'kevin mccarthy': 'Kevin McCarthy',
    'hakeem jeffries': 'Hakeem Jeffries',
    'dan crenshaw': 'Dan Crenshaw',
    'ro khanna': 'Ro Khanna',
    'mark cuban': 'Mark Cuban',
    'mitt romney': 'Mitt Romney',
    'john boehner': 'John Boehner',
    'steny hoyer': 'Steny Hoyer',
    'richard burr': 'Richard Burr',
    'david perdue': 'David Perdue',
    'kelly loeffler': 'Kelly Loeffler',
    'james inhofe': 'James Inhofe',
    'pat toomey': 'Pat Toomey',
    'susan collins': 'Susan Collins',
    'joe manchin': 'Joe Manchin',
    'kyrsten sinema': 'Kyrsten Sinema'
  };

  /**
   * Classify user input as simple or complex for routing optimization
   */
  classify(input: string): ClassificationResult {
    const normalizedInput = this.normalizeInput(input);
    
    // Check for complex patterns first (higher specificity)
    const complexScore = this.scoreComplexPatterns(normalizedInput);
    if (complexScore > 0.6) {
      return {
        type: 'complex',
        confidence: complexScore,
        suggestedParser: 'llm'
      };
    }

    // Check for simple patterns
    const simpleScore = this.scoreSimplePatterns(normalizedInput);
    if (simpleScore > 0.8) {
      return {
        type: 'simple',
        confidence: simpleScore,
        suggestedParser: 'rule-based'
      };
    }

    // Medium complexity - try semantic cache first
    if (simpleScore > 0.4 && complexScore < 0.4) {
      return {
        type: 'simple',
        confidence: simpleScore,
        suggestedParser: 'semantic'
      };
    }

    // Default to complex for safety
    return {
      type: 'complex',
      confidence: 0.3,
      suggestedParser: 'llm'
    };
  }

  /**
   * Quick check if input matches very simple patterns
   */
  isVerySimple(input: string): boolean {
    const normalizedInput = this.normalizeInput(input);
    return this.scoreSimplePatterns(normalizedInput) > 0.9;
  }

  /**
   * Extract potential ticker symbols from input
   */
  extractTickers(input: string): string[] {
    const tickers = new Set<string>();
    
    // Direct ticker pattern
    const tickerMatches = input.match(/\b[A-Z]{1,5}\b/g);
    if (tickerMatches) {
      tickerMatches.forEach(ticker => {
        if (ticker.length >= 1 && ticker.length <= 5) {
          tickers.add(ticker);
        }
      });
    }

    // Company name conversion
    const normalizedInput = input.toLowerCase();
    for (const [company, ticker] of Object.entries(this.companyNames)) {
      if (normalizedInput.includes(company)) {
        tickers.add(ticker);
      }
    }

    return Array.from(tickers);
  }

  /**
   * Extract politician names from input
   */
  extractPoliticians(input: string): string[] {
    const politicians = new Set<string>();
    const normalizedInput = input.toLowerCase();
    
    // Check for politician name patterns
    for (const [searchTerm, fullName] of Object.entries(this.politicianNames)) {
      if (normalizedInput.includes(searchTerm)) {
        politicians.add(fullName);
      }
    }
    
    // Additional pattern matching for common politician query formats
    const politicianPatterns = [
      /(?:senator|rep|representative|congressman|congresswoman)\s+([a-z]+(?:\s+[a-z]+)*)/gi,
      /([a-z]+(?:\s+[a-z]+)*)\s+(?:stock|holdings|trades|investments|portfolio)/gi
    ];
    
    for (const pattern of politicianPatterns) {
      const matches = normalizedInput.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          const name = match[1].trim();
          if (name.length > 2) {
            // Capitalize first letter of each word
            const capitalizedName = name.split(' ').map(word => 
              word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            politicians.add(capitalizedName);
          }
        }
      }
    }
    
    return Array.from(politicians);
  }

  /**
   * Check if input is a politician-related query
   */
  isPoliticianQuery(input: string): boolean {
    const normalizedInput = input.toLowerCase();
    return this.complexPatterns.politician.test(normalizedInput) ||
           this.extractPoliticians(input).length > 0;
  }

  /**
   * Estimate computational cost for routing decisions
   */
  estimateCost(input: string): { time: number; tokens: number } {
    const classification = this.classify(input);
    
    if (classification.suggestedParser === 'rule-based') {
      return { time: 1, tokens: 0 }; // 1ms, no API tokens
    }
    
    if (classification.suggestedParser === 'semantic') {
      return { time: 5, tokens: 0 }; // 5ms cache lookup, no API tokens
    }
    
    // LLM estimation based on input complexity
    const tokenCount = Math.ceil(input.length / 4); // Rough token estimation
    const baseTokens = 500; // System prompt + tools
    
    return { 
      time: classification.type === 'complex' ? 200 : 100, 
      tokens: tokenCount + baseTokens 
    };
  }

  private normalizeInput(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s$.,]/g, ''); // Keep only word chars, spaces, $, ., ,
  }

  private scoreSimplePatterns(input: string): number {
    let matches = 0;
    let totalPatterns = Object.keys(this.simplePatterns).length;

    for (const pattern of Object.values(this.simplePatterns)) {
      if (pattern.test(input)) {
        matches++;
        break; // One match is enough for simple classification
      }
    }

    // Boost score if input is very short and direct
    if (input.split(' ').length <= 6 && matches > 0) {
      return Math.min(1.0, matches + 0.3);
    }

    return matches / totalPatterns;
  }

  private scoreComplexPatterns(input: string): number {
    let matches = 0;
    let totalPatterns = Object.keys(this.complexPatterns).length;

    for (const pattern of Object.values(this.complexPatterns)) {
      if (pattern.test(input)) {
        matches++;
      }
    }

    // Additional complexity indicators
    const wordCount = input.split(' ').length;
    const hasMultipleVerbs = (input.match(/\b(?:buy|sell|analyze|hedge|recommend|compare)\b/gi) || []).length > 1;
    const hasConditionals = /\b(?:if|when|unless|after|before)\b/i.test(input);

    let complexityBonus = 0;
    if (wordCount > 10) complexityBonus += 0.2;
    if (hasMultipleVerbs) complexityBonus += 0.3;
    if (hasConditionals) complexityBonus += 0.4;

    return Math.min(1.0, (matches / totalPatterns) + complexityBonus);
  }

  /**
   * Get detailed classification info for debugging
   */
  getClassificationDetails(input: string): {
    classification: ClassificationResult;
    simpleMatches: string[];
    complexMatches: string[];
    extractedTickers: string[];
    estimatedCost: { time: number; tokens: number };
  } {
    const normalizedInput = this.normalizeInput(input);
    
    const simpleMatches: string[] = [];
    const complexMatches: string[] = [];

    // Check which patterns matched
    for (const [name, pattern] of Object.entries(this.simplePatterns)) {
      if (pattern.test(normalizedInput)) {
        simpleMatches.push(name);
      }
    }

    for (const [name, pattern] of Object.entries(this.complexPatterns)) {
      if (pattern.test(normalizedInput)) {
        complexMatches.push(name);
      }
    }

    return {
      classification: this.classify(input),
      simpleMatches,
      complexMatches,
      extractedTickers: this.extractTickers(input),
      estimatedCost: this.estimateCost(input)
    };
  }
}

// Global classifier instance
export const commandClassifier = new CommandClassifier();