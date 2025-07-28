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
  BrokerError,
  // Options types
  OptionsBrokerAdapter,
  OptionsTradeIntent,
  OptionsValidation,
  OptionsTradeResult,
  OptionsChain,
  OptionsPosition,
  OptionQuote,
  GreeksCalculation,
  OptionsMarketData,
  OptionContract
} from '../types';
import { config } from '../config';
import { cacheService } from '../cache/cache-service';

export class AlpacaAdapter implements OptionsBrokerAdapter {
  private alpaca: Alpaca;

  constructor() {
    this.alpaca = new Alpaca({
      keyId: config.alpacaApiKey,
      secretKey: config.alpacaSecretKey,
      baseUrl: config.alpacaBaseUrl,
      paper: config.alpacaBaseUrl.includes('paper')
    });
  }

  // ===== EXISTING STOCK METHODS =====

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
      
      // Different validation logic for buy vs sell orders
      if (order.action === 'sell') {
        // For sell orders, validate position ownership instead of buying power
        const sellValidation = await this.validateSellOrder(order, estimatedCost, estimatedShares, currentPrice);
        errors.push(...sellValidation.errors);
        warnings.push(...sellValidation.warnings);
      } else {
        // For buy orders, check buying power as before
        if (marketData && estimatedCost > buyingPower) {
          errors.push(`Insufficient buying power. Available: $${buyingPower.toFixed(2)}, Required: $${estimatedCost.toFixed(2)}`);
        } else if (!marketData && order.amountType === 'dollars' && order.amount > buyingPower) {
          errors.push(`Insufficient buying power. Available: $${buyingPower.toFixed(2)}, Required: $${order.amount.toFixed(2)}`);
        }
        
        // Check position size limits for buy orders
        const orderAmount = order.amountType === 'dollars' ? order.amount : estimatedCost;
        if (orderAmount > config.maxPositionSize) {
          errors.push(`Order exceeds maximum position size of $${config.maxPositionSize}`);
        }
        
        // Check daily spending limit for buy orders
        const todaySpending = await this.getTodaySpending();
        if (orderAmount > 0 && todaySpending + orderAmount > config.maxDailySpending) {
          errors.push(`Order would exceed daily spending limit of $${config.maxDailySpending}`);
        }
      }
      
      // Check if symbol is tradable (applies to both buy and sell)
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

  /**
   * Validate sell orders by checking position ownership
   */
  private async validateSellOrder(
    order: TradeIntent, 
    estimatedCost: number, 
    estimatedShares: number, 
    currentPrice: number
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Get current positions - use cached data if available from getAccountInfo
      const positions = await this.alpaca.getPositions();
      const position = positions.find((pos: any) => pos.symbol === order.symbol);

      if (!position) {
        errors.push(`No position found for ${order.symbol}. You must own shares to sell them.`);
        return { errors, warnings };
      }

      const ownedShares = parseFloat(position.qty);
      const ownedMarketValue = parseFloat(position.market_value);

      // Handle short positions (negative quantities)
      if (ownedShares <= 0) {
        if (ownedShares < 0) {
          warnings.push(`You have a short position in ${order.symbol}. Selling will increase your short position.`);
        } else {
          errors.push(`No long position found for ${order.symbol}. You must own shares to sell them.`);
          return { errors, warnings };
        }
      }

      // Validate the sell amount against owned position
      if (order.amountType === 'dollars') {
        // For dollar-based sells, check against market value
        const requestedDollarAmount = order.amount;
        
        if (requestedDollarAmount > ownedMarketValue) {
          errors.push(
            `Insufficient ${order.symbol} position. You own $${ownedMarketValue.toFixed(2)} worth, ` +
            `but requested to sell $${requestedDollarAmount.toFixed(2)}.`
          );
        }

        // Warning if selling close to full position
        if (requestedDollarAmount > ownedMarketValue * 0.95) {
          warnings.push(`This will sell most or all of your ${order.symbol} position.`);
        }
      } else {
        // For share-based sells, check against owned shares
        const requestedShares = order.amount;
        
        if (requestedShares > ownedShares) {
          errors.push(
            `Insufficient ${order.symbol} shares. You own ${ownedShares} shares, ` +
            `but requested to sell ${requestedShares} shares.`
          );
        }

        // Warning if selling close to full position
        if (requestedShares > ownedShares * 0.95) {
          warnings.push(`This will sell most or all of your ${order.symbol} position.`);
        }
      }

      // Additional context information
      if (currentPrice > 0 && order.amountType === 'dollars') {
        const estimatedSellShares = order.amount / currentPrice;
        warnings.push(
          `At current price $${currentPrice.toFixed(2)}, this will sell approximately ${estimatedSellShares.toFixed(2)} shares ` +
          `out of your ${ownedShares} shares.`
        );
      }

    } catch (error) {
      console.error('Error validating sell order:', error);
      errors.push('Unable to validate position. Please try again.');
    }

    return { errors, warnings };
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
        // Handle dollar-based orders
        if (order.action === 'sell') {
          // For sell orders, convert dollars to shares since notional sells may not be supported
          console.log(`Converting dollar sell order to shares for ${order.symbol}: $${order.amount}`);
          try {
            const marketData = await this.getMarketData(order.symbol);
            const sharesToSell = Math.floor(order.amount / marketData.currentPrice);
            if (sharesToSell < 1) {
              throw new Error(`$${order.amount} is not enough to sell at least 1 share at current price $${marketData.currentPrice}`);
            }
            orderParams.qty = sharesToSell;
            console.log(`Converted to ${sharesToSell} shares at $${marketData.currentPrice} per share`);
          } catch (marketDataError) {
            console.warn('Could not get market data for sell conversion, using notional order anyway');
            orderParams.notional = order.amount;
            delete orderParams.qty;
          }
        } else {
          // Use notional orders for buy orders - Alpaca handles fractional shares automatically
          console.log(`Creating notional buy order for ${order.symbol}: $${order.amount}`);
          orderParams.notional = order.amount;
          // Remove qty parameter for notional orders
          delete orderParams.qty;
        }
      } else {
        orderParams.qty = order.amount;
      }
      
      if (order.orderType === 'limit' && order.limitPrice) {
        orderParams.limit_price = order.limitPrice;
      }
      
      // Submit the order
      console.log('Submitting order with params:', JSON.stringify(orderParams, null, 2));
      console.log('Original trade intent action:', order.action);
      console.log('Mapped to Alpaca side:', orderParams.side);
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
                  // No price data available - throw error
      throw new Error(`Unable to fetch price data for ${symbol} from any source`);
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
      // Don't throw errors for market data - return cached data if available
      console.warn(`Market data error for ${symbol}:`, error);
      
      // Try to return cached data (even if we couldn't get fresh data)
      const cached = cacheService.getMarketData(symbol);
      if (cached) {
        console.log(`Using cached data for ${symbol}`);
        return cached;
      }
      
      // No data available - throw descriptive error
      throw new Error(`Unable to fetch market data for ${symbol} - all data sources failed`);
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

  async getHistoricalData(symbol: string, startDate: string, endDate: string, timeframe: string = '1Day'): Promise<any[]> {
    try {
      console.log(`Fetching historical bars for ${symbol}: ${startDate} to ${endDate}, timeframe: ${timeframe}`);
      
      // Map frontend timeframes to Alpaca timeframes
      let alpacaTimeframe = timeframe;
      switch (timeframe) {
        case '1H':
          alpacaTimeframe = '1Hour';
          break;
        case '1D':
          alpacaTimeframe = '1Day';
          break;
        case '1W':
          alpacaTimeframe = '1Week';
          break;
        case '1M':
          alpacaTimeframe = '1Month';
          break;
        default:
          alpacaTimeframe = timeframe;
      }

      const bars = await this.alpaca.getBarsV2(symbol, {
        start: startDate,
        end: endDate,
        timeframe: alpacaTimeframe,
        limit: 1000,
        adjustment: 'raw',
        page_token: undefined,
        sort: 'asc'
      });

      const historicalData = [];
      for await (const bar of bars) {
        const barData = bar as any;
        console.log('Raw bar data:', JSON.stringify(barData, null, 2));
        
        // Check if we have actual price data
        const open = barData.o || barData.Open;
        const high = barData.h || barData.High;
        const low = barData.l || barData.Low;
        const close = barData.c || barData.Close;
        
        if (!open && !high && !low && !close) {
          console.warn(`No price data available for ${symbol} at ${barData.t || barData.Timestamp}`);
          continue; // Skip this bar if no price data
        }
        
        const dataPoint = {
          date: barData.t || barData.Timestamp,
          timestamp: barData.t || barData.Timestamp,
          open: open || close || 0,
          high: high || close || 0,
          low: low || close || 0,
          close: close || 0,
          price: close || 0,
          volume: barData.v || barData.Volume || 0
        };
        
        console.log('Processed data point:', JSON.stringify(dataPoint, null, 2));
        historicalData.push(dataPoint);
      }

      console.log(`Successfully fetched ${historicalData.length} historical data points for ${symbol}`);
      
      // If we have no price data at all, throw an error
      if (historicalData.length === 0 || historicalData.every(d => d.price === 0)) {
        throw new BrokerError(`No historical price data available for ${symbol}. This may be due to paper trading API limitations or market closure.`);
      }
      
      return historicalData;
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      throw new BrokerError(`Failed to get historical data: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        return `Order partially filled: ${order.filled_qty}/${order.qty} shares at $${order.filled_avg_price}`;
      case 'pending':
        return 'Order pending execution';
      case 'canceled':
        return 'Order canceled';
      default:
        return `Order status: ${order.status}`;
    }
  }

  // ===== OPTIONS TRADING METHODS =====

  async validateOptionsOrder(order: OptionsTradeIntent): Promise<OptionsValidation> {
    try {
      const account = await this.alpaca.getAccount();
      const buyingPower = parseFloat(account.buying_power);
      const dayTradingBuyingPower = parseFloat(account.day_trading_buying_power || '0');
      
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Basic validations
      if (order.quantity <= 0) {
        errors.push('Option quantity must be positive');
      }
      
      if (order.strikePrice <= 0) {
        errors.push('Strike price must be positive');
      }
      
      // Validate expiration date
      const expirationDate = new Date(order.expirationDate);
      const now = new Date();
      if (expirationDate <= now) {
        errors.push('Expiration date must be in the future');
      }
      
      // Calculate time to expiration
      const daysToExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysToExpiration < 1) {
        warnings.push('Option expires within 24 hours');
      }
      
      // Estimate costs and requirements
      let estimatedCost = 0;
      let estimatedCollateral = 0;
      let marginRequirement = 0;
      let maxProfit = 0;
      let maxLoss = 0;
      let breakeven: number[] = [];
      let probabilityOfProfit = 0;
      
      // For opening positions, estimate cost based on typical option pricing
      if (order.action === 'buy_to_open') {
        // Estimate premium based on moneyness and time
        const underlyingPrice = order.strikePrice; // Simplified - would get real price
        const intrinsicValue = Math.max(0, 
          order.contractType === 'call' 
            ? underlyingPrice - order.strikePrice 
            : order.strikePrice - underlyingPrice
        );
        const timeValue = Math.max(1, daysToExpiration * 0.1); // Simplified time value
        const estimatedPremium = intrinsicValue + timeValue;
        
        estimatedCost = estimatedPremium * order.quantity * 100; // 100 shares per contract
        maxLoss = estimatedCost;
        maxProfit = order.contractType === 'call' ? Number.POSITIVE_INFINITY : order.strikePrice * order.quantity * 100;
        breakeven = [order.strikePrice + (estimatedPremium * (order.contractType === 'call' ? 1 : -1))];
        probabilityOfProfit = 0.5; // Simplified probability
      } else if (order.action === 'sell_to_open') {
        // Selling options requires collateral
        if (order.contractType === 'put') {
          estimatedCollateral = order.strikePrice * order.quantity * 100; // Cash secured put
          marginRequirement = estimatedCollateral;
        } else {
          // Naked call - high margin requirement
          marginRequirement = order.strikePrice * order.quantity * 100 * 0.2; // Simplified margin calc
        }
      }
      
      // Check buying power
      if (estimatedCost > buyingPower) {
        errors.push(`Insufficient buying power. Required: $${estimatedCost.toFixed(2)}, Available: $${buyingPower.toFixed(2)}`);
      }
      
      if (marginRequirement > buyingPower) {
        errors.push(`Insufficient margin. Required: $${marginRequirement.toFixed(2)}, Available: $${buyingPower.toFixed(2)}`);
      }
      
      // Options-specific warnings
      if (order.orderType === 'market') {
        warnings.push('Market orders for options may experience significant slippage. Consider using limit orders.');
      }
      
      if (daysToExpiration <= 7) {
        warnings.push('Option expires within one week. Time decay will accelerate.');
      }
      
      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        estimatedCost,
        estimatedCollateral,
        marginRequirement,
        accountBalance: parseFloat(account.equity || '0'),
        buyingPower,
        maxProfit,
        maxLoss,
        breakeven,
        probabilityOfProfit
      };
    } catch (error) {
      throw new BrokerError(`Failed to validate options order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async executeOptionsOrder(order: OptionsTradeIntent): Promise<OptionsTradeResult> {
    try {
      // Create option symbol in Alpaca format
      const expirationDate = new Date(order.expirationDate);
      const year = expirationDate.getFullYear().toString().slice(-2);
      const month = (expirationDate.getMonth() + 1).toString().padStart(2, '0');
      const day = expirationDate.getDate().toString().padStart(2, '0');
      const contractTypeChar = order.contractType === 'call' ? 'C' : 'P';
      const strikeStr = (order.strikePrice * 1000).toString().padStart(8, '0');
      
      const optionSymbol = `${order.underlying}${year}${month}${day}${contractTypeChar}${strikeStr}`;
      
      // Map our action to Alpaca's side and position intent
      let side: 'buy' | 'sell';
      let positionIntent: string;
      
      switch (order.action) {
        case 'buy_to_open':
          side = 'buy';
          positionIntent = 'buy_to_open';
          break;
        case 'sell_to_open':
          side = 'sell';
          positionIntent = 'sell_to_open';
          break;
        case 'buy_to_close':
          side = 'buy';
          positionIntent = 'buy_to_close';
          break;
        case 'sell_to_close':
          side = 'sell';
          positionIntent = 'sell_to_close';
          break;
        default:
          throw new BrokerError(`Invalid options action: ${order.action}`);
      }
      
      // Prepare order data
      const orderData: any = {
        symbol: optionSymbol,
        qty: order.quantity.toString(),
        side,
        type: order.orderType,
        time_in_force: 'day',
        position_intent: positionIntent
      };
      
      if (order.orderType === 'limit' && order.limitPrice) {
        orderData.limit_price = order.limitPrice.toString();
      }
      
      // Submit order to Alpaca
      const alpacaOrder = await this.alpaca.createOrder(orderData);
      
      // Parse response
      const success = alpacaOrder && ['new', 'accepted', 'pending_new'].includes(alpacaOrder.status);
      
      const contract: OptionContract = {
        symbol: order.underlying,
        optionSymbol,
        contractType: order.contractType,
        strikePrice: order.strikePrice,
        expirationDate: order.expirationDate,
        multiplier: 100,
        exchange: 'OPRA',
        underlying: order.underlying
      };
      
              return {
          success,
          orderId: alpacaOrder?.id,
          strategy: order.strategy || 'single_leg',
          legs: [{
            contract,
            executedPrice: parseFloat(alpacaOrder?.filled_avg_price || '0'),
            executedQuantity: parseInt(alpacaOrder?.filled_qty || '0')
          }],
          totalCost: parseFloat(alpacaOrder?.filled_avg_price || '0') * order.quantity * 100,
          timestamp: new Date(),
          message: success ? 'Options order submitted successfully' : 'Options order failed',
          ...(success ? {} : { error: 'Order submission failed' })
        };
    } catch (error) {
      throw new BrokerError(`Failed to execute options order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getOptionsChain(symbol: string, expirationDate?: string): Promise<OptionsChain> {
    try {
      // Use Alpaca's options data endpoint
      const baseUrl = config.alpacaBaseUrl.includes('paper') 
        ? 'https://data.alpaca.markets'
        : 'https://data.alpaca.markets';
      
      const url = `${baseUrl}/v1beta1/options/snapshots/${symbol}`;
      const params = new URLSearchParams({
        feed: 'indicative'
      });
      
      if (expirationDate) {
        params.append('expiration_date', expirationDate);
      }
      
      const response = await fetch(`${url}?${params}`, {
        headers: {
          'APCA-API-KEY-ID': config.alpacaApiKey,
          'APCA-API-SECRET-KEY': config.alpacaSecretKey
        }
      });
      
      if (!response.ok) {
        throw new Error(`Options chain request failed: ${response.status}`);
      }
      
              const data: any = await response.json();
        
        // Get underlying price
        const underlyingData = await this.getMarketData(symbol);
      
      // Transform response to our format
      const chains: { [expirationDate: string]: { calls: OptionQuote[]; puts: OptionQuote[] } } = {};
      const expirationDates: string[] = [];
      
      if (data.option_snapshots) {
        for (const [optionSymbol, snapshot] of Object.entries(data.option_snapshots)) {
          const contract = this.parseOptionSymbol(optionSymbol as string);
          if (!contract) continue;
          
          const expDate = contract.expirationDate;
          if (!chains[expDate]) {
            chains[expDate] = { calls: [], puts: [] };
            expirationDates.push(expDate);
          }
          
          const quote: OptionQuote = {
            contract,
            bid: (snapshot as any).latest_quote?.bid || 0,
            ask: (snapshot as any).latest_quote?.ask || 0,
            lastPrice: (snapshot as any).latest_trade?.price || 0,
            volume: (snapshot as any).latest_trade?.size || 0,
            openInterest: (snapshot as any).open_interest || 0,
            impliedVolatility: (snapshot as any).implied_volatility || 0,
            intrinsicValue: Math.max(0, 
              contract.contractType === 'call' 
                ? underlyingData.currentPrice - contract.strikePrice
                : contract.strikePrice - underlyingData.currentPrice
            ),
            timeValue: (snapshot as any).latest_trade?.price || 0,
            inTheMoney: contract.contractType === 'call' 
              ? underlyingData.currentPrice > contract.strikePrice
              : underlyingData.currentPrice < contract.strikePrice
          };
          
          if (contract.contractType === 'call') {
            chains[expDate].calls.push(quote);
          } else {
            chains[expDate].puts.push(quote);
          }
        }
      }
      
      return {
        symbol,
        underlyingPrice: underlyingData.currentPrice,
        expirationDates: expirationDates.sort(),
        chains
      };
    } catch (error) {
      throw new BrokerError(`Failed to get options chain: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getOptionsPositions(): Promise<OptionsPosition[]> {
    try {
      const positions = await this.alpaca.getPositions();
      const optionsPositions: OptionsPosition[] = [];
      
      for (const position of positions) {
        // Check if this is an options position
        if (this.isOptionSymbol(position.symbol)) {
          const contract = this.parseOptionSymbol(position.symbol);
          if (!contract) continue;
          
          const daysToExpiration = Math.ceil(
            (new Date(contract.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          );
          
          optionsPositions.push({
            id: position.asset_id,
            underlying: contract.underlying,
            legs: [{
              action: parseFloat(position.qty) > 0 ? 'buy_to_open' : 'sell_to_open',
              contract,
              quantity: Math.abs(parseFloat(position.qty)),
              price: parseFloat(position.avg_entry_price || '0'),
              side: parseFloat(position.qty) > 0 ? 'long' : 'short'
            }],
            strategy: 'single_leg',
            openDate: new Date(), // Would need to track this separately
            quantity: Math.abs(parseFloat(position.qty)),
            costBasis: parseFloat(position.cost_basis || '0'),
            currentValue: parseFloat(position.market_value || '0'),
            unrealizedPnL: parseFloat(position.unrealized_pl || '0'),
            dayChange: parseFloat(position.unrealized_intraday_pl || '0'),
            dayChangePercent: parseFloat(position.unrealized_intraday_plpc || '0') * 100,
            greeks: {
              delta: 0, // Would need to calculate or fetch
              gamma: 0,
              theta: 0,
              vega: 0,
              rho: 0
            },
            daysToExpiration,
            status: daysToExpiration > 0 ? 'open' : 'expired'
          });
        }
      }
      
      return optionsPositions;
    } catch (error) {
      throw new BrokerError(`Failed to get options positions: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getOptionsQuote(optionSymbol: string): Promise<OptionQuote> {
    try {
      const contract = this.parseOptionSymbol(optionSymbol);
      if (!contract) {
        throw new BrokerError(`Invalid option symbol: ${optionSymbol}`);
      }
      
      const baseUrl = 'https://data.alpaca.markets';
      const url = `${baseUrl}/v1beta1/options/quotes/latest`;
      
      const response = await fetch(`${url}?symbols=${optionSymbol}`, {
        headers: {
          'APCA-API-KEY-ID': config.alpacaApiKey,
          'APCA-API-SECRET-KEY': config.alpacaSecretKey
        }
      });
      
      if (!response.ok) {
        throw new Error(`Options quote request failed: ${response.status}`);
      }
      
              const data: any = await response.json();
        const quote = data.quotes?.[optionSymbol];
      
      if (!quote) {
        throw new BrokerError(`No quote data available for ${optionSymbol}`);
      }
      
      // Get underlying price for intrinsic value calculation
      const underlyingData = await this.getMarketData(contract.underlying);
      
      return {
        contract,
        bid: quote.bid || 0,
        ask: quote.ask || 0,
        lastPrice: quote.last_price || 0,
        volume: quote.volume || 0,
        openInterest: 0, // Not in quote data
        impliedVolatility: 0, // Not in quote data
        intrinsicValue: Math.max(0, 
          contract.contractType === 'call' 
            ? underlyingData.currentPrice - contract.strikePrice
            : contract.strikePrice - underlyingData.currentPrice
        ),
        timeValue: (quote.last_price || 0) - Math.max(0, 
          contract.contractType === 'call' 
            ? underlyingData.currentPrice - contract.strikePrice
            : contract.strikePrice - underlyingData.currentPrice
        ),
        inTheMoney: contract.contractType === 'call' 
          ? underlyingData.currentPrice > contract.strikePrice
          : underlyingData.currentPrice < contract.strikePrice
      };
    } catch (error) {
      throw new BrokerError(`Failed to get options quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async calculateGreeks(
    contract: OptionContract, 
    underlyingPrice: number, 
    volatility: number, 
    riskFreeRate: number
  ): Promise<GreeksCalculation> {
    // Simplified Black-Scholes Greeks calculation
    // In production, you'd want to use a proper options pricing library
    try {
      const timeToExpiration = (new Date(contract.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 365);
      const strike = contract.strikePrice;
      const spot = underlyingPrice;
      const rate = riskFreeRate;
      const vol = volatility;
      
      if (timeToExpiration <= 0) {
        return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
      }
      
      // Standard normal cumulative distribution function (simplified)
      const normalCDF = (x: number) => 0.5 * (1 + this.erf(x / Math.sqrt(2)));
      const normalPDF = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
      
      const d1 = (Math.log(spot / strike) + (rate + 0.5 * vol * vol) * timeToExpiration) / (vol * Math.sqrt(timeToExpiration));
      const d2 = d1 - vol * Math.sqrt(timeToExpiration);
      
      let delta, gamma, theta, vega, rho;
      
      if (contract.contractType === 'call') {
        delta = normalCDF(d1);
        gamma = normalPDF(d1) / (spot * vol * Math.sqrt(timeToExpiration));
        theta = -(spot * normalPDF(d1) * vol) / (2 * Math.sqrt(timeToExpiration)) - rate * strike * Math.exp(-rate * timeToExpiration) * normalCDF(d2);
        vega = spot * normalPDF(d1) * Math.sqrt(timeToExpiration);
        rho = strike * timeToExpiration * Math.exp(-rate * timeToExpiration) * normalCDF(d2);
      } else {
        delta = normalCDF(d1) - 1;
        gamma = normalPDF(d1) / (spot * vol * Math.sqrt(timeToExpiration));
        theta = -(spot * normalPDF(d1) * vol) / (2 * Math.sqrt(timeToExpiration)) + rate * strike * Math.exp(-rate * timeToExpiration) * normalCDF(-d2);
        vega = spot * normalPDF(d1) * Math.sqrt(timeToExpiration);
        rho = -strike * timeToExpiration * Math.exp(-rate * timeToExpiration) * normalCDF(-d2);
      }
      
      return {
        delta: delta || 0,
        gamma: gamma || 0,
        theta: (theta || 0) / 365, // Convert to daily theta
        vega: (vega || 0) / 100, // Convert to percentage
        rho: (rho || 0) / 100 // Convert to percentage
      };
    } catch (error) {
      throw new BrokerError(`Failed to calculate Greeks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getOptionsMarketData(symbol: string): Promise<OptionsMarketData> {
    try {
      const marketData = await this.getMarketData(symbol);
      
      // Get options data for volatility calculation
      const baseUrl = 'https://data.alpaca.markets';
      const url = `${baseUrl}/v1beta1/options/snapshots/${symbol}`;
      
      const response = await fetch(`${url}?feed=indicative`, {
        headers: {
          'APCA-API-KEY-ID': config.alpacaApiKey,
          'APCA-API-SECRET-KEY': config.alpacaSecretKey
        }
      });
      
      let impliedVolatility = 0;
      let volume = 0;
      let openInterest = 0;
      
              if (response.ok) {
          const data: any = await response.json();
          if (data.option_snapshots) {
          // Calculate average implied volatility from options chain
          const volatilities: number[] = [];
          let totalVolume = 0;
          let totalOpenInterest = 0;
          
          for (const snapshot of Object.values(data.option_snapshots)) {
            const s = snapshot as any;
            if (s.implied_volatility) volatilities.push(s.implied_volatility);
            if (s.latest_trade?.size) totalVolume += s.latest_trade.size;
            if (s.open_interest) totalOpenInterest += s.open_interest;
          }
          
          impliedVolatility = volatilities.length > 0 
            ? volatilities.reduce((a, b) => a + b, 0) / volatilities.length 
            : 0;
          volume = totalVolume;
          openInterest = totalOpenInterest;
        }
      }
      
      return {
        underlying: symbol,
        underlyingPrice: marketData.currentPrice,
        impliedVolatility,
        historicalVolatility: 0, // Would need historical data calculation
        volume,
        openInterest,
        lastUpdated: new Date()
      };
    } catch (error) {
      throw new BrokerError(`Failed to get options market data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ===== HELPER METHODS =====

  private isOptionSymbol(symbol: string): boolean {
    // Alpaca option symbols follow the format: SYMBOL + YYMMDD + C/P + Strike price
    return /^[A-Z]+\d{6}[CP]\d{8}$/.test(symbol);
  }

  private parseOptionSymbol(optionSymbol: string): OptionContract | null {
    try {
      // Parse Alpaca option symbol format: SYMBOLYYMMDDCPPPPPPPP
      const match = optionSymbol.match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
      if (!match) return null;
      
      const [, underlying, year, month, day, contractTypeChar, strikeStr] = match;
      
      if (!underlying || !year || !month || !day || !contractTypeChar || !strikeStr) {
        return null;
      }
      
      const expirationDate = new Date(2000 + parseInt(year), parseInt(month) - 1, parseInt(day));
      const contractType = contractTypeChar === 'C' ? 'call' : 'put';
      const strikePrice = parseInt(strikeStr) / 1000;
      
      const formattedDate = expirationDate.toISOString().split('T')[0];
      if (!formattedDate) {
        return null;
      }
      
      return {
        symbol: underlying,
        optionSymbol,
        contractType,
        strikePrice,
        expirationDate: formattedDate,
        multiplier: 100,
        exchange: 'OPRA',
        underlying: underlying
      };
    } catch (error) {
      return null;
    }
  }

  // Error function approximation for normal distribution
  private erf(x: number): number {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }
} 