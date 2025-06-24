import Alpaca from '@alpacahq/alpaca-trade-api';
import { 
  BrokerAdapter, 
  TradeIntent, 
  TradeValidation, 
  TradeResult, 
  AccountInfo, 
  MarketData,
  Position,
  BrokerError 
} from '../types';
import { config } from '../config';

export class AlpacaAdapter implements BrokerAdapter {
  private alpaca: Alpaca;

  constructor() {
    this.alpaca = new Alpaca({
      keyId: config.alpacaApiKey,
      secretKey: config.alpacaSecretKey,
      baseUrl: config.alpacaBaseUrl,
      paper: config.alpacaBaseUrl.includes('paper')
    });
  }

  async validateOrder(order: TradeIntent): Promise<TradeValidation> {
    try {
      // Get account information
      const account = await this.alpaca.getAccount();
      const buyingPower = parseFloat(account.buying_power);
      
      // Get current market data
      const marketData = await this.getMarketData(order.symbol);
      
      // Calculate estimated cost
      let estimatedCost: number;
      let estimatedShares: number;
      
      if (order.amountType === 'dollars') {
        estimatedCost = order.amount;
        estimatedShares = order.amount / marketData.currentPrice;
      } else {
        estimatedShares = order.amount;
        estimatedCost = order.amount * marketData.currentPrice;
      }
      
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Validation checks
      if (!marketData.isMarketOpen) {
        warnings.push('Market is currently closed. Order will be queued for next market open.');
      }
      
      if (estimatedCost > buyingPower) {
        errors.push(`Insufficient buying power. Available: $${buyingPower.toFixed(2)}, Required: $${estimatedCost.toFixed(2)}`);
      }
      
      if (estimatedCost > config.maxPositionSize) {
        errors.push(`Order exceeds maximum position size of $${config.maxPositionSize}`);
      }
      
      // Check daily spending limit
      const todaySpending = await this.getTodaySpending();
      if (todaySpending + estimatedCost > config.maxDailySpending) {
        errors.push(`Order would exceed daily spending limit of $${config.maxDailySpending}`);
      }
      
      // Check if symbol is tradable
      try {
        const asset = await this.alpaca.getAsset(order.symbol);
        if (!asset.tradable) {
          errors.push(`${order.symbol} is not tradable`);
        }
      } catch (error) {
        errors.push(`Invalid symbol: ${order.symbol}`);
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        estimatedCost,
        accountBalance: buyingPower,
        currentPrice: marketData.currentPrice,
        estimatedShares
      };
    } catch (error) {
      throw new BrokerError('Failed to validate order', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async executeOrder(order: TradeIntent): Promise<TradeResult> {
    try {
      // Create order parameters
      const orderParams: any = {
        symbol: order.symbol,
        side: order.action,
        type: order.orderType,
        time_in_force: 'day'
      };
      
      if (order.amountType === 'dollars') {
        // For dollar amounts, we need to calculate shares based on current price
        try {
          const marketData = await this.getMarketData(order.symbol);
          orderParams.qty = Math.floor(order.amount / marketData.currentPrice);
          
          if (orderParams.qty === 0) {
            throw new BrokerError('Order amount too small to buy even one share');
          }
        } catch (error) {
          // If we can't get market data (market closed), estimate based on notional value
          // Alpaca will handle the actual share calculation when the order executes
          console.log('Market data unavailable, using notional order');
          orderParams.notional = order.amount;
          delete orderParams.qty;
        }
      } else {
        orderParams.qty = order.amount;
      }
      
      if (order.orderType === 'limit' && order.limitPrice) {
        orderParams.limit_price = order.limitPrice;
      }
      
      // Submit the order
      const alpacaOrder = await this.alpaca.createOrder(orderParams);
      
      // Wait a moment for order to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get updated order status
      const updatedOrder = await this.alpaca.getOrder(alpacaOrder.id);
      
      const result: TradeResult = {
        success: updatedOrder.status !== 'rejected' && updatedOrder.status !== 'canceled',
        orderId: updatedOrder.id,
        timestamp: new Date(),
        message: this.getOrderStatusMessage(updatedOrder)
      };

      if (updatedOrder.filled_avg_price) {
        result.executedPrice = parseFloat(updatedOrder.filled_avg_price);
      }
      
      if (updatedOrder.filled_qty) {
        result.executedShares = parseFloat(updatedOrder.filled_qty);
      }
      
      if (updatedOrder.filled_avg_price && updatedOrder.filled_qty) {
        result.executedValue = parseFloat(updatedOrder.filled_avg_price) * parseFloat(updatedOrder.filled_qty);
      }
      
      if (updatedOrder.status === 'rejected') {
        result.error = 'Order was rejected by broker';
      }

      return result;
    } catch (error) {
      throw new BrokerError('Failed to execute order', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAccountInfo(): Promise<AccountInfo> {
    try {
      const [account, positions] = await Promise.all([
        this.alpaca.getAccount(),
        this.alpaca.getPositions()
      ]);
      
      const mappedPositions: Position[] = positions.map((pos: any) => ({
        symbol: pos.symbol,
        quantity: parseFloat(pos.qty),
        marketValue: parseFloat(pos.market_value),
        costBasis: parseFloat(pos.cost_basis),
        unrealizedPnL: parseFloat(pos.unrealized_pl),
        side: parseFloat(pos.qty) > 0 ? 'long' : 'short'
      }));
      
      return {
        accountId: account.account_number,
        buyingPower: parseFloat(account.buying_power),
        portfolioValue: parseFloat(account.portfolio_value),
        dayTradeCount: account.daytrade_count,
        positions: mappedPositions
      };
    } catch (error) {
      throw new BrokerError('Failed to get account info', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getMarketData(symbol: string): Promise<MarketData> {
    try {
      // Check if market is open first
      const marketIsOpen = await this.isMarketOpen();
      
      // Get latest trade
      let latestTrade;
      let currentPrice;
      
      try {
        latestTrade = await this.alpaca.getLatestTrade(symbol);
        currentPrice = (latestTrade as any).Price || (latestTrade as any).price || (latestTrade as any).p;
      } catch (error) {
        // If we can't get latest trade, try to get the last close price
        console.log('Could not get latest trade, fetching last close price...');
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
        } else {
          throw new Error('Could not fetch any price data');
        }
      }
      
      // Get daily bar for previous close
      const bars = await this.alpaca.getBarsV2(symbol, {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
        timeframe: '1Day',
        limit: 2
      });
      
      let previousClose = currentPrice;
      const barArray = [];
      for await (const bar of bars) {
        barArray.push(bar);
      }
      
      if (barArray.length >= 2) {
        previousClose = (barArray[barArray.length - 2] as any).c || (barArray[barArray.length - 2] as any).Close;
      }
      
      const changePercent = ((currentPrice - previousClose) / previousClose) * 100;
      
      return {
        symbol,
        currentPrice,
        previousClose,
        changePercent,
        volume: (latestTrade as any)?.Size || (latestTrade as any)?.size || (latestTrade as any)?.s || 0,
        isMarketOpen: marketIsOpen
      };
    } catch (error) {
      throw new BrokerError('Failed to get market data', {
        error: error instanceof Error ? error.message : 'Unknown error',
        symbol
      });
    }
  }

  async isMarketOpen(): Promise<boolean> {
    try {
      const clock = await this.alpaca.getClock();
      return clock.is_open;
    } catch (error) {
      throw new BrokerError('Failed to check market status', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getTodaySpending(): Promise<number> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const orders = await this.alpaca.getOrders({
        status: 'all',
        after: today.toISOString(),
        direction: 'asc',
        until: new Date().toISOString(),
        limit: 500,
        nested: true,
        symbols: ''
      } as any);
      
      return orders
        .filter((order: any) => order.side === 'buy' && order.filled_qty)
        .reduce((total: number, order: any) => {
          const value = parseFloat(order.filled_qty!) * parseFloat(order.filled_avg_price || '0');
          return total + value;
        }, 0);
    } catch (error) {
      console.error('Failed to calculate today\'s spending:', error);
      return 0;
    }
  }

  private getOrderStatusMessage(order: any): string {
    switch (order.status) {
      case 'filled':
        return `Order filled at $${order.filled_avg_price} for ${order.filled_qty} shares`;
      case 'partially_filled':
        return `Order partially filled: ${order.filled_qty} of ${order.qty} shares at $${order.filled_avg_price}`;
      case 'pending_new':
      case 'accepted':
        return 'Order accepted and pending execution';
      case 'rejected':
        return 'Order rejected by broker';
      case 'canceled':
        return 'Order canceled';
      default:
        return `Order status: ${order.status}`;
    }
  }
} 