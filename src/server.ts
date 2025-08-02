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