// ============================================================================
// ROUTES - PRESENTATION LAYER
// ============================================================================

import { Router } from 'express';
import { TradingController } from '../controllers/TradingController';
import { 
  resolveTradeOrchestrator, 
  resolvePortfolioService,
  resolveBrokerAdapter,
  resolveLogger 
} from '../../infrastructure/di/Container';

const router = Router();

// Initialize controllers with dependencies
const logger = resolveLogger();
const tradeOrchestrator = resolveTradeOrchestrator();
const portfolioService = resolvePortfolioService();
const brokerAdapter = resolveBrokerAdapter();

const tradingController = new TradingController(
  tradeOrchestrator,
  portfolioService,
  logger
);

// ===== HEALTH CHECK ROUTES =====

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/health', async (req, res) => {
  try {
    const isMarketOpen = await brokerAdapter.isMarketOpen();
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        broker: 'connected',
        market: isMarketOpen ? 'open' : 'closed'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      timestamp: new Date().toISOString(),
      error: 'Broker connection issue'
    });
  }
});

/**
 * Detailed health check
 * GET /api/health/detailed
 */
router.get('/health/detailed', async (req, res) => {
  const healthChecks = {
    broker: false,
    llm: false,
    cache: false,
    eventBus: false
  };

  try {
    // Check broker connection
    await brokerAdapter.isMarketOpen();
    healthChecks.broker = true;
  } catch (error) {
    logger.warn('Broker health check failed', { error: error as Error });
  }

  // Add other health checks as needed...

  const isHealthy = Object.values(healthChecks).every(check => check);

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks: healthChecks
  });
});

// ===== TRADING ROUTES =====

/**
 * Execute a trade
 * POST /api/trades/execute
 * Body: { command: string }
 */
router.post('/trades/execute', (req, res) => tradingController.executeTrade(req, res));

/**
 * Preview a trade
 * POST /api/trades/preview
 * Body: { command: string }
 */
router.post('/trades/preview', (req, res) => tradingController.previewTrade(req, res));

/**
 * Cancel a trade
 * DELETE /api/trades/:tradeId
 */
router.delete('/trades/:tradeId', (req, res) => tradingController.cancelTrade(req, res));

// ===== PORTFOLIO ROUTES =====

/**
 * Get current portfolio
 * GET /api/portfolio
 */
router.get('/portfolio', (req, res) => tradingController.getPortfolio(req, res));

/**
 * Get portfolio performance metrics
 * GET /api/portfolio/performance?period=1M
 */
router.get('/portfolio/performance', (req, res) => tradingController.getPerformanceMetrics(req, res));

/**
 * Rebalance portfolio
 * POST /api/portfolio/rebalance
 * Body: { targets: PortfolioTarget[] }
 */
router.post('/portfolio/rebalance', (req, res) => tradingController.rebalancePortfolio(req, res));

// ===== POSITION ROUTES =====

/**
 * Get current positions
 * GET /api/positions
 */
router.get('/positions', (req, res) => tradingController.getPositions(req, res));

// ===== MARKET DATA ROUTES =====

/**
 * Get market data for a symbol
 * GET /api/market/:symbol
 */
router.get('/market/:symbol', async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  try {
    const { symbol } = req.params;
    
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol.toUpperCase())) {
      res.status(400).json({
        success: false,
        error: 'Valid symbol is required (1-5 uppercase letters)',
        code: 'INVALID_SYMBOL'
      });
      return;
    }

    logger.debug('Market data request received', { requestId, symbol });

    const marketData = await brokerAdapter.getMarketData(symbol.toUpperCase());

    res.json({
      success: true,
      marketData: {
        symbol: marketData.symbol,
        currentPrice: marketData.currentPrice,
        previousClose: marketData.previousClose,
        changeAmount: marketData.changeAmount,
        changePercent: marketData.changePercent,
        volume: marketData.volume,
        isMarketOpen: marketData.isMarketOpen,
        timestamp: marketData.timestamp
      }
    });

  } catch (error) {
    logger.error('Market data request failed', error as Error, { requestId });
    
    res.status(404).json({
      success: false,
      error: 'Market data not available',
      message: 'Unable to fetch market data for the requested symbol',
      requestId
    });
  }
});

/**
 * Get market status
 * GET /api/market/status
 */
router.get('/market/status', async (req, res) => {
  try {
    const isOpen = await brokerAdapter.isMarketOpen();
    
    res.json({
      success: true,
      market: {
        isOpen,
        status: isOpen ? 'open' : 'closed',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Market status request failed', error as Error);
    
    res.status(503).json({
      success: false,
      error: 'Unable to determine market status',
      message: 'Market status service is currently unavailable'
    });
  }
});

// ===== ACCOUNT ROUTES =====

/**
 * Get account information
 * GET /api/account
 */
router.get('/account', async (req, res) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  try {
    logger.debug('Account info request received', { requestId });

    const account = await brokerAdapter.getAccountInfo();

    res.json({
      success: true,
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        buyingPower: account.buyingPower,
        portfolioValue: account.portfolioValue,
        totalEquity: account.totalEquity,
        dayTradeCount: account.dayTradeCount,
        status: account.status,
        lastUpdated: account.lastUpdated
      }
    });

  } catch (error) {
    logger.error('Account info request failed', error as Error, { requestId });
    
    res.status(503).json({
      success: false,
      error: 'Account information unavailable',
      message: 'Unable to fetch account information from broker',
      requestId
    });
  }
});

// ===== LEGACY COMPATIBILITY ROUTES =====
// These maintain compatibility with existing frontend code

/**
 * Legacy command execute endpoint
 * POST /api/command/execute
 */
router.post('/command/execute', (req, res) => {
  // Transform legacy request format to new format
  const { command } = req.body;
  req.body = { command };
  
  tradingController.executeTrade(req, res);
});

/**
 * Legacy command parse endpoint  
 * POST /api/command/parse
 */
router.post('/command/parse', (req, res) => {
  // Transform legacy request format to new format
  const { command } = req.body;
  req.body = { command };
  
  tradingController.previewTrade(req, res);
});

// ===== ERROR HANDLING MIDDLEWARE =====

/**
 * Global error handler for routes
 */
router.use((error: any, req: any, res: any, next: any) => {
  logger.error('Unhandled route error', error, {
    path: req.path,
    method: req.method
  });

  if (res.headersSent) {
    return next(error);
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'An unexpected error occurred while processing your request'
  });
});

export { router as apiRoutes };