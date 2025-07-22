// ============================================================================
// TRADING CONTROLLER - PRESENTATION LAYER
// ============================================================================

import { Request, Response } from 'express';
import {
  ITradeOrchestrator,
  IPortfolioService,
  ApplicationError,
  DomainError,
  InfrastructureError,
  ILogger
} from '../../core/interfaces';

export class TradingController {
  constructor(
    private tradeOrchestrator: ITradeOrchestrator,
    private portfolioService: IPortfolioService,
    private logger: ILogger
  ) {}

  /**
   * Execute a trade based on natural language input
   * POST /api/trades/execute
   */
  async executeTrade(req: Request, res: Response): Promise<void> {
    const requestId = this.generateRequestId();
    
    try {
      const { command } = req.body;
      
      if (!command || typeof command !== 'string' || !command.trim()) {
        res.status(400).json({
          success: false,
          error: 'Trade command is required',
          code: 'INVALID_REQUEST'
        });
        return;
      }

      this.logger.info('Trade execution request received', { 
        requestId, 
        command: command.substring(0, 100) 
      });

      const result = await this.tradeOrchestrator.executeTrade(command.trim());

      if (result.success) {
        res.json({
          success: true,
          trade: {
            id: result.trade?.id,
            symbol: result.trade?.symbol,
            action: result.trade?.action,
            quantity: result.executedQuantity || result.trade?.quantity,
            price: result.executedPrice || result.trade?.price,
            status: result.trade?.status
          },
          orderId: result.orderId,
          message: result.message,
          timestamp: result.timestamp
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: result.timestamp
        });
      }

    } catch (error) {
      this.handleError(error, res, requestId, 'trade execution');
    }
  }

  /**
   * Preview a trade without executing it
   * POST /api/trades/preview
   */
  async previewTrade(req: Request, res: Response): Promise<void> {
    const requestId = this.generateRequestId();
    
    try {
      const { command } = req.body;
      
      if (!command || typeof command !== 'string' || !command.trim()) {
        res.status(400).json({
          success: false,
          error: 'Trade command is required',
          code: 'INVALID_REQUEST'
        });
        return;
      }

      this.logger.info('Trade preview request received', { 
        requestId, 
        command: command.substring(0, 100) 
      });

      const preview = await this.tradeOrchestrator.previewTrade(command.trim());

      res.json({
        success: true,
        preview: {
          command: {
            symbol: preview.command.symbol,
            action: preview.command.action,
            amount: preview.command.amount,
            amountType: preview.command.amountType,
            orderType: preview.command.orderType
          },
          validation: {
            isValid: preview.validation.isValid,
            errors: preview.validation.errors,
            warnings: preview.validation.warnings
          },
          estimates: {
            cost: preview.estimatedCost,
            shares: preview.estimatedShares,
            marketPrice: preview.marketPrice
          },
          impact: preview.impact
        }
      });

    } catch (error) {
      this.handleError(error, res, requestId, 'trade preview');
    }
  }

  /**
   * Cancel a pending trade
   * DELETE /api/trades/:tradeId
   */
  async cancelTrade(req: Request, res: Response): Promise<void> {
    const requestId = this.generateRequestId();
    
    try {
      const { tradeId } = req.params;
      
      if (!tradeId) {
        res.status(400).json({
          success: false,
          error: 'Trade ID is required',
          code: 'INVALID_REQUEST'
        });
        return;
      }

      this.logger.info('Trade cancellation request received', { requestId, tradeId });

      const cancelled = await this.tradeOrchestrator.cancelTrade(tradeId);

      if (cancelled) {
        res.json({
          success: true,
          message: 'Trade cancelled successfully',
          tradeId
        });
      } else {
        res.status(400).json({
          success: false,
          error: 'Failed to cancel trade',
          message: 'Trade may have already been executed or cancelled',
          tradeId
        });
      }

    } catch (error) {
      this.handleError(error, res, requestId, 'trade cancellation');
    }
  }

  /**
   * Get current portfolio
   * GET /api/portfolio
   */
  async getPortfolio(req: Request, res: Response): Promise<void> {
    const requestId = this.generateRequestId();
    
    try {
      this.logger.debug('Portfolio request received', { requestId });

      const portfolio = await this.portfolioService.getPortfolio();

      res.json({
        success: true,
        portfolio: {
          totalValue: portfolio.totalValue,
          totalCost: portfolio.totalCost,
          totalReturn: portfolio.totalReturn,
          totalReturnPercent: portfolio.totalReturnPercent,
          cash: portfolio.cash,
          dayChange: portfolio.dayChange,
          dayChangePercent: portfolio.dayChangePercent,
          positions: portfolio.positions.map(position => ({
            symbol: position.symbol,
            quantity: position.quantity,
            averagePrice: position.averagePrice,
            marketValue: position.marketValue,
            unrealizedPnL: position.unrealizedPnL,
            side: position.side
          }))
        }
      });

    } catch (error) {
      this.handleError(error, res, requestId, 'portfolio fetch');
    }
  }

  /**
   * Get portfolio performance metrics
   * GET /api/portfolio/performance
   */
  async getPerformanceMetrics(req: Request, res: Response): Promise<void> {
    const requestId = this.generateRequestId();
    
    try {
      const { period = '1M' } = req.query;
      
      this.logger.debug('Performance metrics request received', { requestId, period });

      const metrics = await this.portfolioService.getPerformanceMetrics(period as string);

      res.json({
        success: true,
        metrics: {
          period: metrics.period,
          totalReturn: metrics.totalReturn,
          annualizedReturn: metrics.annualizedReturn,
          volatility: metrics.volatility,
          sharpeRatio: metrics.sharpeRatio,
          maxDrawdown: metrics.maxDrawdown,
          winRate: metrics.winRate,
          profitFactor: metrics.profitFactor
        }
      });

    } catch (error) {
      this.handleError(error, res, requestId, 'performance metrics');
    }
  }

  /**
   * Get current positions
   * GET /api/positions
   */
  async getPositions(req: Request, res: Response): Promise<void> {
    const requestId = this.generateRequestId();
    
    try {
      this.logger.debug('Positions request received', { requestId });

      const positions = await this.portfolioService.getPositions();

      res.json({
        success: true,
        positions: positions.map(position => ({
          id: position.id,
          symbol: position.symbol,
          quantity: position.quantity,
          averagePrice: position.averagePrice,
          marketValue: position.marketValue,
          unrealizedPnL: position.unrealizedPnL,
          side: position.side,
          lastUpdated: position.lastUpdated
        }))
      });

    } catch (error) {
      this.handleError(error, res, requestId, 'positions fetch');
    }
  }

  /**
   * Rebalance portfolio
   * POST /api/portfolio/rebalance
   */
  async rebalancePortfolio(req: Request, res: Response): Promise<void> {
    const requestId = this.generateRequestId();
    
    try {
      const { targets } = req.body;
      
      if (!targets || !Array.isArray(targets) || targets.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Portfolio targets are required',
          code: 'INVALID_REQUEST'
        });
        return;
      }

      this.logger.info('Portfolio rebalance request received', { 
        requestId, 
        targetCount: targets.length 
      });

      const result = await this.portfolioService.rebalancePortfolio(targets);

      res.json({
        success: result.success,
        message: result.message,
        trades: result.trades.map(trade => ({
          symbol: trade.symbol,
          action: trade.action,
          quantity: trade.quantity,
          status: trade.status,
          price: trade.executedPrice || trade.price
        })),
        totalCost: result.totalCost
      });

    } catch (error) {
      this.handleError(error, res, requestId, 'portfolio rebalance');
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private handleError(error: any, res: Response, requestId: string, operation: string): void {
    this.logger.error(`${operation} failed`, error, { requestId });

    if (error instanceof ApplicationError) {
      res.status(400).json({
        success: false,
        error: error.message,
        code: error.code,
        requestId
      });
    } else if (error instanceof DomainError) {
      res.status(422).json({
        success: false,
        error: error.message,
        code: error.code,
        requestId
      });
    } else if (error instanceof InfrastructureError) {
      res.status(502).json({
        success: false,
        error: 'External service error',
        message: 'A required external service is currently unavailable',
        code: error.code,
        requestId
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        requestId
      });
    }
  }
}