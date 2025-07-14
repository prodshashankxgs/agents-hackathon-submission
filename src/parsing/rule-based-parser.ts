import { TradeIntent } from '../types';

export interface ParseResult {
  intent?: TradeIntent;
  confidence: number;
  matchedPattern?: string;
  extractedValues?: Record<string, any>;
}

export class RuleBasedParser {
  private patterns = [
    // Basic buy patterns with dollar amounts
    {
      name: 'buy_dollars_simple',
      regex: /^(?:buy|purchase|get)\s+\$(\d+(?:\.\d{2})?)\s+(?:of\s+|worth\s+of\s+)?([A-Z]{1,5})$/i,
      confidence: 0.95,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'buy',
        symbol: match[2]?.toUpperCase() || '',
        amountType: 'dollars',
        amount: parseFloat(match[1] || '0'),
        orderType: 'market'
      })
    },
    
    // Buy with "worth of" syntax
    {
      name: 'buy_dollars_worth',
      regex: /^(?:buy|purchase|get)\s+\$(\d+(?:\.\d{2})?)\s+(?:worth\s+of\s+)?([A-Z]{1,5})$/i,
      confidence: 0.95,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'buy',
        symbol: match[2]?.toUpperCase() || '',
        amountType: 'dollars',
        amount: parseFloat(match[1] || '0'),
        orderType: 'market'
      })
    },

    // Buy with share amounts
    {
      name: 'buy_shares_simple',
      regex: /^(?:buy|purchase|get)\s+(\d+)\s+(?:shares?|stocks?)\s+(?:of\s+)?([A-Z]{1,5})$/i,
      confidence: 0.95,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'buy',
        symbol: match[2]?.toUpperCase() || '',
        amountType: 'shares',
        amount: parseInt(match[1] || '0'),
        orderType: 'market'
      })
    },

    // Sell with dollar amounts
    {
      name: 'sell_dollars_simple',
      regex: /^(?:sell|dispose|liquidate)\s+\$(\d+(?:\.\d{2})?)\s+(?:of\s+|worth\s+of\s+)?([A-Z]{1,5})$/i,
      confidence: 0.95,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'sell',
        symbol: match[2]?.toUpperCase() || '',
        amountType: 'dollars',
        amount: parseFloat(match[1] || '0'),
        orderType: 'market'
      })
    },

    // Sell with share amounts
    {
      name: 'sell_shares_simple',
      regex: /^(?:sell|dispose|liquidate)\s+(\d+)\s+(?:shares?|stocks?)\s+(?:of\s+)?([A-Z]{1,5})$/i,
      confidence: 0.95,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'sell',
        symbol: match[2]?.toUpperCase() || '',
        amountType: 'shares',
        amount: parseInt(match[1] || '0'),
        orderType: 'market'
      })
    },

    // Sell all positions
    {
      name: 'sell_all_position',
      regex: /^(?:sell\s+all|liquidate\s+all)\s+(?:of\s+|my\s+)?([A-Z]{1,5})$/i,
      confidence: 0.90,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'sell',
        symbol: match[1]?.toUpperCase() || '',
        amountType: 'shares',
        amount: -1, // Special value to indicate "sell all"
        orderType: 'market'
      })
    },

    // Buy with limit price
    {
      name: 'buy_limit_dollars',
      regex: /^(?:buy|purchase)\s+\$(\d+(?:\.\d{2})?)\s+(?:of\s+|worth\s+of\s+)?([A-Z]{1,5})\s+at\s+\$?(\d+(?:\.\d{2})?)$/i,
      confidence: 0.92,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'buy',
        symbol: match[2]?.toUpperCase() || '',
        amountType: 'dollars',
        amount: parseFloat(match[1] || '0'),
        orderType: 'limit',
        limitPrice: parseFloat(match[3] || '0')
      })
    },

    // Buy shares with limit price
    {
      name: 'buy_limit_shares',
      regex: /^(?:buy|purchase)\s+(\d+)\s+(?:shares?|stocks?)\s+(?:of\s+)?([A-Z]{1,5})\s+at\s+\$?(\d+(?:\.\d{2})?)$/i,
      confidence: 0.92,
      extract: (match: RegExpMatchArray): TradeIntent => ({
        action: 'buy',
        symbol: match[2]?.toUpperCase() || '',
        amountType: 'shares',
        amount: parseInt(match[1] || '0'),
        orderType: 'limit',
        limitPrice: parseFloat(match[3] || '0')
      })
    },

    // Natural language amounts (hundreds, thousands)
    {
      name: 'buy_natural_numbers',
      regex: /^(?:buy|purchase)\s+(one\s+hundred|two\s+hundred|three\s+hundred|four\s+hundred|five\s+hundred|six\s+hundred|seven\s+hundred|eight\s+hundred|nine\s+hundred|one\s+thousand|two\s+thousand)\s+(?:dollars?\s+)?(?:of\s+|worth\s+of\s+)?([A-Z]{1,5})$/i,
      confidence: 0.88,
      extract: (match: RegExpMatchArray): TradeIntent => {
        const amountText = match[1]?.toLowerCase().replace(/\s+/g, ' ') || '';
        const amount = this.parseNaturalNumber(amountText);
        return {
          action: 'buy',
          symbol: match[2]?.toUpperCase() || '',
          amountType: 'dollars',
          amount: amount,
          orderType: 'market'
        };
      }
    },

    // Fractional amounts (half, quarter)
    {
      name: 'buy_fractional',
      regex: /^(?:buy|purchase|get)\s+(half|quarter)\s+(?:a\s+)?(?:share|stock)\s+(?:of\s+)?([A-Z]{1,5})$/i,
      confidence: 0.85,
      extract: (match: RegExpMatchArray): TradeIntent => {
        const fraction = match[1]?.toLowerCase() === 'half' ? 0.5 : 0.25;
        return {
          action: 'buy',
          symbol: match[2]?.toUpperCase() || '',
          amountType: 'shares',
          amount: fraction,
          orderType: 'market'
        };
      }
    }
  ];

  private companyNameMap = {
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
    'coke': 'KO',
    'pepsi': 'PEP',
    'johnson': 'JNJ',
    'visa': 'V',
    'mastercard': 'MA',
    'jpmorgan': 'JPM',
    'jp morgan': 'JPM',
    'bank of america': 'BAC'
  };

  /**
   * Parse user input using rule-based patterns
   */
  parse(input: string): ParseResult {
    const normalizedInput = this.preprocessInput(input);
    
    // Try each pattern in order of confidence
    for (const pattern of this.patterns) {
      const match = normalizedInput.match(pattern.regex);
      if (match) {
        try {
          const intent = pattern.extract(match);
          
          // Validate the extracted intent
          if (this.validateIntent(intent)) {
            return {
              intent,
              confidence: pattern.confidence,
              matchedPattern: pattern.name,
              extractedValues: {
                originalMatch: match[0],
                groups: match.slice(1)
              }
            };
          }
        } catch (error) {
          console.warn(`Pattern ${pattern.name} failed to extract:`, error);
          continue;
        }
      }
    }

    return { confidence: 0 };
  }

  /**
   * Quick test if input can be parsed by rules
   */
  canParse(input: string): boolean {
    return this.parse(input).confidence > 0.8;
  }

  /**
   * Get all supported patterns (for debugging/optimization)
   */
  getSupportedPatterns(): string[] {
    return this.patterns.map(p => p.name);
  }

  /**
   * Add a new pattern dynamically
   */
  addPattern(pattern: {
    name: string;
    regex: RegExp;
    confidence: number;
    extract: (match: RegExpMatchArray) => TradeIntent;
  }): void {
    // Insert by confidence (highest first)
    const insertIndex = this.patterns.findIndex(p => p.confidence < pattern.confidence);
    if (insertIndex === -1) {
      this.patterns.push(pattern);
    } else {
      this.patterns.splice(insertIndex, 0, pattern);
    }
  }

  /**
   * Get parsing statistics
   */
  getStats(): {
    totalPatterns: number;
    averageConfidence: number;
    patternsByConfidence: Record<string, number>;
  } {
    const totalPatterns = this.patterns.length;
    const averageConfidence = this.patterns.reduce((sum, p) => sum + p.confidence, 0) / totalPatterns;
    const patternsByConfidence: Record<string, number> = {};
    
    this.patterns.forEach(p => {
      const range = Math.floor(p.confidence * 10) / 10;
      patternsByConfidence[range.toString()] = (patternsByConfidence[range.toString()] || 0) + 1;
    });

    return {
      totalPatterns,
      averageConfidence,
      patternsByConfidence
    };
  }

  private preprocessInput(input: string): string {
    let processed = input.trim();
    
    // Expand company names to tickers
    const lowerInput = processed.toLowerCase();
    for (const [company, ticker] of Object.entries(this.companyNameMap)) {
      const regex = new RegExp(`\\b${company}\\b`, 'gi');
      if (lowerInput.includes(company)) {
        processed = processed.replace(regex, ticker);
      }
    }

    // Normalize common variations
    processed = processed
      .replace(/\bstocks?\b/gi, 'shares')
      .replace(/\bequity\b/gi, 'shares')
      .replace(/\bunits?\b/gi, 'shares')
      .replace(/\bacquire\b/gi, 'buy')
      .replace(/\bpurchase\b/gi, 'buy')
      .replace(/\bget\b/gi, 'buy')
      .replace(/\bdispose\b/gi, 'sell')
      .replace(/\bliquidate\b/gi, 'sell')
      .replace(/\bdump\b/gi, 'sell');

    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();

    return processed;
  }

  private parseNaturalNumber(text: string): number {
    const numberMap: Record<string, number> = {
      'one hundred': 100,
      'two hundred': 200,
      'three hundred': 300,
      'four hundred': 400,
      'five hundred': 500,
      'six hundred': 600,
      'seven hundred': 700,
      'eight hundred': 800,
      'nine hundred': 900,
      'one thousand': 1000,
      'two thousand': 2000,
      'three thousand': 3000,
      'four thousand': 4000,
      'five thousand': 5000,
      'ten thousand': 10000
    };

    return numberMap[text] || 0;
  }

  private validateIntent(intent: TradeIntent): boolean {
    // Basic validation
    if (!intent.action || !intent.symbol || !intent.amountType) {
      return false;
    }

    // Check action is valid
    if (!['buy', 'sell'].includes(intent.action)) {
      return false;
    }

    // Check symbol format (1-5 uppercase letters)
    if (!/^[A-Z]{1,5}$/.test(intent.symbol)) {
      return false;
    }

    // Check amount type
    if (!['dollars', 'shares'].includes(intent.amountType)) {
      return false;
    }

    // Check amount is positive (except for special "sell all" case)
    if (intent.amount !== -1 && (!intent.amount || intent.amount <= 0)) {
      return false;
    }

    // Check order type
    if (intent.orderType && !['market', 'limit'].includes(intent.orderType)) {
      return false;
    }

    // If limit order, must have limit price
    if (intent.orderType === 'limit' && (!intent.limitPrice || intent.limitPrice <= 0)) {
      return false;
    }

    return true;
  }
}

// Global rule-based parser instance
export const ruleBasedParser = new RuleBasedParser();