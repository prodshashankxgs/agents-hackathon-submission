import { PortfolioRiskMonitoringService } from '../services/portfolio-risk-monitoring-service';
import { OptionsRiskManager } from '../trading/options-risk-manager';
import { PortfolioService } from '../application/services/PortfolioService';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { OptionsMarketDataService } from '../market-data/options-market-data-service';
import { OptionsStrategy } from '../types';

/**
 * Portfolio Risk Integration Example
 * 
 * Demonstrates how to use the Portfolio Risk Monitoring Service
 * for comprehensive options portfolio risk management.
 */
export class PortfolioRiskIntegrationExample {
  private riskMonitoringService: PortfolioRiskMonitoringService;
  
  constructor() {
    this.initializeServices();
  }

  /**
   * Initialize all required services
   */
  private async initializeServices(): Promise<void> {
    console.log('🚀 Initializing Portfolio Risk Monitoring System...\n');

    try {
      // Initialize core services
      const riskManager = new OptionsRiskManager({
        maxSinglePositionRisk: 0.03,    // 3% max risk per position
        maxConcentrationRisk: 0.10,     // 10% max concentration
        maxPortfolioDelta: 25,          // ±25 portfolio delta limit
        stopLossThreshold: -0.15        // 15% stop loss threshold
      });

      const broker = new AlpacaAdapter();
      const marketDataService = new OptionsMarketDataService();
      
      // Note: In real implementation, PortfolioService would need proper DI
      const portfolioService = new (PortfolioService as any)();

      // Initialize risk monitoring service
      this.riskMonitoringService = new PortfolioRiskMonitoringService(
        riskManager,
        portfolioService,
        broker,
        marketDataService
      );

      console.log('✅ All services initialized successfully\n');
    } catch (error) {
      console.warn('⚠️ Some services failed to initialize (expected in demo):', error);
      console.log('📝 Continuing with mock data...\n');
    }
  }

  /**
   * Example 1: Start continuous risk monitoring
   */
  async startContinuousMonitoring(): Promise<void> {
    console.log('📊 EXAMPLE 1: Starting Continuous Risk Monitoring');
    console.log('================================================\n');

    try {
      // Subscribe to risk alerts
      const unsubscribe = this.riskMonitoringService.subscribeToAlerts((alert) => {
        console.log(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.message}`);
      });

      // Start monitoring (1-minute intervals)
      await this.riskMonitoringService.startMonitoring(1);

      console.log('⏰ Monitoring started - will run continuously in background');
      console.log('📱 Risk alerts will be displayed in real-time\n');

      // Wait for a few seconds to show initial assessment
      await this.sleep(3000);

      // Show monitoring status
      const status = this.riskMonitoringService.getMonitoringStatus();
      console.log('📈 Current Monitoring Status:');
      console.log(`   • Active: ${status.isActive ? '✅' : '❌'}`);
      console.log(`   • Last Update: ${status.lastUpdate ? status.lastUpdate.toLocaleTimeString() : 'Never'}`);
      console.log(`   • Risk Score: ${status.riskScore || 'N/A'}`);
      console.log(`   • Alert Subscribers: ${status.subscriberCount}\n`);

      // Clean up after demo
      setTimeout(() => {
        unsubscribe();
        this.riskMonitoringService.stopMonitoring();
        console.log('🛑 Monitoring stopped (demo completed)\n');
      }, 10000);

    } catch (error) {
      console.error('❌ Monitoring failed:', error);
    }
  }

  /**
   * Example 2: Validate strategy risk before execution
   */
  async validateStrategyExample(): Promise<void> {
    console.log('🔍 EXAMPLE 2: Strategy Risk Validation');
    console.log('=====================================\n');

    // Mock iron condor strategy
    const mockStrategy: OptionsStrategy = {
      id: 'iron-condor-example',
      name: 'SPY Iron Condor',
      type: 'iron_condor',
      underlying: 'SPY',
      legs: [
        {
          action: 'buy',
          contract: {
            id: 'SPY_PUT_380',
            symbol: 'SPY',
            underlying: 'SPY',
            contractType: 'put',
            strikePrice: 380,
            expirationDate: '2024-02-16',
            multiplier: 100
          },
          quantity: 1,
          side: 'long',
          price: 2.50
        },
        {
          action: 'sell',
          contract: {
            id: 'SPY_PUT_390',
            symbol: 'SPY',
            underlying: 'SPY',
            contractType: 'put',
            strikePrice: 390,
            expirationDate: '2024-02-16',
            multiplier: 100
          },
          quantity: 1,
          side: 'short',
          price: 5.00
        },
        {
          action: 'sell',
          contract: {
            id: 'SPY_CALL_410',
            symbol: 'SPY',
            underlying: 'SPY',
            contractType: 'call',
            strikePrice: 410,
            expirationDate: '2024-02-16',
            multiplier: 100
          },
          quantity: 1,
          side: 'short',
          price: 4.75
        },
        {
          action: 'buy',
          contract: {
            id: 'SPY_CALL_420',
            symbol: 'SPY',
            underlying: 'SPY',
            contractType: 'call',
            strikePrice: 420,
            expirationDate: '2024-02-16',
            multiplier: 100
          },
          quantity: 1,
          side: 'long',
          price: 2.25
        }
      ],
      maxProfit: 500,
      maxLoss: -500,
      breakeven: [385, 415],
      margin: 1000,
      netCredit: 500,
      probability: 65,
      timeDecay: -15
    };

    try {
      console.log(`🎯 Validating strategy: ${mockStrategy.name}`);
      console.log(`   • Type: ${mockStrategy.type}`);
      console.log(`   • Underlying: ${mockStrategy.underlying}`);
      console.log(`   • Max Profit: $${mockStrategy.maxProfit}`);
      console.log(`   • Max Loss: $${mockStrategy.maxLoss}`);
      console.log(`   • Margin Required: $${mockStrategy.margin}\n`);

      const validation = await this.riskMonitoringService.validateStrategyRisk(mockStrategy);

      console.log('📋 VALIDATION RESULTS:');
      console.log(`   • Status: ${validation.isValid ? '✅ APPROVED' : '❌ REJECTED'}`);
      console.log(`   • Position Risk: ${(validation.riskAssessment.positionRisk * 100).toFixed(2)}%`);
      console.log(`   • Concentration Risk: ${(validation.riskAssessment.concentrationRisk * 100).toFixed(2)}%`);
      console.log(`   • Margin Impact: $${validation.riskAssessment.marginImpact.toFixed(2)}`);

      if (validation.errors.length > 0) {
        console.log('\n🚨 ERRORS:');
        validation.errors.forEach(error => console.log(`   • ${error}`));
      }

      if (validation.warnings.length > 0) {
        console.log('\n⚠️ WARNINGS:');
        validation.warnings.forEach(warning => console.log(`   • ${warning}`));
      }

      console.log(`\n${validation.isValid ? '✅ Strategy approved for execution' : '❌ Strategy rejected - fix errors before proceeding'}\n`);

    } catch (error) {
      console.error('❌ Strategy validation failed:', error);
    }
  }

  /**
   * Example 3: Get comprehensive risk dashboard data
   */
  async getRiskDashboardExample(): Promise<void> {
    console.log('📊 EXAMPLE 3: Risk Dashboard Data');
    console.log('================================\n');

    try {
      const dashboardData = await this.riskMonitoringService.getRiskDashboardData();

      console.log('🎯 PORTFOLIO RISK OVERVIEW:');
      console.log(`   • Portfolio Value: $${dashboardData.portfolioValue.toLocaleString()}`);
      console.log(`   • Risk Score: ${dashboardData.riskScore}/100 (${dashboardData.riskLevel})`);
      console.log(`   • Options Exposure: ${dashboardData.optionsExposure.toFixed(1)}%`);
      console.log(`   • Last Updated: ${dashboardData.lastUpdated.toLocaleString()}\n`);

      console.log('📈 PORTFOLIO GREEKS:');
      console.log(`   • Delta: ${dashboardData.portfolioGreeks.delta.toFixed(2)}`);
      console.log(`   • Gamma: ${dashboardData.portfolioGreeks.gamma.toFixed(3)}`);
      console.log(`   • Theta: $${dashboardData.portfolioGreeks.theta.toFixed(2)}/day`);
      console.log(`   • Vega: ${dashboardData.portfolioGreeks.vega.toFixed(2)}`);
      console.log(`   • Rho: ${dashboardData.portfolioGreeks.rho.toFixed(2)}\n`);

      console.log('⚖️ RISK METRICS:');
      console.log(`   • Value at Risk: $${dashboardData.riskMetrics.valueAtRisk.toFixed(2)}`);
      console.log(`   • Max Portfolio Loss: $${dashboardData.riskMetrics.maxPortfolioLoss.toFixed(2)}`);
      console.log(`   • Current Leverage: ${dashboardData.riskMetrics.currentLeverage.toFixed(2)}x`);
      console.log(`   • Sharpe Ratio: ${dashboardData.riskMetrics.sharpeRatio.toFixed(2)}\n`);

      console.log('🏦 MARGIN ANALYSIS:');
      console.log(`   • Total Margin Used: $${dashboardData.marginAnalysis.totalMarginUsed.toLocaleString()}`);
      console.log(`   • Available Margin: $${dashboardData.marginAnalysis.availableMargin.toLocaleString()}`);
      console.log(`   • Margin Utilization: ${(dashboardData.marginAnalysis.marginUtilization * 100).toFixed(1)}%`);
      console.log(`   • Over Margin: ${dashboardData.marginAnalysis.isOverMargin ? '⚠️ YES' : '✅ NO'}\n`);

      console.log('🎯 CONCENTRATION RISK:');
      console.log(`   • Max Concentration: ${(dashboardData.concentrationRisk.maxConcentration * 100).toFixed(1)}%`);
      console.log(`   • Over Concentrated: ${dashboardData.concentrationRisk.isOverConcentrated ? '⚠️ YES' : '✅ NO'}`);
      console.log('   • Top Holdings:');
      dashboardData.concentrationRisk.topConcentrations.slice(0, 3).forEach((holding, index) => {
        console.log(`     ${index + 1}. ${holding.underlying}: ${(holding.percentage * 100).toFixed(1)}% ($${holding.exposure.toLocaleString()})`);
      });

      if (dashboardData.alerts.length > 0) {
        console.log(`\n🚨 ACTIVE ALERTS (${dashboardData.alerts.length}):`);
        dashboardData.alerts.forEach(alert => {
          const icon = alert.severity === 'high' ? '🚨' : alert.severity === 'medium' ? '⚠️' : 'ℹ️';
          console.log(`   ${icon} ${alert.category.toUpperCase()}: ${alert.message}`);
        });
      } else {
        console.log('\n✅ NO ACTIVE ALERTS');
      }

      console.log('\n📊 STRESS TEST RESULTS:');
      dashboardData.stressTestResults.scenarios.forEach(scenario => {
        const pnlColor = scenario.portfolioPnL >= 0 ? '+' : '';
        const percentColor = scenario.portfolioPnLPercent >= 0 ? '+' : '';
        console.log(`   • ${scenario.scenario}: ${pnlColor}$${scenario.portfolioPnL.toFixed(0)} (${percentColor}${(scenario.portfolioPnLPercent * 100).toFixed(1)}%)`);
      });

      console.log();

    } catch (error) {
      console.error('❌ Dashboard data retrieval failed:', error);
    }
  }

  /**
   * Example 4: Handle real-time risk alerts
   */
  async handleRealTimeAlertsExample(): Promise<void> {
    console.log('🔔 EXAMPLE 4: Real-Time Risk Alert Handling');
    console.log('===========================================\n');

    try {
      let alertCount = 0;
      
      // Subscribe to alerts with custom handler
      const unsubscribe = this.riskMonitoringService.subscribeToAlerts((alert) => {
        alertCount++;
        console.log(`\n📢 ALERT #${alertCount} [${new Date().toLocaleTimeString()}]:`);
        console.log(`   🏷️  Type: ${alert.type.toUpperCase()}`);
        console.log(`   📂 Category: ${alert.category.toUpperCase()}`);
        console.log(`   ⚖️  Severity: ${alert.severity.toUpperCase()}`);
        console.log(`   💬 Message: ${alert.message}`);
        if (alert.position) {
          console.log(`   📍 Position: ${alert.position}`);
        }

        // Example of alert-based actions
        if (alert.severity === 'high') {
          console.log('   🚨 HIGH SEVERITY ALERT - Consider immediate action!');
          
          if (alert.category === 'loss') {
            console.log('   💡 Suggested Action: Review stop-loss orders');
          } else if (alert.category === 'assignment') {
            console.log('   💡 Suggested Action: Consider closing or rolling position');
          } else if (alert.category === 'expiration') {
            console.log('   💡 Suggested Action: Close or roll expiring positions');
          }
        }
      });

      console.log('🎧 Alert listener activated - monitoring for risk events...');
      console.log('⏱️  Will monitor for 15 seconds...\n');

      // Force a risk assessment to potentially generate alerts
      await this.riskMonitoringService.performRiskAssessment();

      // Keep listening for alerts
      await this.sleep(15000);

      unsubscribe();
      console.log(`\n📊 Alert monitoring completed. Total alerts received: ${alertCount}\n`);

    } catch (error) {
      console.error('❌ Alert handling failed:', error);
    }
  }

  /**
   * Run all examples
   */
  async runAllExamples(): Promise<void> {
    console.log('🎯 PORTFOLIO RISK MONITORING INTEGRATION EXAMPLES');
    console.log('================================================\n');
    console.log('This demonstrates comprehensive options portfolio risk management\n');

    try {
      // Run examples in sequence
      await this.validateStrategyExample();
      await this.sleep(2000);
      
      await this.getRiskDashboardExample();
      await this.sleep(2000);
      
      await this.handleRealTimeAlertsExample();
      await this.sleep(2000);
      
      await this.startContinuousMonitoring();

      console.log('✅ ALL EXAMPLES COMPLETED SUCCESSFULLY');
      console.log('\n🔧 Integration Points Available:');
      console.log('   • REST API endpoints for risk data');
      console.log('   • WebSocket alerts for real-time notifications');
      console.log('   • Integration with existing PortfolioService');
      console.log('   • Validation hooks for order execution');
      console.log('   • Risk dashboard components for frontend\n');

    } catch (error) {
      console.error('❌ Example execution failed:', error);
    }
  }

  /**
   * Simple sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Example usage
export async function runPortfolioRiskIntegrationDemo(): Promise<void> {
  console.log('🚀 STARTING PORTFOLIO RISK INTEGRATION DEMO\n');
  
  const example = new PortfolioRiskIntegrationExample();
  await example.runAllExamples();
  
  console.log('🏁 DEMO COMPLETED');
}

// Run demo if this file is executed directly
if (require.main === module) {
  runPortfolioRiskIntegrationDemo().catch(console.error);
}