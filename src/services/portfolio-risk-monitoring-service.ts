import { 
  OptionsRiskManager, 
  RiskAlert,
  PortfolioRiskAssessment,
  MarketConditions,
  PositionValidation
} from '../trading/options-risk-manager';
import { PortfolioService } from '../application/services/PortfolioService';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { OptionsMarketDataService } from '../market-data/options-market-data-service';
import { 
  OptionsPosition, 
  OptionsStrategy, 
  AccountInfo,
  MarketData
} from '../types';

/**
 * Portfolio Risk Monitoring Service
 * 
 * Integrates Options Risk Manager with live portfolio monitoring to provide:
 * - Real-time risk assessment and alerts
 * - Continuous portfolio monitoring
 * - Automated risk limit enforcement
 * - Portfolio-wide risk metrics and visualization
 * - Integration with existing PortfolioService
 */
export class PortfolioRiskMonitoringService {
  private riskManager: OptionsRiskManager;
  private portfolioService: PortfolioService;
  private broker: AlpacaAdapter;
  private marketDataService: OptionsMarketDataService;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private alertSubscribers: ((alert: RiskAlert) => void)[] = [];
  private riskAssessmentCache: PortfolioRiskAssessment | null = null;
  private lastUpdateTime: Date | null = null;

  constructor(
    riskManager: OptionsRiskManager,
    portfolioService: PortfolioService,
    broker: AlpacaAdapter,
    marketDataService: OptionsMarketDataService
  ) {
    this.riskManager = riskManager;
    this.portfolioService = portfolioService;
    this.broker = broker;
    this.marketDataService = marketDataService;
  }

  /**
   * Start continuous portfolio risk monitoring
   */
  async startMonitoring(intervalMinutes: number = 1): Promise<void> {
    if (this.isMonitoring) {
      console.log('⚠️ Portfolio risk monitoring already active');
      return;
    }

    console.log(`🚀 Starting portfolio risk monitoring (${intervalMinutes}min intervals)`);
    this.isMonitoring = true;

    // Perform initial assessment
    await this.performRiskAssessment();

    // Set up continuous monitoring
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performRiskAssessment();
      } catch (error) {
        console.error('❌ Error during risk assessment:', error);
        this.notifyAlert({
          type: 'error',
          category: 'margin',
          message: `Risk monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: 'high',
          timestamp: new Date()
        });
      }
    }, intervalMinutes * 60 * 1000);

    console.log('✅ Portfolio risk monitoring started successfully');
  }

  /**
   * Stop continuous portfolio risk monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    console.log('🛑 Portfolio risk monitoring stopped');
  }

  /**
   * Perform comprehensive risk assessment of current portfolio
   */
  async performRiskAssessment(): Promise<PortfolioRiskAssessment> {
    try {
      // Get current portfolio data
      const [portfolio, accountInfo, optionsPositions] = await Promise.all([
        this.portfolioService.getPortfolio(),
        this.broker.getAccountInfo(),
        this.getOptionsPositions()
      ]);

      // Get market conditions for all underlying assets
      const underlyingAssets = this.extractUnderlyingAssets(optionsPositions);
      const marketConditions = await this.getAggregatedMarketConditions(underlyingAssets);

      // Perform comprehensive risk assessment
      const riskAssessment = await this.riskManager.assessPortfolioRisk(
        optionsPositions,
        accountInfo,
        marketConditions
      );

      // Update cache
      this.riskAssessmentCache = riskAssessment;
      this.lastUpdateTime = new Date();

      // Process alerts
      await this.processAlerts(riskAssessment.alerts);

      // Log assessment summary
      this.logRiskAssessmentSummary(riskAssessment);

      return riskAssessment;

    } catch (error) {
      console.error('❌ Failed to perform risk assessment:', error);
      throw new Error(`Risk assessment failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate new options strategy before execution
   */
  async validateStrategyRisk(strategy: OptionsStrategy): Promise<PositionValidation> {
    try {
      const [accountInfo, currentPositions] = await Promise.all([
        this.broker.getAccountInfo(),
        this.getOptionsPositions()
      ]);

      // Get market conditions for the strategy's underlying
      const underlying = strategy.legs[0]?.contract.underlying;
      if (!underlying) {
        throw new Error('Strategy must have at least one leg with underlying asset');
      }

      const marketConditions = await this.getMarketConditions(underlying);

      // Validate against risk limits
      const validation = await this.riskManager.validateNewPosition(
        strategy,
        currentPositions,
        accountInfo,
        marketConditions
      );

      // Log validation result
      if (!validation.isValid) {
        console.warn('⚠️ Strategy validation failed:', {
          strategy: strategy.name,
          errors: validation.errors,
          warnings: validation.warnings
        });
      } else {
        console.log('✅ Strategy validation passed:', {
          strategy: strategy.name,
          riskPercentage: `${(validation.riskAssessment.positionRisk * 100).toFixed(2)}%`
        });
      }

      return validation;

    } catch (error) {
      console.error('❌ Strategy validation error:', error);
      throw new Error(`Strategy validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current portfolio risk metrics
   */
  async getCurrentRiskMetrics(): Promise<PortfolioRiskAssessment | null> {
    // Return cached assessment if recent (within 5 minutes)
    if (this.riskAssessmentCache && this.lastUpdateTime) {
      const ageMinutes = (Date.now() - this.lastUpdateTime.getTime()) / (1000 * 60);
      if (ageMinutes < 5) {
        return this.riskAssessmentCache;
      }
    }

    // Perform fresh assessment
    return await this.performRiskAssessment();
  }

  /**
   * Subscribe to risk alerts
   */
  subscribeToAlerts(callback: (alert: RiskAlert) => void): () => void {
    this.alertSubscribers.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.alertSubscribers.indexOf(callback);
      if (index > -1) {
        this.alertSubscribers.splice(index, 1);
      }
    };
  }

  /**
   * Get portfolio risk dashboard data
   */
  async getRiskDashboardData(): Promise<RiskDashboardData> {
    const riskAssessment = await this.getCurrentRiskMetrics();
    if (!riskAssessment) {
      throw new Error('No risk assessment available');
    }

    const portfolio = await this.portfolioService.getPortfolio();
    
    return {
      riskScore: riskAssessment.riskScore,
      riskLevel: this.getRiskLevel(riskAssessment.riskScore),
      portfolioGreeks: riskAssessment.portfolioGreeks,
      riskMetrics: riskAssessment.riskMetrics,
      alerts: riskAssessment.alerts,
      concentrationRisk: riskAssessment.concentrationRisk,
      marginAnalysis: riskAssessment.marginAnalysis,
      stressTestResults: riskAssessment.stressTestResults,
      portfolioValue: portfolio.totalValue,
      optionsExposure: this.calculateOptionsExposure(portfolio),
      lastUpdated: riskAssessment.timestamp
    };
  }

  /**
   * Get risk alerts for frontend consumption
   */
  async getActiveAlerts(): Promise<RiskAlert[]> {
    const riskAssessment = await this.getCurrentRiskMetrics();
    return riskAssessment?.alerts || [];
  }

  /**
   * Force refresh of all risk data
   */
  async refreshRiskData(): Promise<void> {
    console.log('🔄 Forcing risk data refresh...');
    this.riskAssessmentCache = null;
    await this.performRiskAssessment();
    console.log('✅ Risk data refresh completed');
  }

  /**
   * Get risk monitoring status
   */
  getMonitoringStatus(): MonitoringStatus {
    return {
      isActive: this.isMonitoring,
      lastUpdate: this.lastUpdateTime,
      subscriberCount: this.alertSubscribers.length,
      riskScore: this.riskAssessmentCache?.riskScore || null,
      alertCount: this.riskAssessmentCache?.alerts.length || 0
    };
  }

  // Private helper methods

  /**
   * Extract options positions from portfolio
   */
  private async getOptionsPositions(): Promise<OptionsPosition[]> {
    try {
      const optionsPositions = await this.broker.getOptionsPositions();
      return optionsPositions;
    } catch (error) {
      console.warn('⚠️ Failed to get options positions, using empty array:', error);
      return [];
    }
  }

  /**
   * Extract unique underlying assets from options positions
   */
  private extractUnderlyingAssets(positions: OptionsPosition[]): string[] {
    const underlyings = new Set<string>();
    
    for (const position of positions) {
      if (position.underlying) {
        underlyings.add(position.underlying);
      }
      // Also check legs for underlying assets
      for (const leg of position.legs) {
        if (leg.contract.underlying) {
          underlyings.add(leg.contract.underlying);
        }
      }
    }
    
    return Array.from(underlyings);
  }

  /**
   * Get market conditions for a specific underlying
   */
  private async getMarketConditions(underlying: string): Promise<MarketConditions> {
    try {
      const marketData = await this.broker.getMarketData(underlying);
      const optionsData = await this.marketDataService.getOptionsMarketData(underlying);
      
      return {
        underlyingPrice: marketData.price,
        impliedVolatility: optionsData.impliedVolatility || 0.25,
        riskFreeRate: 0.05, // 5% default risk-free rate
        marketTrend: this.determineMarketTrend(marketData),
        volatilityRank: optionsData.volatilityRank || 50
      };
    } catch (error) {
      console.warn(`⚠️ Failed to get market conditions for ${underlying}, using defaults:`, error);
      return {
        underlyingPrice: 100, // Default price
        impliedVolatility: 0.25,
        riskFreeRate: 0.05,
        marketTrend: 'neutral'
      };
    }
  }

  /**
   * Get aggregated market conditions for multiple underlyings
   */
  private async getAggregatedMarketConditions(underlyings: string[]): Promise<MarketConditions> {
    if (underlyings.length === 0) {
      return {
        underlyingPrice: 100,
        impliedVolatility: 0.25,
        riskFreeRate: 0.05,
        marketTrend: 'neutral'
      };
    }

    // For multiple underlyings, use the first one's data
    // In a more sophisticated implementation, you might aggregate or weight the conditions
    return await this.getMarketConditions(underlyings[0]);
  }

  /**
   * Determine market trend from market data
   */
  private determineMarketTrend(marketData: MarketData): 'bullish' | 'bearish' | 'neutral' {
    // Simplified trend determination
    // In reality, you'd use more sophisticated technical analysis
    const changePercent = marketData.changePercent || 0;
    
    if (changePercent > 2) return 'bullish';
    if (changePercent < -2) return 'bearish';
    return 'neutral';
  }

  /**
   * Process risk alerts and notify subscribers
   */
  private async processAlerts(alerts: RiskAlert[]): Promise<void> {
    for (const alert of alerts) {
      // Log alerts based on severity
      if (alert.severity === 'high') {
        console.error(`🚨 HIGH RISK ALERT: ${alert.message}`);
      } else if (alert.severity === 'medium') {
        console.warn(`⚠️ MEDIUM RISK ALERT: ${alert.message}`);
      } else {
        console.info(`ℹ️ INFO ALERT: ${alert.message}`);
      }

      // Notify subscribers
      this.notifyAlert(alert);
    }
  }

  /**
   * Notify alert subscribers
   */
  private notifyAlert(alert: RiskAlert): void {
    for (const subscriber of this.alertSubscribers) {
      try {
        subscriber(alert);
      } catch (error) {
        console.error('Error notifying alert subscriber:', error);
      }
    }
  }

  /**
   * Log risk assessment summary
   */
  private logRiskAssessmentSummary(assessment: PortfolioRiskAssessment): void {
    const { riskScore, portfolioGreeks, alerts, concentrationRisk } = assessment;
    
    console.log('\n📊 PORTFOLIO RISK ASSESSMENT SUMMARY');
    console.log('=====================================');
    console.log(`🎯 Risk Score: ${riskScore}/100 (${this.getRiskLevel(riskScore)})`);
    console.log(`📈 Portfolio Delta: ${portfolioGreeks.delta.toFixed(2)}`);
    console.log(`⚡ Portfolio Gamma: ${portfolioGreeks.gamma.toFixed(3)}`);
    console.log(`⏰ Daily Theta: $${portfolioGreeks.theta.toFixed(2)}`);
    console.log(`🌊 Portfolio Vega: ${portfolioGreeks.vega.toFixed(2)}`);
    console.log(`🔍 Max Concentration: ${(concentrationRisk.maxConcentration * 100).toFixed(1)}%`);
    console.log(`⚠️ Active Alerts: ${alerts.length}`);
    
    if (alerts.length > 0) {
      console.log('\nActive Alerts:');
      alerts.forEach(alert => {
        console.log(`  • ${alert.category.toUpperCase()}: ${alert.message}`);
      });
    }
    
    console.log('=====================================\n');
  }

  /**
   * Get risk level from risk score
   */
  private getRiskLevel(riskScore: number): 'Low' | 'Medium' | 'High' | 'Critical' {
    if (riskScore >= 80) return 'Critical';
    if (riskScore >= 60) return 'High';
    if (riskScore >= 40) return 'Medium';
    return 'Low';
  }

  /**
   * Calculate options exposure percentage of portfolio
   */
  private calculateOptionsExposure(portfolio: any): number {
    // This would need to be implemented based on your Portfolio interface
    // For now, return a placeholder
    const optionsValue = portfolio.positions
      ?.filter((pos: any) => pos.instrument?.includes('option') || pos.symbol?.includes('C') || pos.symbol?.includes('P'))
      ?.reduce((sum: number, pos: any) => sum + Math.abs(pos.marketValue || 0), 0) || 0;
    
    return portfolio.totalValue > 0 ? (optionsValue / portfolio.totalValue) * 100 : 0;
  }
}

// Supporting interfaces
export interface RiskDashboardData {
  riskScore: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  portfolioGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  riskMetrics: {
    valueAtRisk: number;
    maxPortfolioLoss: number;
    currentLeverage: number;
    portfolioBeta: number;
    sharpeRatio: number;
    sortinioRatio: number;
    maxDrawdown: number;
  };
  alerts: RiskAlert[];
  concentrationRisk: {
    topConcentrations: Array<{
      underlying: string;
      exposure: number;
      percentage: number;
    }>;
    maxConcentration: number;
    concentrationScore: number;
    isOverConcentrated: boolean;
  };
  marginAnalysis: {
    totalMarginUsed: number;
    availableMargin: number;
    marginUtilization: number;
    isOverMargin: boolean;
  };
  stressTestResults: {
    scenarios: Array<{
      scenario: string;
      portfolioPnL: number;
      portfolioPnLPercent: number;
    }>;
  };
  portfolioValue: number;
  optionsExposure: number; // Percentage of portfolio in options
  lastUpdated: Date;
}

export interface MonitoringStatus {
  isActive: boolean;
  lastUpdate: Date | null;
  subscriberCount: number;
  riskScore: number | null;
  alertCount: number;
}

export default PortfolioRiskMonitoringService;