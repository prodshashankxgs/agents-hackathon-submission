import Alpaca from '@alpacahq/alpaca-trade-api';
import fetch from 'node-fetch';
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
import { cacheService } from '../cache/cache-service';

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
      
      // Create validation cache key
      const validationKey = `${order.symbol}-${order.action}-${order.amountType}-${order.amount}`;
      const cachedValidation = cacheService.getValidation(validationKey);
      if (cachedValidation) {
        return cachedValidation;
      }

      // Try to get current market data, but don't fail if unavailable
      let marketData: MarketData | null = null;
      let marketDataError = false;
      
      try {
        marketData = await this.getMarketData(order.symbol);
      } catch (error) {
        console.log('Market data unavailable during validation, will use notional order');
        marketDataError = true;
      }
      
      // Calculate estimated cost
      let estimatedCost: number;
      let estimatedShares: number;
      let currentPrice: number;
      
      if (marketData) {
        currentPrice = marketData.currentPrice;
        if (order.amountType === 'dollars') {
          estimatedCost = order.amount;
          estimatedShares = order.amount / currentPrice;
        } else {
          estimatedShares = order.amount;
          estimatedCost = order.amount * currentPrice;
        }
      } else {
        // Market data unavailable - use estimates for validation
        if (order.amountType === 'dollars') {
          estimatedCost = order.amount;
          estimatedShares = 0; // Will be calculated by broker
          currentPrice = 0; // Unknown
        } else {
          // For share-based orders without market data, we can't validate properly
          // But we'll allow it and let the broker handle it
          estimatedShares = order.amount;
          estimatedCost = 0; // Unknown
          currentPrice = 0; // Unknown
        }
      }
      
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Add warning about market data unavailability
      if (marketDataError) {
        warnings.push('Market data unavailable. Order will be processed as notional (dollar-based) order when market opens.');
      }
      
      // Validation checks
      if (marketData && !marketData.isMarketOpen) {
        warnings.push('Market is currently closed. Order will be queued for next market open.');
      }
      
      // Only check buying power if we have a reliable cost estimate
      if (marketData && estimatedCost > buyingPower) {
        errors.push(`Insufficient buying power. Available: $${buyingPower.toFixed(2)}, Required: $${estimatedCost.toFixed(2)}`);
      } else if (!marketData && order.amountType === 'dollars' && order.amount > buyingPower) {
        errors.push(`Insufficient buying power. Available: $${buyingPower.toFixed(2)}, Required: $${order.amount.toFixed(2)}`);
      }
      
      // Check position size limits
      const orderAmount = order.amountType === 'dollars' ? order.amount : estimatedCost;
      if (orderAmount > config.maxPositionSize) {
        errors.push(`Order exceeds maximum position size of $${config.maxPositionSize}`);
      }
      
      // Check daily spending limit
      const todaySpending = await this.getTodaySpending();
      if (orderAmount > 0 && todaySpending + orderAmount > config.maxDailySpending) {
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
      
      const validation = {
        isValid: errors.length === 0,
        errors,
        warnings,
        estimatedCost: marketData ? estimatedCost : order.amount,
        accountBalance: buyingPower,
        currentPrice: currentPrice,
        estimatedShares: estimatedShares
      };

      // Cache validation for 1 minute
      cacheService.setValidation(validationKey, validation, 60000);
      return validation;
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
        time_in_force: order.amountType === 'dollars' ? 'day' : 'day' // Both use 'day' for now
      };
      
      if (order.amountType === 'dollars') {
        // Use notional orders - Alpaca handles fractional shares automatically
        console.log(`Creating notional order for ${order.symbol}: $${order.amount}`);
        orderParams.notional = order.amount;
        // Remove qty parameter for notional orders
        delete orderParams.qty;
      } else {
        orderParams.qty = order.amount;
      }
      
      if (order.orderType === 'limit' && order.limitPrice) {
        orderParams.limit_price = order.limitPrice;
      }
      
      // Submit the order
      console.log('Submitting order with params:', JSON.stringify(orderParams, null, 2));
      const alpacaOrder = await this.alpaca.createOrder(orderParams);
      console.log('Order submitted, initial response:', JSON.stringify(alpacaOrder, null, 2));
      
      // Return immediately with order details - don't wait for execution
      // In paper trading, orders execute instantly but status updates may be delayed
      
      const result: TradeResult = {
        success: alpacaOrder.status !== 'rejected' && alpacaOrder.status !== 'canceled',
        orderId: alpacaOrder.id,
        timestamp: new Date(),
        message: this.getOrderStatusMessage(alpacaOrder)
      };

      // For notional orders, set the expected execution value immediately
      if (order.amountType === 'dollars') {
        result.executedValue = order.amount;
        // For paper trading, we can estimate shares based on current market price
        if (alpacaOrder.status === 'accepted' || alpacaOrder.status === 'pending_new') {
          try {
            const marketData = await this.getMarketData(order.symbol);
            result.executedShares = order.amount / marketData.currentPrice;
            result.executedPrice = marketData.currentPrice;
          } catch (error) {
            console.log('Could not estimate execution details:', error);
          }
        }
      }

      // Handle any immediate fill information from the initial response
      if (alpacaOrder.filled_avg_price) {
        result.executedPrice = parseFloat(alpacaOrder.filled_avg_price);
      }
      
      if (alpacaOrder.filled_qty) {
        result.executedShares = parseFloat(alpacaOrder.filled_qty);
      }
      
      if (alpacaOrder.status === 'rejected') {
        result.error = alpacaOrder.reject_reason || 'Order was rejected by broker';
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
      // Check cache first
      const cached = cacheService.getAccountInfo();
      if (cached) {
        return cached;
      }

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
      
      const accountInfo = {
        accountId: account.account_number,
        buyingPower: parseFloat(account.buying_power),
        portfolioValue: parseFloat(account.portfolio_value),
        dayTradeCount: account.daytrade_count,
        positions: mappedPositions
      };

      // Cache account info for 2 minutes
      cacheService.setAccountInfo(accountInfo, 120000);
      return accountInfo;
    } catch (error) {
      throw new BrokerError('Failed to get account info', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getMarketData(symbol: string): Promise<MarketData> {
    try {
      // Check cache first
      const cached = cacheService.getMarketData(symbol);
      if (cached) {
        return cached;
      }

      // Check if market is open first
      let marketIsOpen = false;
      try {
        marketIsOpen = await this.isMarketOpen();
      } catch (error) {
        console.log('Could not check market status, assuming closed');
        marketIsOpen = false;
      }
      
      // Get latest trade with fallback methods
      let currentPrice: number;
      let volume = 0;
      
      try {
        // Try latest trade first
        const latestTrade = await this.alpaca.getLatestTrade(symbol);
        currentPrice = (latestTrade as any).Price || (latestTrade as any).price || (latestTrade as any).p;
        volume = (latestTrade as any)?.Size || (latestTrade as any)?.size || (latestTrade as any)?.s || 0;
      } catch (tradeError) {
        console.log('Could not get latest trade, trying quote data...');
        
        try {
          // Try latest quote
          const latestQuote = await this.alpaca.getLatestQuote(symbol);
          const bid = (latestQuote as any).BidPrice || (latestQuote as any).bid_price || (latestQuote as any).bp || 0;
          const ask = (latestQuote as any).AskPrice || (latestQuote as any).ask_price || (latestQuote as any).ap || 0;
          currentPrice = bid > 0 && ask > 0 ? (bid + ask) / 2 : Math.max(bid, ask);
        } catch (quoteError) {
          console.log('Could not get quote data, fetching last close price...');
          
          try {
            // Fallback to daily bars
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
              throw new Error('No price data available');
            }
          } catch (barError) {
            // Final fallback - use a placeholder price
            console.warn(`Could not fetch any price data for ${symbol}, using placeholder`);
            currentPrice = 100; // Placeholder price
            volume = 0;
          }
        }
      }
      
      // Get previous close with error handling
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
        } else if (barArray.length === 1) {
          // Use the same day's open as previous close if only one bar available
          previousClose = (barArray[0] as any).o || (barArray[0] as any).Open || currentPrice;
        }
      } catch (error) {
        console.log('Could not fetch historical data for previous close, using current price');
        previousClose = currentPrice;
      }
      
      const changePercent = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;
      
      const marketData = {
        symbol,
        currentPrice,
        previousClose,
        changePercent,
        volume,
        isMarketOpen: marketIsOpen
      };

      // Cache market data for 30 seconds (or 5 minutes if market is closed)
      const ttl = marketIsOpen ? 30000 : 300000;
      cacheService.setMarketData(symbol, marketData, ttl);
      return marketData;
    } catch (error) {
      // Don't throw errors for market data - return cached data or placeholder
      console.warn(`Market data error for ${symbol}:`, error);
      
      // Try to return cached data (even if we couldn't get fresh data)
      const cached = cacheService.getMarketData(symbol);
      if (cached) {
        console.log(`Using cached data for ${symbol}`);
        return cached;
      }
      
      // Final fallback - return placeholder data
      console.log(`Using placeholder market data for ${symbol}`);
      return {
        symbol,
        currentPrice: 100, // Placeholder
        previousClose: 100,
        changePercent: 0,
        volume: 0,
        isMarketOpen: false
      };
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

  async getPortfolioHistory(period: string = '1M', timeframe: string = '1D'): Promise<any> {
    try {
      // Make direct API call to portfolio history endpoint
      const url = `${config.alpacaBaseUrl}/v2/account/portfolio/history`;
      
      console.log(`Fetching portfolio history: period=${period}, timeframe=${timeframe}`);
      
      // First, try with the requested period
      let params = new URLSearchParams({
        timeframe: timeframe,
        extended_hours: 'true'
      });

      // For ALL, use 'all' period directly
      if (period === 'ALL') {
        params.append('period', 'all');
      } else {
        params.append('period', period);
      }

      let response = await fetch(`${url}?${params}`, {
        method: 'GET',
        headers: {
          'APCA-API-KEY-ID': config.alpacaApiKey,
          'APCA-API-SECRET-KEY': config.alpacaSecretKey,
          'Content-Type': 'application/json'
        }
      });

      let data: any;
      if (response.ok) {
        data = await response.json();
        
        // Validate the response structure
        if (data && typeof data === 'object') {
          // If we got data and it has timestamps, validate and return it
          if (data.timestamp && Array.isArray(data.timestamp) && data.timestamp.length > 0) {
            console.log(`Successfully fetched ${data.timestamp.length} data points for period ${period}`);
            
            // Ensure all required arrays exist and have the same length
            const { timestamp, equity, profit_loss, profit_loss_pct, base_value } = data;
            
            if (!equity || !Array.isArray(equity)) {
              console.warn('Missing or invalid equity data');
              data.equity = timestamp.map(() => base_value || 0);
            }
            
            if (!profit_loss || !Array.isArray(profit_loss)) {
              console.warn('Missing or invalid profit_loss data');
              data.profit_loss = timestamp.map(() => 0);
            }
            
            if (!profit_loss_pct || !Array.isArray(profit_loss_pct)) {
              console.warn('Missing or invalid profit_loss_pct data');
              data.profit_loss_pct = timestamp.map(() => 0);
            }
            
            // Ensure all arrays have the same length
            const minLength = Math.min(
              timestamp.length,
              data.equity.length,
              data.profit_loss.length,
              data.profit_loss_pct.length
            );
            
            if (minLength < timestamp.length) {
              console.warn(`Data arrays have mismatched lengths, truncating to ${minLength}`);
              data.timestamp = timestamp.slice(0, minLength);
              data.equity = data.equity.slice(0, minLength);
              data.profit_loss = data.profit_loss.slice(0, minLength);
              data.profit_loss_pct = data.profit_loss_pct.slice(0, minLength);
            }
            
            return data;
          } else if (data.timestamp && Array.isArray(data.timestamp) && data.timestamp.length === 0) {
            console.log(`No data available for period ${period}, trying fallback`);
          } else {
            console.warn('Invalid response structure:', data);
          }
        }
      } else {
        const errorText = await response.text();
        console.warn(`API request failed with status ${response.status}: ${errorText}`);
      }

      // If the requested period failed or returned no data, fallback to 'all'
      // This handles cases where the account is newer than the requested period
      if (period !== 'ALL') {
        console.log(`Period ${period} returned no data or failed, falling back to 'all' period`);
        
        params = new URLSearchParams({
          period: 'all',
          timeframe: timeframe,
          extended_hours: 'true'
        });

        response = await fetch(`${url}?${params}`, {
          method: 'GET',
          headers: {
            'APCA-API-KEY-ID': config.alpacaApiKey,
            'APCA-API-SECRET-KEY': config.alpacaSecretKey,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to fetch portfolio history (fallback): ${response.status} ${errorText}`);
        }

        data = await response.json();
        
        // Validate fallback response
        if (data && typeof data === 'object') {
          if (data.timestamp && Array.isArray(data.timestamp)) {
            console.log(`Fallback successful: fetched ${data.timestamp.length} data points`);
            
            // Apply same validation as above
            const { timestamp, equity, profit_loss, profit_loss_pct, base_value } = data;
            
            if (!equity || !Array.isArray(equity)) {
              console.warn('Missing or invalid equity data in fallback');
              data.equity = timestamp.map(() => base_value || 0);
            }
            
            if (!profit_loss || !Array.isArray(profit_loss)) {
              console.warn('Missing or invalid profit_loss data in fallback');
              data.profit_loss = timestamp.map(() => 0);
            }
            
            if (!profit_loss_pct || !Array.isArray(profit_loss_pct)) {
              console.warn('Missing or invalid profit_loss_pct data in fallback');
              data.profit_loss_pct = timestamp.map(() => 0);
            }
            
            // Ensure all arrays have the same length
            const minLength = Math.min(
              timestamp.length,
              data.equity.length,
              data.profit_loss.length,
              data.profit_loss_pct.length
            );
            
            if (minLength < timestamp.length) {
              console.warn(`Fallback data arrays have mismatched lengths, truncating to ${minLength}`);
              data.timestamp = timestamp.slice(0, minLength);
              data.equity = data.equity.slice(0, minLength);
              data.profit_loss = data.profit_loss.slice(0, minLength);
              data.profit_loss_pct = data.profit_loss_pct.slice(0, minLength);
            }
            
            return data;
          }
        }
      }

      // If we still don't have valid data, check if this is a very new account
      console.log('No portfolio history data available - this may be a new account');
      
      // For very new accounts, return a minimal structure to prevent crashes
      const now = Math.floor(Date.now() / 1000);
      const account = await this.alpaca.getAccount();
      const portfolioValue = parseFloat(account.portfolio_value) || parseFloat(account.equity) || 0;
      
      return {
        timestamp: [now],
        equity: [portfolioValue],
        profit_loss: [0],
        profit_loss_pct: [0],
        base_value: portfolioValue,
        timeframe: timeframe
      };
      
    } catch (error) {
      console.error('Portfolio history error:', error);
      
      // As a last resort, try to return current account value as a single data point
      try {
        console.log('Attempting to create minimal portfolio data from current account info');
        const account = await this.alpaca.getAccount();
        const portfolioValue = parseFloat(account.portfolio_value) || parseFloat(account.equity) || 0;
        const now = Math.floor(Date.now() / 1000);
        
        return {
          timestamp: [now],
          equity: [portfolioValue],
          profit_loss: [0],
          profit_loss_pct: [0],
          base_value: portfolioValue,
          timeframe: timeframe
        };
      } catch (fallbackError) {
        console.error('Failed to create fallback portfolio data:', fallbackError);
        throw new BrokerError('Failed to get portfolio history', {
          error: error instanceof Error ? error.message : 'Unknown error',
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error'
        });
      }
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