import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config';
import { OpenAIService } from './llm/openai-service';
import { ClaudeService } from './llm/claude-service';
import { AdvancedTradingService } from './llm/trading';
import { AlpacaAdapter } from './brokers/alpaca-adapter';
import { ValidationService } from './trading/validation-service';
import { BasketStorageService } from './storage/basket-storage';
import { TickerSearchService } from './services/ticker-search-service';
import { ThirteenFService } from './services/thirteenf-service';
import { AdvancedResearchService } from './services/advanced-research-service';
import { PerplexityService } from './services/perplexity-service';
import { ConsoleLogger } from './infrastructure/logging/ConsoleLogger';
import { TradeIntent, CLIOptions, TradingError } from './types';
// import { brokerLimiter } from './utils/concurrency-limiter';
import { performanceMiddleware, performanceMonitor } from './utils/performance-monitor';
import { optimizedParsingService } from './parsing/parsing-service';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(performanceMiddleware);

// Initialize LLM services
const openaiService = new OpenAIService();
const claudeService = new ClaudeService();
const advancedTrading = new AdvancedTradingService();
const broker = new AlpacaAdapter();
const validator = new ValidationService(broker);
const basketStorage = new BasketStorageService();
const tickerSearch = new TickerSearchService();
const logger = new ConsoleLogger();
const thirteenFService = new ThirteenFService(logger, broker);
const advancedResearchService = new AdvancedResearchService(openaiService, broker);
const perplexityService = new PerplexityService();

// Development mode warnings
if (config.nodeEnv === 'development') {
  console.log('\n🔧 Running in DEVELOPMENT mode');
  
    if (!config.openaiApiKey) {
    console.warn('⚠️  No OpenAI API key configured - OpenAI features will not work');
  }
  
  if (!config.anthropicApiKey) {
    console.warn('⚠️  No Anthropic API key configured - Claude features will not work');
  }

  if (!config.alpacaApiKey) {
    console.warn('⚠️  No Alpaca API key configured - Trading features will not work');
  }
  
  console.log('\n💡 To enable full functionality, add your API keys to the .env file\n');
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    mode: config.alpacaBaseUrl.includes('paper') ? 'paper' : 'live',
    timestamp: new Date().toISOString()
  });
});

// Parse natural language trade intent
app.post('/api/trade/parse', async (req: Request, res: Response) => {
  try {
    const { input } = req.body;
    
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Invalid input provided' });
    }

    const intent = await openaiService.parseTradeIntent(input);
    const summary = openaiService.generateTradeSummary(intent);
    
    return res.json({ intent, summary });
  } catch (error) {
    console.error('Parse error:', error);
    
    if (error instanceof TradingError) {
      return res.status(400).json({ error: error.message, code: error.code });
    } else {
      return res.status(500).json({ error: 'Failed to parse trade intent' });
    }
  }
});

// Validate trade
app.post('/api/trade/validate', async (req: Request, res: Response) => {
  try {
    const { intent } = req.body;
    
    if (!intent) {
      return res.status(400).json({ error: 'Trade intent required' });
    }

    const validation = await validator.validateTrade(intent);
    const formattedResults = validator.formatValidationResults(validation);
    
    return res.json({ validation, formattedResults });
  } catch (error) {
    console.error('Validation error:', error);
    
    if (error instanceof TradingError) {
      return res.status(400).json({ error: error.message, code: error.code });
    } else {
      return res.status(500).json({ error: 'Failed to validate trade' });
    }
  }
});

// Execute trade
app.post('/api/trade/execute', async (req: Request, res: Response) => {
  try {
    const { intent } = req.body;
    
    if (!intent) {
      return res.status(400).json({ error: 'Trade intent required' });
    }

    // Validate before executing
    const validation = await validator.validateTrade(intent);
    
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Trade validation failed', 
        validation 
      });
    }

    const result = await broker.executeOrder(intent);
    
    return res.json({ result });
  } catch (error) {
    console.error('Execution error:', error);
    
    if (error instanceof TradingError) {
      return res.status(400).json({ error: error.message, code: error.code });
    } else {
      return res.status(500).json({ error: 'Failed to execute trade' });
    }
  }
});

// Get account information
app.get('/api/account', async (req: Request, res: Response) => {
  try {
    const accountInfo = await broker.getAccountInfo();
    return res.json(accountInfo);
  } catch (error) {
    console.error('Account error:', error);
    
    if (error instanceof TradingError) {
      return res.status(400).json({ error: error.message, code: error.code });
    } else {
      return res.status(500).json({ error: 'Failed to get account info' });
    }
  }
});

// Get market data for a symbol
app.get('/api/market/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol required' });
    }

    const marketData = await broker.getMarketData(symbol.toUpperCase());
    return res.json(marketData);
  } catch (error) {
    console.error('Market data error:', error);
    
    if (error instanceof TradingError) {
      return res.status(400).json({ error: error.message, code: error.code });
    } else {
      return res.status(500).json({ error: 'Failed to get market data' });
    }
  }
});

// Check if market is open
app.get('/api/market/status', async (req: Request, res: Response) => {
  try {
    const isOpen = await broker.isMarketOpen();
    return res.json({
      isOpen,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('Market status error:', error)
    return res.status(500).json({ 
      error: 'Failed to get market status',
      details: error.message 
    })
  }
})

// Get portfolio history
app.get('/api/portfolio/history', async (req: Request, res: Response) => {
  try {
    const { period = '1M', timeframe = '1D' } = req.query;
    
    console.log(`Portfolio history request: period=${period}, timeframe=${timeframe}`);
    
    const history = await broker.getPortfolioHistory(
      period as string, 
      timeframe as string
    );
    
    // Validate the response before sending
    if (!history || typeof history !== 'object') {
      console.warn('Invalid portfolio history response:', history);
      return res.status(500).json({ 
        error: 'Invalid portfolio history data received',
        details: 'The broker returned invalid data'
      });
    }
    
    // Ensure required fields exist
    if (!history.timestamp || !Array.isArray(history.timestamp)) {
      console.warn('Missing or invalid timestamp data');
      return res.status(500).json({ 
        error: 'Invalid portfolio history format',
        details: 'Missing timestamp data'
      });
    }
    
    return res.json(history);
  } catch (error: any) {
    console.error('Portfolio history error:', error);
    
    // Try to provide a more helpful error message
    let errorMessage = 'Failed to get portfolio history';
    let statusCode = 500;
    
    if (error.message && error.message.includes('unauthorized')) {
      errorMessage = 'API credentials are invalid or expired';
      statusCode = 401;
    } else if (error.message && error.message.includes('rate limit')) {
      errorMessage = 'API rate limit exceeded, please try again later';
      statusCode = 429;
    } else if (error.message && error.message.includes('new account')) {
      errorMessage = 'Portfolio history not available for new accounts';
      statusCode = 404;
    }
    
    return res.status(statusCode).json({ 
      error: errorMessage,
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Advanced trading endpoints
app.post('/api/advanced/parse', async (req: Request, res: Response) => {
  try {
    const { input } = req.body;
    
    if (!input || typeof input !== 'string') {
      return res.status(400).json({ error: 'Invalid input provided' });
    }

    // Get account info for context (no timeout - let it complete)
    let accountInfo;
    try {
      accountInfo = await broker.getAccountInfo();
    } catch (error: any) {
      console.log('Could not fetch account info for context:', error?.message || 'Unknown error');
    }

    // Parse the intent (no timeout - let it complete)
    const intent = await advancedTrading.parseAdvancedIntent(input, accountInfo);
    
    return res.json({ intent, type: intent.type });
  } catch (error: any) {
    console.error('Advanced parse error:', error);
    
    if (error instanceof TradingError) {
      return res.status(400).json({ error: error.message, code: error.code });
    } else {
      return res.status(500).json({ error: 'Failed to parse advanced intent' });
    }
  }
});

app.post('/api/advanced/hedge', async (req: Request, res: Response) => {
  try {
    const { intent } = req.body;
    
    if (!intent || intent.type !== 'hedge') {
      return res.status(400).json({ error: 'Invalid hedge intent' });
    }

    // Get market data
    const marketData: any = {};
    try {
      marketData[intent.primaryPosition.symbol] = await broker.getMarketData(intent.primaryPosition.symbol);
    } catch (error) {
      console.log('Market data unavailable');
    }

    const recommendation = await advancedTrading.generateHedgeRecommendation(intent, marketData);
    
    return res.json({ recommendation });
  } catch (error) {
    console.error('Hedge recommendation error:', error);
    return res.status(500).json({ error: 'Failed to generate hedge recommendation' });
  }
});

app.post('/api/advanced/analyze', async (req: Request, res: Response) => {
  try {
    const { intent } = req.body;
    
    if (!intent || intent.type !== 'analysis') {
      return res.status(400).json({ error: 'Invalid analysis intent' });
    }

    // Get market data for requested symbols in parallel
    const marketData: any = {};
    const marketDataPromises = intent.symbols.map(async (symbol: string) => {
      try {
        const data = await broker.getMarketData(symbol);
        return { symbol, data };
      } catch (error) {
        console.log(`Could not fetch data for ${symbol}`);
        return { symbol, data: null };
      }
    });
    
    const marketDataResults = await Promise.all(marketDataPromises);
    marketDataResults.forEach(({ symbol, data }: { symbol: string; data: any }) => {
      if (data) {
        marketData[symbol] = data;
      }
    });

    const analyses = await advancedTrading.performMarketAnalysis(intent, marketData);
    
    return res.json({ analyses });
  } catch (error) {
    console.error('Market analysis error:', error);
    return res.status(500).json({ error: 'Failed to perform market analysis' });
  }
});

app.post('/api/advanced/recommend', async (req: Request, res: Response) => {
  try {
    const { intent } = req.body;
    
    if (!intent || intent.type !== 'recommendation') {
      return res.status(400).json({ error: 'Invalid recommendation intent' });
    }

    const accountInfo = await broker.getAccountInfo();
    const recommendations = await advancedTrading.generateTradeRecommendations(intent, accountInfo);
    
    return res.json({ recommendations });
  } catch (error) {
    console.error('Trade recommendation error:', error);
    return res.status(500).json({ error: 'Failed to generate trade recommendations' });
  }
});




// Basket management endpoints
app.get('/api/baskets', async (req: Request, res: Response) => {
  try {
    const baskets = await basketStorage.getBaskets();
    return res.json({ baskets });
  } catch (error) {
    console.error('Get baskets error:', error);
    return res.status(500).json({ error: 'Failed to get baskets' });
  }
});

app.get('/api/baskets/:basketId', async (req: Request, res: Response) => {
  try {
    const { basketId } = req.params;
    const basket = await basketStorage.getBasket(basketId);
    
    if (!basket) {
      return res.status(404).json({ error: 'Basket not found' });
    }
    
    return res.json({ basket });
  } catch (error) {
    console.error('Get basket error:', error);
    return res.status(500).json({ error: 'Failed to get basket' });
  }
});

app.delete('/api/baskets/:basketId', async (req: Request, res: Response) => {
  try {
    const { basketId } = req.params;
    await basketStorage.deleteBasket(basketId);
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete basket error:', error);
    return res.status(500).json({ error: 'Failed to delete basket' });
  }
});

// 13F filing endpoints
app.post('/api/13f/create-basket', async (req: Request, res: Response) => {
  try {
    const { institution, investmentAmount, options = {} } = req.body;
    
    if (!institution || !investmentAmount) {
      return res.status(400).json({ 
        error: 'Institution name and investment amount are required' 
      });
    }
    
    if (investmentAmount < 100) {
      return res.status(400).json({ 
        error: 'Minimum investment amount is $100' 
      });
    }
    
    const basket = await thirteenFService.process13FRequest(institution, investmentAmount, {
      maxPositions: options.maxPositions || 25,
      minWeight: options.minWeight || 0.5,
      rebalanceThreshold: options.rebalanceThreshold || 5.0
    });
    
    return res.json({ 
      success: true, 
      basket,
      message: `Successfully created 13F basket for ${institution}` 
    });
  } catch (error) {
    console.error('13F basket creation error:', error);
    
    let errorMessage = 'Failed to create 13F basket';
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        errorMessage = 'Perplexity API key is required for 13F functionality';
      } else if (error.message.includes('13F data')) {
        errorMessage = `Could not find 13F data for "${req.body.institution}"`;
      } else {
        errorMessage = error.message;
      }
    }
    
    return res.status(500).json({ error: errorMessage });
  }
});

app.post('/api/13f/execute-basket/:basketId', async (req: Request, res: Response) => {
  try {
    const { basketId } = req.params;
    
    await thirteenFService.executeBasket(basketId);
    
    return res.json({ 
      success: true, 
      message: 'Basket execution completed' 
    });
  } catch (error) {
    console.error('13F basket execution error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to execute basket' 
    });
  }
});

app.get('/api/13f/baskets', async (req: Request, res: Response) => {
  try {
    const baskets = await thirteenFService.get13FBaskets();
    return res.json({ baskets });
  } catch (error) {
    console.error('Get 13F baskets error:', error);
    return res.status(500).json({ error: 'Failed to get 13F baskets' });
  }
});

// LLM provider endpoints
app.get('/api/llm/provider', async (req: Request, res: Response) => {
  try {
    // For now, return the default provider based on what's configured
    let provider = 'openai';
    if (config.anthropicApiKey && !config.openaiApiKey) {
      provider = 'claude';
    }
    
    return res.json({
      success: true,
      provider,
      message: `Current LLM provider: ${provider}`
    });
  } catch (error) {
    console.error('Get LLM provider error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get LLM provider'
    });
  }
});

app.post('/api/llm/provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;
    
    if (!provider || !['openai', 'claude'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Valid provider (openai or claude) is required'
      });
    }
    
    // Validate the provider has a configured API key
    if (provider === 'openai' && !config.openaiApiKey) {
      return res.status(400).json({
        success: false,
        error: 'OpenAI API key is not configured'
      });
    }
    
    if (provider === 'claude' && !config.anthropicApiKey) {
      return res.status(400).json({
        success: false,
        error: 'Anthropic API key is not configured'
      });
    }
    
    // Update the parsing service provider
    optimizedParsingService.setLLMProvider(provider);
    
    return res.json({
      success: true,
      provider,
      message: `LLM provider set to: ${provider}`
    });
  } catch (error) {
    console.error('Set LLM provider error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to set LLM provider'
    });
  }
});


// Ticker search endpoints
app.get('/api/ticker/search', async (req: Request, res: Response) => {
  try {
    const { q: query, limit = 10, includeMarketData = false } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Search query parameter "q" is required',
        code: 'MISSING_QUERY'
      });
    }

    const startTime = Date.now();
    
    let results;
    if (includeMarketData === 'true') {
      results = await tickerSearch.getTickerSuggestionsWithMarketData(
        query as string, 
        parseInt(limit as string) || 10
      );
    } else {
      results = await tickerSearch.searchTickers(
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
    console.error('Ticker search error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during ticker search',
      code: 'TICKER_SEARCH_ERROR'
    });
  }
});

app.get('/api/ticker/:symbol', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    
    if (!symbol || !/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Valid stock symbol is required',
        code: 'INVALID_SYMBOL'
      });
    }

    const startTime = Date.now();
    
    // Get ticker info and market data in parallel
    const [tickerInfo, marketData] = await Promise.all([
      tickerSearch.getTickerInfo(symbol.toUpperCase()),
      broker.getMarketData(symbol.toUpperCase()).catch(() => null)
    ]);

    const processingTime = Date.now() - startTime;

    if (!tickerInfo) {
      return res.status(404).json({
        success: false,
        error: 'Stock symbol not found',
        code: 'SYMBOL_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        symbol: symbol.toUpperCase(),
        info: tickerInfo,
        marketData,
        processingTime
      }
    });

  } catch (error) {
    console.error('Ticker info error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error while getting ticker info',
      code: 'TICKER_INFO_ERROR'
    });
  }
});

// Historical stock price data endpoint
app.get('/api/ticker/:symbol/history', async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { period = '1M', timeframe = '1D' } = req.query;
    
    if (!symbol || !/^[A-Z]{1,5}(\.[A-Z])?$/.test(symbol.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Valid stock symbol is required',
        code: 'INVALID_SYMBOL'
      });
    }

    console.log(`Fetching historical data for ${symbol}: period=${period}, timeframe=${timeframe}`);

    // Calculate date range based on period
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '1D':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '5D':
        startDate.setDate(endDate.getDate() - 5);
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
      case 'YTD':
        startDate = new Date(endDate.getFullYear(), 0, 1);
        break;
      case '1Y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      case '5Y':
        startDate.setFullYear(endDate.getFullYear() - 5);
        break;
      case 'MAX':
        startDate.setFullYear(endDate.getFullYear() - 10); // 10 years max
        break;
      default:
        startDate.setMonth(endDate.getMonth() - 1);
    }

    // Get historical data from broker
    const historicalData = await broker.getHistoricalData(
      symbol.toUpperCase(),
      startDate.toISOString(),
      endDate.toISOString(),
      timeframe as string
    );

    if (!historicalData || historicalData.length === 0) {
      return res.json({
        success: true,
        data: [],
        symbol: symbol.toUpperCase(),
        period,
        timeframe,
        message: 'No historical data available for this time period'
      });
    }

    return res.json({
      success: true,
      data: historicalData,
      symbol: symbol.toUpperCase(),
      period,
      timeframe,
      dataPoints: historicalData.length
    });

  } catch (error) {
    console.error('Historical data error:', error);
    
    let errorMessage = 'Failed to fetch historical data';
    let statusCode = 500;
    let errorCode = 'HISTORICAL_DATA_ERROR';
    
    if (error instanceof Error) {
      if (error.message.includes('No historical price data available')) {
        errorMessage = 'No historical data available for this symbol. This may be due to paper trading limitations or the symbol may not be available.';
        statusCode = 404;
        errorCode = 'NO_DATA_AVAILABLE';
      } else if (error.message.includes('market closure')) {
        errorMessage = 'Historical data unavailable due to market closure. Please try again during market hours.';
        statusCode = 503;
        errorCode = 'MARKET_CLOSED';
      } else if (error.message.includes('Invalid symbol') || error.message.includes('not found')) {
        errorMessage = `Symbol ${req.params.symbol.toUpperCase()} not found or invalid`;
        statusCode = 404;
        errorCode = 'INVALID_SYMBOL';
      } else {
        errorMessage = error.message;
      }
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      code: errorCode,
      symbol: req.params.symbol.toUpperCase(),
      period: req.query.period,
      timeframe: req.query.timeframe
    });
  }
});

// Simplified command endpoints
app.post('/api/command/parse', async (req: Request, res: Response) => {
  try {
    const { command } = req.body
    
    if (!command?.trim()) {
      console.log('❌ Empty command received:', req.body)
      return res.status(400).json({ 
        error: 'Command is required' 
      })
    }

    console.log('🎯 Parsing command:', command);

    // Use optimized parsing service with multi-tier strategy
    const parseResult = await optimizedParsingService.parseTradeIntent(command);
    const intent = parseResult.intent;
    
    console.log(`✅ Parsed via ${parseResult.method} in ${parseResult.processingTime}ms (confidence: ${parseResult.confidence.toFixed(3)})`);
    console.log('📋 Parsed intent:', JSON.stringify(intent, null, 2));
    
    // Extract errors and warnings
    const errors: string[] = []
    const warnings: string[] = []

    if (!intent.symbol) {
      errors.push('Could not identify stock symbol')
    }
    if (!intent.amount || intent.amount <= 0) {
      errors.push('Could not identify valid quantity or amount')
    }

    const result = {
      action: intent.action,
      symbol: intent.symbol,
      quantity: intent.amountType === 'shares' ? intent.amount : undefined,
      amount: intent.amountType === 'dollars' ? intent.amount : undefined,
      orderType: intent.orderType,
      limitPrice: intent.limitPrice,
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
      // Add parsing metadata
      parseMethod: parseResult.method,
      parseTime: parseResult.processingTime,
      parseConfidence: parseResult.confidence,
      cacheHit: parseResult.cacheHit,
      tokenUsage: parseResult.tokenUsage
    };

    console.log('📋 Parse result:', JSON.stringify(result, null, 2));

    return res.json(result)
  } catch (error: any) {
    console.error('❌ Command parse error:', error)
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({ 
      error: 'Failed to parse command',
      details: error.message 
    })
  }
})

app.post('/api/command/execute', async (req: Request, res: Response) => {
  try {
    const { command } = req.body
    
    if (!command?.trim()) {
      console.log('❌ Empty command received for execution:', req.body)
      return res.status(400).json({ 
        error: 'Command is required' 
      })
    }

    console.log('🎯 Executing command:', command);

        // Parse the command using optimized parsing service
        console.log('🤖 Parsing command with optimized service...');
        const parseResult = await optimizedParsingService.parseTradeIntent(command);
        const intent = parseResult.intent;
        console.log(`✅ Parsed via ${parseResult.method} in ${parseResult.processingTime}ms (confidence: ${parseResult.confidence.toFixed(3)})`);
        
        // Validate the trade
        console.log('🔍 Validating trade...');
        const validation = await validator.validateTrade(intent);
        console.log('📋 Validation results:', JSON.stringify(validation, null, 2));
    
    if (!validation.isValid) {
      console.log('❌ Validation failed:', validation.errors);
      return res.json({
        success: false,
        message: `Failed to validate order: ${validation.errors.join(', ')}`,
        error: validation.errors.join(', '),
        details: {
          intent,
          validation
        }
      });
    }

    // Execute the trade
    console.log('💼 Executing trade with broker...');
    const result = await broker.executeOrder(intent);
    console.log('✅ Trade execution result:', JSON.stringify(result, null, 2));
    
    return res.json({
      success: result.success,
      message: result.message || `${intent.action.toUpperCase()} order submitted successfully`,
      order: result.orderId ? { id: result.orderId } : undefined,
      error: result.success ? undefined : result.error
    })
  } catch (error: any) {
    console.error('❌ Command execution error:', error);
    console.error('Error stack:', error.stack);
    
    // Provide more detailed error information
    let errorMessage = 'Command execution failed';
    let errorDetails: any = {};
    
    if (error.message) {
      errorMessage = error.message;
    }
    
    if (error.code) {
      errorDetails.code = error.code;
    }
    
    if (error.response?.data) {
      errorDetails.apiResponse = error.response.data;
    }
    
    console.error('Error details:', errorDetails);
    
    return res.status(500).json({ 
      success: false,
      message: errorMessage,
      error: errorMessage,
      details: errorDetails
    })
  }
})

// Parsing performance endpoints
app.get('/api/parsing/stats', async (req: Request, res: Response) => {
  try {
    const stats = optimizedParsingService.getPerformanceStats();
    return res.json(stats);
  } catch (error: any) {
    console.error('❌ Failed to get parsing stats:', error);
    return res.status(500).json({
      error: 'Failed to get parsing statistics',
      details: error.message
    });
  }
});

app.post('/api/parsing/warm-cache', async (req: Request, res: Response) => {
  try {
    await optimizedParsingService.warmCaches();
    return res.json({
      success: true,
      message: 'Cache warming completed'
    });
  } catch (error: any) {
    console.error('❌ Failed to warm caches:', error);
    return res.status(500).json({
      error: 'Failed to warm caches',
      details: error.message
    });
  }
});

app.post('/api/parsing/test-method', async (req: Request, res: Response) => {
  try {
    const { input, method } = req.body;
    
    if (!input || !method) {
      return res.status(400).json({ 
        error: 'Input and method are required' 
      });
    }

    if (!['rule-based', 'semantic-cache', 'llm'].includes(method)) {
      return res.status(400).json({ 
        error: 'Invalid method. Must be: rule-based, semantic-cache, or llm' 
      });
    }

    const result = await optimizedParsingService.parseWithMethod(input, method);
    return res.json(result);
  } catch (error: any) {
    console.error('❌ Failed to test parsing method:', error);
    return res.status(500).json({
      error: 'Failed to test parsing method',
      details: error.message
    });
  }
});

// Add a test endpoint after the existing endpoints
app.get('/api/test/broker', async (req: Request, res: Response) => {
  try {
    console.log('🧪 Testing broker connection...');
    
    // Test account access
    const accountInfo = await broker.getAccountInfo();
    console.log('✅ Account info retrieved:', {
      accountId: accountInfo.accountId,
      buyingPower: accountInfo.buyingPower,
      portfolioValue: accountInfo.portfolioValue
    });
    
    // Test symbol lookup
    try {
      const marketData = await broker.getMarketData('AAPL');
      console.log('✅ Market data for AAPL:', {
        currentPrice: marketData.currentPrice,
        isMarketOpen: marketData.isMarketOpen
      });
    } catch (error) {
      console.log('❌ Failed to get AAPL market data:', error);
    }
    
    res.json({
      success: true,
      message: 'Broker connection working',
      accountInfo: {
        accountId: accountInfo.accountId,
        buyingPower: accountInfo.buyingPower,
        portfolioValue: accountInfo.portfolioValue,
        positions: accountInfo.positions.length
      }
    });
  } catch (error: any) {
    console.error('❌ Broker test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

// Debug endpoints for testing services
app.get('/api/debug/openai', async (req: Request, res: Response) => {
  try {
    const testPrompt = "What is 2+2? Respond with just the number.";
    const response = await openaiService.generateCompletion(testPrompt, {
      temperature: 0,
      maxTokens: 50
    });
    res.json({ success: true, response, prompt: testPrompt });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

app.get('/api/debug/perplexity', async (req: Request, res: Response) => {
  try {
    const insight = await perplexityService.generateMarketInsight("What is the current market sentiment?");
    res.json({ success: true, insight });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

app.get('/api/debug/research-simple', async (req: Request, res: Response) => {
  try {
    console.log('🔍 Testing simple research plan generation...');
    const testRequest = {
      query: "Test simple research query",
      mode: null,
      includeVisuals: false,
      symbols: []
    };
    
    // Test just the research plan creation
    const service = new (await import('./services/advanced-research-service')).AdvancedResearchService(openaiService, broker);
    const result = await service.conductResearch(testRequest);
    
    res.json({ success: true, result });
  } catch (error: any) {
    console.error('🚨 Research debug error:', error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

app.get('/api/debug/openai-json', async (req: Request, res: Response) => {
  try {
    const planningPrompt = `
    Create a comprehensive research plan for: "Test research query"
    Research Mode: market-insight
    
    You are a senior research analyst creating a detailed research methodology. Provide:
    
    1. RESEARCH STEPS (5-7 specific steps):
    - Each step should be actionable and specific
    - Focus on gathering different types of data
    - Include both quantitative and qualitative analysis
    
    2. METHODOLOGY:
    - Overall approach and framework
    - How to evaluate and weight different information sources
    - Quality criteria for research findings
    
    3. FOCUS AREAS:
    - Key topics to investigate deeply
    - Critical questions to answer
    - Specific metrics or data points to gather
    
    4. EXPECTED SOURCES:
    - Types of sources to prioritize
    - Specific databases or platforms to check
    - Expert opinions or reports to seek
    
    Format as JSON with the structure:
    {
      "steps": ["step1", "step2", ...],
      "methodology": "description",
      "focusAreas": ["area1", "area2", ...],
      "expectedSources": ["source1", "source2", ...]
    }
    `;

    const response = await openaiService.generateCompletion(planningPrompt, {
      temperature: 0.3,
      maxTokens: 1000
    });
    
    let parseResult;
    let parseError;
    
    try {
      // Try direct parse
      parseResult = JSON.parse(response);
    } catch (error: any) {
      parseError = error.message;
      
      // Try with JSON extraction
      let jsonStr = response.trim();
      if (jsonStr.includes('```json')) {
        const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }
      }
      
      try {
        parseResult = JSON.parse(jsonStr);
        parseError = null;
      } catch (extractError: any) {
        parseError = `Both direct and extracted JSON parsing failed: ${extractError.message}`;
      }
    }
    
    res.json({ 
      success: true, 
      rawResponse: response,
      parseResult,
      parseError,
      responseLength: response.length
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
});

// Research API endpoints
app.post('/api/research', async (req: Request, res: Response) => {
  try {
    const { query, mode, includeVisuals, symbols } = req.body;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Query is required',
        code: 'INVALID_QUERY'
      });
    }

    const request = {
      query,
      mode: mode || null,
      includeVisuals: includeVisuals || false,
      symbols: symbols || []
    };

    const result = await advancedResearchService.conductResearch(request);
    
    res.json(result);
  } catch (error: any) {
    console.error('Research error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to conduct research',
      details: error.message
    });
  }
});

// In-memory plan storage (in production, use a database)
interface ExecutionStep {
  id: string;
  description: string;
  action: 'buy' | 'sell' | 'hold' | 'wait';
  symbol?: string;
  quantity?: number;
  price?: number;
  condition?: string;
  timing?: string;
  completed: boolean;
  executedAt?: string;
  result?: any;
}

interface TradingPlan {
  id: string;
  title: string;
  type: string;
  query: string;
  createdAt: string;
  savedAt: number;
  tags: string[];
  isTrending: boolean;
  data: any;
  executionSteps: ExecutionStep[];
  status: 'draft' | 'ready' | 'executing' | 'completed' | 'paused' | 'failed';
  totalSteps: number;
  completedSteps: number;
  lastExecuted?: string;
  scheduledAt?: string;
  autoExecute: boolean;
}

const plansStorage = new Map<string, TradingPlan>();

// Initialize with sample executable plans
const initializeSamplePlans = () => {
  const samplePlans: TradingPlan[] = [
    {
      id: '1',
      title: 'AAPL Momentum Strategy',
      type: 'trade-plan',
      query: 'Create a momentum trading plan for AAPL based on recent earnings',
      createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
      savedAt: Date.now() - 86400000,
      tags: ['AAPL', 'momentum', 'technology', 'earnings'],
      isTrending: true,
      status: 'ready',
      autoExecute: false,
      totalSteps: 3,
      completedSteps: 0,
      data: {
        summary: 'Momentum-based trading strategy for AAPL following strong earnings. Buy on strength, use technical indicators for timing.',
        keyFindings: [
          'AAPL reported strong quarterly earnings with 15% revenue growth',
          'Technical indicators show bullish momentum with RSI at 65',
          'Volume spike indicates institutional buying interest',
          'Support level established at $195, resistance at $210'
        ],
        confidence: 0.85,
        expectedReturn: '8-12%',
        riskLevel: 'Medium',
        timeframe: '2-4 weeks'
      },
      executionSteps: [
        {
          id: 'step-1',
          description: 'Wait for market open and check pre-market sentiment',
          action: 'wait',
          condition: 'Market opens AND pre-market volume > 500K',
          timing: 'Market open (9:30 AM ET)',
          completed: false
        },
        {
          id: 'step-2', 
          description: 'Buy 15 shares of AAPL if price is above $200',
          action: 'buy',
          symbol: 'AAPL',
          quantity: 15,
          condition: 'Price > $200 AND RSI < 70',
          timing: 'Within first 30 minutes of market open',
          completed: false
        },
        {
          id: 'step-3',
          description: 'Set stop loss at 5% below entry price',
          action: 'hold',
          condition: 'Position established',
          timing: 'Immediately after purchase',
          completed: false
        }
      ]
    },
    {
      id: '2',
      title: 'TSLA Technical Breakout',
      type: 'trade-plan', 
      query: 'Technical analysis based plan for TSLA breakout above $250',
      createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
      savedAt: Date.now() - 172800000,
      tags: ['TSLA', 'breakout', 'technical', 'EV'],
      isTrending: false,
      status: 'ready',
      autoExecute: false,
      totalSteps: 4,
      completedSteps: 0,
      data: {
        summary: 'Technical breakout strategy for TSLA. Waiting for break above $250 resistance with volume confirmation.',
        keyFindings: [
          'TSLA consolidating in $240-250 range for 2 weeks',
          'Volume declining suggests coiling for breakout move',
          'EV sector showing renewed strength',
          'Options flow indicates bullish sentiment'
        ],
        confidence: 0.78,
        expectedReturn: '15-20%',
        riskLevel: 'High',
        timeframe: '1-3 weeks'
      },
      executionSteps: [
        {
          id: 'step-1',
          description: 'Monitor for breakout above $250 with volume > 1M',
          action: 'wait',
          symbol: 'TSLA',
          condition: 'Price > $250 AND Volume > 1M shares',
          timing: 'Continuous monitoring during market hours',
          completed: false
        },
        {
          id: 'step-2',
          description: 'Buy 10 shares on confirmed breakout',
          action: 'buy',
          symbol: 'TSLA',
          quantity: 10,
          condition: 'Breakout confirmed with sustained move',
          timing: 'Within 15 minutes of breakout signal',
          completed: false
        },
        {
          id: 'step-3',
          description: 'Set initial stop loss at $245',
          action: 'hold',
          condition: 'Position established',
          timing: 'Immediately after entry',
          completed: false
        },
        {
          id: 'step-4',
          description: 'Set profit target at $280 and monitor position',
          action: 'hold',
          symbol: 'TSLA',
          condition: 'Price reaches $280 for profit taking',
          timing: 'Monitor continuously',
          completed: false
        }
      ]
    },
    {
      id: '3',
      title: 'NVDA AI Sector Play',
      type: 'trade-plan',
      query: 'Long-term investment plan for NVIDIA based on AI growth',
      createdAt: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
      savedAt: Date.now() - 259200000,
      tags: ['NVDA', 'AI', 'long-term', 'semiconductors'],
      isTrending: true,
      status: 'ready',
      autoExecute: false,
      totalSteps: 3,
      completedSteps: 0,
      data: {
        summary: 'Long-term accumulation strategy for NVIDIA. Dollar-cost averaging approach over 4 weeks.',
        keyFindings: [
          'AI market projected to grow 25% annually through 2027',
          'NVDA maintains 85% market share in AI chips',
          'Recent pullback creates attractive entry opportunity',
          'Strong institutional support and analyst upgrades'
        ],
        confidence: 0.92,
        expectedReturn: '25-35%',
        riskLevel: 'Medium',
        timeframe: '3-6 months'
      },
      executionSteps: [
        {
          id: 'step-1',
          description: 'Buy $1000 worth of NVDA shares (Week 1)',
          action: 'buy',
          symbol: 'NVDA',
          price: 1000, // Dollar amount
          condition: 'Any price below $500',
          timing: 'This week',
          completed: false
        },
        {
          id: 'step-2',
          description: 'Buy additional $1000 worth (Week 2)',
          action: 'buy',
          symbol: 'NVDA', 
          price: 1000,
          condition: 'Any price below $520',
          timing: 'Next week',
          completed: false
        },
        {
          id: 'step-3',
          description: 'Final $1000 purchase (Week 3)',
          action: 'buy',
          symbol: 'NVDA',
          price: 1000,
          condition: 'Any price below $540',
          timing: 'Week 3',
          completed: false
        }
      ]
    },
    {
      id: '4',
      title: 'MSFT Dividend Growth Strategy',
      type: 'trade-plan',
      query: 'Create a conservative accumulation plan for Microsoft for dividend growth',
      createdAt: new Date(Date.now() - 345600000).toISOString(), // 4 days ago
      savedAt: Date.now() - 345600000,
      tags: ['MSFT', 'dividend', 'conservative', 'technology'],
      isTrending: false,
      status: 'ready',
      autoExecute: false,
      totalSteps: 3,
      completedSteps: 0,
      data: {
        summary: 'Conservative accumulation strategy for Microsoft focusing on dividend growth and stability.',
        keyFindings: [
          'MSFT has increased dividend payments for 20+ consecutive years',
          'Strong balance sheet with consistent free cash flow generation',
          'Azure cloud growth provides long-term revenue visibility',
          'Enterprise software business offers stable recurring revenue'
        ],
        confidence: 0.88,
        expectedReturn: '12-18%',
        riskLevel: 'Low',
        timeframe: '6-12 months'
      },
      executionSteps: [
        {
          id: 'step-1',
          description: 'Buy initial 10 shares of MSFT as core position',
          action: 'buy',
          symbol: 'MSFT',
          quantity: 10,
          condition: 'Any price below $450',
          timing: 'Immediate execution',
          completed: false
        },
        {
          id: 'step-2',
          description: 'Set dividend reinvestment and monitoring',
          action: 'hold',
          condition: 'Position established, monitor for dividend announcements',
          timing: 'Ongoing monitoring',
          completed: false
        },
        {
          id: 'step-3',
          description: 'Add 5 more shares on any 5% dip',
          action: 'buy',
          symbol: 'MSFT',
          quantity: 5,
          condition: 'Price drops 5% from initial purchase',
          timing: 'Opportunistic buying on dips',
          completed: false
        }
      ]
    }
  ];

  samplePlans.forEach(plan => {
    plansStorage.set(plan.id, plan);
  });
};

// Initialize sample plans
initializeSamplePlans();

// Trading Plans API endpoints
app.get('/api/plans', async (req: Request, res: Response) => {
  try {
    const { type, trending, limit = '50' } = req.query;
    
    let plans = Array.from(plansStorage.values());
    
    // Apply filters
    if (type && type !== 'all') {
      plans = plans.filter(plan => plan.type === type);
    }
    
    if (trending === 'true') {
      plans = plans.filter(plan => plan.isTrending);
    }
    
    // Sort by creation date (newest first)
    plans.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    // Apply limit
    const limitNum = parseInt(limit as string);
    if (limitNum > 0) {
      plans = plans.slice(0, limitNum);
    }
    
    res.json({
      plans,
      total: plans.length
    });
  } catch (error: any) {
    console.error('Plans fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plans',
      details: error.message
    });
  }
});

app.get('/api/plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const plan = plansStorage.get(id);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }
    
    res.json({
      success: true,
      plan
    });
  } catch (error: any) {
    console.error('Plan fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plan',
      details: error.message
    });
  }
});

app.post('/api/plans', async (req: Request, res: Response) => {
  try {
    const { title, type, query, tags, data, executionSteps, autoExecute } = req.body;
    
    const plan: TradingPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title,
      type: type || 'trade-plan',
      query,
      createdAt: new Date().toISOString(),
      savedAt: Date.now(),
      tags: tags || [],
      isTrending: false,
      data: data || {},
      executionSteps: executionSteps || [],
      status: 'draft',
      totalSteps: (executionSteps || []).length,
      completedSteps: 0,
      autoExecute: autoExecute || false
    };
    
    plansStorage.set(plan.id, plan);
    
    res.json({
      success: true,
      plan,
      message: 'Plan created successfully'
    });
  } catch (error: any) {
    console.error('Plan creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create plan',
      details: error.message
    });
  }
});

app.put('/api/plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const plan = plansStorage.get(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }
    
    // Update plan
    const updatedPlan = { ...plan, ...updates };
    plansStorage.set(id, updatedPlan);
    
    res.json({
      success: true,
      plan: updatedPlan,
      message: 'Plan updated successfully'
    });
  } catch (error: any) {
    console.error('Plan update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update plan',
      details: error.message
    });
  }
});

app.delete('/api/plans/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    if (!plansStorage.has(id)) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }
    
    plansStorage.delete(id);
    
    res.json({
      success: true,
      message: 'Plan deleted successfully'
    });
  } catch (error: any) {
    console.error('Plan deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete plan',
      details: error.message
    });
  }
});

// Plan execution endpoints
app.post('/api/plans/:id/execute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stepId, force = false } = req.body;
    
    const plan = plansStorage.get(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }
    
    // Find the step to execute
    const step = plan.executionSteps.find(s => s.id === stepId);
    if (!step) {
      return res.status(404).json({
        success: false,
        error: 'Execution step not found'
      });
    }
    
    if (step.completed && !force) {
      return res.status(400).json({
        success: false,
        error: 'Step already completed'
      });
    }
    
    console.log(`🎯 Executing plan step: ${step.description}`);
    
    // Update plan status
    plan.status = 'executing';
    plan.lastExecuted = new Date().toISOString();
    
    let executionResult;
    
    try {
      // Execute the step based on action type
      switch (step.action) {
        case 'buy':
          if (step.symbol && (step.quantity || step.price)) {
            const command = step.quantity 
              ? `buy ${step.quantity} shares of ${step.symbol}`
              : `buy $${step.price} worth of ${step.symbol}`;
            
            console.log(`📈 Executing buy order: ${command}`);
            
            // Parse and execute the trade
            const tradeResult = await optimizedParsingService.parseTradeIntent(command);
            const validation = await validator.validateTrade(tradeResult.intent);
            if (validation.isValid) {
              executionResult = await broker.executeOrder(tradeResult.intent);
              console.log(`✅ Trade executed successfully:`, executionResult);
            } else {
              throw new Error(`Trade validation failed: ${validation.errors.join(', ')}`);
            }
          } else {
            throw new Error('Invalid buy step: missing symbol or quantity/price');
          }
          break;
          
        case 'sell':
          if (step.symbol && step.quantity) {
            const command = `sell ${step.quantity} shares of ${step.symbol}`;
            console.log(`📉 Executing sell order: ${command}`);
            
            const tradeResult = await optimizedParsingService.parseTradeIntent(command);
            const validation = await validator.validateTrade(tradeResult.intent);
            if (validation.isValid) {
              executionResult = await broker.executeOrder(tradeResult.intent);
              console.log(`✅ Sell order executed successfully:`, executionResult);
            } else {
              throw new Error(`Trade validation failed: ${validation.errors.join(', ')}`);
            }
          } else {
            throw new Error('Invalid sell step: missing symbol or quantity');
          }
          break;
          
        case 'wait':
          console.log(`⏰ Wait step acknowledged: ${step.description}`);
          executionResult = {
            success: true,
            message: 'Wait condition noted',
            action: 'wait',
            timestamp: new Date().toISOString()
          };
          break;
          
        case 'hold':
          console.log(`🤝 Hold step acknowledged: ${step.description}`);
          executionResult = {
            success: true,
            message: 'Hold position maintained',
            action: 'hold',
            timestamp: new Date().toISOString()
          };
          break;
          
        default:
          throw new Error(`Unknown action type: ${step.action}`);
      }
      
      // Mark step as completed
      step.completed = true;
      step.executedAt = new Date().toISOString();
      step.result = executionResult;
      
      // Update completed steps count
      plan.completedSteps = plan.executionSteps.filter(s => s.completed).length;
      
      // Check if plan is complete
      if (plan.completedSteps >= plan.totalSteps) {
        plan.status = 'completed';
        console.log(`🎉 Plan "${plan.title}" completed successfully!`);
      } else {
        plan.status = 'ready'; // Ready for next step
      }
      
      // Save updated plan
      plansStorage.set(id, plan);
      
      res.json({
        success: true,
        plan,
        step,
        executionResult,
        message: 'Step executed successfully'
      });
      
    } catch (executionError: any) {
      console.error(`❌ Step execution failed:`, executionError);
      
      // Provide better error messages based on error type
      let userFriendlyError = executionError.message;
      if (executionError.message.includes('403') || executionError.message.includes('Request failed with status code 403')) {
        if (step.action === 'sell') {
          userFriendlyError = 'Cannot sell shares: Insufficient holdings. You may not own enough shares to sell.';
        } else {
          userFriendlyError = 'Trade rejected: Insufficient permissions or account restrictions.';
        }
      } else if (executionError.message.includes('validation failed')) {
        userFriendlyError = 'Waiting for market conditions to be met.';
      }
      
      // Mark step as failed but don't mark as completed
      step.result = {
        success: false,
        error: userFriendlyError,
        originalError: executionError.message,
        timestamp: new Date().toISOString()
      };
      
      plan.status = 'failed';
      plansStorage.set(id, plan);
      
      res.status(500).json({
        success: false,
        error: 'Step execution failed',
        details: userFriendlyError,
        plan,
        step
      });
    }
    
  } catch (error: any) {
    console.error('Plan execution error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute plan step',
      details: error.message
    });
  }
});

app.post('/api/plans/:id/execute-all', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const plan = plansStorage.get(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }
    
    console.log(`🚀 Starting full execution of plan: ${plan.title}`);
    
    plan.status = 'executing';
    const executionResults = [];
    
    // Execute steps in order
    for (const step of plan.executionSteps) {
      if (step.completed) {
        console.log(`⏭️ Skipping completed step: ${step.description}`);
        continue;
      }
      
      try {
        // For wait/hold steps in automated execution, just mark as completed
        if (step.action === 'wait' || step.action === 'hold') {
          step.completed = true;
          step.executedAt = new Date().toISOString();
          step.result = {
            success: true,
            message: `Automated ${step.action} step completed`,
            timestamp: new Date().toISOString()
          };
          executionResults.push({ stepId: step.id, success: true });
          continue;
        }
        
        // Execute trading steps
        const response = await fetch(`http://localhost:${port}/api/plans/${id}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId: step.id })
        });
        
        const result = await response.json();
        executionResults.push({ 
          stepId: step.id, 
          success: result.success,
          result: result.executionResult,
          error: result.error
        });
        
        if (!result.success) {
          console.error(`❌ Step ${step.id} failed:`, result.error);
          break; // Stop on first failure
        }
        
      } catch (stepError: any) {
        console.error(`❌ Step ${step.id} execution failed:`, stepError);
        executionResults.push({ 
          stepId: step.id, 
          success: false, 
          error: stepError.message 
        });
        break; // Stop on error
      }
    }
    
    // Update plan status
    const updatedPlan = plansStorage.get(id)!;
    const allCompleted = updatedPlan.executionSteps.every(s => s.completed);
    updatedPlan.status = allCompleted ? 'completed' : 'failed';
    plansStorage.set(id, updatedPlan);
    
    res.json({
      success: true,
      plan: updatedPlan,
      executionResults,
      message: allCompleted ? 'Plan executed successfully' : 'Plan execution stopped due to error'
    });
    
  } catch (error: any) {
    console.error('Full plan execution error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute plan',
      details: error.message
    });
  }
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start HTTP server
const server = app.listen(port, async () => {
  console.log(`🚀 Trading API server running on port ${port}`);
  console.log(`📊 Mode: ${config.alpacaBaseUrl.includes('paper') ? 'PAPER TRADING' : 'LIVE TRADING'}`);
  console.log(`🌐 API available at: http://localhost:${port}/api`);
  
  // Warm parsing caches on startup
  try {
    console.log('🔥 Warming parsing caches...');
    await optimizedParsingService.warmCaches();
    console.log('✅ Cache warming completed');
  } catch (error) {
    console.warn('⚠️ Cache warming failed:', error);
  }
});

// WebSocket server for real-time updates
const wss = new WebSocketServer({ server });

interface ClientConnection {
  ws: WebSocket;
  subscriptions: Set<string>;
}

const clients = new Map<string, ClientConnection>();

wss.on('connection', (ws: WebSocket) => {
  const clientId = Math.random().toString(36).substring(7);
  clients.set(clientId, { ws, subscriptions: new Set() });
  
  console.log(`📡 Client connected: ${clientId}`);
  
  ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[]) => {
    try {
      const message = JSON.parse(data.toString());
      const client = clients.get(clientId);
      
      if (!client) return;
      
      switch (message.type) {
        case 'subscribe':
          if (message.symbol) {
            client.subscriptions.add(message.symbol);
            console.log(`📊 Client ${clientId} subscribed to ${message.symbol}`);
          }
          break;
          
        case 'unsubscribe':
          if (message.symbol) {
            client.subscriptions.delete(message.symbol);
            console.log(`📊 Client ${clientId} unsubscribed from ${message.symbol}`);
          }
          break;
          
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    clients.delete(clientId);
    console.log(`📡 Client disconnected: ${clientId}`);
  });
  
  // Send initial connection confirmation
  ws.send(JSON.stringify({ 
    type: 'connected', 
    clientId,
    timestamp: Date.now() 
  }));
});

// Broadcast market updates to subscribed clients
const broadcastMarketUpdate = (symbol: string, data: any) => {
  clients.forEach((client) => {
    if (client.subscriptions.has(symbol) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'market_update',
        symbol,
        data,
        timestamp: Date.now()
      }));
    }
  });
};

// Periodic market data updates (every 30 seconds)
setInterval(async () => {
  const symbols = new Set<string>();
  clients.forEach((client) => {
    client.subscriptions.forEach((symbol) => symbols.add(symbol));
  });
  
  for (const symbol of symbols) {
    try {
      const marketData = await broker.getMarketData(symbol);
      broadcastMarketUpdate(symbol, marketData);
    } catch (error) {
      console.error(`Failed to get market data for ${symbol}:`, error);
    }
  }
}, 30000);

export { app, server, wss }; 