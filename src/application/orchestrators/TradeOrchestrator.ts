// ============================================================================
// TRADE ORCHESTRATOR - APPLICATION LAYER
// ============================================================================

import {
  ITradeOrchestrator,
  IParsingService,
  IValidationService,
  IRiskManagementService,
  IBrokerAdapter,
  IEventBus,
  ICacheService,
  TradeExecutionResult,
  TradePreview,
  TradeEntity,
  OrderRequest,
  TradeExecutedEvent,
  PositionUpdatedEvent,
  ApplicationError,
  ILogger
} from '../../core/interfaces';

export class TradeOrchestrator implements ITradeOrchestrator {
  constructor(
    private parsingService: IParsingService,
    private validationService: IValidationService,
    private riskManagementService: IRiskManagementService,
    private brokerAdapter: IBrokerAdapter,
    private eventBus: IEventBus,
    private cacheService: ICacheService,
    private logger: ILogger
  ) {}

  async executeTrade(input: string): Promise<TradeExecutionResult> {
    const executionId = this.generateExecutionId();
    const startTime = Date.now();
    
    this.logger.info('Starting trade execution', { executionId, input });

    try {
      // Step 1: Parse the natural language command
      this.logger.debug('Step 1: Parsing command', { executionId });
      const parseResult = await this.parsingService.parseCommand(input);
      
      if (parseResult.confidence < 0.7) {
        throw new ApplicationError(
          `Low confidence in command interpretation (${(parseResult.confidence * 100).toFixed(1)}%). Please clarify your request.`,
          'LOW_PARSE_CONFIDENCE',
          { parseResult, input }
        );
      }

      const command = parseResult.command;
      this.logger.info('Command parsed successfully', {
        executionId,
        symbol: command.symbol,
        action: command.action,
        confidence: parseResult.confidence
      });

      // Step 2: Get account information
      this.logger.debug('Step 2: Fetching account information', { executionId });
      const account = await this.brokerAdapter.getAccountInfo();

      // Step 3: Validate the trade
      this.logger.debug('Step 3: Validating trade', { executionId });
      const validation = await this.validationService.validateTrade(command, account);
      
      if (!validation.isValid) {
        const errorMessages = validation.errors.map(e => e.message).join('; ');
        throw new ApplicationError(
          `Trade validation failed: ${errorMessages}`,
          'VALIDATION_FAILED',
          { validation, command }
        );
      }

      // Step 4: Risk assessment
      this.logger.debug('Step 4: Performing risk assessment', { executionId });
      const positions = await this.brokerAdapter.getPositions();
      const riskAssessment = await this.riskManagementService.assessRisk(command, positions);

      // Check if risk is too high
      if (riskAssessment.riskLevel === 'high') {
        const riskFactors = riskAssessment.riskFactors.join('; ');
        this.logger.warn('High risk trade detected', { executionId, riskFactors });
        
        // For high risk, we could either block or require confirmation
        // For now, we'll proceed but log the warning
        // throw new ApplicationError(
        //   `High risk trade blocked: ${riskFactors}`,
        //   'HIGH_RISK_BLOCKED',
        //   { riskAssessment, command }
        // );
      }

      // Step 5: Create and execute the order
      this.logger.debug('Step 5: Creating order request', { executionId });
      const orderRequest = this.createOrderRequest(command);
      
      this.logger.info('Executing order with broker', { executionId, orderRequest });
      const orderResult = await this.brokerAdapter.executeOrder(orderRequest);

      if (!orderResult.success) {
        throw new ApplicationError(
          `Order execution failed: ${orderResult.message}`,
          'ORDER_EXECUTION_FAILED',
          { orderResult, orderRequest }
        );
      }

      // Step 6: Create trade entity and publish events
      const trade = this.createTradeEntity(command, orderResult, executionId);
      
      // Publish trade executed event
      await this.publishTradeExecutedEvent(trade, orderResult);

      // Step 7: Update position tracking (if order was filled)
      if (orderResult.executedQuantity > 0) {
        await this.handlePositionUpdate(command, orderResult);
      }

      const executionResult: TradeExecutionResult = {
        success: true,
        trade,
        orderId: orderResult.orderId,
        executedPrice: orderResult.executedPrice,
        executedQuantity: orderResult.executedQuantity,
        message: `${command.action.toUpperCase()} order for ${command.symbol} executed successfully`,
        timestamp: new Date()
      };

      const executionTime = Date.now() - startTime;
      this.logger.info('Trade execution completed successfully', {
        executionId,
        orderId: orderResult.orderId,
        executionTime,
        symbol: command.symbol
      });

      return executionResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      if (error instanceof ApplicationError) {
        this.logger.error('Trade execution failed (application error)', error, {
          executionId,
          executionTime,
          input
        });
        
        return {
          success: false,
          message: error.message,
          error: error.message,
          timestamp: new Date()
        };
      }

      this.logger.error('Trade execution failed (unexpected error)', error as Error, {
        executionId,
        executionTime,
        input
      });

      return {
        success: false,
        message: 'Trade execution failed due to an unexpected error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  async previewTrade(input: string): Promise<TradePreview> {
    const previewId = this.generateExecutionId();
    
    this.logger.info('Starting trade preview', { previewId, input });

    try {
      // Step 1: Parse the command
      const parseResult = await this.parsingService.parseCommand(input);
      const command = parseResult.command;

      // Step 2: Get account info
      const account = await this.brokerAdapter.getAccountInfo();

      // Step 3: Validate the trade
      const validation = await this.validationService.validateTrade(command, account);

      // Step 4: Get market data for cost estimation
      const marketData = await this.brokerAdapter.getMarketData(command.symbol);

      // Step 5: Calculate estimated costs
      let estimatedCost = 0;
      let estimatedShares: number | undefined;

      if (command.amountType === 'dollars') {
        estimatedCost = command.amount;
        estimatedShares = Math.floor(command.amount / marketData.currentPrice);
      } else {
        estimatedShares = command.amount;
        estimatedCost = command.amount * marketData.currentPrice;
      }

      // Step 6: Risk assessment for impact analysis
      const positions = await this.brokerAdapter.getPositions();
      const riskAssessment = await this.riskManagementService.assessRisk(command, positions);

      const preview: TradePreview = {
        command,
        validation,
        estimatedCost,
        estimatedShares,
        marketPrice: marketData.currentPrice,
        impact: {
          priceImpact: 0, // Would need more sophisticated calculation
          liquidityScore: marketData.volume > 0 ? 0.8 : 0.3,
          timing: marketData.isMarketOpen ? 'good' : 'fair',
          ...(riskAssessment.riskLevel === 'high' && riskAssessment.recommendedPositionSize !== undefined ? {
            alternatives: [`Consider smaller position (${riskAssessment.recommendedPositionSize} shares)`]
          } : {})
        }
      };

      this.logger.info('Trade preview completed', {
        previewId,
        isValid: validation.isValid,
        estimatedCost,
        riskLevel: riskAssessment.riskLevel
      });

      return preview;

    } catch (error) {
      this.logger.error('Trade preview failed', error as Error, { previewId, input });
      
      throw new ApplicationError(
        `Trade preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PREVIEW_FAILED',
        { input, originalError: error }
      );
    }
  }

  async cancelTrade(tradeId: string): Promise<boolean> {
    this.logger.info('Cancelling trade', { tradeId });

    try {
      // For now, we assume tradeId is the same as orderId
      // In a full implementation, we'd have a trade repository to map trade IDs to order IDs
      const cancelled = await this.brokerAdapter.cancelOrder(tradeId);
      
      if (cancelled) {
        this.logger.info('Trade cancelled successfully', { tradeId });
        
        // Could publish a trade cancelled event here
        // await this.eventBus.publish(...);
      } else {
        this.logger.warn('Trade cancellation failed', { tradeId });
      }

      return cancelled;

    } catch (error) {
      this.logger.error('Trade cancellation failed', error as Error, { tradeId });
      
      throw new ApplicationError(
        `Trade cancellation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CANCELLATION_FAILED',
        { tradeId, originalError: error }
      );
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private generateExecutionId(): string {
    return `trade_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private createOrderRequest(command: any): OrderRequest {
    const orderRequest: OrderRequest = {
      symbol: command.symbol,
      side: command.action,
      quantity: command.amountType === 'shares' ? command.amount : 0, // Will be calculated for dollar amounts
      orderType: command.orderType,
      timeInForce: command.timeInForce || 'day',
      clientOrderId: this.generateExecutionId()
    };

    // Handle dollar-based orders
    if (command.amountType === 'dollars') {
      // For dollar amounts, we'll need to calculate shares based on current price
      // This is a simplification - in reality, we'd use notional orders or calculate exactly
      orderRequest.quantity = 1; // Placeholder - broker adapter should handle notional
    }

    if (command.orderType === 'limit' && command.limitPrice) {
      orderRequest.price = command.limitPrice;
    }

    return orderRequest;
  }

  private createTradeEntity(command: any, orderResult: any, executionId: string): TradeEntity {
    const entity: TradeEntity = {
      id: executionId,
      symbol: command.symbol,
      action: command.action,
      quantity: orderResult.executedQuantity || command.amount,
      orderType: command.orderType,
      status: orderResult.success ? 'executed' : 'failed',
      timestamp: new Date()
    };
    
    if (orderResult.executedPrice !== undefined) {
      entity.executedPrice = orderResult.executedPrice;
    }
    
    if (orderResult.executedQuantity !== undefined) {
      entity.executedQuantity = orderResult.executedQuantity;
    }
    
    if (command.limitPrice !== undefined) {
      entity.price = command.limitPrice;
    }
    
    if (orderResult.success) {
      entity.executedAt = new Date();
    }
    
    return entity;
  }

  private async publishTradeExecutedEvent(trade: TradeEntity, orderResult: any): Promise<void> {
    if (!orderResult.success || !orderResult.executedQuantity) {
      return;
    }

    try {
      const event: TradeExecutedEvent = {
        id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        type: 'TradeExecuted',
        aggregateId: trade.id,
        aggregateType: 'Trade',
        data: {
          tradeId: trade.id,
          symbol: trade.symbol,
          action: trade.action,
          quantity: orderResult.executedQuantity,
          executedPrice: orderResult.executedPrice || 0,
          executedAt: new Date()
        },
        timestamp: new Date(),
        version: 1
      };

      await this.eventBus.publish(event);
      this.logger.debug('Trade executed event published', { tradeId: trade.id });

    } catch (error) {
      this.logger.warn('Failed to publish trade executed event', { error: error as Error, tradeId: trade.id });
      // Don't throw - event publishing failure shouldn't fail the trade
    }
  }

  private async handlePositionUpdate(command: any, orderResult: any): Promise<void> {
    try {
      // This would typically involve updating position tracking
      // For now, we'll just publish a position updated event
      
      const event: PositionUpdatedEvent = {
        id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        type: 'PositionUpdated',
        aggregateId: command.symbol,
        aggregateType: 'Position',
        data: {
          positionId: command.symbol, // Simplified
          symbol: command.symbol,
          previousQuantity: 0, // Would need to fetch current position
          newQuantity: orderResult.executedQuantity,
          change: command.action === 'buy' ? orderResult.executedQuantity : -orderResult.executedQuantity
        },
        timestamp: new Date(),
        version: 1
      };

      await this.eventBus.publish(event);
      this.logger.debug('Position updated event published', { symbol: command.symbol });

    } catch (error) {
      this.logger.warn('Failed to handle position update', { error: error as Error, symbol: command.symbol });
      // Don't throw - position update failure shouldn't fail the trade
    }
  }
}