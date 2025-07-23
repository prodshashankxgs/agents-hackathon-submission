// ============================================================================
// LAYERED SERVER - MAIN ENTRY POINT
// ============================================================================

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { WebSocket, WebSocketServer } from 'ws';

import { router as apiRoutes } from './presentation/routes';
import { 
  container, 
  resolveLogger, 
  resolveBrokerAdapter,
  resolveEventBus 
} from './infrastructure/di/Container';
import { config } from './config';

// Initialize the application
const app = express();
const port = process.env.PORT || 3001;
const logger = resolveLogger();

// ===== MIDDLEWARE SETUP =====

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false // Disable for development
}));

// Compression middleware
app.use(compression({
  threshold: 1024, // Only compress responses > 1KB
  level: 6 // Balanced compression level
}));

// CORS middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Replace with actual domain
    : true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = `req_${startTime}_${Math.random().toString(36).substring(2, 15)}`;
  
  // Add request ID to request object for tracking
  (req as any).requestId = requestId;
  
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });
  
  next();
});

// ===== ROUTES =====

// API routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Natural Language Trading API',
    version: '2.0.0',
    status: 'active',
    architecture: 'layered',
    mode: config.alpacaBaseUrl.includes('paper') ? 'paper-trading' : 'live-trading',
    endpoints: {
      health: '/api/health',
      trades: '/api/trades',
      portfolio: '/api/portfolio',
      positions: '/api/positions',
      market: '/api/market',
      account: '/api/account'
    },
    timestamp: new Date().toISOString()
  });
});

// ===== ERROR HANDLING =====

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: `Endpoint ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  const requestId = (req as any).requestId;
  
  logger.error('Unhandled application error', error, {
    requestId,
    path: req.path,
    method: req.method
  });

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'An unexpected error occurred',
    requestId,
    timestamp: new Date().toISOString()
  });
});

// ===== SERVER STARTUP =====

async function startServer() {
  try {
    // Initialize dependencies
    logger.info('Initializing application dependencies...');
    
    // Test broker connection
    const brokerAdapter = resolveBrokerAdapter();
    await brokerAdapter.isMarketOpen();
    logger.info('Broker connection verified');
    
    // Initialize event bus
    const eventBus = resolveEventBus();
    logger.info('Event bus initialized');
    
    // Start HTTP server
    const server = app.listen(port, () => {
      logger.info('🚀 Layered Trading API Server Started', {
        port,
        mode: config.alpacaBaseUrl.includes('paper') ? 'PAPER TRADING' : 'LIVE TRADING',
        environment: config.nodeEnv,
        apiUrl: `http://localhost:${port}/api`,
        architecture: 'layered'
      });
    });

    // ===== WEBSOCKET SETUP =====
    
    const wss = new WebSocketServer({ server });
    const clients = new Map<string, { ws: WebSocket; subscriptions: Set<string> }>();

    wss.on('connection', (ws: WebSocket) => {
      const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      clients.set(clientId, { ws, subscriptions: new Set() });
      
      logger.info('WebSocket client connected', { clientId });
      
      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          const client = clients.get(clientId);
          
          if (!client) return;
          
          switch (message.type) {
            case 'subscribe':
              if (message.symbol) {
                client.subscriptions.add(message.symbol);
                logger.debug('Client subscribed to symbol', { clientId, symbol: message.symbol });
              }
              break;
              
            case 'unsubscribe':
              if (message.symbol) {
                client.subscriptions.delete(message.symbol);
                logger.debug('Client unsubscribed from symbol', { clientId, symbol: message.symbol });
              }
              break;
              
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;
          }
        } catch (error) {
          logger.warn('Invalid WebSocket message', { error: error as Error, clientId });
        }
      });
      
      ws.on('close', () => {
        clients.delete(clientId);
        logger.info('WebSocket client disconnected', { clientId });
      });
      
      ws.on('error', (error) => {
        logger.error('WebSocket error', error, { clientId });
        clients.delete(clientId);
      });
      
      // Send connection confirmation
      ws.send(JSON.stringify({ 
        type: 'connected', 
        clientId,
        timestamp: Date.now() 
      }));
    });

    // Periodic market data updates (every 30 seconds)
    const marketDataInterval = setInterval(async () => {
      const symbols = new Set<string>();
      clients.forEach(client => {
        client.subscriptions.forEach(symbol => symbols.add(symbol));
      });
      
      for (const symbol of symbols) {
        try {
          const marketData = await brokerAdapter.getMarketData(symbol);
          
          // Broadcast to subscribed clients
          clients.forEach((client) => {
            if (client.subscriptions.has(symbol) && client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(JSON.stringify({
                type: 'market_update',
                symbol,
                data: marketData,
                timestamp: Date.now()
              }));
            }
          });
          
        } catch (error) {
          logger.warn('Failed to broadcast market data', { error: error as Error, symbol });
        }
      }
    }, 30000);

    // ===== GRACEFUL SHUTDOWN =====
    
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      // Clear intervals
      clearInterval(marketDataInterval);
      
      // Close WebSocket connections
      clients.forEach(({ ws }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      });
      
      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      
      // Force exit after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    return server;

  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
}

// ===== MAIN EXECUTION =====

if (require.main === module) {
  startServer().catch((error) => {
    logger.error('Server startup failed', error);
    process.exit(1);
  });
}

export { app, startServer };