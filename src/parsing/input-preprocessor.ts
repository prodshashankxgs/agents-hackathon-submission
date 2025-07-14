export class InputPreprocessor {
  private actionSynonyms: { [key: string]: string } = {
    // Buy actions
    'purchase': 'buy',
    'acquire': 'buy',
    'get': 'buy',
    'pick up': 'buy',
    'invest in': 'buy',
    'grab': 'buy',
    'take': 'buy',
    
    // Sell actions
    'dispose': 'sell',
    'liquidate': 'sell',
    'dump': 'sell',
    'get rid of': 'sell',
    'exit': 'sell',
    'close': 'sell',
    'unload': 'sell'
  };

  private quantitySynonyms: { [key: string]: string } = {
    'stocks': 'shares',
    'stock': 'shares',
    'equity': 'shares',
    'equities': 'shares',
    'units': 'shares',
    'unit': 'shares',
    'positions': 'shares',
    'position': 'shares'
  };

  private currencySynonyms: { [key: string]: string } = {
    'dollars': 'dollars',
    'dollar': 'dollars',
    'bucks': 'dollars',
    'buck': 'dollars',
    'usd': 'dollars',
    'cash': 'dollars',
    'money': 'dollars'
  };

  private numberWords: { [key: string]: number } = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
    'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60, 'seventy': 70,
    'eighty': 80, 'ninety': 90, 'hundred': 100, 'thousand': 1000, 'million': 1000000
  };

  private scaleWords: { [key: string]: number } = {
    'k': 1000,
    'thousand': 1000,
    'm': 1000000,
    'million': 1000000,
    'mil': 1000000,
    'b': 1000000000,
    'billion': 1000000000,
    'bil': 1000000000
  };

  private fractionalWords = {
    'half': 0.5,
    'quarter': 0.25,
    'third': 0.333,
    'two thirds': 0.667,
    'three quarters': 0.75
  };

  /**
   * Main preprocessing pipeline - general purpose command normalization
   */
  async preprocess(input: string): Promise<string> {
    let processed = input.trim();
    
    // Step 1: Basic normalization
    processed = this.normalizeWhitespace(processed);
    processed = this.normalizeCase(processed);
    
    // Step 2: Expand contractions
    processed = this.expandContractions(processed);
    
    // Step 3: Normalize action words
    processed = this.normalizeActions(processed);
    
    // Step 4: Normalize quantity words
    processed = this.normalizeQuantities(processed);
    
    // Step 5: Convert written numbers to digits
    processed = this.convertNumberWords(processed);
    
    // Step 6: Normalize currency and amounts
    processed = this.normalizeCurrency(processed);
    
    // Step 7: Fix common command typos
    processed = this.fixCommonTypos(processed);
    
    // Step 8: Normalize ticker symbol format
    processed = this.normalizeTickerSymbols(processed);
    
    // Step 9: Final cleanup
    processed = this.finalCleanup(processed);
    
    return processed;
  }

  /**
   * Extract potential ticker symbols from text
   */
  extractTickerSymbols(input: string): string[] {
    const tickers = new Set<string>();
    
    // Find patterns that look like ticker symbols (1-5 uppercase letters)
    const tickerMatches = input.match(/\b[A-Z]{1,5}\b/g);
    if (tickerMatches) {
      tickerMatches.forEach(ticker => {
        if (this.isLikelyTicker(ticker)) {
          tickers.add(ticker);
        }
      });
    }
    
    return Array.from(tickers);
  }

  /**
   * Normalize monetary amounts with scale handling
   */
  normalizeAmount(input: string): string {
    let processed = input;
    
    // Handle scale suffixes (1k, 2.5m, etc.)
    processed = processed.replace(/(\d+(?:\.\d+)?)\s*([kmb])\b/gi, (match, number, scale) => {
      const multiplier = this.scaleWords[scale.toLowerCase() as keyof typeof this.scaleWords] || 1;
      const result = parseFloat(number) * multiplier;
      return result.toString();
    });
    
    return processed;
  }

  /**
   * Parse fractional amounts (half, quarter, etc.)
   */
  parseFractionalAmount(input: string): string {
    let processed = input;
    
    for (const [fraction, value] of Object.entries(this.fractionalWords)) {
      const regex = new RegExp(`\\b${fraction}\\b`, 'gi');
      processed = processed.replace(regex, value.toString());
    }
    
    return processed;
  }

  private normalizeWhitespace(input: string): string {
    return input
      .replace(/\s+/g, ' ')  // Multiple spaces to single
      .replace(/\t/g, ' ')   // Tabs to spaces
      .replace(/\n/g, ' ')   // Newlines to spaces
      .trim();
  }

  private normalizeCase(input: string): string {
    // Keep ticker symbols uppercase, lowercase everything else except first letter
    return input.replace(/\b[A-Z]{2,5}\b/g, (match) => {
      // If it looks like a ticker, keep it uppercase
      if (this.isLikelyTicker(match)) {
        return match.toUpperCase();
      }
      // Otherwise, lowercase it
      return match.toLowerCase();
    });
  }

  private expandContractions(input: string): string {
    const contractions: Record<string, string> = {
      "won't": "will not",
      "can't": "cannot",
      "don't": "do not",
      "isn't": "is not",
      "aren't": "are not",
      "wasn't": "was not",
      "weren't": "were not",
      "hasn't": "has not",
      "haven't": "have not",
      "hadn't": "had not",
      "wouldn't": "would not",
      "shouldn't": "should not",
      "couldn't": "could not",
      "mustn't": "must not",
      "'ll": " will",
      "'re": " are",
      "'ve": " have",
      "'d": " would",
      "'m": " am",
      "'s": " is"
    };
    
    let processed = input;
    for (const [contraction, expansion] of Object.entries(contractions)) {
      const regex = new RegExp(contraction, 'gi');
      processed = processed.replace(regex, expansion);
    }
    
    return processed;
  }

  private normalizeActions(input: string): string {
    let processed = input;
    
    for (const [synonym, standard] of Object.entries(this.actionSynonyms)) {
      const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
      processed = processed.replace(regex, standard);
    }
    
    return processed;
  }

  private normalizeQuantities(input: string): string {
    let processed = input;
    
    for (const [synonym, standard] of Object.entries(this.quantitySynonyms)) {
      const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
      processed = processed.replace(regex, standard);
    }
    
    return processed;
  }

  private convertNumberWords(input: string): string {
    let processed = input;
    
    // Handle compound numbers (e.g., "twenty five" -> "25")
    processed = processed.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\b/gi, 
      (match, tens, ones) => {
        const tensValue = this.numberWords[tens.toLowerCase()] || 0;
        const onesValue = this.numberWords[ones.toLowerCase()] || 0;
        return (tensValue + onesValue).toString();
      }
    );
    
    // Handle hundreds (e.g., "two hundred" -> "200")
    processed = processed.replace(/\b(one|two|three|four|five|six|seven|eight|nine)\s+hundred\b/gi,
      (match, number) => {
        const value = this.numberWords[number.toLowerCase()] || 0;
        return (value * 100).toString();
      }
    );
    
    // Handle thousands (e.g., "five thousand" -> "5000")
    processed = processed.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+thousand\b/gi,
      (match, number) => {
        const value = this.numberWords[number.toLowerCase()] || 0;
        return (value * 1000).toString();
      }
    );
    
    // Handle fractional amounts
    processed = this.parseFractionalAmount(processed);
    
    // Handle simple number words (only small numbers to avoid conflicts)
    for (const [word, number] of Object.entries(this.numberWords)) {
      if (number <= 20) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        processed = processed.replace(regex, number.toString());
      }
    }
    
    return processed;
  }

  private normalizeCurrency(input: string): string {
    let processed = input;
    
    // Normalize currency synonyms first
    for (const [synonym, standard] of Object.entries(this.currencySynonyms)) {
      const regex = new RegExp(`\\b${synonym}\\b`, 'gi');
      processed = processed.replace(regex, standard);
    }
    
    // Normalize dollar signs and amounts
    processed = processed.replace(/\$\s*(\d+(?:\.\d{2})?)/g, '$1 dollars');
    
    // Handle scale suffixes with currency
    processed = processed.replace(/\$(\d+(?:\.\d+)?)\s*([kmb])\b/gi, (match, number, scale) => {
      const multiplier = this.scaleWords[scale.toLowerCase()] || 1;
      const result = parseFloat(number) * multiplier;
      return `${result} dollars`;
    });
    
    // Handle "worth of" patterns
    processed = processed.replace(/(\d+(?:\.\d+)?)\s*dollars?\s+worth\s+of/gi, '$1 dollars worth of');
    
    // Normalize scale suffixes for plain numbers
    processed = this.normalizeAmount(processed);
    
    return processed;
  }

  private normalizeTickerSymbols(input: string): string {
    // Ensure ticker symbols are uppercase and properly spaced
    return input.replace(/\b([a-z]{1,5})\b(?=\s|$)/g, (match) => {
      if (this.isLikelyTicker(match.toUpperCase())) {
        return match.toUpperCase();
      }
      return match;
    });
  }

  private fixCommonTypos(input: string): string {
    const typoMap: Record<string, string> = {
      // Action typos
      'seel': 'sell',
      'sel': 'sell',
      'by': 'buy',
      'byu': 'buy',
      'purchse': 'purchase',
      'purchas': 'purchase',
      
      // Quantity typos
      'shaers': 'shares',
      'shres': 'shares',
      'shars': 'shares',
      'shar': 'shares',
      
      // Currency typos
      'dolars': 'dollars',
      'dolar': 'dollars',
      'doller': 'dollars',
      'dollers': 'dollars',
      
      // Common words
      'of': 'of',
      'teh': 'the',
      'adn': 'and',
      'nad': 'and'
    };
    
    let processed = input;
    for (const [typo, correction] of Object.entries(typoMap)) {
      const regex = new RegExp(`\\b${typo}\\b`, 'gi');
      processed = processed.replace(regex, correction);
    }
    
    return processed;
  }

  private finalCleanup(input: string): string {
    return input
      .replace(/\s+/g, ' ')  // Normalize whitespace again
      .replace(/\s+([.,!?])/g, '$1')  // Remove spaces before punctuation
      .replace(/([.,!?])\s*([.,!?])/g, '$1$2')  // Remove duplicate punctuation
      .trim();
  }

  private isLikelyTicker(symbol: string): boolean {
    // Basic heuristics for ticker symbol detection
    const upperSymbol = symbol.toUpperCase();
    
    // Must be 1-5 characters, all letters
    if (!/^[A-Z]{1,5}$/.test(upperSymbol)) {
      return false;
    }
    
    // Exclude common English words that might be confused as tickers
    const commonWords = [
      'THE', 'AND', 'OR', 'BUT', 'FOR', 'TO', 'OF', 'IN', 'ON', 'AT', 'BY', 
      'IS', 'IT', 'ALL', 'ANY', 'CAN', 'HAD', 'HAS', 'HER', 'WAS', 'ONE',
      'OUR', 'OUT', 'DAY', 'GET', 'USE', 'MAN', 'NEW', 'NOW', 'WAY', 'MAY',
      'SAY', 'EACH', 'WHICH', 'DO', 'HOW', 'IF', 'WILL', 'UP', 'OTHER', 'ABOUT',
      'OUT', 'MANY', 'THEN', 'THEM', 'THESE', 'SO', 'SOME', 'HER', 'WOULD',
      'MAKE', 'LIKE', 'INTO', 'HIM', 'TIME', 'TWO', 'MORE', 'GO', 'NO', 'MY',
      'THAN', 'FIRST', 'BEEN', 'CALL', 'WHO', 'ITS', 'DID', 'YES', 'HIS',
      'BEEN', 'LONG', 'DOWN', 'COULD', 'WHAT', 'WITH', 'HAVE', 'FROM', 'THEY',
      'KNOW', 'WANT', 'BEEN', 'GOOD', 'MUCH', 'SOME', 'TIME', 'VERY', 'WHEN',
      'COME', 'HERE', 'JUST', 'LIKE', 'LONG', 'MAKE', 'OVER', 'SUCH', 'TAKE',
      'THAN', 'THEM', 'WELL', 'WERE', 'BUY', 'SELL'
    ];
    
    return !commonWords.includes(upperSymbol);
  }

  /**
   * Get preprocessing statistics
   */
  getStats(): {
    actionSynonyms: number;
    quantitySynonyms: number;
    currencySynonyms: number;
    numberWords: number;
    scaleWords: number;
    fractionalWords: number;
  } {
    return {
      actionSynonyms: Object.keys(this.actionSynonyms).length,
      quantitySynonyms: Object.keys(this.quantitySynonyms).length,
      currencySynonyms: Object.keys(this.currencySynonyms).length,
      numberWords: Object.keys(this.numberWords).length,
      scaleWords: Object.keys(this.scaleWords).length,
      fractionalWords: Object.keys(this.fractionalWords).length
    };
  }

  /**
   * Add custom synonym mappings
   */
  addActionSynonym(synonym: string, standard: string): void {
    this.actionSynonyms[synonym.toLowerCase()] = standard.toLowerCase();
  }

  addQuantitySynonym(synonym: string, standard: string): void {
    this.quantitySynonyms[synonym.toLowerCase()] = standard.toLowerCase();
  }

  addCurrencySynonym(synonym: string, standard: string): void {
    this.currencySynonyms[synonym.toLowerCase()] = standard.toLowerCase();
  }

  /**
   * Test preprocessing on sample inputs
   */
  test(): void {
    const testCases = [
      'buy one hundred dollars worth of AAPL',
      'purchase 5 shares of MSFT',
      'sell all my TSLA stocks',
      'get 2.5k worth of GOOGL',
      'dispose of fifty shares of AMZN',
      'buy $500 worth of META',
      'liquidate half my positions in NVDA',
      'acquire two thousand dollars of SPY',
      'dump 25 shares of QQQ'
    ];

    console.log('🧪 Testing input preprocessor...');
    testCases.forEach(async (testCase, index) => {
      const result = await this.preprocess(testCase);
      console.log(`${index + 1}. "${testCase}" → "${result}"`);
    });
  }
}

// Global input preprocessor instance
export const inputPreprocessor = new InputPreprocessor();