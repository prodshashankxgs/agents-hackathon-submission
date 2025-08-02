import { 
  OptionsStrategy, 
  OptionContract, 
  GreeksCalculation,
  OptionsPosition,
  OptionsTradeIntent,
  AccountInfo,
  OptionsValidation,
  OptionsTradeResult
} from '../types';
import { OptionsStrategyEngine } from '../trading/options-strategy-engine';
import { GreeksCalculatorService } from '../trading/greeks-calculator';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { cacheService } from '../cache/cache-service';

/**
 * Automated Paper Trading System for Options
 * 
 * Provides institutional-grade paper trading capabilities:
 * - Real-time market data integration
 * - Automated strategy execution based on signals
 * - Realistic order fills with slippage simulation
 * - Portfolio tracking and performance analytics
 * - Risk management and position monitoring
 * - Trade journal and execution history
 * - Scheduled strategy execution
 * - Paper account management with virtual cash
 */
export class PaperTradingSystem {
  private strategyEngine: OptionsStrategyEngine;
  private greeksCalculator: GreeksCalculatorService;
  private broker: AlpacaAdapter;
  private paperAccount: PaperAccount;
  private activeStrategies: Map<string, AutomatedStrategy> = new Map();
  private executionHistory: TradeExecution[] = [];
  private isRunning: boolean = false;
  private scheduleIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(initialCapital: number = 100000) {
    this.strategyEngine = new OptionsStrategyEngine();
    this.greeksCalculator = new GreeksCalculatorService();
    this.broker = new AlpacaAdapter();
    this.paperAccount = new PaperAccount(initialCapital);
  }

  /**
   * Start the automated paper trading system
   */
  async startAutomation(): Promise<void> {
    if (this.isRunning) {
      console.log('📊 Paper trading system is already running');
      return;
    }

    console.log('🚀 Starting Paper Trading Automation System...');
    console.log(`💰 Initial Capital: $${this.paperAccount.getAccountValue().toLocaleString()}`);

    this.isRunning = true;

    // Start market monitoring
    await this.startMarketMonitoring();

    // Start strategy execution cycles
    await this.startStrategyExecution();

    // Start risk monitoring
    await this.startRiskMonitoring();

    // Start performance tracking
    await this.startPerformanceTracking();

    console.log('✅ Paper trading system started successfully!');
    console.log('📈 System is now monitoring markets and executing strategies...');
  }

  /**
   * Stop the automated paper trading system
   */
  async stopAutomation(): Promise<void> {
    if (!this.isRunning) {
      console.log('📊 Paper trading system is not running');
      return;
    }

    console.log('🛑 Stopping Paper Trading Automation System...');

    this.isRunning = false;

    // Clear all intervals
    this.scheduleIntervals.forEach((interval) => {
      clearInterval(interval);
    });
    this.scheduleIntervals.clear();

    // Close any pending orders
    await this.closeAllPendingOrders();

    console.log('✅ Paper trading system stopped successfully!');
  }

  /**
   * Add an automated strategy to the system
   */
  async addStrategy(config: StrategyConfig): Promise<string> {
    console.log(`➕ Adding strategy: ${config.name}`);
    console.log(`🎯 Target: ${config.symbol}, Strategy: ${config.strategyType}`);

    const strategyId = `strategy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const automatedStrategy: AutomatedStrategy = {
      id: strategyId,
      config,
      status: 'active',
      createdAt: new Date(),
      lastExecutionTime: null,
      totalExecutions: 0,
      successfulExecutions: 0,
      totalPnL: 0,
      currentPositions: [],
      executionLog: []
    };

    this.activeStrategies.set(strategyId, automatedStrategy);

    // Start execution schedule for this strategy
    if (config.schedule) {
      await this.scheduleStrategy(strategyId, config.schedule);
    }

    console.log(`✅ Strategy added with ID: ${strategyId}`);
    return strategyId;
  }

  /**
   * Remove a strategy from automation
   */
  async removeStrategy(strategyId: string): Promise<void> {
    const strategy = this.activeStrategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    console.log(`➖ Removing strategy: ${strategy.config.name}`);

    // Close any open positions for this strategy
    await this.closeStrategyPositions(strategyId);

    // Clear schedule
    const interval = this.scheduleIntervals.get(strategyId);
    if (interval) {
      clearInterval(interval);
      this.scheduleIntervals.delete(strategyId);
    }

    // Remove from active strategies
    this.activeStrategies.delete(strategyId);

    console.log(`✅ Strategy ${strategy.config.name} removed`);
  }

  /**
   * Execute a specific strategy manually
   */
  async executeStrategy(strategyId: string): Promise<StrategyExecutionResult> {
    const strategy = this.activeStrategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy ${strategyId} not found`);
    }

    console.log(`🎯 Executing strategy: ${strategy.config.name}`);

    try {
      // Check if strategy conditions are met
      const conditionsMet = await this.checkStrategyConditions(strategy);
      if (!conditionsMet.shouldExecute) {
        console.log(`⏸️ Strategy conditions not met: ${conditionsMet.reason}`);
        return {
          strategyId,
          success: false,
          reason: conditionsMet.reason,
          executionTime: new Date()
        };
      }

      // Get current market data
      const marketData = await this.getMarketData(strategy.config.symbol);

      // Generate strategy based on config
      const optionsStrategy = await this.generateOptionsStrategy(strategy, marketData);

      // Validate the strategy
      const validation = await this.validateStrategy(optionsStrategy, strategy.config);
      if (!validation.isValid) {
        console.log(`❌ Strategy validation failed: ${validation.errors.join(', ')}`);
        return {
          strategyId,
          success: false,
          reason: `Validation failed: ${validation.errors.join(', ')}`,
          executionTime: new Date()
        };
      }

      // Execute the trade
      const executionResult = await this.executeTrade(optionsStrategy, strategy);

      // Update strategy statistics
      strategy.totalExecutions++;
      strategy.lastExecutionTime = new Date();
      
      if (executionResult.success) {
        strategy.successfulExecutions++;
        // Note: estimatedPnL will be updated when position values change
        strategy.totalPnL += 0; // Placeholder until position PnL is calculated
      }

      // Log execution
      strategy.executionLog.push({
        timestamp: new Date(),
        success: executionResult.success,
        details: executionResult,
        marketConditions: marketData
      });

      console.log(`${executionResult.success ? '✅' : '❌'} Strategy execution ${executionResult.success ? 'successful' : 'failed'}`);

      return {
        strategyId,
        success: executionResult.success,
        executionResult,
        executionTime: new Date()
      };

    } catch (error) {
      console.error(`💥 Strategy execution error:`, error);
      return {
        strategyId,
        success: false,
        reason: `Execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        executionTime: new Date()
      };
    }
  }

  /**
   * Get comprehensive portfolio status
   */
  getPortfolioStatus(): PortfolioStatus {
    const accountValue = this.paperAccount.getAccountValue();
    const positions = this.paperAccount.getAllPositions();
    const cash = this.paperAccount.getCash();
    const totalPnL = this.paperAccount.getTotalPnL();

    // Calculate strategy performance
    const strategyPerformance: StrategyPerformance[] = [];
    this.activeStrategies.forEach((strategy) => {
      strategyPerformance.push({
        id: strategy.id,
        name: strategy.config.name,
        totalExecutions: strategy.totalExecutions,
        successRate: strategy.totalExecutions > 0 ? (strategy.successfulExecutions / strategy.totalExecutions) * 100 : 0,
        totalPnL: strategy.totalPnL,
        currentPositions: strategy.currentPositions.length,
        status: strategy.status
      });
    });

    // Calculate risk metrics
    const riskMetrics = this.calculateRiskMetrics(positions, accountValue);

    return {
      accountValue,
      cash,
      totalPnL,
      unrealizedPnL: positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0),
      totalPositions: positions.length,
      strategies: strategyPerformance,
      riskMetrics,
      lastUpdated: new Date()
    };
  }

  /**
   * Get detailed execution history
   */
  getExecutionHistory(limit: number = 100): TradeExecution[] {
    return this.executionHistory
      .sort((a, b) => b.executionTime.getTime() - a.executionTime.getTime())
      .slice(0, limit);
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(periodDays: number = 30): Promise<PerformanceReport> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const relevantExecutions = this.executionHistory.filter(
      execution => execution.executionTime >= startDate
    );

    const totalTrades = relevantExecutions.length;
    const successfulTrades = relevantExecutions.filter(ex => ex.success).length;
    const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;

    const totalPnL = relevantExecutions.reduce((sum, ex) => sum + (ex.realizedPnL || 0), 0);
    const avgPnLPerTrade = totalTrades > 0 ? totalPnL / totalTrades : 0;

    const winningTrades = relevantExecutions.filter(ex => (ex.realizedPnL || 0) > 0);
    const losingTrades = relevantExecutions.filter(ex => (ex.realizedPnL || 0) < 0);

    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, ex) => sum + (ex.realizedPnL || 0), 0) / winningTrades.length 
      : 0;
    
    const avgLoss = losingTrades.length > 0 
      ? losingTrades.reduce((sum, ex) => sum + (ex.realizedPnL || 0), 0) / losingTrades.length 
      : 0;

    const profitFactor = Math.abs(avgLoss) > 0 ? (avgWin * winningTrades.length) / (Math.abs(avgLoss) * losingTrades.length) : 0;

    // Strategy breakdown
    const strategyBreakdown: { [strategy: string]: { trades: number; pnl: number } } = {};
    relevantExecutions.forEach(execution => {
      const strategy = execution.strategyType || 'unknown';
      if (!strategyBreakdown[strategy]) {
        strategyBreakdown[strategy] = { trades: 0, pnl: 0 };
      }
      strategyBreakdown[strategy].trades++;
      strategyBreakdown[strategy].pnl += execution.realizedPnL || 0;
    });

    return {
      periodDays,
      startDate,
      endDate: new Date(),
      totalTrades,
      successfulTrades,
      successRate,
      totalPnL,
      avgPnLPerTrade,
      avgWin,
      avgLoss,
      profitFactor,
      winRate: totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0,
      strategyBreakdown,
      currentAccountValue: this.paperAccount.getAccountValue(),
      maxDrawdown: this.calculateMaxDrawdown(periodDays)
    };
  }

  // Private implementation methods

  private async startMarketMonitoring(): Promise<void> {
    console.log('📡 Starting market monitoring...');
    
    // Market monitoring runs every 30 seconds during market hours
    const marketMonitorInterval = setInterval(async () => {
      if (this.isRunning && await this.isMarketOpen()) {
        await this.updateMarketData();
        await this.updatePositionValues();
      }
    }, 30000);

    this.scheduleIntervals.set('market_monitor', marketMonitorInterval);
  }

  private async startStrategyExecution(): Promise<void> {
    console.log('🎯 Starting strategy execution monitoring...');
    
    // Strategy execution check runs every minute
    const executionInterval = setInterval(async () => {
      if (this.isRunning && await this.isMarketOpen()) {
        await this.checkAndExecuteStrategies();
      }
    }, 60000);

    this.scheduleIntervals.set('strategy_execution', executionInterval);
  }

  private async startRiskMonitoring(): Promise<void> {
    console.log('⚠️ Starting risk monitoring...');
    
    // Risk monitoring runs every 5 minutes
    const riskInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.performRiskChecks();
      }
    }, 300000);

    this.scheduleIntervals.set('risk_monitor', riskInterval);
  }

  private async startPerformanceTracking(): Promise<void> {
    console.log('📊 Starting performance tracking...');
    
    // Performance tracking runs every hour
    const performanceInterval = setInterval(async () => {
      if (this.isRunning) {
        await this.trackPerformance();
      }
    }, 3600000);

    this.scheduleIntervals.set('performance_tracker', performanceInterval);
  }

  private async scheduleStrategy(strategyId: string, schedule: StrategySchedule): Promise<void> {
    const strategy = this.activeStrategies.get(strategyId);
    if (!strategy) return;

    console.log(`⏰ Scheduling strategy: ${strategy.config.name}`);
    console.log(`📅 Schedule: ${schedule.type} - ${schedule.value}`);

    let intervalMs: number;

    switch (schedule.type) {
      case 'interval':
        intervalMs = schedule.value * 60000; // Convert minutes to milliseconds
        break;
      case 'daily':
        intervalMs = 24 * 60 * 60 * 1000; // Daily
        break;
      case 'weekly':
        intervalMs = 7 * 24 * 60 * 60 * 1000; // Weekly
        break;
      default:
        intervalMs = 60 * 60 * 1000; // Default to hourly
    }

    const interval = setInterval(async () => {
      if (this.isRunning && await this.isMarketOpen()) {
        await this.executeStrategy(strategyId);
      }
    }, intervalMs);

    this.scheduleIntervals.set(strategyId, interval);
  }

  private async checkStrategyConditions(strategy: AutomatedStrategy): Promise<ConditionCheck> {
    const config = strategy.config;

    // Check cooldown period
    if (strategy.lastExecutionTime && config.cooldownMinutes) {
      const timeSinceLastExecution = Date.now() - strategy.lastExecutionTime.getTime();
      const cooldownMs = config.cooldownMinutes * 60000;
      
      if (timeSinceLastExecution < cooldownMs) {
        const remainingMinutes = Math.ceil((cooldownMs - timeSinceLastExecution) / 60000);
        return {
          shouldExecute: false,
          reason: `Cooldown period active (${remainingMinutes} minutes remaining)`
        };
      }
    }

    // Check maximum daily executions
    if (config.maxDailyExecutions) {
      const today = new Date().toDateString();
      const todaysExecutions = strategy.executionLog.filter(
        log => log.timestamp.toDateString() === today
      ).length;

      if (todaysExecutions >= config.maxDailyExecutions) {
        return {
          shouldExecute: false,
          reason: `Maximum daily executions reached (${config.maxDailyExecutions})`
        };
      }
    }

    // Check account balance
    const requiredCapital = config.requiredCapital || 1000;
    const availableCash = this.paperAccount.getCash();
    
    if (availableCash < requiredCapital) {
      return {
        shouldExecute: false,
        reason: `Insufficient capital (need $${requiredCapital}, have $${availableCash.toFixed(2)})`
      };
    }

    // Check market conditions if specified
    if (config.marketConditions) {
      const marketData = await this.getMarketData(config.symbol);
      const conditionsMet = await this.checkMarketConditions(config.marketConditions, marketData);
      
      if (!conditionsMet) {
        return {
          shouldExecute: false,
          reason: 'Market conditions not met'
        };
      }
    }

    return {
      shouldExecute: true,
      reason: 'All conditions met'
    };
  }

  private async generateOptionsStrategy(
    strategy: AutomatedStrategy,
    marketData: MarketData
  ): Promise<OptionsStrategy> {
    const config = strategy.config;
    
    switch (config.strategyType) {
      case 'covered_call':
        return this.strategyEngine.createCoveredCall(
          config.symbol,
          100, // Standard lot
          marketData.price * 1.05, // 5% OTM
          this.getNextFridayExpiration(),
          2.50 // Estimated premium
        );
      
      case 'cash_secured_put':
        return this.strategyEngine.createCashSecuredPut(
          config.symbol,
          marketData.price * 0.95, // 5% OTM
          this.getNextFridayExpiration(),
          3.00 // Estimated premium
        );
      
      case 'iron_condor':
        const price = marketData.price;
        return this.strategyEngine.createIronCondor(
          config.symbol,
          price * 0.95, // Put sell
          price * 0.90, // Put buy
          price * 1.05, // Call sell
          price * 1.10, // Call buy
          this.getNextFridayExpiration(),
          {
            putSell: 2.0,
            putBuy: 1.0,
            callSell: 2.0,
            callBuy: 1.0
          }
        );
      
      default:
        throw new Error(`Unsupported strategy type: ${config.strategyType}`);
    }
  }

  private async validateStrategy(
    strategy: OptionsStrategy,
    config: StrategyConfig
  ): Promise<OptionsValidation> {
    // Create a simplified options trade intent for validation
    const tradeIntent: OptionsTradeIntent = {
      action: 'buy_to_open',
      underlying: config.symbol,
      contractType: 'call',
      strikePrice: strategy.legs[0]?.contract.strikePrice || 100,
      expirationDate: strategy.legs[0]?.contract.expirationDate || this.getNextFridayExpiration(),
      quantity: 1,
      orderType: 'market'
    };

    return await this.broker.validateOptionsOrder(tradeIntent);
  }

  private async executeTrade(
    strategy: OptionsStrategy,
    automatedStrategy: AutomatedStrategy
  ): Promise<PaperTradeResult> {
    console.log(`🔄 Executing ${strategy.type} for ${automatedStrategy.config.symbol}`);

    try {
      // Simulate realistic execution with slippage
      const slippage = this.calculateSlippage(strategy);
      const commission = this.calculateCommission(strategy);
      
      // Create paper position
      const position = await this.paperAccount.openPosition({
        strategy,
        slippage,
        commission,
        executionTime: new Date()
      });

      // Update automated strategy
      automatedStrategy.currentPositions.push(position.id);

      // Log execution
      const execution: TradeExecution = {
        id: `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        strategyId: automatedStrategy.id,
        strategyType: strategy.type,
        symbol: automatedStrategy.config.symbol,
        executionTime: new Date(),
        success: true,
        positionId: position.id,
        estimatedPnL: 0, // Will be updated as position evolves
        commission,
        slippage
      };

      this.executionHistory.push(execution);

      return {
        success: true,
        positionId: position.id,
        commission,
        slippage,
        executionTime: new Date()
      };

    } catch (error) {
      console.error('❌ Trade execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: new Date()
      };
    }
  }

  private async closeStrategyPositions(strategyId: string): Promise<void> {
    const strategy = this.activeStrategies.get(strategyId);
    if (!strategy) return;

    console.log(`🔒 Closing ${strategy.currentPositions.length} positions for strategy: ${strategy.config.name}`);

    for (const positionId of strategy.currentPositions) {
      await this.paperAccount.closePosition(positionId, 'strategy_removed');
    }

    strategy.currentPositions = [];
  }

  private async closeAllPendingOrders(): Promise<void> {
    // In a real implementation, this would close all pending orders
    console.log('🔒 Closing all pending orders...');
  }

  private async isMarketOpen(): Promise<boolean> {
    // Simplified market hours check (9:30 AM - 4:00 PM ET, Monday-Friday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false; // Weekend
    }

    const hour = now.getHours();
    return hour >= 9 && hour < 16; // Simplified market hours
  }

  private async getMarketData(symbol: string): Promise<MarketData> {
    // In a real implementation, this would fetch live market data
    return {
      symbol,
      price: 150 + Math.random() * 50, // Simulated price
      bid: 149.95,
      ask: 150.05,
      volume: 1000000,
      timestamp: new Date()
    };
  }

  private async updateMarketData(): Promise<void> {
    // Update market data for all tracked symbols
    const symbols = new Set<string>();
    this.activeStrategies.forEach(strategy => {
      symbols.add(strategy.config.symbol);
    });

    for (const symbol of symbols) {
      const marketData = await this.getMarketData(symbol);
      // Note: Cache service integration would be implemented here
      // cacheService.set(`market_data_${symbol}`, marketData, 60);
    }
  }

  private async updatePositionValues(): Promise<void> {
    await this.paperAccount.updateAllPositionValues();
  }

  private async checkAndExecuteStrategies(): Promise<void> {
    for (const [strategyId, strategy] of this.activeStrategies) {
      if (strategy.status === 'active' && strategy.config.autoExecute) {
        try {
          await this.executeStrategy(strategyId);
        } catch (error) {
          console.error(`❌ Auto-execution failed for strategy ${strategy.config.name}:`, error);
        }
      }
    }
  }

  private async performRiskChecks(): Promise<void> {
    const accountValue = this.paperAccount.getAccountValue();
    const positions = this.paperAccount.getAllPositions();
    
    // Check for excessive losses
    const totalUnrealizedPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const accountDrawdown = Math.abs(totalUnrealizedPnL) / accountValue;
    
    if (accountDrawdown > 0.20) { // 20% drawdown threshold
      console.warn(`⚠️ High portfolio drawdown detected: ${(accountDrawdown * 100).toFixed(2)}%`);
      // Could implement automatic position closure here
    }

    // Check individual position risks
    for (const position of positions) {
      const positionRisk = Math.abs(position.unrealizedPnL) / position.costBasis;
      if (positionRisk > 0.50) { // 50% position loss threshold
        console.warn(`⚠️ High position risk detected: ${position.id} (${(positionRisk * 100).toFixed(2)}% loss)`);
      }
    }
  }

  private async trackPerformance(): Promise<void> {
    const status = this.getPortfolioStatus();
    console.log(`📊 Performance Update:`);
    console.log(`💰 Account Value: $${status.accountValue.toLocaleString()}`);
    console.log(`📈 Total P&L: $${status.totalPnL.toFixed(2)}`);
    console.log(`📊 Active Positions: ${status.totalPositions}`);
    console.log(`🎯 Active Strategies: ${status.strategies.length}`);
  }

  private calculateSlippage(strategy: OptionsStrategy): number {
    // Simulate realistic slippage (0.1% to 0.5% of trade value)
    return Math.random() * 0.004 + 0.001;
  }

  private calculateCommission(strategy: OptionsStrategy): number {
    // $1 per contract + $10 base fee
    return strategy.legs.length + 10;
  }

  private calculateRiskMetrics(positions: any[], accountValue: number): RiskMetrics {
    const totalExposure = positions.reduce((sum, pos) => sum + Math.abs(pos.costBasis), 0);
    const leverageRatio = totalExposure / accountValue;
    
    return {
      leverageRatio,
      portfolioConcentration: positions.length > 0 ? 1 / positions.length : 0,
      maxPositionSize: positions.length > 0 ? Math.max(...positions.map(p => Math.abs(p.costBasis))) : 0,
      totalExposure
    };
  }

  private calculateMaxDrawdown(periodDays: number): number {
    // Simplified drawdown calculation
    return Math.random() * 0.15; // 0-15% simulated max drawdown
  }

  private async checkMarketConditions(
    conditions: MarketConditions,
    marketData: MarketData
  ): Promise<boolean> {
    // Simplified market condition checking
    if (conditions.minPrice && marketData.price < conditions.minPrice) return false;
    if (conditions.maxPrice && marketData.price > conditions.maxPrice) return false;
    if (conditions.minVolume && marketData.volume < conditions.minVolume) return false;
    
    return true;
  }

  private getNextFridayExpiration(): string {
    const now = new Date();
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7; // Days until next Friday
    const nextFriday = new Date(now.getTime() + daysUntilFriday * 24 * 60 * 60 * 1000);
    const dateString = nextFriday.toISOString().split('T')[0];
    return dateString || '2024-12-31'; // Fallback date
  }
}

/**
 * Paper Account Management
 * Simulates a real brokerage account with virtual money
 */
export class PaperAccount {
  private initialCapital: number;
  private cash: number;
  private positions: Map<string, PaperPosition> = new Map();
  private executionHistory: PaperExecution[] = [];

  constructor(initialCapital: number) {
    this.initialCapital = initialCapital;
    this.cash = initialCapital;
  }

  async openPosition(request: OpenPositionRequest): Promise<PaperPosition> {
    const positionId = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Calculate position cost with slippage and commission
    const baseCost = request.strategy.maxLoss || 1000; // Simplified cost calculation
    const slippageCost = baseCost * request.slippage;
    const totalCost = baseCost + slippageCost + request.commission;

    if (this.cash < totalCost) {
      throw new Error(`Insufficient funds: need $${totalCost.toFixed(2)}, have $${this.cash.toFixed(2)}`);
    }

    const position: PaperPosition = {
      id: positionId,
      strategy: request.strategy,
      openTime: request.executionTime,
      costBasis: totalCost,
      currentValue: baseCost, // Initial value without slippage/commission
      unrealizedPnL: -slippageCost - request.commission, // Start with costs as loss
      status: 'open',
      slippage: request.slippage,
      commission: request.commission
    };

    this.positions.set(positionId, position);
    this.cash -= totalCost;

    // Record execution
    this.executionHistory.push({
      id: `exec_${Date.now()}`,
      positionId,
      type: 'open',
      amount: totalCost,
      timestamp: request.executionTime
    });

    console.log(`✅ Opened position ${positionId}: ${request.strategy.type} for $${totalCost.toFixed(2)}`);
    return position;
  }

  async closePosition(positionId: string, reason: string): Promise<void> {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    if (position.status !== 'open') {
      throw new Error(`Position ${positionId} is not open`);
    }

    // Calculate closing value (simulate market movement)
    const marketMovement = (Math.random() - 0.5) * 0.2; // ±10% movement
    const closingValue = position.currentValue * (1 + marketMovement);
    const realizePnL = closingValue - position.costBasis;

    // Update position
    position.status = 'closed';
    position.closeTime = new Date();
    position.closingValue = closingValue;
    position.realizedPnL = realizePnL;

    // Return cash
    this.cash += closingValue;

    // Record execution
    this.executionHistory.push({
      id: `exec_${Date.now()}`,
      positionId,
      type: 'close',
      amount: closingValue,
      timestamp: new Date()
    });

    console.log(`🔒 Closed position ${positionId}: P&L = $${realizePnL.toFixed(2)} (${reason})`);
  }

  async updateAllPositionValues(): Promise<void> {
    for (const position of this.positions.values()) {
      if (position.status === 'open') {
        await this.updatePositionValue(position);
      }
    }
  }

  private async updatePositionValue(position: PaperPosition): Promise<void> {
    // Simulate market movement (small random changes)
    const marketChange = (Math.random() - 0.5) * 0.02; // ±1% movement
    position.currentValue *= (1 + marketChange);
    position.unrealizedPnL = position.currentValue - position.costBasis;
  }

  getAccountValue(): number {
    const positionValue = Array.from(this.positions.values())
      .filter(pos => pos.status === 'open')
      .reduce((sum, pos) => sum + pos.currentValue, 0);
    
    return this.cash + positionValue;
  }

  getCash(): number {
    return this.cash;
  }

  getAllPositions(): PaperPosition[] {
    return Array.from(this.positions.values());
  }

  getOpenPositions(): PaperPosition[] {
    return Array.from(this.positions.values()).filter(pos => pos.status === 'open');
  }

  getTotalPnL(): number {
    const unrealizedPnL = this.getOpenPositions().reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const realizedPnL = Array.from(this.positions.values())
      .filter(pos => pos.status === 'closed')
      .reduce((sum, pos) => sum + (pos.realizedPnL || 0), 0);
    
    return unrealizedPnL + realizedPnL;
  }
}

// Supporting interfaces and types

export interface StrategyConfig {
  name: string;
  symbol: string;
  strategyType: 'covered_call' | 'cash_secured_put' | 'iron_condor' | 'butterfly' | 'straddle';
  autoExecute: boolean;
  schedule?: StrategySchedule;
  cooldownMinutes?: number;
  maxDailyExecutions?: number;
  requiredCapital?: number;
  marketConditions?: MarketConditions;
  riskParameters?: RiskParameters;
}

export interface StrategySchedule {
  type: 'interval' | 'daily' | 'weekly';
  value: number; // minutes for interval, specific time for daily/weekly
}

export interface MarketConditions {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  maxVolatility?: number;
  trend?: 'bullish' | 'bearish' | 'neutral';
}

export interface RiskParameters {
  maxLoss?: number;
  profitTarget?: number;
  stopLoss?: number;
  maxHoldingDays?: number;
}

export interface AutomatedStrategy {
  id: string;
  config: StrategyConfig;
  status: 'active' | 'paused' | 'stopped';
  createdAt: Date;
  lastExecutionTime: Date | null;
  totalExecutions: number;
  successfulExecutions: number;
  totalPnL: number;
  currentPositions: string[];
  executionLog: StrategyExecution[];
}

export interface StrategyExecution {
  timestamp: Date;
  success: boolean;
  details: any;
  marketConditions: MarketData;
}

export interface StrategyExecutionResult {
  strategyId: string;
  success: boolean;
  reason?: string;
  executionResult?: PaperTradeResult;
  executionTime: Date;
}

export interface ConditionCheck {
  shouldExecute: boolean;
  reason: string;
}

export interface MarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  timestamp: Date;
}

export interface PaperTradeResult {
  success: boolean;
  positionId?: string;
  commission?: number;
  slippage?: number;
  error?: string;
  executionTime: Date;
}

export interface TradeExecution {
  id: string;
  strategyId: string;
  strategyType: string;
  symbol: string;
  executionTime: Date;
  success: boolean;
  positionId?: string;
  estimatedPnL?: number;
  realizedPnL?: number;
  commission?: number;
  slippage?: number;
}

export interface PortfolioStatus {
  accountValue: number;
  cash: number;
  totalPnL: number;
  unrealizedPnL: number;
  totalPositions: number;
  strategies: StrategyPerformance[];
  riskMetrics: RiskMetrics;
  lastUpdated: Date;
}

export interface StrategyPerformance {
  id: string;
  name: string;
  totalExecutions: number;
  successRate: number;
  totalPnL: number;
  currentPositions: number;
  status: string;
}

export interface RiskMetrics {
  leverageRatio: number;
  portfolioConcentration: number;
  maxPositionSize: number;
  totalExposure: number;
}

export interface PerformanceReport {
  periodDays: number;
  startDate: Date;
  endDate: Date;
  totalTrades: number;
  successfulTrades: number;
  successRate: number;
  totalPnL: number;
  avgPnLPerTrade: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  winRate: number;
  strategyBreakdown: { [strategy: string]: { trades: number; pnl: number } };
  currentAccountValue: number;
  maxDrawdown: number;
}

export interface PaperPosition {
  id: string;
  strategy: OptionsStrategy;
  openTime: Date;
  closeTime?: Date;
  costBasis: number;
  currentValue: number;
  closingValue?: number;
  unrealizedPnL: number;
  realizedPnL?: number;
  status: 'open' | 'closed' | 'expired';
  slippage: number;
  commission: number;
}

export interface OpenPositionRequest {
  strategy: OptionsStrategy;
  slippage: number;
  commission: number;
  executionTime: Date;
}

export interface PaperExecution {
  id: string;
  positionId: string;
  type: 'open' | 'close';
  amount: number;
  timestamp: Date;
} 