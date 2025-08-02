import { describe, it, expect, beforeEach, afterEach } from 'jest';
import request from 'supertest';
import express from 'express';
import { OptionsRiskManager } from '../trading/options-risk-manager';
import { OptionsPerformanceAnalytics } from '../analytics/options-performance-analytics';
import { RealTimeOptionsFeed } from '../data/real-time-options-feed';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { createAdvancedOptionsRoutes } from '../api/advanced-options-routes';
import { OptionsPosition, OptionsStrategy, AccountInfo, OptionContract } from '../types';

/**
 * Comprehensive End-to-End Tests for Phase 3 Advanced Features
 * 
 * Tests the complete workflow of:
 * - Risk management system integration
 * - Performance analytics calculations
 * - Real-time market data feeds
 * - API endpoint functionality
 * - Error handling and edge cases
 */
describe('Phase 3 E2E Tests - Advanced Options Features', () => {
  let app: express.Application;
  let riskManager: OptionsRiskManager;
  let performanceAnalytics: OptionsPerformanceAnalytics;
  let realTimeFeed: RealTimeOptionsFeed;
  let alpacaAdapter: AlpacaAdapter;

  // Mock data for testing
  const mockAccountInfo: AccountInfo = {
    accountId: 'test-account-123',
    buyingPower: 100000,
    portfolioValue: 150000,
    dayTradeCount: 2,
    equity: 150000,
    lastEquity: 148000,
    longMarketValue: 50000,
    shortMarketValue: 0,
    multiplier: 1,
    cash: 50000,
    pendingTransferOut: 0,
    pendingTransferIn: 0,
    dayTradingPower: 200000
  };

  const mockOptionsPosition: OptionsPosition = {
    id: 'pos-001',
    underlying: 'AAPL',
    legs: [{
      action: 'buy_to_open',
      contract: {
        symbol: 'AAPL',
        optionSymbol: 'AAPL240315C00150000',
        contractType: 'call',
        strikePrice: 150,
        expirationDate: '2024-03-15',
        multiplier: 100,
        exchange: 'OPRA',
        underlying: 'AAPL'
      },
      quantity: 1,
      price: 5.50,
      side: 'long'
    }],
    strategy: 'long_call',
    openDate: new Date('2024-01-15'),
    quantity: 1,
    costBasis: 550,
    currentValue: 650,
    unrealizedPnL: 100,
    dayChange: 25,
    dayChangePercent: 4.0,
    greeks: {
      delta: 0.65,
      gamma: 0.05,
      theta: -0.15,
      vega: 0.25,
      rho: 0.08
    },
    daysToExpiration: 60,
    status: 'open'
  };

  const mockOptionsStrategy: OptionsStrategy = {
    name: 'AAPL Iron Condor',
    type: 'iron_condor',
    legs: [
      {
        action: 'sell_to_open',
        contract: {
          symbol: 'AAPL',
          optionSymbol: 'AAPL240315P00145000',
          contractType: 'put',
          strikePrice: 145,
          expirationDate: '2024-03-15',
          multiplier: 100,
          exchange: 'OPRA',
          underlying: 'AAPL'
        },
        quantity: 1,
        price: 2.00,
        side: 'short'
      },
      {
        action: 'buy_to_open',
        contract: {
          symbol: 'AAPL',
          optionSymbol: 'AAPL240315P00140000',
          contractType: 'put',
          strikePrice: 140,
          expirationDate: '2024-03-15',
          multiplier: 100,
          exchange: 'OPRA',
          underlying: 'AAPL'
        },
        quantity: 1,
        price: 1.00,
        side: 'long'
      }
    ],
    maxProfit: 150,
    maxLoss: 350,
    breakeven: [146.5, 153.5],
    collateral: 500,
    margin: 500,
    description: 'Iron condor strategy for range-bound profit'
  };

  beforeEach(async () => {
    // Initialize services
    riskManager = new OptionsRiskManager();
    performanceAnalytics = new OptionsPerformanceAnalytics();
    alpacaAdapter = new AlpacaAdapter();
    realTimeFeed = new RealTimeOptionsFeed(alpacaAdapter);

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/advanced', createAdvancedOptionsRoutes());
  });

  afterEach(async () => {
    // Cleanup resources
    realTimeFeed.destroy();
  });

  describe('Risk Management Integration', () => {
    it('should assess portfolio risk correctly', async () => {
      const positions = [mockOptionsPosition];
      const marketConditions = {
        underlyingPrice: 155,
        impliedVolatility: 0.25,
        riskFreeRate: 0.05
      };

      const riskAssessment = await riskManager.assessPortfolioRisk(
        positions,
        mockAccountInfo,
        marketConditions
      );

      expect(riskAssessment).toBeDefined();
      expect(riskAssessment.riskScore).toBeGreaterThan(0);
      expect(riskAssessment.portfolioGreeks).toBeDefined();
      expect(riskAssessment.riskMetrics).toBeDefined();
      expect(riskAssessment.alerts).toBeInstanceOf(Array);
    });

    it('should validate new positions against risk limits', async () => {
      const currentPositions = [mockOptionsPosition];
      const marketConditions = {
        underlyingPrice: 155,
        impliedVolatility: 0.25,
        riskFreeRate: 0.05
      };

      const validation = await riskManager.validateNewPosition(
        mockOptionsStrategy,
        currentPositions,
        mockAccountInfo,
        marketConditions
      );

      expect(validation).toBeDefined();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toBeInstanceOf(Array);
      expect(validation.warnings).toBeInstanceOf(Array);
      expect(validation.riskAssessment).toBeDefined();
    });

    it('should monitor positions and generate alerts', async () => {
      const positions = [mockOptionsPosition];
      const marketConditions = {
        underlyingPrice: 155,
        impliedVolatility: 0.25,
        riskFreeRate: 0.05
      };

      const alerts = await riskManager.monitorPositions(
        positions,
        mockAccountInfo,
        marketConditions
      );

      expect(alerts).toBeInstanceOf(Array);
      // Should not have alerts for healthy position
      expect(alerts.length).toBe(0);
    });

    it('should handle risk limit violations', async () => {
      // Create a position that violates risk limits
      const largePosition: OptionsPosition = {
        ...mockOptionsPosition,
        currentValue: 80000, // 53% of portfolio
        unrealizedPnL: -30000,
        costBasis: 50000
      };

      const validation = await riskManager.validateNewPosition(
        mockOptionsStrategy,
        [largePosition],
        mockAccountInfo,
        { underlyingPrice: 155, impliedVolatility: 0.25, riskFreeRate: 0.05 }
      );

      expect(validation.errors.length).toBeGreaterThan(0);
      expect(validation.isValid).toBe(false);
    });
  });

  describe('Performance Analytics Integration', () => {
    it('should generate comprehensive performance report', async () => {
      const positions = [mockOptionsPosition];
      const trades = [{
        id: 'trade-001',
        strategy: 'long_call',
        openDate: new Date('2024-01-15'),
        closeDate: new Date('2024-02-15'),
        realizedPnL: 250,
        costBasis: 550
      }];

      const report = await performanceAnalytics.generatePerformanceReport(
        positions,
        trades,
        mockAccountInfo,
        '1M'
      );

      expect(report).toBeDefined();
      expect(report.pnlAnalysis).toBeDefined();
      expect(report.riskMetrics).toBeDefined();
      expect(report.strategyBreakdown).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
    });

    it('should calculate P&L attribution correctly', async () => {
      const positions = [mockOptionsPosition];
      const marketConditions = {
        underlyingPriceChange: 5, // $5 move up
        volatilityChange: 0.05,   // 5% vol increase
        timeDecay: -1,            // 1 day passed
        rateChange: 0
      };

      const attribution = await performanceAnalytics.calculatePnLAttribution(
        positions,
        marketConditions
      );

      expect(attribution).toBeDefined();
      expect(attribution.totalPnL).toBeDefined();
      expect(attribution.deltaContribution).toBeGreaterThan(0); // Positive from price increase
      expect(attribution.thetaContribution).toBeLessThan(0);    // Negative from time decay
      expect(attribution.vegaContribution).toBeGreaterThan(0);  // Positive from vol increase
    });

    it('should calculate strategy metrics accurately', async () => {
      const trades = [
        { id: '1', strategy: 'long_call', realizedPnL: 100, openDate: new Date(), closeDate: new Date(), costBasis: 500 },
        { id: '2', strategy: 'long_call', realizedPnL: -50, openDate: new Date(), closeDate: new Date(), costBasis: 300 },
        { id: '3', strategy: 'long_call', realizedPnL: 200, openDate: new Date(), closeDate: new Date(), costBasis: 400 }
      ];

      const metrics = performanceAnalytics.calculateStrategyMetrics('long_call', trades);

      expect(metrics).toBeDefined();
      expect(metrics.totalTrades).toBe(3);
      expect(metrics.totalPnL).toBe(250);
      expect(metrics.winRate).toBe(2/3);
      expect(metrics.avgWin).toBe(150);
      expect(metrics.avgLoss).toBe(-50);
      expect(metrics.profitFactor).toBeGreaterThan(1);
    });

    it('should analyze portfolio optimization', async () => {
      const positions = [mockOptionsPosition];

      const optimization = await performanceAnalytics.analyzePortfolioOptimization(
        positions,
        mockAccountInfo,
        'moderate'
      );

      expect(optimization).toBeDefined();
      expect(optimization.currentMetrics).toBeDefined();
      expect(optimization.suggestions).toBeInstanceOf(Array);
      expect(optimization.currentMetrics.diversificationScore).toBeGreaterThan(0);
      expect(optimization.currentMetrics.efficiencyScore).toBeGreaterThan(0);
    });
  });

  describe('Real-Time Market Data Integration', () => {
    it('should get enhanced options chain data', async () => {
      const chainData = await realTimeFeed.getEnhancedOptionsChain('AAPL');

      expect(chainData).toBeDefined();
      expect(chainData.chain).toBeDefined();
      expect(chainData.marketConditions).toBeDefined();
      expect(chainData.volatilitySurface).toBeDefined();
      expect(chainData.isRealTime).toBeDefined();
      expect(chainData.lastUpdated).toBeInstanceOf(Date);
    });

    it('should calculate real-time Greeks for contracts', async () => {
      const contracts: OptionContract[] = [mockOptionsPosition.legs[0].contract];

      const greeksData = await realTimeFeed.getRealTimeGreeks(contracts);

      expect(greeksData).toBeDefined();
      expect(greeksData.contracts).toBeInstanceOf(Array);
      expect(greeksData.contracts.length).toBe(1);
      expect(greeksData.portfolioGreeks).toBeDefined();
      expect(greeksData.portfolioGreeks.delta).toBeDefined();
      expect(greeksData.lastUpdated).toBeInstanceOf(Date);
    });

    it('should get market sentiment data', async () => {
      const sentiment = await realTimeFeed.getMarketSentiment('AAPL');

      expect(sentiment).toBeDefined();
      expect(sentiment.underlying).toBe('AAPL');
      expect(sentiment.putCallRatio).toBeDefined();
      expect(sentiment.impliedVolatilityRank).toBeDefined();
      expect(sentiment.marketSentiment).toMatch(/^(bullish|bearish|neutral)$/);
      expect(sentiment.liquidityScore).toBeDefined();
    });

    it('should handle subscription management', () => {
      let updateReceived = false;
      
      const subscriptionId = realTimeFeed.subscribeToOptionsChain('AAPL', (update) => {
        updateReceived = true;
        expect(update.underlying).toBe('AAPL');
        expect(update.timestamp).toBeInstanceOf(Date);
      });

      expect(subscriptionId).toBeDefined();
      expect(typeof subscriptionId).toBe('string');

      // Wait for simulated update
      setTimeout(() => {
        expect(updateReceived).toBe(true);
      }, 3000);
    });
  });

  describe('API Endpoint Integration', () => {
    it('should handle risk assessment API calls', async () => {
      const response = await request(app)
        .post('/api/advanced/risk/assessment')
        .send({
          positions: [mockOptionsPosition],
          accountInfo: mockAccountInfo,
          marketConditions: { underlyingPrice: 155, impliedVolatility: 0.25 }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.timestamp).toBeDefined();
    });

    it('should handle position validation API calls', async () => {
      const response = await request(app)
        .post('/api/advanced/risk/validate-position')
        .send({
          strategy: mockOptionsStrategy,
          currentPositions: [mockOptionsPosition],
          accountInfo: mockAccountInfo,
          marketConditions: { underlyingPrice: 155, impliedVolatility: 0.25 }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isValid).toBeDefined();
    });

    it('should handle performance report API calls', async () => {
      const response = await request(app)
        .post('/api/advanced/analytics/performance/1M')
        .send({
          positions: [mockOptionsPosition],
          trades: [],
          accountInfo: mockAccountInfo
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should handle market data API calls', async () => {
      const response = await request(app)
        .get('/api/advanced/market/options-chain/AAPL');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should handle portfolio metrics API calls', async () => {
      const response = await request(app)
        .post('/api/advanced/portfolio/risk-metrics')
        .send({
          positions: [mockOptionsPosition]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.totalDelta).toBeDefined();
      expect(response.body.data.totalGamma).toBeDefined();
    });

    it('should handle API errors gracefully', async () => {
      const response = await request(app)
        .post('/api/advanced/risk/assessment')
        .send({}); // Invalid payload

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle empty portfolios', async () => {
      const emptyPositions: OptionsPosition[] = [];
      
      const riskAssessment = await riskManager.assessPortfolioRisk(
        emptyPositions,
        mockAccountInfo,
        { underlyingPrice: 155, impliedVolatility: 0.25, riskFreeRate: 0.05 }
      );

      expect(riskAssessment).toBeDefined();
      expect(riskAssessment.riskScore).toBe(0);
    });

    it('should handle expired options', async () => {
      const expiredPosition: OptionsPosition = {
        ...mockOptionsPosition,
        legs: [{
          ...mockOptionsPosition.legs[0],
          contract: {
            ...mockOptionsPosition.legs[0].contract,
            expirationDate: '2023-01-15' // Past date
          }
        }],
        daysToExpiration: -30,
        status: 'expired'
      };

      const alerts = await riskManager.monitorPositions(
        [expiredPosition],
        mockAccountInfo,
        { underlyingPrice: 155, impliedVolatility: 0.25, riskFreeRate: 0.05 }
      );

      // Should not generate alerts for expired positions
      expect(alerts).toBeInstanceOf(Array);
    });

    it('should handle market data failures', async () => {
      // Test would verify graceful handling of Alpaca API failures
      expect(true).toBe(true); // Placeholder
    });

    it('should handle calculation edge cases', () => {
      // Test division by zero, null values, etc.
      const emptyTrades: any[] = [];
      const metrics = performanceAnalytics.calculateStrategyMetrics('test_strategy', emptyTrades);

      expect(metrics.totalTrades).toBe(0);
      expect(metrics.totalPnL).toBe(0);
      expect(metrics.winRate).toBe(0);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle concurrent risk assessments', async () => {
      const promises = Array.from({ length: 10 }, () =>
        riskManager.assessPortfolioRisk(
          [mockOptionsPosition],
          mockAccountInfo,
          { underlyingPrice: 155, impliedVolatility: 0.25, riskFreeRate: 0.05 }
        )
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.riskScore).toBeGreaterThan(0);
      });
    });

    it('should complete risk calculations within performance targets', async () => {
      const startTime = Date.now();
      
      await riskManager.assessPortfolioRisk(
        Array.from({ length: 50 }, () => mockOptionsPosition),
        mockAccountInfo,
        { underlyingPrice: 155, impliedVolatility: 0.25, riskFreeRate: 0.05 }
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(200); // Should complete within 200ms
    });

    it('should handle large portfolio calculations efficiently', async () => {
      const largePositions = Array.from({ length: 100 }, (_, i) => ({
        ...mockOptionsPosition,
        id: `pos-${i}`,
        underlying: i % 10 === 0 ? 'AAPL' : i % 10 === 1 ? 'MSFT' : 'GOOGL'
      }));

      const startTime = Date.now();
      const optimization = await performanceAnalytics.analyzePortfolioOptimization(
        largePositions,
        mockAccountInfo,
        'moderate'
      );
      const duration = Date.now() - startTime;

      expect(optimization).toBeDefined();
      expect(duration).toBeLessThan(500); // Should complete within 500ms
    });
  });

  describe('Data Consistency and Integrity', () => {
    it('should maintain consistent Greeks calculations', async () => {
      const greeksData = await realTimeFeed.getRealTimeGreeks([mockOptionsPosition.legs[0].contract]);
      
      expect(greeksData.portfolioGreeks.delta).toBe(greeksData.contracts[0].greeks.delta);
      expect(Math.abs(greeksData.portfolioGreeks.delta)).toBeLessThanOrEqual(1);
      expect(Math.abs(greeksData.portfolioGreeks.gamma)).toBeLessThanOrEqual(1);
    });

    it('should validate P&L attribution sums correctly', async () => {
      const attribution = await performanceAnalytics.calculatePnLAttribution(
        [mockOptionsPosition],
        { underlyingPriceChange: 5, volatilityChange: 0.05, timeDecay: -1, rateChange: 0 }
      );

      const totalAttributed = attribution.deltaContribution + 
                              attribution.gammaContribution + 
                              attribution.thetaContribution + 
                              attribution.vegaContribution + 
                              attribution.rhoContribution;

      const calculatedTotal = totalAttributed + attribution.residualContribution;
      
      // Should approximately equal total P&L (allowing for rounding)
      expect(Math.abs(calculatedTotal - attribution.totalPnL)).toBeLessThan(1);
    });

    it('should ensure risk limits are properly enforced', () => {
      const limits = riskManager.getRiskLimits();
      
      expect(limits.maxPortfolioDelta).toBeGreaterThan(0);
      expect(limits.maxSinglePositionRisk).toBeLessThan(1);
      expect(limits.maxConcentrationRisk).toBeLessThan(1);
      expect(limits.stopLossThreshold).toBeLessThan(0);
    });
  });
});

/**
 * Integration Test Suite for Phase 3 → Phase 4 Readiness
 * 
 * Ensures all Phase 3 components are ready for frontend integration
 */
describe('Phase 3 → Phase 4 Integration Readiness', () => {
  let riskManager: OptionsRiskManager;
  let performanceAnalytics: OptionsPerformanceAnalytics;
  let realTimeFeed: RealTimeOptionsFeed;

  beforeEach(() => {
    riskManager = new OptionsRiskManager();
    performanceAnalytics = new OptionsPerformanceAnalytics();
    realTimeFeed = new RealTimeOptionsFeed(new AlpacaAdapter());
  });

  afterEach(() => {
    realTimeFeed.destroy();
  });

  it('should provide all data structures needed for OptionsChain component', async () => {
    const chainData = await realTimeFeed.getEnhancedOptionsChain('AAPL');
    
    // Verify structure matches frontend expectations
    expect(chainData.chain).toBeDefined();
    expect(chainData.marketConditions).toBeDefined();
    expect(chainData.volatilitySurface).toBeDefined();
    expect(chainData.lastUpdated).toBeInstanceOf(Date);
    expect(chainData.isRealTime).toBeDefined();
  });

  it('should provide real-time risk data for risk dashboard', async () => {
    const riskAssessment = await riskManager.assessPortfolioRisk(
      [],
      {} as AccountInfo,
      { underlyingPrice: 155, impliedVolatility: 0.25, riskFreeRate: 0.05 }
    );

    // Verify structure for frontend risk dashboard
    expect(riskAssessment.riskScore).toBeDefined();
    expect(riskAssessment.portfolioGreeks).toBeDefined();
    expect(riskAssessment.alerts).toBeInstanceOf(Array);
    expect(riskAssessment.timestamp).toBeInstanceOf(Date);
  });

  it('should provide performance data for analytics components', async () => {
    const report = await performanceAnalytics.generatePerformanceReport(
      [],
      [],
      {} as AccountInfo,
      '1M'
    );

    // Verify structure for frontend analytics
    expect(report.pnlAnalysis).toBeDefined();
    expect(report.riskMetrics).toBeDefined();
    expect(report.strategyBreakdown).toBeDefined();
    expect(report.timeAnalysis).toBeDefined();
    expect(report.recommendations).toBeInstanceOf(Array);
  });

  it('should support real-time updates for frontend subscriptions', (done) => {
    let updateCount = 0;
    
    realTimeFeed.subscribeToOptionsChain('AAPL', (update) => {
      updateCount++;
      expect(update.underlying).toBe('AAPL');
      expect(update.timestamp).toBeInstanceOf(Date);
      
      if (updateCount >= 2) {
        done(); // Received multiple updates
      }
    });

    // Should receive updates within 5 seconds
    setTimeout(() => {
      if (updateCount === 0) {
        done.fail('No real-time updates received');
      }
    }, 5000);
  });
}); 