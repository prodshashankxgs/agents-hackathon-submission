import express from 'express';
import { UnifiedTradeProcessor } from '../llm/unified-trade-processor';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { ValidationService } from '../trading/validation-service';
import { TradeIntent, UnifiedTradeIntent, OptionsTradeIntent } from '../types';
import { IntentRecognitionService } from '../services/intent-recognition-service';
import { StrategyRecommendationEngine, UserProfile } from '../services/strategy-recommendation-engine';
import { TickerSearchService } from '../services/ticker-search-service';

/**
 * Optimized API routes for core trading functionality
 * 
 * Features:
 * - Fast parsing with multiple tiers
 * - Streamlined validation
 * - Parallel processing where possible
 * - Comprehensive error handling
 * - Response caching
 */
export class OptimizedTradeRoutes {
  private tradeProcessor: UnifiedTradeProcessor;
  private broker: AlpacaAdapter;
  private validator: ValidationService;
  private intentRecognition: IntentRecognitionService;
  private recommendationEngine: StrategyRecommendationEngine;
  private tickerSearch: TickerSearchService;
  private router: express.Router;

  constructor() {
    this.tradeProcessor = new UnifiedTradeProcessor();
    this.broker = new AlpacaAdapter();
    this.validator = new ValidationService(this.broker);
    this.intentRecognition = new IntentRecognitionService();
    this.recommendationEngine = new StrategyRecommendationEngine();
    this.tickerSearch = new TickerSearchService();
    this.router = express.Router();
    this.setupRoutes();
  }

  // Type guard functions
  private isOptionsIntent(intent: UnifiedTradeIntent): intent is OptionsTradeIntent {
    return 'underlying' in intent && 'contractType' in intent;
  }

  private isStockIntent(intent: UnifiedTradeIntent): intent is TradeIntent {
    return 'symbol' in intent && 'amountType' in intent;
  }

  /**
   * Setup all trading routes
   */
  private setupRoutes(): void {
    // Fast trade parsing endpoint
    this.router.post('/parse', this.handleParseTrade.bind(this));
    
    // Trade validation endpoint
    this.router.post('/validate', this.handleValidateTrade.bind(this));
    
    // Trade execution endpoint
    this.router.post('/execute', this.handleExecuteTrade.bind(this));
    
    // Combined parse + validate + execute endpoint
    this.router.post('/trade', this.handleFullTrade.bind(this));
    
    // Account information endpoint
    this.router.get('/account', this.handleAccountInfo.bind(this));
    
    // Portfolio/positions endpoint
    this.router.get('/portfolio', this.handlePortfolio.bind(this));
    
    // Market data endpoint
    this.router.get('/market/:symbol', this.handleMarketData.bind(this));
    
    // Health check endpoint
    this.router.get('/health', this.handleHealthCheck.bind(this));
    
    // Trading patterns endpoint (for autocomplete)
    this.router.get('/patterns', this.handleTradingPatterns.bind(this));
    
    // Options endpoints
    this.router.get('/options/chain/:symbol', this.handleOptionsChain.bind(this));
    this.router.get('/options/quote/:optionSymbol', this.handleOptionsQuote.bind(this));
    this.router.get('/options/positions', this.handleOptionsPositions.bind(this));
    
    // Strategy recommendation endpoints
    this.router.post('/strategies/recommend', this.handleStrategyRecommendation.bind(this));
    this.router.post('/strategies/analyze', this.handleIntentAnalysis.bind(this));
    
    // Ticker search endpoints
    this.router.get('/tickers/search', this.handleTickerSearch.bind(this));
    this.router.get('/tickers/info/:symbol', this.handleTickerInfo.bind(this));
    this.router.get('/tickers/popular', this.handlePopularTickers.bind(this));
    this.router.get('/tickers/history/:symbol', this.handleTickerHistory.bind(this));
  }

  /**
   * Parse trade command using optimized multi-tier parsing
   */
  private async handleParseTrade(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { command } = req.body;

      if (!command?.trim()) {
        res.status(400).json({
          success: false,
          error: 'Command is required',
          code: 'MISSING_COMMAND'
        });
        return;
      }

      const startTime = Date.now();
      
      // Use a unified trade processor
      const parseResult = await this.tradeProcessor.processTradeCommand(command);
      const totalTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          intent: parseResult.intent,
          confidence: parseResult.confidence,
          processingTime: parseResult.processingTime,
          totalTime,
          cached: parseResult.cached,
          summary: this.tradeProcessor.generateTradeSummary(parseResult.intent)
        }
      });

    } catch (error) {
      this.handleError(res, error, 'PARSE_ERROR');
    }
  }

  /**
   * Validate a trade intent
   */
  private async handleValidateTrade(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { intent } = req.body;

      if (!intent) {
        res.status(400).json({
          success: false,
          error: 'Trade intent is required',
          code: 'MISSING_INTENT'
        });
        return;
      }

      const startTime = Date.now();
      const validation = await this.validator.validateTrade(intent);
      const validationTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          validation,
          validationTime,
          canExecute: validation.isValid
        }
      });

    } catch (error) {
      this.handleError(res, error, 'VALIDATION_ERROR');
    }
  }

  /**
   * Execute a validated trade
   */
  private async handleExecuteTrade(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { intent, skipValidation = false } = req.body;

      if (!intent) {
        res.status(400).json({
          success: false,
          error: 'Trade intent is required',
          code: 'MISSING_INTENT'
        });
        return;
      }

      const startTime = Date.now();
      
      // Validate unless explicitly skipped
      if (!skipValidation) {
        const validation = await this.validator.validateTrade(intent);
        if (!validation.isValid) {
          res.status(400).json({
            success: false,
            error: 'Trade validation failed',
            code: 'VALIDATION_FAILED',
            details: {
              errors: validation.errors,
              warnings: validation.warnings
            }
          });
          return;
        }
      }

      // Execute the trade
      const result = await this.broker.executeOrder(intent);
      const executionTime = Date.now() - startTime;

      res.json({
        success: result.success,
        data: {
          result,
          executionTime
        },
        error: result.success ? undefined : result.error
      });

    } catch (error) {
      this.handleError(res, error, 'EXECUTION_ERROR');
    }
  }

  /**
   * Full trade pipeline: parse + validate + execute
   */
  private async handleFullTrade(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { command, dryRun = false, skipValidation = false } = req.body;

      if (!command?.trim()) {
        res.status(400).json({
          success: false,
          error: 'Trade command is required',
          code: 'MISSING_COMMAND'
        });
        return;
      }

      const pipeline = {
        startTime: Date.now(),
        parse: { startTime: 0, endTime: 0, duration: 0 },
        validate: { startTime: 0, endTime: 0, duration: 0 },
        execute: { startTime: 0, endTime: 0, duration: 0 }
      };

      // Step 1: Parse
      pipeline.parse.startTime = Date.now();
      const parseResult = await this.tradeProcessor.processTradeCommand(command);
      pipeline.parse.endTime = Date.now();
      pipeline.parse.duration = pipeline.parse.endTime - pipeline.parse.startTime;

      // No early validation failure - let validation step handle it

      // Step 2: Validate (unless skipped)
      let validation: any = null;
      if (!skipValidation) {
        pipeline.validate.startTime = Date.now();
        if (this.isStockIntent(parseResult.intent)) {
          validation = await this.validator.validateTrade(parseResult.intent);
        } else {
          // For now, skip validation for options until we update the validator
          validation = { 
            isValid: true, 
            estimatedCost: parseResult.intent.quantity * 100, 
            marginRequired: 0, 
            potentialReturn: 0,
            errors: [],
            warnings: []
          };
        }
        pipeline.validate.endTime = Date.now();
        pipeline.validate.duration = pipeline.validate.endTime - pipeline.validate.startTime;

        if (!validation.isValid) {
          res.status(400).json({
            success: false,
            error: 'Trade validation failed',
            code: 'VALIDATION_FAILED',
            data: {
              intent: parseResult.intent,
              validation,
              pipeline: {
                parse: pipeline.parse,
                validate: pipeline.validate,
                totalTime: Date.now() - pipeline.startTime
              }
            }
          });
          return;
        }
      }

      // Step 3: Execute (or simulate if dry run)
      pipeline.execute.startTime = Date.now();
      let result: any;
      
      if (dryRun) {
        result = {
          success: true,
          message: 'DRY RUN - Trade would execute successfully',
          orderId: 'DRY_RUN_' + Date.now(),
          timestamp: new Date(),
          isDryRun: true,
          estimatedCost: validation?.estimatedCost || 0,
          estimatedShares: validation?.estimatedShares || 0
        };
      } else {
        if (this.isStockIntent(parseResult.intent)) {
          result = await this.broker.executeOrder(parseResult.intent);
        } else if (this.isOptionsIntent(parseResult.intent)) {
          result = await this.broker.executeOptionsOrder(parseResult.intent);
        } else {
          result = {
            success: false,
            error: 'Unknown trade intent type',
            orderId: null
          };
        }
      }
      
      pipeline.execute.endTime = Date.now();
      pipeline.execute.duration = pipeline.execute.endTime - pipeline.execute.startTime;

      const totalTime = Date.now() - pipeline.startTime;

      res.json({
        success: result.success,
        data: {
          intent: parseResult.intent,
          validation: skipValidation ? null : validation,
          result,
          pipeline: {
            parse: pipeline.parse,
            validate: skipValidation ? null : pipeline.validate,
            execute: pipeline.execute,
            totalTime
          },
          confidence: parseResult.confidence,
          cached: parseResult.cached,
          summary: this.tradeProcessor.generateTradeSummary(parseResult.intent)
        },
        error: result.success ? undefined : result.error
      });

    } catch (error) {
      this.handleError(res, error, 'FULL_TRADE_ERROR');
    }
  }

  /**
   * Get account information
   */
  private async handleAccountInfo(req: express.Request, res: express.Response): Promise<void> {
    try {
      const accountInfo = await this.broker.getAccountInfo();
      
      res.json({
        success: true,
        data: accountInfo
      });

    } catch (error) {
      this.handleError(res, error, 'ACCOUNT_ERROR');
    }
  }

  /**
   * Get portfolio positions
   */
  private async handlePortfolio(req: express.Request, res: express.Response): Promise<void> {
    try {
      const accountInfo = await this.broker.getAccountInfo();
      
      res.json({
        success: true,
        data: {
          positions: accountInfo.positions,
          portfolioValue: accountInfo.portfolioValue,
          totalPositions: accountInfo.positions.length,
          hasPositions: accountInfo.positions.length > 0
        }
      });

    } catch (error) {
      this.handleError(res, error, 'PORTFOLIO_ERROR');
    }
  }

  /**
   * Get market data for a symbol
   */
  private async handleMarketData(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { symbol } = req.params;
      
      if (!symbol || !/^[A-Z]{1,5}$/.test(symbol.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: 'Valid stock symbol is required',
          code: 'INVALID_SYMBOL'
        });
        return;
      }

      const marketData = await this.broker.getMarketData(symbol.toUpperCase());
      
      res.json({
        success: true,
        data: marketData
      });

    } catch (error) {
      this.handleError(res, error, 'MARKET_DATA_ERROR');
    }
  }

  /**
   * Health check endpoint
   */
  private async handleHealthCheck(req: express.Request, res: express.Response): Promise<void> {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          broker: 'unknown',
          parser: 'healthy',
          validator: 'healthy'
        }
      };

      // Test broker connection
      try {
        await this.broker.isMarketOpen();
        health.services.broker = 'healthy';
      } catch (error) {
        health.services.broker = 'unhealthy';
        health.status = 'degraded';
      }

      res.json({
        success: true,
        data: health
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        code: 'HEALTH_CHECK_FAILED'
      });
    }
  }

  /**
   * Get common trading patterns for autocomplete
   */
  private handleTradingPatterns(req: express.Request, res: express.Response): void {
    const patterns = [
      'buy 100 shares of AAPL',
      'buy $1000 of TSLA', 
      'sell 50 shares of MSFT',
      'buy $500 worth of Amazon',
      'sell all GOOGL',
      'purchase 25 shares of NVDA'
    ];
    const stats = this.tradeProcessor.getStats();

    res.json({
      success: true,
      data: {
        patterns,
        stats,
        totalPatterns: patterns.length
      }
    });
  }

  /**
   * Get options chain for a symbol
   */
  private async handleOptionsChain(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { symbol } = req.params;
      const { expiration } = req.query;
      
      if (!symbol || !/^[A-Z]{1,5}$/.test(symbol.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: 'Valid stock symbol is required',
          code: 'INVALID_SYMBOL'
        });
        return;
      }

      const optionsChain = await this.broker.getOptionsChain(
        symbol.toUpperCase(), 
        expiration as string | undefined
      );
      
      res.json({
        success: true,
        data: optionsChain
      });

    } catch (error) {
      this.handleError(res, error, 'OPTIONS_CHAIN_ERROR');
    }
  }

  /**
   * Get quote for a specific option contract
   */
  private async handleOptionsQuote(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { optionSymbol } = req.params;
      
      if (!optionSymbol) {
        res.status(400).json({
          success: false,
          error: 'Option symbol is required',
          code: 'MISSING_OPTION_SYMBOL'
        });
        return;
      }

      const optionQuote = await this.broker.getOptionsQuote(optionSymbol);
      
      res.json({
        success: true,
        data: optionQuote
      });

    } catch (error) {
      this.handleError(res, error, 'OPTIONS_QUOTE_ERROR');
    }
  }

  /**
   * Get current options positions
   */
  private async handleOptionsPositions(req: express.Request, res: express.Response): Promise<void> {
    try {
      const optionsPositions = await this.broker.getOptionsPositions();
      
      res.json({
        success: true,
        data: {
          positions: optionsPositions,
          totalPositions: optionsPositions.length,
          hasOptions: optionsPositions.length > 0
        }
      });

    } catch (error) {
      this.handleError(res, error, 'OPTIONS_POSITIONS_ERROR');
    }
  }

  /**
   * Get strategy recommendations based on natural language command and user profile
   */
  private async handleStrategyRecommendation(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { command, userProfile } = req.body;
      
      if (!command || !command.trim()) {
        res.status(400).json({
          success: false,
          error: 'Command is required',
          code: 'MISSING_COMMAND'
        });
        return;
      }

      // Default user profile if not provided
      const profile: UserProfile = {
        experienceLevel: 'intermediate',
        riskTolerance: 'medium',
        preferredComplexity: 'moderate',
        capitalAvailable: 10000,
        tradingObjective: 'growth',
        timeHorizon: 'medium_term',
        ...userProfile
      };

      const startTime = Date.now();
      const recommendations = await this.recommendationEngine.recommendStrategy(command, profile);
      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          recommendations,
          processingTime,
          userProfile: profile,
          totalRecommendations: recommendations.length
        }
      });

    } catch (error) {
      this.handleError(res, error, 'STRATEGY_RECOMMENDATION_ERROR');
    }
  }

  /**
   * Analyze intent from natural language command
   */
  private async handleIntentAnalysis(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { command } = req.body;
      
      if (!command || !command.trim()) {
        res.status(400).json({
          success: false,
          error: 'Command is required',
          code: 'MISSING_COMMAND'
        });
        return;
      }

      const startTime = Date.now();
      const recognizedIntent = await this.intentRecognition.parseCommand(command);
      const processingTime = Date.now() - startTime;

      // Generate summary
      const summary = this.intentRecognition.getStrategyRecommendationSummary(recognizedIntent);

      res.json({
        success: true,
        data: {
          intent: recognizedIntent,
          summary,
          processingTime,
          suggestedStrategies: recognizedIntent.suggestedStrategies.length
        }
      });

    } catch (error) {
      this.handleError(res, error, 'INTENT_ANALYSIS_ERROR');
    }
  }

  /**
   * Search for tickers with fuzzy matching
   */
  private async handleTickerSearch(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { q: query, limit = 10, includeMarketData = false } = req.query;
      
      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Search query parameter "q" is required',
          code: 'MISSING_QUERY'
        });
        return;
      }

      const startTime = Date.now();
      
      let results;
      if (includeMarketData === 'true') {
        results = await this.tickerSearch.getTickerSuggestionsWithMarketData(
          query as string, 
          parseInt(limit as string) || 10
        );
      } else {
        results = await this.tickerSearch.searchTickers(
          query as string, 
          parseInt(limit as string) || 10
        );
      }

      const searchTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          query,
          results,
          totalResults: results.length,
          searchTime,
          includeMarketData: includeMarketData === 'true'
        }
      });

    } catch (error) {
      this.handleError(res, error, 'TICKER_SEARCH_ERROR');
    }
  }

  /**
   * Get detailed information about a specific ticker
   */
  private async handleTickerInfo(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { symbol } = req.params;
      
      if (!symbol || !/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: 'Valid stock symbol is required',
          code: 'INVALID_SYMBOL'
        });
        return;
      }

      const startTime = Date.now();
      
      // Get ticker info and market data in parallel
      const [tickerInfo, marketData] = await Promise.all([
        this.tickerSearch.getTickerInfo(symbol.toUpperCase()),
        this.broker.getMarketData(symbol.toUpperCase()).catch(() => null)
      ]);

      const processingTime = Date.now() - startTime;

      if (!tickerInfo) {
        res.status(404).json({
          success: false,
          error: `Ticker ${symbol.toUpperCase()} not found`,
          code: 'TICKER_NOT_FOUND'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          ticker: tickerInfo,
          marketData,
          processingTime
        }
      });

    } catch (error) {
      this.handleError(res, error, 'TICKER_INFO_ERROR');
    }
  }

  /**
   * Get popular tickers
   */
  private async handlePopularTickers(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { limit = 20 } = req.query;
      
      const startTime = Date.now();
      const results = await this.tickerSearch.getPopularTickers(parseInt(limit as string) || 20);
      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          results,
          totalResults: results.length,
          processingTime
        }
      });

    } catch (error) {
      this.handleError(res, error, 'POPULAR_TICKERS_ERROR');
    }
  }

  /**
   * Get historical price data for a ticker
   */
  private async handleTickerHistory(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { symbol } = req.params;
      const { period = '1M', timeframe = '1D' } = req.query;
      
      if (!symbol || !/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol.toUpperCase())) {
        res.status(400).json({
          success: false,
          error: 'Valid stock symbol is required',
          code: 'INVALID_SYMBOL'
        });
        return;
      }

      const startTime = Date.now();
      
      // Get historical bars data using Alpaca
      const endDate = new Date();
      let startDate = new Date();
      
      // Calculate start date based on period
      switch (period) {
        case '1D':
          startDate.setDate(endDate.getDate() - 1);
          break;
        case '1W':
          startDate.setDate(endDate.getDate() - 7);
          break;
        case '1M':
          startDate.setMonth(endDate.getMonth() - 1);
          break;
        case '3M':
          startDate.setMonth(endDate.getMonth() - 3);
          break;
        case '6M':
          startDate.setMonth(endDate.getMonth() - 6);
          break;
        case '1Y':
          startDate.setFullYear(endDate.getFullYear() - 1);
          break;
        case '5Y':
          startDate.setFullYear(endDate.getFullYear() - 5);
          break;
        default:
          startDate.setMonth(endDate.getMonth() - 1);
      }

      const bars = await (this.broker as any).alpaca.getBarsV2(symbol.toUpperCase(), {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        timeframe: timeframe as string,
        limit: 1000,
        adjustment: 'raw',
        page_token: undefined,
        sort: 'asc'
      });

      const historicalData = [];
      for await (const bar of bars) {
        historicalData.push({
          timestamp: bar.Timestamp || bar.t,
          open: bar.OpenPrice || bar.o,
          high: bar.HighPrice || bar.h,
          low: bar.LowPrice || bar.l,
          close: bar.ClosePrice || bar.c,
          volume: bar.Volume || bar.v
        });
      }

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          symbol: symbol.toUpperCase(),
          period,
          timeframe,
          data: historicalData,
          totalBars: historicalData.length,
          processingTime
        }
      });

    } catch (error) {
      this.handleError(res, error, 'TICKER_HISTORY_ERROR');
    }
  }

  /**
   * Centralized error handling
   */
  private handleError(res: express.Response, error: unknown, code: string): void {
    console.error(`API Error [${code}]:`, error);

    if (error instanceof Error) {
      res.status(500).json({
        success: false,
        error: error.message,
        code,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'An unknown error occurred',
        code,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get the Express router
   */
  getRouter(): express.Router {
    return this.router;
  }

  /**
   * Add custom middleware to the router
   */
  addMiddleware(middleware: express.RequestHandler): void {
    this.router.use(middleware);
  }
}