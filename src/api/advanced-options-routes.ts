import express from 'express';
import { OptionsRiskManager, PortfolioRiskAssessment, RiskAlert } from '../trading/options-risk-manager';
import { OptionsPerformanceAnalytics, PerformanceReport } from '../analytics/options-performance-analytics';
import { RealTimeOptionsFeed, EnhancedOptionsChainData, MarketSentimentData } from '../data/real-time-options-feed';
import { PortfolioRiskMonitoringService } from '../services/portfolio-risk-monitoring-service';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { OptionsStrategy, OptionsPosition, AccountInfo } from '../types';

/**
 * Advanced Options API Routes for Phase 3
 * 
 * Provides comprehensive endpoints for:
 * - Risk management and monitoring
 * - Performance analytics and reporting  
 * - Real-time market data and sentiment
 * - Portfolio optimization
 */
export class AdvancedOptionsRoutes {
  private router: express.Router;
  private riskManager!: OptionsRiskManager;
  private performanceAnalytics!: OptionsPerformanceAnalytics;
  private realTimeFeed!: RealTimeOptionsFeed;
  private riskMonitoringService?: PortfolioRiskMonitoringService;
  
  constructor() {
    this.router = express.Router();
    this.initializeServices();
    this.setupRoutes();
  }

  private initializeServices(): void {
    this.riskManager = new OptionsRiskManager();
    this.performanceAnalytics = new OptionsPerformanceAnalytics();
    
    const alpacaAdapter = new AlpacaAdapter();
    this.realTimeFeed = new RealTimeOptionsFeed(alpacaAdapter);
    
    // Initialize risk monitoring service (would be dependency injected in production)
    // this.riskMonitoringService = new PortfolioRiskMonitoringService(...);
  }

  private setupRoutes(): void {
    // Risk Management Routes
    this.router.get('/risk/assessment', this.getRiskAssessment.bind(this));
    this.router.post('/risk/validate-position', this.validateNewPosition.bind(this));
    this.router.get('/risk/alerts', this.getRiskAlerts.bind(this));
    this.router.put('/risk/limits', this.updateRiskLimits.bind(this));
    this.router.get('/risk/dashboard', this.getRiskDashboard.bind(this));

    // Performance Analytics Routes
    this.router.get('/analytics/performance/:period', this.getPerformanceReport.bind(this));
    this.router.get('/analytics/pnl-attribution', this.getPnLAttribution.bind(this));
    this.router.get('/analytics/strategy-metrics', this.getStrategyMetrics.bind(this));
    this.router.get('/analytics/optimization', this.getPortfolioOptimization.bind(this));

    // Market Data Routes
    this.router.get('/market/options-chain/:symbol', this.getEnhancedOptionsChain.bind(this));
    this.router.get('/market/sentiment/:symbol', this.getMarketSentiment.bind(this));
    this.router.get('/market/greeks', this.getRealTimeGreeks.bind(this));
    // WebSocket route would be handled separately in a WebSocket server
    // this.router.ws('/market/stream/:symbol', this.streamMarketData.bind(this));

    // Portfolio Routes
    this.router.get('/portfolio/risk-metrics', this.getPortfolioRiskMetrics.bind(this));
    this.router.get('/portfolio/exposure', this.getPortfolioExposure.bind(this));
    this.router.get('/portfolio/correlations', this.getPortfolioCorrelations.bind(this));
  }

  // Risk Management Endpoints
  private async getRiskAssessment(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { positions, accountInfo, marketConditions } = req.body;
      
      const riskAssessment = await this.riskManager.assessPortfolioRisk(
        positions,
        accountInfo,
        marketConditions
      );

      res.json({
        success: true,
        data: riskAssessment,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Risk assessment failed'
      });
    }
  }

  private async validateNewPosition(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { strategy, currentPositions, accountInfo, marketConditions } = req.body;
      
      const validation = await this.riskManager.validateNewPosition(
        strategy,
        currentPositions,
        accountInfo,
        marketConditions
      );

      res.json({
        success: true,
        data: validation,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Position validation failed'
      });
    }
  }

  private async getRiskAlerts(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { positions, accountInfo, marketConditions } = req.query;
      
      const alerts = await this.riskManager.monitorPositions(
        JSON.parse(positions as string),
        JSON.parse(accountInfo as string),
        JSON.parse(marketConditions as string)
      );

      res.json({
        success: true,
        data: alerts,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get risk alerts'
      });
    }
  }

  private async updateRiskLimits(req: express.Request, res: express.Response): Promise<void> {
    try {
      const newLimits = req.body;
      
      this.riskManager.updateRiskLimits(newLimits);

      res.json({
        success: true,
        message: 'Risk limits updated successfully',
        data: this.riskManager.getRiskLimits()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update risk limits'
      });
    }
  }

  private async getRiskDashboard(req: express.Request, res: express.Response): Promise<void> {
    try {
      // This would integrate with the risk monitoring service
      const dashboardData = {
        riskScore: 45,
        riskLevel: 'Medium',
        portfolioGreeks: { delta: 25, gamma: 5, theta: -100, vega: 200, rho: 10 },
        alerts: [],
        lastUpdated: new Date()
      };

      res.json({
        success: true,
        data: dashboardData,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get risk dashboard'
      });
    }
  }

  // Performance Analytics Endpoints
  private async getPerformanceReport(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { period } = req.params;
      const { positions, trades, accountInfo } = req.body;
      
      const report = await this.performanceAnalytics.generatePerformanceReport(
        positions,
        trades,
        accountInfo,
        period as any
      );

      res.json({
        success: true,
        data: report,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate performance report'
      });
    }
  }

  private async getPnLAttribution(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { positions, marketConditions } = req.body;
      
      const attribution = await this.performanceAnalytics.calculatePnLAttribution(
        positions,
        marketConditions
      );

      res.json({
        success: true,
        data: attribution,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate P&L attribution'
      });
    }
  }

  private async getStrategyMetrics(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { strategy, trades } = req.query;
      
      const metrics = this.performanceAnalytics.calculateStrategyMetrics(
        strategy as string,
        JSON.parse(trades as string)
      );

      res.json({
        success: true,
        data: metrics,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate strategy metrics'
      });
    }
  }

  private async getPortfolioOptimization(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { positions, accountInfo, riskTolerance } = req.body;
      
      const optimization = await this.performanceAnalytics.analyzePortfolioOptimization(
        positions,
        accountInfo,
        riskTolerance
      );

      res.json({
        success: true,
        data: optimization,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze portfolio optimization'
      });
    }
  }

  // Market Data Endpoints
  private async getEnhancedOptionsChain(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { symbol } = req.params;
      const { expirationDate } = req.query;
      
      const chainData = await this.realTimeFeed.getEnhancedOptionsChain(
        symbol,
        expirationDate as string
      );

      res.json({
        success: true,
        data: chainData,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get options chain'
      });
    }
  }

  private async getMarketSentiment(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { symbol } = req.params;
      
      const sentiment = await this.realTimeFeed.getMarketSentiment(symbol);

      res.json({
        success: true,
        data: sentiment,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get market sentiment'
      });
    }
  }

  private async getRealTimeGreeks(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { contracts } = req.body;
      
      const greeksData = await this.realTimeFeed.getRealTimeGreeks(contracts);

      res.json({
        success: true,
        data: greeksData,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get real-time Greeks'
      });
    }
  }

  private streamMarketData(ws: any, req: express.Request): void {
    const { symbol } = req.params;
    
    // Subscribe to real-time updates
    const subscriptionId = this.realTimeFeed.subscribeToOptionsChain(symbol, (update) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          type: 'market_update',
          data: update,
          timestamp: new Date()
        }));
      }
    });

    // Handle WebSocket close
    ws.on('close', () => {
      // Cleanup subscription
      console.log(`WebSocket closed for ${symbol}`);
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });
  }

  // Portfolio Endpoints
  private async getPortfolioRiskMetrics(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { positions } = req.body;
      
      // Calculate comprehensive portfolio risk metrics
      const riskMetrics = {
        totalDelta: positions.reduce((sum: number, pos: any) => sum + pos.greeks.delta * pos.quantity, 0),
        totalGamma: positions.reduce((sum: number, pos: any) => sum + pos.greeks.gamma * pos.quantity, 0),
        totalTheta: positions.reduce((sum: number, pos: any) => sum + pos.greeks.theta * pos.quantity, 0),
        totalVega: positions.reduce((sum: number, pos: any) => sum + pos.greeks.vega * pos.quantity, 0),
        valueAtRisk: 10000, // Would be calculated properly
        maxDrawdown: 0.15,
        sharpeRatio: 1.5
      };

      res.json({
        success: true,
        data: riskMetrics,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get portfolio risk metrics'
      });
    }
  }

  private async getPortfolioExposure(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { positions } = req.body;
      
      // Calculate exposure by underlying
      const exposureMap = new Map<string, number>();
      positions.forEach((pos: any) => {
        const exposure = Math.abs(pos.currentValue);
        exposureMap.set(pos.underlying, (exposureMap.get(pos.underlying) || 0) + exposure);
      });

      const exposureData = {
        byUnderlying: Object.fromEntries(exposureMap),
        topExposures: Array.from(exposureMap.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5),
        totalExposure: Array.from(exposureMap.values()).reduce((sum, exp) => sum + exp, 0)
      };

      res.json({
        success: true,
        data: exposureData,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get portfolio exposure'
      });
    }
  }

  private async getPortfolioCorrelations(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { positions } = req.body;
      
      // Simplified correlation calculation
      const correlations = {
        'AAPL-MSFT': 0.65,
        'AAPL-GOOGL': 0.72,
        'MSFT-GOOGL': 0.68,
        averageCorrelation: 0.68,
        diversificationBenefit: 0.32
      };

      res.json({
        success: true,
        data: correlations,
        timestamp: new Date()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get portfolio correlations'
      });
    }
  }

  /**
   * Get the Express router with all routes configured
   */
  getRouter(): express.Router {
    return this.router;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.realTimeFeed.destroy();
  }
}

// Export the router factory
export function createAdvancedOptionsRoutes(): express.Router {
  const routes = new AdvancedOptionsRoutes();
  return routes.getRouter();
} 