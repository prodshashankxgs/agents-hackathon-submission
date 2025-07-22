// ============================================================================
// PARSING SERVICE - DOMAIN LAYER
// ============================================================================

import {
  IParsingService,
  ILLMAdapter,
  ICacheService,
  ParseResult,
  TradeCommand,
  DomainError,
  ILogger
} from '../../core/interfaces';

export class ParsingService implements IParsingService {
  private readonly CACHE_TTL = 300000; // 5 minutes
  private readonly CONFIDENCE_THRESHOLD = 0.7;

  constructor(
    private llmAdapter: ILLMAdapter,
    private cacheService: ICacheService,
    private logger: ILogger
  ) {}

  async parseCommand(input: string): Promise<ParseResult> {
    const startTime = Date.now();
    
    this.logger.info('Starting command parsing', { input });

    try {
      // Step 1: Normalize input
      const normalizedInput = this.normalizeInput(input);
      
      // Step 2: Check cache first
      const cacheKey = this.createCacheKey(normalizedInput);
      const cachedResult = await this.cacheService.get<ParseResult>(cacheKey);
      
      if (cachedResult) {
        this.logger.debug('Cache hit for parsing request', { input: normalizedInput });
        return {
          ...cachedResult,
          processingTime: Date.now() - startTime,
          metadata: { ...cachedResult.metadata, cacheHit: true }
        };
      }

      // Step 3: Try rule-based parsing first (fastest)
      const ruleBasedResult = await this.tryRuleBasedParsing(normalizedInput);
      
      if (ruleBasedResult && ruleBasedResult.confidence >= this.CONFIDENCE_THRESHOLD) {
        const result = {
          ...ruleBasedResult,
          processingTime: Date.now() - startTime
        };
        
        // Cache successful results
        await this.cacheService.set(cacheKey, result, this.CACHE_TTL);
        
        this.logger.info('Command parsed successfully via rule-based method', {
          confidence: result.confidence,
          method: result.method
        });
        
        return result;
      }

      // Step 4: Fallback to LLM parsing
      this.logger.debug('Rule-based parsing insufficient, trying LLM', {
        ruleBasedConfidence: ruleBasedResult?.confidence || 0
      });

      const llmResult = await this.tryLLMParsing(normalizedInput);
      const result = {
        ...llmResult,
        processingTime: Date.now() - startTime
      };

      // Cache LLM results if confidence is high enough
      if (result.confidence >= this.CONFIDENCE_THRESHOLD) {
        await this.cacheService.set(cacheKey, result, this.CACHE_TTL);
      }

      this.logger.info('Command parsed successfully via LLM', {
        confidence: result.confidence,
        method: result.method
      });

      return result;

    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error('Command parsing failed', error as Error, { input, processingTime });
      
      throw new DomainError(
        `Failed to parse command: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PARSING_FAILED',
        { input, processingTime, originalError: error }
      );
    }
  }

  validateSyntax(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return false;
    }

    // Basic syntax validation
    const hasAction = /\b(buy|sell|purchase|acquire|dispose|liquidate)\b/i.test(trimmed);
    const hasSymbol = /\b[A-Z]{1,5}\b/.test(trimmed.toUpperCase());
    const hasAmount = /\b(\d+(\.\d+)?|\$\d+|\d+\s*(shares?|dollars?|bucks?))\b/i.test(trimmed);

    return hasAction && (hasSymbol || hasAmount);
  }

  extractSymbols(input: string): string[] {
    const symbols: string[] = [];
    
    // Pattern for stock symbols (1-5 uppercase letters)
    const symbolPattern = /\b[A-Z]{1,5}\b/g;
    const matches = input.toUpperCase().match(symbolPattern);
    
    if (matches) {
      // Filter out common English words that might match the pattern
      const commonWords = new Set(['THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'HAD', 'BY', 'HOT', 'WORD', 'WHAT', 'SOME', 'WE', 'IT', 'DO', 'CAN', 'OUT', 'OTHER', 'WERE', 'WHICH', 'THEIR', 'SAID', 'EACH', 'SHE', 'HOW', 'THERE', 'BEEN', 'THAN', 'NOW', 'MANY', 'VERY', 'WHEN', 'MUCH', 'NEW', 'MOST', 'OVER', 'SUCH', 'TAKE', 'JUST', 'THESE', 'ALSO', 'BACK', 'AFTER', 'FIRST', 'WELL', 'WAY', 'WORK', 'LIFE', 'ONLY', 'THEN', 'YEAR', 'COME', 'KNOW', 'TIME', 'GET', 'MAY', 'USE', 'WATER', 'LONG', 'LITTLE', 'VERY', 'GOOD', 'MAN', 'YEAR', 'DAY', 'GO', 'GREAT', 'NEW', 'WORK', 'PART', 'TAKE', 'GET', 'PLACE', 'MADE', 'LIVE', 'WHERE', 'AFTER', 'BACK', 'LITTLE', 'ONLY', 'ROUND', 'MAN', 'YEAR', 'CAME', 'SHOW', 'EVERY', 'GOOD', 'ME', 'GIVE', 'OUR', 'UNDER', 'NAME', 'VERY', 'THROUGH', 'JUST', 'FORM', 'SENTENCE', 'GREAT', 'THINK', 'SAY', 'HELP', 'LOW', 'LINE', 'DIFFER', 'TURN', 'CAUSE', 'MUCH', 'MEAN', 'BEFORE', 'MOVE', 'RIGHT', 'BOY', 'OLD', 'TOO', 'SAME', 'TELL', 'DOES', 'SET', 'THREE', 'WANT', 'AIR', 'WELL', 'ALSO', 'PLAY', 'SMALL', 'END', 'PUT', 'HOME', 'READ', 'HAND', 'PORT', 'LARGE', 'SPELL', 'ADD', 'EVEN', 'LAND', 'HERE', 'MUST', 'BIG', 'HIGH', 'SUCH', 'FOLLOW', 'ACT', 'WHY', 'ASK', 'MEN', 'CHANGE', 'WENT', 'LIGHT', 'KIND', 'OFF', 'NEED', 'HOUSE', 'PICTURE', 'TRY', 'US', 'AGAIN', 'ANIMAL', 'POINT', 'MOTHER', 'WORLD', 'NEAR', 'BUILD', 'SELF', 'EARTH', 'FATHER', 'HEAD', 'STAND', 'OWN', 'PAGE', 'SHOULD', 'COUNTRY', 'FOUND', 'ANSWER', 'SCHOOL', 'GROW', 'STUDY', 'STILL', 'LEARN', 'PLANT', 'COVER', 'FOOD', 'SUN', 'FOUR', 'BETWEEN', 'STATE', 'KEEP', 'EYE', 'NEVER', 'LAST', 'LET', 'THOUGHT', 'CITY', 'TREE', 'CROSS', 'FARM', 'HARD', 'START', 'MIGHT', 'STORY', 'SAW', 'FAR', 'SEA', 'DRAW', 'LEFT', 'LATE', 'RUN', 'DON\'T', 'WHILE', 'PRESS', 'CLOSE', 'NIGHT', 'REAL', 'LIFE', 'FEW', 'NORTH', 'OPEN', 'SEEM', 'TOGETHER', 'NEXT', 'WHITE', 'CHILDREN', 'EXAMPLE', 'BEGIN', 'GOT', 'WALK', 'TOOK', 'RIVER', 'MOUNTAIN', 'STOP', 'ONCE', 'BASE', 'HEAR', 'HORSE', 'CUT', 'SURE', 'WATCH', 'COLOR', 'FACE', 'WOOD', 'MAIN', 'ENOUGH', 'PLAIN', 'GIRL', 'USUAL', 'YOUNG', 'READY', 'ABOVE', 'EVER', 'RED', 'LIST', 'THOUGH', 'FEEL', 'TALK', 'BIRD', 'SOON', 'BODY', 'DOG', 'FAMILY', 'DIRECT', 'LEAVE', 'SONG', 'MEASURE', 'DOOR', 'PRODUCT', 'BLACK', 'SHORT', 'NUMERAL', 'CLASS', 'WIND', 'QUESTION', 'HAPPEN', 'COMPLETE', 'SHIP', 'AREA', 'HALF', 'ROCK', 'ORDER', 'FIRE', 'SOUTH', 'PROBLEM', 'PIECE', 'TOLD', 'KNEW', 'PASS', 'SINCE', 'TOP', 'WHOLE', 'KING', 'SPACE', 'HEARD', 'BEST', 'HOUR', 'BETTER', 'DURING', 'HUNDRED', 'FIVE', 'REMEMBER', 'STEP', 'EARLY', 'HOLD', 'WEST', 'GROUND', 'INTEREST', 'REACH', 'FAST', 'VERB', 'SING', 'LISTEN', 'SIX', 'TABLE', 'TRAVEL', 'LESS', 'MORNING', 'TEN', 'SIMPLE', 'SEVERAL', 'VOWEL', 'TOWARD', 'WAR', 'LAY', 'AGAINST', 'PATTERN', 'SLOW', 'CENTER', 'LOVE', 'PERSON', 'MONEY', 'SERVE', 'APPEAR', 'ROAD', 'MAP', 'RAIN', 'RULE', 'GOVERN', 'PULL', 'COLD', 'NOTICE', 'VOICE', 'UNIT', 'POWER', 'TOWN', 'FINE', 'CERTAIN', 'FLY', 'FALL', 'LEAD', 'CRY', 'DARK', 'MACHINE', 'NOTE', 'WAIT', 'PLAN', 'FIGURE', 'STAR', 'BOX', 'NOUN', 'FIELD', 'REST', 'CORRECT', 'ABLE', 'POUND', 'DONE', 'BEAUTY', 'DRIVE', 'STOOD', 'CONTAIN', 'FRONT', 'TEACH', 'WEEK', 'FINAL', 'GAVE', 'GREEN', 'OH', 'QUICK', 'DEVELOP', 'OCEAN', 'WARM', 'FREE', 'MINUTE', 'STRONG', 'SPECIAL', 'MIND', 'BEHIND', 'CLEAR', 'TAIL', 'PRODUCE', 'FACT', 'STREET', 'INCH', 'MULTIPLY', 'NOTHING', 'COURSE', 'STAY', 'WHEEL', 'FULL', 'FORCE', 'BLUE', 'OBJECT', 'DECIDE', 'SURFACE', 'DEEP', 'MOON', 'ISLAND', 'FOOT', 'SYSTEM', 'BUSY', 'TEST', 'RECORD', 'BOAT', 'COMMON', 'GOLD', 'POSSIBLE', 'PLANE', 'STEAD', 'DRY', 'WONDER', 'LAUGH', 'THOUSANDS', 'AGO', 'RAN', 'CHECK', 'GAME', 'SHAPE', 'EQUATE', 'MISS', 'BROUGHT', 'HEAT', 'SNOW', 'TIRE', 'BRING', 'YES', 'DISTANT', 'FILL', 'EAST', 'PAINT', 'LANGUAGE', 'AMONG']);
      
      matches.forEach(match => {
        if (!commonWords.has(match) && !symbols.includes(match)) {
          symbols.push(match);
        }
      });
    }

    this.logger.debug('Extracted symbols from input', { input, symbols });
    return symbols;
  }

  // ===== PRIVATE HELPER METHODS =====

  private normalizeInput(input: string): string {
    let normalized = input.trim().toLowerCase();
    
    // Normalize common variations
    normalized = normalized
      .replace(/\$(\d+)/g, '$1 dollars') // $100 -> 100 dollars
      .replace(/(\d+)\s*k\b/gi, '$1000') // 5k -> 5000
      .replace(/\b(shares?|stocks?|units?)\b/gi, 'shares') // normalize share terms
      .replace(/\b(dollars?|usd|bucks?)\b/gi, 'dollars') // normalize currency terms
      .replace(/\b(purchase|acquire|get|pick\s+up)\b/gi, 'buy') // normalize buy terms
      .replace(/\b(dispose|liquidate|dump|get\s+rid\s+of)\b/gi, 'sell') // normalize sell terms
      .replace(/\s+/g, ' '); // normalize whitespace
    
    return normalized.trim();
  }

  private createCacheKey(input: string): string {
    // Create a hash-like key for caching
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `parse:${hash.toString(36)}`;
  }

  private async tryRuleBasedParsing(input: string): Promise<ParseResult | null> {
    this.logger.debug('Attempting rule-based parsing', { input });

    try {
      // Define parsing patterns
      const patterns = [
        // Pattern: "buy $100 of AAPL"
        /^(buy|sell)\s+\$(\d+(?:\.\d+)?)\s+(?:of|worth\s+of)?\s+([A-Z]{1,5})$/i,
        
        // Pattern: "buy 10 shares of AAPL"
        /^(buy|sell)\s+(\d+)\s+shares?\s+(?:of\s+)?([A-Z]{1,5})$/i,
        
        // Pattern: "sell all AAPL"
        /^(sell)\s+all\s+([A-Z]{1,5})$/i,
        
        // Pattern: "buy AAPL $100"
        /^(buy|sell)\s+([A-Z]{1,5})\s+\$(\d+(?:\.\d+)?)$/i,
        
        // Pattern: "buy AAPL 10 shares"
        /^(buy|sell)\s+([A-Z]{1,5})\s+(\d+)\s+shares?$/i
      ];

      for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
          const result = this.extractFromRuleBasedMatch(match);
          if (result) {
            this.logger.debug('Rule-based parsing successful', { pattern: pattern.source });
            return result;
          }
        }
      }

      this.logger.debug('No rule-based pattern matched');
      return null;

    } catch (error) {
      this.logger.warn('Rule-based parsing failed', { error: error as Error, input });
      return null;
    }
  }

  private extractFromRuleBasedMatch(match: RegExpMatchArray): ParseResult | null {
    try {
      let action: 'buy' | 'sell';
      let symbol: string;
      let amount: number;
      let amountType: 'dollars' | 'shares';

      // Handle different pattern structures
      if (match[0].toLowerCase().includes('all')) {
        // Special case: "sell all SYMBOL"
        action = 'sell';
        symbol = match[2] || '';
        amount = -1; // Indicates "all"
        amountType = 'shares';
      } else if (match[0].startsWith('$') || match[0].includes('$')) {
        // Dollar amount patterns
        const actionStr = match[1]?.toLowerCase();
        if (actionStr !== 'buy' && actionStr !== 'sell') {
          return null;
        }
        action = actionStr;
        symbol = match[3] || match[2] || '';
        amount = parseFloat(match[2] || match[3] || '0');
        amountType = 'dollars';
      } else {
        // Share amount patterns
        const actionStr2 = match[1]?.toLowerCase();
        if (actionStr2 !== 'buy' && actionStr2 !== 'sell') {
          return null;
        }
        action = actionStr2;
        symbol = match[3] || match[2] || '';
        amount = parseFloat(match[2] || match[3] || '0');
        amountType = 'shares';
      }

      const command: TradeCommand = {
        action,
        symbol: symbol.toUpperCase(),
        amountType,
        amount,
        orderType: 'market' // Default to market orders
      };

      return {
        command,
        confidence: 0.85, // Rule-based parsing is quite confident
        method: 'rule-based',
        processingTime: 0, // Will be set by caller
        metadata: {
          pattern: 'rule-based',
          originalMatch: match[0]
        }
      };

    } catch (error) {
      this.logger.warn('Failed to extract from rule-based match', { error: error as Error, match });
      return null;
    }
  }

  private async tryLLMParsing(input: string): Promise<ParseResult> {
    this.logger.debug('Attempting LLM parsing', { input });

    try {
      const parsedIntent = await this.llmAdapter.parseNaturalLanguage(input);
      
      const result: ParseResult = {
        command: parsedIntent.intent,
        confidence: parsedIntent.confidence,
        method: 'llm',
        processingTime: 0 // Will be set by caller
      };
      
      if (parsedIntent.metadata !== undefined) {
        result.metadata = parsedIntent.metadata;
      }
      
      return result;

    } catch (error) {
      this.logger.error('LLM parsing failed', error as Error, { input });
      
      throw new DomainError(
        `LLM parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LLM_PARSING_FAILED',
        { input, originalError: error }
      );
    }
  }
}