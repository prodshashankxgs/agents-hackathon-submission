import express from 'express';
import { PortfolioRiskMonitoringService, RiskDashboardData, MonitoringStatus } from '../services/portfolio-risk-monitoring-service';
import { OptionsRiskManager, RiskAlert } from '../trading/options-risk-manager';
import { PortfolioService } from '../application/services/PortfolioService';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { OptionsMarketDataService } from '../market-data/options-market-data-service';
import { OptionsStrategy } from '../types';

/**
 * Portfolio Risk Management API Routes
 * 
 * Provides endpoints for:
 * - Portfolio risk assessment and monitoring
 * - Real-time risk alerts
 * - Risk dashboard data
 * - Strategy validation
 * - Risk monitoring controls
 */
export class PortfolioRiskRoutes {
  private router: express.Router;
  private riskMonitoringService: PortfolioRiskMonitoringService;
  
  constructor() {
    this.router = express.Router();
    this.initializeServices();
    this.setupRoutes();
  }

  /**
   * Initialize services
   */
  private async initializeServices(): Promise<void> {
    try {
      // Initialize core services
      const riskManager = new OptionsRiskManager();
      const broker = new AlpacaAdapter();
      const marketDataService = new OptionsMarketDataService();
      
      // Note: PortfolioService would need proper dependency injection in real implementation
      const portfolioService = new (PortfolioService as any)();
      
      // Initialize risk monitoring service
      this.riskMonitoringService = new PortfolioRiskMonitoringService(
        riskManager,
        portfolioService,
        broker,
        marketDataService
      );

      console.log('✅ Portfolio risk monitoring services initialized');
    } catch (error) {
      console.warn('⚠️ Some portfolio risk services failed to initialize:', error);
    }
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Risk dashboard data endpoint
    this.router.get('/dashboard', this.handleGetRiskDashboard.bind(this));
    
    // Risk assessment endpoint
    this.router.post('/assess', this.handlePerformRiskAssessment.bind(this));
    
    // Strategy validation endpoint
    this.router.post('/validate-strategy', this.handleValidateStrategy.bind(this));
    
    // Active alerts endpoint
    this.router.get('/alerts', this.handleGetActiveAlerts.bind(this));
    
    // Monitoring control endpoints
    this.router.post('/monitoring/start', this.handleStartMonitoring.bind(this));
    this.router.post('/monitoring/stop', this.handleStopMonitoring.bind(this));
    this.router.get('/monitoring/status', this.handleMonitoringStatus.bind(this));
    
    // Refresh data endpoint
    this.router.post('/refresh', this.handleRefreshRiskData.bind(this));
    
    // Health check
    this.router.get('/health', this.handleHealthCheck.bind(this));
  }

  /**
   * Get comprehensive risk dashboard data
   */
  private async handleGetRiskDashboard(req: express.Request, res: express.Response): Promise<void> {
    try {
      const startTime = Date.now();
      const dashboardData = await this.riskMonitoringService.getRiskDashboardData();
      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: dashboardData,
        metadata: {
          processingTime,
          timestamp: new Date(),
          dataFreshness: this.calculateDataFreshness(dashboardData.lastUpdated)
        }
      });

    } catch (error) {
      this.handleError(res, error, 'RISK_DASHBOARD_ERROR');
    }
  }

  /**
   * Perform immediate risk assessment
   */
  private async handlePerformRiskAssessment(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { force = false } = req.body;
      const startTime = Date.now();

      let riskAssessment;
      if (force) {
        await this.riskMonitoringService.refreshRiskData();
        riskAssessment = await this.riskMonitoringService.getCurrentRiskMetrics();
      } else {
        riskAssessment = await this.riskMonitoringService.performRiskAssessment();
      }

      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          assessment: riskAssessment,
          summary: {
            riskScore: riskAssessment?.riskScore || 0,
            riskLevel: this.getRiskLevel(riskAssessment?.riskScore || 0),
            alertCount: riskAssessment?.alerts.length || 0,
            highSeverityAlerts: riskAssessment?.alerts.filter(a => a.severity === 'high').length || 0
          }
        },
        metadata: {
          processingTime,
          timestamp: new Date(),
          forced: force
        }
      });

    } catch (error) {
      this.handleError(res, error, 'RISK_ASSESSMENT_ERROR');
    }
  }

  /**
   * Validate strategy against risk limits
   */
  private async handleValidateStrategy(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { strategy } = req.body;

      if (!strategy) {
        res.status(400).json({
          success: false,
          error: 'Strategy is required',
          code: 'MISSING_STRATEGY'
        });
        return;
      }

      const startTime = Date.now();
      const validation = await this.riskMonitoringService.validateStrategyRisk(strategy as OptionsStrategy);
      const processingTime = Date.now() - startTime;

      res.json({
        success: true,
        data: {
          validation,
          canExecute: validation.isValid,
          riskSummary: {
            positionRiskPercent: (validation.riskAssessment.positionRisk * 100).toFixed(2),
            concentrationRiskPercent: (validation.riskAssessment.concentrationRisk * 100).toFixed(2),
            marginRequired: validation.riskAssessment.marginImpact,
            errorCount: validation.errors.length,
            warningCount: validation.warnings.length
          }
        },
        metadata: {
          processingTime,
          timestamp: new Date(),
          strategyName: strategy.name || 'Unnamed Strategy'
        }
      });

    } catch (error) {
      this.handleError(res, error, 'STRATEGY_VALIDATION_ERROR');
    }
  }

  /**
   * Get active risk alerts
   */
  private async handleGetActiveAlerts(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { severity, category } = req.query;
      let alerts = await this.riskMonitoringService.getActiveAlerts();

      // Apply filters
      if (severity) {
        alerts = alerts.filter(alert => alert.severity === severity);
      }
      if (category) {
        alerts = alerts.filter(alert => alert.category === category);
      }

      // Sort by severity and timestamp
      alerts = this.sortAlerts(alerts);

      res.json({
        success: true,
        data: {
          alerts,
          summary: {
            total: alerts.length,
            high: alerts.filter(a => a.severity === 'high').length,
            medium: alerts.filter(a => a.severity === 'medium').length,
            low: alerts.filter(a => a.severity === 'low').length,
            categories: this.getAlertCategories(alerts)
          }
        }
      });

    } catch (error) {
      this.handleError(res, error, 'ALERTS_FETCH_ERROR');
    }
  }

  /**
   * Start risk monitoring
   */
  private async handleStartMonitoring(req: express.Request, res: express.Response): Promise<void> {
    try {
      const { intervalMinutes = 1 } = req.body;

      if (intervalMinutes < 1 || intervalMinutes > 60) {
        res.status(400).json({
          success: false,
          error: 'Interval must be between 1 and 60 minutes',
          code: 'INVALID_INTERVAL'
        });
        return;
      }

      await this.riskMonitoringService.startMonitoring(intervalMinutes);

      res.json({
        success: true,
        message: `Risk monitoring started with ${intervalMinutes}-minute intervals`,
        data: {
          intervalMinutes,
          startedAt: new Date()
        }
      });

    } catch (error) {
      this.handleError(res, error, 'MONITORING_START_ERROR');
    }
  }

  /**
   * Stop risk monitoring
   */
  private async handleStopMonitoring(req: express.Request, res: express.Response): Promise<void> {
    try {
      this.riskMonitoringService.stopMonitoring();

      res.json({
        success: true,
        message: 'Risk monitoring stopped',
        data: {
          stoppedAt: new Date()
        }
      });

    } catch (error) {
      this.handleError(res, error, 'MONITORING_STOP_ERROR');
    }
  }

  /**
   * Get monitoring status
   */
  private handleMonitoringStatus(req: express.Request, res: express.Response): void {
    try {
      const status = this.riskMonitoringService.getMonitoringStatus();

      res.json({
        success: true,
        data: {
          ...status,
          uptime: status.lastUpdate ? this.calculateUptime(status.lastUpdate) : null,
          healthCheck: this.performHealthCheck(status)
        }
      });

    } catch (error) {
      this.handleError(res, error, 'MONITORING_STATUS_ERROR');
    }
  }

  /**
   * Refresh risk data
   */
  private async handleRefreshRiskData(req: express.Request, res: express.Response): Promise<void> {
    try {
      const startTime = Date.now();
      await this.riskMonitoringService.refreshRiskData();
      const processingTime = Date.now() - startTime;

      const updatedData = await this.riskMonitoringService.getCurrentRiskMetrics();

      res.json({
        success: true,
        message: 'Risk data refreshed successfully',
        data: {
          lastUpdated: updatedData?.timestamp || new Date(),
          riskScore: updatedData?.riskScore || null,
          alertCount: updatedData?.alerts.length || 0
        },
        metadata: {
          processingTime,
          refreshedAt: new Date()
        }
      });

    } catch (error) {
      this.handleError(res, error, 'REFRESH_ERROR');
    }
  }

  /**
   * Health check endpoint
   */
  private async handleHealthCheck(req: express.Request, res: express.Response): Promise<void> {
    try {
      const status = this.riskMonitoringService.getMonitoringStatus();
      const isHealthy = status.lastUpdate && 
                       (Date.now() - status.lastUpdate.getTime()) < 10 * 60 * 1000; // 10 minutes

      res.json({
        success: true,
        data: {
          status: isHealthy ? 'healthy' : 'degraded',
          monitoring: status.isActive,
          lastUpdate: status.lastUpdate,
          riskScore: status.riskScore,
          alertCount: status.alertCount,
          uptime: status.lastUpdate ? this.calculateUptime(status.lastUpdate) : null
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Health check failed',
        code: 'HEALTH_CHECK_FAILED'
      });
    }
  }

  // Helper methods

  /**
   * Calculate data freshness in minutes
   */
  private calculateDataFreshness(lastUpdated: Date): string {
    const ageMinutes = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60));
    
    if (ageMinutes < 1) return 'Just now';
    if (ageMinutes === 1) return '1 minute ago';
    if (ageMinutes < 60) return `${ageMinutes} minutes ago`;
    
    const ageHours = Math.floor(ageMinutes / 60);
    if (ageHours === 1) return '1 hour ago';
    return `${ageHours} hours ago`;
  }

  /**
   * Get risk level from score
   */
  private getRiskLevel(riskScore: number): string {
    if (riskScore >= 80) return 'Critical';
    if (riskScore >= 60) return 'High';
    if (riskScore >= 40) return 'Medium';
    return 'Low';
  }

  /**
   * Sort alerts by severity and recency
   */
  private sortAlerts(alerts: RiskAlert[]): RiskAlert[] {
    const severityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    
    return alerts.sort((a, b) => {
      // First by severity
      const severityDiff = (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;
      
      // Then by recency
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
  }

  /**
   * Get unique alert categories
   */
  private getAlertCategories(alerts: RiskAlert[]): string[] {
    const categories = new Set(alerts.map(alert => alert.category));
    return Array.from(categories);
  }

  /**
   * Calculate uptime
   */
  private calculateUptime(startTime: Date): string {
    const uptimeMs = Date.now() - startTime.getTime();
    const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
    const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (uptimeHours > 0) {
      return `${uptimeHours}h ${uptimeMinutes}m`;
    }
    return `${uptimeMinutes}m`;
  }

  /**
   * Perform health check
   */
  private performHealthCheck(status: MonitoringStatus): { status: string; issues: string[] } {
    const issues: string[] = [];
    
    if (!status.isActive) {
      issues.push('Monitoring is not active');
    }
    
    if (!status.lastUpdate) {
      issues.push('No recent updates available');
    } else {
      const ageMinutes = (Date.now() - status.lastUpdate.getTime()) / (1000 * 60);
      if (ageMinutes > 10) {
        issues.push(`Data is stale (${Math.floor(ageMinutes)} minutes old)`);
      }
    }
    
    if (status.riskScore && status.riskScore >= 80) {
      issues.push('Critical risk level detected');
    }
    
    return {
      status: issues.length === 0 ? 'healthy' : 'warning',
      issues
    };
  }

  /**
   * Centralized error handling
   */
  private handleError(res: express.Response, error: unknown, code: string): void {
    console.error(`Portfolio Risk API Error [${code}]:`, error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      code,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get the Express router
   */
  getRouter(): express.Router {
    return this.router;
  }
}