// ============================================================================
// ALPACA BROKER ADAPTER - INFRASTRUCTURE LAYER
// ============================================================================

import Alpaca from '@alpacahq/alpaca-trade-api';
import { 
  IBrokerAdapter, 
  AccountEntity, 
  PositionEntity, 
  MarketDataEntity,
  OrderRequest,
  OrderResult,
  InfrastructureError
} from '../../core/interfaces';
import { config } from '../../config';
import { ILogger } from '../../core/interfaces';

export class AlpacaBrokerAdapter implements IBrokerAdapter {
  private alpaca: Alpaca;

  constructor(private logger: ILogger) {
    this.alpaca = new Alpaca({
      keyId: config.alpacaApiKey,
      secretKey: config.alpacaSecretKey,
      baseUrl: config.alpacaBaseUrl,
      paper: config.alpacaBaseUrl.includes('paper')
    });

    this.logger.info('AlpacaBrokerAdapter initialized', {
      baseUrl: config.alpacaBaseUrl,
      isPaper: config.alpacaBaseUrl.includes('paper')
    });
  }

  async executeOrder(orderRequest: OrderRequest): Promise<OrderResult> {
    this.logger.info('Executing order', { orderRequest });

    try {
      // Validate order request
      this.validateOrderRequest(orderRequest);

      // Map our order request to Alpaca format
      const alpacaOrderParams = this.mapToAlpacaOrder(orderRequest);
      
      // Submit order to Alpaca
      const alpacaOrder = await this.alpaca.createOrder(alpacaOrderParams);
      
      this.logger.info('Order submitted to Alpaca', { 
        orderId: alpacaOrder.id,
        status: alpacaOrder.status 
      });

      // Map Alpaca response to our format
      return this.mapFromAlpacaOrder(alpacaOrder);

    } catch (error) {
      const errorMessage = `Failed to execute order: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Order execution failed', error as Error, { orderRequest });
      
      throw new InfrastructureError(
        errorMessage,
        'ORDER_EXECUTION_FAILED',
        'Alpaca',
        { orderRequest, originalError: error }
      );
    }
  }

  async getAccountInfo(): Promise<AccountEntity> {
    this.logger.debug('Fetching account info from Alpaca');

    try {
      const account = await this.alpaca.getAccount();
      
      const accountEntity: AccountEntity = {
        id: account.account_number,
        accountNumber: account.account_number,
        buyingPower: parseFloat(account.buying_power),
        portfolioValue: parseFloat(account.portfolio_value),
        totalEquity: parseFloat(account.equity),
        dayTradeCount: account.daytrade_count || 0,
        status: this.mapAccountStatus(account.status),
        lastUpdated: new Date()
      };

      this.logger.debug('Account info retrieved successfully', {
        accountId: accountEntity.id,
        portfolioValue: accountEntity.portfolioValue
      });

      return accountEntity;

    } catch (error) {
      const errorMessage = `Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Failed to fetch account info', error as Error);
      
      throw new InfrastructureError(
        errorMessage,
        'ACCOUNT_FETCH_FAILED',
        'Alpaca',
        { originalError: error }
      );
    }
  }

  async getPositions(): Promise<PositionEntity[]> {
    this.logger.debug('Fetching positions from Alpaca');

    try {
      const positions = await this.alpaca.getPositions();
      
      const positionEntities: PositionEntity[] = positions.map((position: any) => ({
        id: `${position.asset_id}_${position.symbol}`,
        symbol: position.symbol,
        quantity: parseFloat(position.qty),
        averagePrice: parseFloat(position.avg_entry_price || '0'),
        marketValue: parseFloat(position.market_value || '0'),
        unrealizedPnL: parseFloat(position.unrealized_pl || '0'),
        realizedPnL: 0, // Alpaca doesn't provide this directly
        side: parseFloat(position.qty) > 0 ? 'long' : 'short',
        lastUpdated: new Date()
      }));

      this.logger.debug('Positions retrieved successfully', {
        positionCount: positionEntities.length
      });

      return positionEntities;

    } catch (error) {
      const errorMessage = `Failed to get positions: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Failed to fetch positions', error as Error);
      
      throw new InfrastructureError(
        errorMessage,
        'POSITIONS_FETCH_FAILED',
        'Alpaca',
        { originalError: error }
      );
    }
  }

  async getMarketData(symbol: string): Promise<MarketDataEntity> {
    this.logger.debug('Fetching market data', { symbol });

    try {
      // Get market status first
      const isMarketOpen = await this.isMarketOpen();
      
      // Try to get latest trade data
      let currentPrice = 0;
      let volume = 0;
      
      try {
        const latestTrade = await this.alpaca.getLatestTrade(symbol);
        currentPrice = (latestTrade as any).Price || (latestTrade as any).price || (latestTrade as any).p || 0;
        volume = (latestTrade as any).Size || (latestTrade as any).size || (latestTrade as any).s || 0;
      } catch (tradeError) {
        this.logger.warn('Failed to get latest trade, trying quote data', { symbol });
        
        // Fallback to quote data
        try {
          const latestQuote = await this.alpaca.getLatestQuote(symbol);
          const bid = (latestQuote as any).BidPrice || (latestQuote as any).bid_price || (latestQuote as any).bp || 0;
          const ask = (latestQuote as any).AskPrice || (latestQuote as any).ask_price || (latestQuote as any).ap || 0;
          currentPrice = bid > 0 && ask > 0 ? (bid + ask) / 2 : Math.max(bid, ask);
        } catch (quoteError) {
          // Final fallback to daily bars
          this.logger.warn('Failed to get quote data, using daily bars', { symbol });
          const bars = await this.alpaca.getBarsV2(symbol, {
            start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            end: new Date().toISOString(),
            timeframe: '1Day',
            limit: 1
          });
          
          const barArray = [];
          for await (const bar of bars) {
            barArray.push(bar);
          }
          
          if (barArray.length > 0) {
            currentPrice = (barArray[0] as any).c || (barArray[0] as any).Close;
            volume = (barArray[0] as any).v || (barArray[0] as any).Volume || 0;
          } else {
            throw new Error(`No price data available for ${symbol}`);
          }
        }
      }

      // Get previous close for change calculation
      let previousClose = currentPrice;
      try {
        const bars = await this.alpaca.getBarsV2(symbol, {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          end: new Date().toISOString(),
          timeframe: '1Day',
          limit: 2
        });
        
        const barArray = [];
        for await (const bar of bars) {
          barArray.push(bar);
        }
        
        if (barArray.length >= 2) {
          previousClose = (barArray[barArray.length - 2] as any).c || (barArray[barArray.length - 2] as any).Close;
        }
      } catch (error) {
        this.logger.warn('Failed to get previous close', { symbol });
      }

      const changeAmount = currentPrice - previousClose;
      const changePercent = previousClose > 0 ? (changeAmount / previousClose) * 100 : 0;

      const marketDataEntity: MarketDataEntity = {
        symbol,
        currentPrice,
        previousClose,
        changeAmount,
        changePercent,
        volume,
        isMarketOpen,
        timestamp: new Date()
      };

      this.logger.debug('Market data retrieved successfully', {
        symbol,
        currentPrice,
        changePercent
      });

      return marketDataEntity;

    } catch (error) {
      const errorMessage = `Failed to get market data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Failed to fetch market data', error as Error, { symbol });
      
      throw new InfrastructureError(
        errorMessage,
        'MARKET_DATA_FETCH_FAILED',
        'Alpaca',
        { symbol, originalError: error }
      );
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    this.logger.info('Cancelling order', { orderId });

    try {
      await this.alpaca.cancelOrder(orderId);
      
      this.logger.info('Order cancelled successfully', { orderId });
      return true;

    } catch (error) {
      const errorMessage = `Failed to cancel order ${orderId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.logger.error('Failed to cancel order', error as Error, { orderId });
      
      throw new InfrastructureError(
        errorMessage,
        'ORDER_CANCELLATION_FAILED',
        'Alpaca',
        { orderId, originalError: error }
      );
    }
  }

  async isMarketOpen(): Promise<boolean> {
    try {
      const clock = await this.alpaca.getClock();
      return clock.is_open;
    } catch (error) {
      this.logger.warn('Failed to check market status, assuming closed', error as Error);
      return false;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  private validateOrderRequest(orderRequest: OrderRequest): void {
    if (!orderRequest.symbol) {
      throw new InfrastructureError('Symbol is required', 'INVALID_ORDER_REQUEST', 'Alpaca');
    }

    if (!orderRequest.side || !['buy', 'sell'].includes(orderRequest.side)) {
      throw new InfrastructureError('Valid side (buy/sell) is required', 'INVALID_ORDER_REQUEST', 'Alpaca');
    }

    if (!orderRequest.quantity || orderRequest.quantity <= 0) {
      throw new InfrastructureError('Valid quantity is required', 'INVALID_ORDER_REQUEST', 'Alpaca');
    }

    if (!orderRequest.orderType || !['market', 'limit', 'stop', 'stop_limit'].includes(orderRequest.orderType)) {
      throw new InfrastructureError('Valid order type is required', 'INVALID_ORDER_REQUEST', 'Alpaca');
    }

    if (orderRequest.orderType === 'limit' && (!orderRequest.price || orderRequest.price <= 0)) {
      throw new InfrastructureError('Limit price is required for limit orders', 'INVALID_ORDER_REQUEST', 'Alpaca');
    }

    if ((orderRequest.orderType === 'stop' || orderRequest.orderType === 'stop_limit') && 
        (!orderRequest.stopPrice || orderRequest.stopPrice <= 0)) {
      throw new InfrastructureError('Stop price is required for stop orders', 'INVALID_ORDER_REQUEST', 'Alpaca');
    }
  }

  private mapToAlpacaOrder(orderRequest: OrderRequest): any {
    const alpacaOrder: any = {
      symbol: orderRequest.symbol.toUpperCase(),
      qty: orderRequest.quantity,
      side: orderRequest.side,
      type: orderRequest.orderType,
      time_in_force: orderRequest.timeInForce || 'day'
    };

    if (orderRequest.price) {
      alpacaOrder.limit_price = orderRequest.price;
    }

    if (orderRequest.stopPrice) {
      alpacaOrder.stop_price = orderRequest.stopPrice;
    }

    if (orderRequest.clientOrderId) {
      alpacaOrder.client_order_id = orderRequest.clientOrderId;
    }

    return alpacaOrder;
  }

  private mapFromAlpacaOrder(alpacaOrder: any): OrderResult {
    const success = alpacaOrder.status !== 'rejected' && alpacaOrder.status !== 'canceled';
    
    const result: OrderResult = {
      success,
      orderId: alpacaOrder.id,
      status: alpacaOrder.status,
      executedQuantity: parseFloat(alpacaOrder.filled_qty || '0'),
      message: success ? 
        `Order ${alpacaOrder.status}` : 
        alpacaOrder.reject_reason || `Order ${alpacaOrder.status}`,
      timestamp: new Date()
    };
    
    // Set optional properties conditionally
    if (alpacaOrder.filled_avg_price) {
      result.executedPrice = parseFloat(alpacaOrder.filled_avg_price);
    }
    
    return result;
  }

  private mapAccountStatus(alpacaStatus: string): 'active' | 'restricted' | 'suspended' {
    switch (alpacaStatus?.toLowerCase()) {
      case 'active':
      case 'trading':
        return 'active';
      case 'restricted':
      case 'day_trading_buying_power_restricted':
        return 'restricted';
      case 'suspended':
      case 'closed':
        return 'suspended';
      default:
        return 'active';
    }
  }
}