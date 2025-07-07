import express from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config';
import { OpenAIService } from './llm/openai-service';
import { AdvancedTradingService } from './llm/advanced-trading-service';
import { AlpacaAdapter } from './brokers/alpaca-adapter';
import { ValidationService } from './trading/validation-service';
import { ThirteenFService } from './services/thirteenth-f-service';
import { BasketStorageService } from './storage/basket-storage';
import { TradeIntent, CLIOptions, TradingError } from './types';
import { brokerLimiter } from './utils/concurrency-limiter';
import { performanceMiddleware, performanceMonitor } from './utils/performance-monitor';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(performanceMiddleware);

// Initialize services
const openaiService = new OpenAIService();
const advancedTrading = new AdvancedTradingService();
const broker = new AlpacaAdapter();
const validator = new ValidationService(broker);
const basketStorage = new BasketStorageService();
const thirteenFService = new ThirteenFService(basketStorage);

// Development mode warnings
if (config.nodeEnv === 'development') {
  console.log('\n🔧 Running in DEVELOPMENT mode');
  
  if (config.openaiApiKey === 'development-mock-key') {
    console.warn('⚠️  Using mock OpenAI API key - AI features will not work');
  }
  
  if (config.alpacaApiKey === 'development-mock-key') {
    console.warn('⚠️  Using mock Alpaca API key - Trading features will not work');
  }
  
  console.log('\n💡 To enable full functionality, add your API keys to the .env file\n');
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    mode: config.alpacaBaseUrl.includes('paper') ? 'paper' : 'live',
    timestamp: new Date().toISOString()
  });
});

// Parse natural language trade intent
app.post('/api/trade/parse', async (req, res) => {
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
app.post('/api/trade/validate', async (req, res) => {
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
app.post('/api/trade/execute', async (req, res) => {
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
app.get('/api/account', async (req, res) => {
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
app.get('/api/market/:symbol', async (req, res) => {
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
app.get('/api/market/status', async (req, res) => {
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
app.get('/api/portfolio/history', async (req, res) => {
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
app.post('/api/advanced/parse', async (req, res) => {
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

app.post('/api/advanced/hedge', async (req, res) => {
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

app.post('/api/advanced/analyze', async (req, res) => {
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
    marketDataResults.forEach(({ symbol, data }) => {
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

app.post('/api/advanced/recommend', async (req, res) => {
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

// 13F endpoints
app.post('/api/advanced/13f', async (req, res) => {
  try {
    const { intent } = req.body;
    
    if (!intent || intent.type !== '13f') {
      return res.status(400).json({ error: 'Invalid 13F intent' });
    }

    const portfolio = await thirteenFService.getPortfolio(intent.institution);
    
    return res.json({ portfolio });
  } catch (error) {
    console.error('13F query error:', error);
    return res.status(500).json({ error: 'Failed to get 13F data' });
  }
});

app.post('/api/advanced/13f/invest', async (req, res) => {
  try {
    const { intent, investmentAmount } = req.body;
    
    if (!intent || intent.type !== '13f') {
      return res.status(400).json({ error: 'Invalid 13F intent' });
    }

    if (!investmentAmount || investmentAmount <= 0) {
      return res.status(400).json({ error: 'Valid investment amount required' });
    }

    // Create investment basket using the new service method
    const basketResult = await thirteenFService.createInvestmentBasket(
      intent.institution, 
      investmentAmount,
      { minHoldingPercent: 0.5, maxPositions: 20 }
    );
    
    // Execute trades for each holding using notional (dollar) amounts - PARALLEL EXECUTION
    console.log(`🚀 Executing ${basketResult.allocations.length} trades in parallel for maximum speed...`);
    
    const tradePromises = basketResult.allocations.map(async (item: any) => {
      if (item.targetValue <= 0) {
        return {
          symbol: item.symbol,
          success: false,
          error: 'Target value is zero or negative',
          targetValue: item.targetValue
        };
      }

      try {
        const tradeIntent = {
          action: 'buy' as const,
          symbol: item.symbol,
          amountType: 'dollars' as const,
          amount: item.targetValue,
          orderType: 'market' as const
        };
        
        console.log(`⚡ Executing notional order for ${item.symbol}: $${item.targetValue}`);
        
        const result = await broker.executeOrder(tradeIntent);
        
        console.log(`✅ Order executed for ${item.symbol}: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);
        
        return {
          symbol: item.symbol,
          success: result.success,
          orderId: result.orderId,
          message: result.message,
          targetValue: item.targetValue,
          executedValue: result.executedValue,
          executedShares: result.executedShares
        };
      } catch (error: any) {
        console.error(`❌ Failed to execute trade for ${item.symbol}:`, error);
        return {
          symbol: item.symbol,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          targetValue: item.targetValue
        };
      }
    });

    // Wait for all trades to complete simultaneously
    const tradeResults = await Promise.all(tradePromises);
    
    const successCount = tradeResults.filter((r: any) => r.success).length;
    console.log(`🎯 Basket execution complete: ${successCount}/${tradeResults.length} trades successful`);
    
    return res.json({
      basket: basketResult,
      allocation: basketResult.allocations,
      tradeResults
    });
  } catch (error) {
    console.error('13F investment error:', error);
    return res.status(500).json({ error: 'Failed to execute 13F investment' });
  }
});



// Basket management endpoints
app.get('/api/baskets', async (req, res) => {
  try {
    const baskets = await basketStorage.getBaskets();
    return res.json({ baskets });
  } catch (error) {
    console.error('Get baskets error:', error);
    return res.status(500).json({ error: 'Failed to get baskets' });
  }
});

app.get('/api/baskets/:basketId', async (req, res) => {
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

app.delete('/api/baskets/:basketId', async (req, res) => {
  try {
    const { basketId } = req.params;
    await basketStorage.deleteBasket(basketId);
    
    return res.json({ success: true });
  } catch (error) {
    console.error('Delete basket error:', error);
    return res.status(500).json({ error: 'Failed to delete basket' });
  }
});



// Simplified command endpoints
app.post('/api/command/parse', async (req, res) => {
  try {
    const { command } = req.body
    
    if (!command?.trim()) {
      console.log('❌ Empty command received:', req.body)
      return res.status(400).json({ 
        error: 'Command is required' 
      })
    }

    console.log('🎯 Parsing command:', command);

            // Use existing OpenAI service to parse the command
        const intent = await openaiService.parseTradeIntent(command);
    console.log('✅ Parsed intent:', JSON.stringify(intent, null, 2));
    
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
      warnings: warnings.length > 0 ? warnings : undefined
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

app.post('/api/command/execute', async (req, res) => {
  try {
    const { command } = req.body
    
    if (!command?.trim()) {
      console.log('❌ Empty command received for execution:', req.body)
      return res.status(400).json({ 
        error: 'Command is required' 
      })
    }

    console.log('🎯 Executing command:', command);

        // Parse the command using OpenAI
        console.log('🤖 Parsing command with OpenAI...');
        const intent = await openaiService.parseTradeIntent(command);
        console.log('✅ Parsed intent:', JSON.stringify(intent, null, 2));
        
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

// Add a test endpoint after the existing endpoints
app.get('/api/test/broker', async (req, res) => {
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
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start HTTP server
const server = app.listen(port, () => {
  console.log(`🚀 Trading API server running on port ${port}`);
  console.log(`📊 Mode: ${config.alpacaBaseUrl.includes('paper') ? 'PAPER TRADING' : 'LIVE TRADING'}`);
  console.log(`🌐 API available at: http://localhost:${port}/api`);
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
  
  ws.on('message', async (data: string) => {
    try {
      const message = JSON.parse(data);
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
  clients.forEach(client => {
    client.subscriptions.forEach(symbol => symbols.add(symbol));
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