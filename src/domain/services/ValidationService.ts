// ============================================================================
// VALIDATION SERVICE - DOMAIN LAYER
// ============================================================================

import {
  IValidationService,
  IBrokerAdapter,
  ICacheService,
  ValidationResult,
  ValidationError,
  TradeCommand,
  AccountEntity,
  MarketDataEntity,
  DomainError,
  ValidationDomainError,
  ILogger
} from '../../core/interfaces';
import { config } from '../../config';

export class ValidationService implements IValidationService {
  private readonly VALIDATION_CACHE_TTL = 60000; // 1 minute
  private readonly MAX_POSITION_SIZE = config.maxPositionSize || 10000;
  private readonly MAX_DAILY_SPENDING = config.maxDailySpending || 50000;

  constructor(
    private brokerAdapter: IBrokerAdapter,
    private cacheService: ICacheService,
    private logger: ILogger
  ) {}

  async validateTrade(command: TradeCommand, account: AccountEntity): Promise<ValidationResult> {
    this.logger.info('Starting trade validation', { 
      symbol: command.symbol, 
      action: command.action,
      amount: command.amount 
    });

    try {
      const errors: ValidationError[] = [];
      const warnings: string[] = [];

      // Step 1: Basic command validation
      this.validateBasicCommand(command, errors);

      if (errors.length > 0) {
        return this.createValidationResult(false, errors, warnings);
      }

      // Step 2: Market hours validation
      await this.validateMarketConditions(command, warnings);

      // Step 3: Account validation
      await this.validateAccount(account, command, errors, warnings);

      // Step 4: Symbol validation
      await this.validateSymbolForTrade(command.symbol, errors);

      // Step 5: Position and risk validation
      await this.validatePositionLimits(command, account, errors, warnings);

      // Step 6: Market data validation
      const marketData = await this.validateMarketData(command.symbol, warnings);

      // Step 7: Calculate costs and requirements
      const costs = await this.calculateTradeCosts(command, marketData, account);

      const result: ValidationResult = {
        isValid: errors.length === 0,
        errors,
        warnings,
        estimatedCost: costs.estimatedCost,
        requiredBuyingPower: costs.requiredBuyingPower
      };

      this.logger.info('Trade validation completed', {
        isValid: result.isValid,
        errorCount: errors.length,
        warningCount: warnings.length,
        estimatedCost: costs.estimatedCost
      });

      return result;

    } catch (error) {
      this.logger.error('Trade validation failed', error as Error, { command });
      
      throw new DomainError(
        `Trade validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'VALIDATION_FAILED',
        { command, originalError: error }
      );
    }
  }

  async validateMarketHours(): Promise<boolean> {
    try {
      // Check cache first
      const cacheKey = 'market:hours:status';
      const cached = await this.cacheService.get<boolean>(cacheKey);
      
      if (cached !== null) {
        this.logger.debug('Market hours status from cache', { isOpen: cached });
        return cached;
      }

      // Get fresh data
      const isOpen = await this.brokerAdapter.isMarketOpen();
      
      // Cache for 1 minute
      await this.cacheService.set(cacheKey, isOpen, 60000);
      
      this.logger.debug('Market hours status fetched', { isOpen });
      return isOpen;

    } catch (error) {
      this.logger.warn('Failed to check market hours, assuming closed', { error: error as Error });
      return false;
    }
  }

  async validateSymbol(symbol: string): Promise<boolean> {
    if (!symbol || typeof symbol !== 'string') {
      return false;
    }

    // Basic format validation
    const symbolPattern = /^[A-Z]{1,5}$/;
    if (!symbolPattern.test(symbol)) {
      return false;
    }

    try {
      // Try to get market data to verify symbol exists
      await this.brokerAdapter.getMarketData(symbol);
      return true;

    } catch (error) {
      this.logger.warn('Symbol validation failed', { error: error as Error, symbol });
      return false;
    }
  }

  // ===== PRIVATE VALIDATION METHODS =====

  private validateBasicCommand(command: TradeCommand, errors: ValidationError[]): void {
    // Validate action
    if (!command.action || !['buy', 'sell'].includes(command.action)) {
      errors.push({
        code: 'INVALID_ACTION',
        message: 'Trade action must be either "buy" or "sell"',
        field: 'action',
        severity: 'error'
      });
    }

    // Validate symbol
    if (!command.symbol || typeof command.symbol !== 'string') {
      errors.push({
        code: 'MISSING_SYMBOL',
        message: 'Stock symbol is required',
        field: 'symbol',
        severity: 'error'
      });
    } else {
      const symbolPattern = /^[A-Z]{1,5}$/;
      if (!symbolPattern.test(command.symbol)) {
        errors.push({
          code: 'INVALID_SYMBOL_FORMAT',
          message: 'Symbol must be 1-5 uppercase letters',
          field: 'symbol',
          severity: 'error'
        });
      }
    }

    // Validate amount type
    if (!command.amountType || !['dollars', 'shares'].includes(command.amountType)) {
      errors.push({
        code: 'INVALID_AMOUNT_TYPE',
        message: 'Amount type must be either "dollars" or "shares"',
        field: 'amountType',
        severity: 'error'
      });
    }

    // Validate amount
    if (typeof command.amount !== 'number' || isNaN(command.amount)) {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: 'Amount must be a valid number',
        field: 'amount',
        severity: 'error'
      });
    } else if (command.amount <= 0 && command.amount !== -1) {
      // -1 is special case for "sell all"
      errors.push({
        code: 'INVALID_AMOUNT_VALUE',
        message: 'Amount must be greater than zero',
        field: 'amount',
        severity: 'error'
      });
    }

    // Validate order type
    if (!command.orderType || !['market', 'limit'].includes(command.orderType)) {
      errors.push({
        code: 'INVALID_ORDER_TYPE',
        message: 'Order type must be either "market" or "limit"',
        field: 'orderType',
        severity: 'error'
      });
    }

    // Validate limit price for limit orders
    if (command.orderType === 'limit') {
      if (!command.limitPrice || typeof command.limitPrice !== 'number' || command.limitPrice <= 0) {
        errors.push({
          code: 'MISSING_LIMIT_PRICE',
          message: 'Limit price is required for limit orders',
          field: 'limitPrice',
          severity: 'error'
        });
      }
    }
  }

  private async validateMarketConditions(command: TradeCommand, warnings: string[]): Promise<void> {
    try {
      const isMarketOpen = await this.validateMarketHours();
      
      if (!isMarketOpen) {
        warnings.push('Market is currently closed. Order will be queued for next market open.');
      }

    } catch (error) {
      warnings.push('Unable to verify market hours. Please check market status manually.');
    }
  }

  private async validateAccount(account: AccountEntity, command: TradeCommand, errors: ValidationError[], warnings: string[]): Promise<void> {
    // Check account status
    if (account.status !== 'active') {
      errors.push({
        code: 'INACTIVE_ACCOUNT',
        message: `Account is ${account.status}. Active account required for trading.`,
        field: 'account',
        severity: 'error'
      });
    }

    // Check day trading limits
    if (account.dayTradeCount >= 3) {
      warnings.push('Approaching day trading limit. Consider position holding time.');
    }

    // Basic buying power check (detailed check in calculateTradeCosts)
    if (command.action === 'buy' && account.buyingPower <= 0) {
      errors.push({
        code: 'INSUFFICIENT_BUYING_POWER',
        message: 'Insufficient buying power for purchase orders',
        field: 'buyingPower',
        severity: 'error'
      });
    }
  }

  private async validateSymbolForTrade(symbol: string, errors: ValidationError[]): Promise<void> {
    const isValid = await this.validateSymbol(symbol);
    
    if (!isValid) {
      errors.push({
        code: 'INVALID_SYMBOL',
        message: `Symbol "${symbol}" is not valid or not tradeable`,
        field: 'symbol',
        severity: 'error'
      });
    }
  }

  private async validatePositionLimits(command: TradeCommand, account: AccountEntity, errors: ValidationError[], warnings: string[]): Promise<void> {
    try {
      // Estimate position value
      let estimatedValue = 0;
      
      if (command.amountType === 'dollars') {
        estimatedValue = command.amount;
      } else {
        // For shares, we need to estimate value using current market price
        try {
          const marketData = await this.brokerAdapter.getMarketData(command.symbol);
          estimatedValue = command.amount * marketData.currentPrice;
        } catch (error) {
          warnings.push('Unable to verify position limits due to missing market data.');
          return;
        }
      }

      // Check maximum position size
      if (estimatedValue > this.MAX_POSITION_SIZE) {
        errors.push({
          code: 'POSITION_TOO_LARGE',
          message: `Position size ($${estimatedValue.toFixed(2)}) exceeds maximum allowed ($${this.MAX_POSITION_SIZE})`,
          field: 'amount',
          severity: 'error'
        });
      }

      // Check daily spending limit for buys
      if (command.action === 'buy') {
        const todaySpending = await this.getTodaySpending(account);
        const totalSpending = todaySpending + estimatedValue;
        
        if (totalSpending > this.MAX_DAILY_SPENDING) {
          errors.push({
            code: 'DAILY_LIMIT_EXCEEDED',
            message: `Daily spending limit would be exceeded. Limit: $${this.MAX_DAILY_SPENDING}, Today's spending: $${todaySpending.toFixed(2)}`,
            field: 'amount',
            severity: 'error'
          });
        } else if (totalSpending > this.MAX_DAILY_SPENDING * 0.8) {
          warnings.push(`Approaching daily spending limit (${((totalSpending / this.MAX_DAILY_SPENDING) * 100).toFixed(1)}% used).`);
        }
      }

    } catch (error) {
      this.logger.warn('Position limit validation failed', error as Error);
      warnings.push('Unable to fully validate position limits.');
    }
  }

  private async validateMarketData(symbol: string, warnings: string[]): Promise<MarketDataEntity | null> {
    try {
      const marketData = await this.brokerAdapter.getMarketData(symbol);
      
      // Check for unusual market conditions
      if (Math.abs(marketData.changePercent) > 10) {
        warnings.push(`${symbol} has moved ${marketData.changePercent.toFixed(2)}% today. Consider market volatility.`);
      }

      if (marketData.volume === 0) {
        warnings.push(`${symbol} has no trading volume data available. Exercise caution.`);
      }

      return marketData;

    } catch (error) {
      this.logger.warn('Market data validation failed', { error: error as Error, symbol });
      warnings.push('Unable to fetch current market data. Prices may be delayed.');
      return null;
    }
  }

  private async calculateTradeCosts(command: TradeCommand, marketData: MarketDataEntity | null, account: AccountEntity): Promise<{
    estimatedCost: number;
    requiredBuyingPower: number;
  }> {
    let estimatedCost = 0;
    let requiredBuyingPower = 0;

    if (command.action === 'buy') {
      if (command.amountType === 'dollars') {
        estimatedCost = command.amount;
        requiredBuyingPower = command.amount;
      } else if (marketData) {
        // Use limit price if available, otherwise current market price
        const price = command.orderType === 'limit' && command.limitPrice 
          ? command.limitPrice 
          : marketData.currentPrice;
          
        estimatedCost = command.amount * price;
        requiredBuyingPower = estimatedCost;
      }

      // Check if sufficient buying power
      if (requiredBuyingPower > account.buyingPower) {
        throw new ValidationDomainError(
          `Insufficient buying power. Required: $${requiredBuyingPower.toFixed(2)}, Available: $${account.buyingPower.toFixed(2)}`,
          { requiredBuyingPower, availableBuyingPower: account.buyingPower }
        );
      }
    } else {
      // For sell orders, we need to verify position exists
      // This would typically require fetching current positions
      estimatedCost = 0; // Selling generates cash
      requiredBuyingPower = 0;
    }

    return { estimatedCost, requiredBuyingPower };
  }

  private async getTodaySpending(account: AccountEntity): Promise<number> {
    // This would typically fetch today's completed buy orders
    // For now, return 0 as we don't have trade history storage
    // TODO: Implement when trade repository is available
    return 0;
  }

  private createValidationResult(isValid: boolean, errors: ValidationError[], warnings: string[]): ValidationResult {
    return {
      isValid,
      errors,
      warnings,
      estimatedCost: 0,
      requiredBuyingPower: 0
    };
  }
}