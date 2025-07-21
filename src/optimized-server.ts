import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { config } from './config';
import { OptimizedTradeRoutes } from './api/optimized-trade-routes';
import { performanceMiddleware, performanceMonitor } from './utils/performance-monitor';

/**
 * Optimized Express server focused on core trading functionality
 * 
 * Features:
 * - Streamlined routing for buy/sell operations
 * - Performance optimizations
 * - Security middleware
 * - Comprehensive error handling
 * - Development tools
 */
class OptimizedTradingServer {
  private app: express.Application;
  private port: number;
  private tradeRoutes: OptimizedTradeRoutes;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3001');
    this.tradeRoutes = new OptimizedTradeRoutes();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware stack
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable for API-only server
      crossOriginEmbedderPolicy: false
    }));
    
    // CORS configuration
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'development' 
        ? ['http://localhost:3000', 'http://localhost:5173']
        : process.env.ALLOWED_ORIGINS?.split(',') || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Compression middleware
    this.app.use(compression());

    // Request parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Performance monitoring
    this.app.use(performanceMiddleware);

    // Request logging in development
    if (config.nodeEnv === 'development') {
      this.app.use((req, res, next) => {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} ${req.method} ${req.path}`);
        next();
      });
    }
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Root health check
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Optimized Trading API',
        version: '2.0.0',
        status: 'healthy',
        mode: config.alpacaBaseUrl.includes('paper') ? 'paper-trading' : 'live-trading',
        timestamp: new Date().toISOString(),
        endpoints: {
          trading: '/api/trade/*',
          health: '/api/trade/health',
          account: '/api/trade/account',
          portfolio: '/api/trade/portfolio'
        }
      });
    });

    // Mount optimized trading routes
    this.app.use('/api/trade', this.tradeRoutes.getRouter());

    // Legacy compatibility routes (redirect to optimized endpoints)
    this.app.post('/api/trade/parse', (req, res) => {
      res.redirect(307, '/api/trade/parse');
    });

    this.app.post('/api/trade/validate', (req, res) => {
      res.redirect(307, '/api/trade/validate');
    });

    this.app.post('/api/trade/execute', (req, res) => {
      res.redirect(307, '/api/trade/execute');
    });

    // Catch-all for unmatched routes
    this.app.all('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: req.path,
        method: req.method,
        availableEndpoints: [
          'GET /',
          'GET /api/trade/health',
          'GET /api/trade/account',
          'GET /api/trade/portfolio',
          'GET /api/trade/market/:symbol',
          'GET /api/trade/patterns',
          'POST /api/trade/parse',
          'POST /api/trade/validate',
          'POST /api/trade/execute',
          'POST /api/trade/trade'
        ]
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Server Error:', err);

      // Don't leak error details in production
      const isDevelopment = config.nodeEnv === 'development';
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString(),
        ...(isDevelopment && {
          details: err.message,
          stack: err.stack
        })
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Promise Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGINT', () => this.gracefulShutdown());
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Validate configuration
      this.validateConfiguration();

      // Start server
      this.app.listen(this.port, () => {
        console.log('');
        console.log('🚀 Optimized Trading Server Started');
        console.log('====================================');
        console.log(`📡 Server running on port ${this.port}`);
        console.log(`🌍 Environment: ${config.nodeEnv}`);
        console.log(`💱 Trading mode: ${config.alpacaBaseUrl.includes('paper') ? 'Paper Trading' : 'Live Trading'}`);
        console.log(`🏥 Health check: http://localhost:${this.port}/`);
        console.log(`📊 Trading API: http://localhost:${this.port}/api/trade/`);
        
        if (config.nodeEnv === 'development') {
          console.log('');
          console.log('🔧 Development Features:');
          console.log('   • Request logging enabled');
          console.log('   • Detailed error messages');
          console.log('   • CORS for localhost');
          console.log('');
          console.log('📖 Quick Start:');
          console.log('   • POST /api/trade/trade - Full trade pipeline');
          console.log('   • POST /api/trade/parse - Parse only');
          console.log('   • GET /api/trade/account - Account info');
          console.log('   • GET /api/trade/portfolio - Portfolio positions');
        }
        
        console.log('====================================');
        console.log('');
      });

      // Log performance stats periodically in development
      if (config.nodeEnv === 'development') {
        setInterval(() => {
          const stats = performanceMonitor.getStats();
          if (stats.count > 0) {
            console.log(`📈 Performance: ${stats.count} requests, avg ${stats.avgDuration}ms`);
          }
        }, 60000); // Every minute
      }

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Validate server configuration
   */
  private validateConfiguration(): void {
    const issues: string[] = [];

    // Check required environment variables
    if (!config.openaiApiKey) {
      issues.push('OpenAI API key is missing - AI parsing will not work');
    }

    if (!config.alpacaApiKey || !config.alpacaSecretKey) {
      issues.push('Alpaca API credentials are missing - Trading will not work');
    }

    // Warn about configuration issues
    if (issues.length > 0) {
      console.warn('');
      console.warn('⚠️  Configuration Issues:');
      issues.forEach(issue => console.warn(`   • ${issue}`));
      console.warn('');
      
      if (config.nodeEnv === 'production') {
        console.error('❌ Cannot start in production with missing configuration');
        process.exit(1);
      } else {
        console.warn('🔧 Continuing in development mode with limited functionality');
        console.warn('   Add your API keys to .env file for full features');
        console.warn('');
      }
    }

    // Validate port
    if (isNaN(this.port) || this.port < 1 || this.port > 65535) {
      throw new Error(`Invalid port number: ${this.port}`);
    }
  }

  /**
   * Graceful shutdown handler
   */
  private gracefulShutdown(): void {
    console.log('');
    console.log('🛑 Received shutdown signal, closing server gracefully...');
    
    // Close server and cleanup resources
    process.exit(0);
  }

  /**
   * Get the Express app instance
   */
  getApp(): express.Application {
    return this.app;
  }
}

// Create and start server if this file is run directly
if (require.main === module) {
  const server = new OptimizedTradingServer();
  server.start().catch(console.error);
}

export { OptimizedTradingServer };