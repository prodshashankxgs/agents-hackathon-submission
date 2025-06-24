import express from 'express';
import cors from 'cors';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config';
import { OpenAIService } from './llm/openai-service';
import { AlpacaAdapter } from './brokers/alpaca-adapter';
import { ValidationService } from './trading/validation-service';
import { TradeIntent, CLIOptions, TradingError } from './types';

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const openAI = new OpenAIService();
const broker = new AlpacaAdapter();
const validator = new ValidationService(broker);

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

    const intent = await openAI.parseTradeIntent(input);
    const summary = openAI.generateTradeSummary(intent);
    
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

// Simplified command endpoints
app.post('/api/command/parse', async (req, res) => {
  try {
    const { command } = req.body
    
    if (!command?.trim()) {
      return res.status(400).json({ 
        error: 'Command is required' 
      })
    }

    // Use existing OpenAI service to parse the command
    const intent = await openAI.parseTradeIntent(command);
    
    // Extract errors and warnings
    const errors: string[] = []
    const warnings: string[] = []

    if (!intent.symbol) {
      errors.push('Could not identify stock symbol')
    }
    if (!intent.amount || intent.amount <= 0) {
      errors.push('Could not identify valid quantity or amount')
    }

    return res.json({
      action: intent.action,
      symbol: intent.symbol,
      quantity: intent.amountType === 'shares' ? intent.amount : undefined,
      amount: intent.amountType === 'dollars' ? intent.amount : undefined,
      orderType: intent.orderType,
      limitPrice: intent.limitPrice,
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    })
  } catch (error: any) {
    console.error('Command parse error:', error)
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
      return res.status(400).json({ 
        error: 'Command is required' 
      })
    }

    // Parse the command using OpenAI
    const intent = await openAI.parseTradeIntent(command);
    
    // Validate the trade
    const validation = await validator.validateTrade(intent);
    
    if (!validation.isValid) {
      return res.json({
        success: false,
        message: `Trade validation failed: ${validation.errors.join(', ')}`,
        error: validation.errors.join(', ')
      });
    }

    // Execute the trade
    const result = await broker.executeOrder(intent);
    
    return res.json({
      success: result.success,
      message: result.message || `${intent.action.toUpperCase()} order submitted successfully`,
      order: result.orderId ? { id: result.orderId } : undefined,
      error: result.success ? undefined : result.error
    })
  } catch (error: any) {
    console.error('Command execution error:', error)
    return res.status(500).json({ 
      success: false,
      message: 'Command execution failed',
      error: error.message 
    })
  }
})

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