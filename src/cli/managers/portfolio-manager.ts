import chalk from 'chalk';
import Table from 'cli-table3';
import { AlpacaAdapter } from '../../brokers/alpaca-adapter';
import { AccountInfo, Position } from '../../types';
import { formatCurrency, formatPercentage } from '../utils/formatters';
// import { ChartRenderer } from '../utils/chart-renderer';

export interface PortfolioMetrics {
  netWorth: number;
  cashBalance: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayTrades: number;
  totalPositions: number;
  diversificationScore: number;
  largestPosition: Position | null;
  topPerformers: Position[];
  worstPerformers: Position[];
}

export interface PortfolioAnalytics {
  sectorBreakdown: Array<{ sector: string; value: number; percentage: number }>;
  riskMetrics: {
    beta: number;
    sharpeRatio: number;
    volatility: number;
    maxDrawdown: number;
  };
  performanceHistory: Array<{ date: string; value: number; return: number }>;
}

export class PortfolioManager {
  private broker: AlpacaAdapter;
  // private chartRenderer: ChartRenderer;

  constructor() {
    this.broker = new AlpacaAdapter();
    // this.chartRenderer = new ChartRenderer();
  }

  /**
   * Display comprehensive portfolio overview
   */
  async showOverview(showValues: boolean = true): Promise<void> {
    try {
      console.log(chalk.blue('\n📊 Portfolio Overview'));
      console.log(chalk.gray('═'.repeat(50)));

      const accountInfo = await this.broker.getAccountInfo();
      const metrics = this.calculateMetrics(accountInfo);

      // Display key metrics
      this.displayMetrics(metrics, showValues);

      // Display positions table
      if (accountInfo.positions.length > 0) {
        console.log(chalk.white('\n📈 Current Positions:'));
        this.displayPositionsTable(accountInfo.positions, showValues);
      } else {
        console.log(chalk.gray('\n💰 No open positions. Ready to start trading!'));
      }

      // Display portfolio composition
      this.displayPortfolioComposition(accountInfo, showValues);

    } catch (error) {
      console.log(chalk.red('\n❌ Could not fetch portfolio data'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Show detailed performance analytics
   */
  async showPerformance(timeRange: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' = '1M'): Promise<void> {
    try {
      console.log(chalk.blue(`\n📈 Portfolio Performance - ${timeRange}`));
      console.log(chalk.gray('═'.repeat(50)));

      const accountInfo = await this.broker.getAccountInfo();
      
                // Performance data requires real broker integration
      console.log(`⚠️ Performance analytics feature is not yet implemented - requires broker API integration.`);

    } catch (error) {
      console.log(chalk.red('\n❌ Could not fetch performance data'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Show detailed position analysis
   */
  async analyzePosition(symbol: string): Promise<void> {
    try {
      console.log(chalk.blue(`\n🔍 Position Analysis - ${symbol.toUpperCase()}`));
      console.log(chalk.gray('═'.repeat(50)));

      const accountInfo = await this.broker.getAccountInfo();
      const position = accountInfo.positions.find(p => p.symbol.toLowerCase() === symbol.toLowerCase());

      if (!position) {
        console.log(chalk.yellow(`No position found for ${symbol.toUpperCase()}`));
        return;
      }

      // Get market data
      const marketData = await this.broker.getMarketData(symbol);

      // Display position details
      this.displayPositionDetails(position, marketData);

      // Display risk analysis
      await this.displayPositionRiskAnalysis(position, marketData);

    } catch (error) {
      console.log(chalk.red(`\n❌ Could not analyze position for ${symbol}`));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Display portfolio diversity analysis
   */
  async showDiversification(): Promise<void> {
    try {
      console.log(chalk.blue('\n🎯 Portfolio Diversification Analysis'));
      console.log(chalk.gray('═'.repeat(50)));

      const accountInfo = await this.broker.getAccountInfo();
      
      if (accountInfo.positions.length === 0) {
        console.log(chalk.gray('No positions to analyze. Add some positions to see diversification metrics.'));
        return;
      }

      // Calculate diversification metrics
      const diversificationData = this.calculateDiversification(accountInfo);
      
      // Display sector breakdown
      this.displaySectorBreakdown(diversificationData.sectorBreakdown);

      // Display concentration risk
      this.displayConcentrationRisk(accountInfo.positions);

      // Display correlation analysis
      await this.displayCorrelationAnalysis(accountInfo.positions);

    } catch (error) {
      console.log(chalk.red('\n❌ Could not fetch diversification data'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Calculate portfolio metrics
   */
  private calculateMetrics(accountInfo: AccountInfo): PortfolioMetrics {
    const totalPnL = accountInfo.positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0);
    const totalCostBasis = accountInfo.positions.reduce((sum, pos) => sum + pos.costBasis, 0);
    const totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0;

    // Find largest position
    const largestPosition = accountInfo.positions.length > 0 
      ? accountInfo.positions.reduce((prev, current) => 
          prev.marketValue > current.marketValue ? prev : current
        )
      : null;

    // Top/worst performers
    const sortedByPnL = [...accountInfo.positions].sort((a, b) => {
      const aPnLPercent = a.costBasis > 0 ? (a.unrealizedPnL / a.costBasis) * 100 : 0;
      const bPnLPercent = b.costBasis > 0 ? (b.unrealizedPnL / b.costBasis) * 100 : 0;
      return bPnLPercent - aPnLPercent;
    });

    return {
      netWorth: accountInfo.portfolioValue,
      cashBalance: accountInfo.buyingPower,
      totalPnL,
      totalPnLPercent,
      dayTrades: accountInfo.dayTradeCount,
      totalPositions: accountInfo.positions.length,
      diversificationScore: this.calculateDiversificationScore(accountInfo.positions),
      largestPosition,
      topPerformers: sortedByPnL.slice(0, 3),
      worstPerformers: sortedByPnL.slice(-3).reverse()
    };
  }

  /**
   * Display key portfolio metrics
   */
  private displayMetrics(metrics: PortfolioMetrics, showValues: boolean): void {
    const table = new Table({
      head: ['Metric', 'Value', 'Status'],
      style: { head: ['cyan'] }
    });

    // Net Worth
    const netWorthColor = metrics.totalPnL >= 0 ? 'green' : 'red';
    table.push([
      'Net Worth',
      showValues ? formatCurrency(metrics.netWorth) : '***',
      chalk[netWorthColor](formatPercentage(metrics.totalPnLPercent))
    ]);

    // Cash Balance
    table.push([
      'Cash Balance',
      showValues ? formatCurrency(metrics.cashBalance) : '***',
      chalk.gray('Available')
    ]);

    // P&L
    const pnlColor = metrics.totalPnL >= 0 ? 'green' : 'red';
    const pnlSign = metrics.totalPnL >= 0 ? '+' : '';
    table.push([
      'Unrealized P&L',
      showValues ? chalk[pnlColor](`${pnlSign}${formatCurrency(Math.abs(metrics.totalPnL))}`) : '***',
      chalk[pnlColor](formatPercentage(metrics.totalPnLPercent))
    ]);

    // Day Trades
    const dayTradeColor = metrics.dayTrades >= 3 ? 'red' : 'green';
    table.push([
      'Day Trades',
      `${metrics.dayTrades}/3`,
      chalk[dayTradeColor](metrics.dayTrades >= 3 ? 'PDT Limit' : 'Available')
    ]);

    // Positions
    table.push([
      'Positions',
      metrics.totalPositions.toString(),
      chalk.gray('Active')
    ]);

    // Diversification Score
    const diversificationColor = metrics.diversificationScore >= 70 ? 'green' : 
                                metrics.diversificationScore >= 50 ? 'yellow' : 'red';
    table.push([
      'Diversification',
      `${metrics.diversificationScore}/100`,
      chalk[diversificationColor](
        metrics.diversificationScore >= 70 ? 'Well Diversified' :
        metrics.diversificationScore >= 50 ? 'Moderately Diversified' : 'Concentrated'
      )
    ]);

    console.log(table.toString());
  }

  /**
   * Display positions table
   */
  private displayPositionsTable(positions: Position[], showValues: boolean): void {
    const table = new Table({
      head: ['Symbol', 'Shares', 'Market Value', 'Cost Basis', 'P&L', 'P&L %'],
      style: { head: ['cyan'] }
    });

    positions.forEach(position => {
      const pnlPercent = position.costBasis > 0 ? (position.unrealizedPnL / position.costBasis) * 100 : 0;
      const pnlColor = position.unrealizedPnL >= 0 ? 'green' : 'red';
      const pnlSign = position.unrealizedPnL >= 0 ? '+' : '';

      table.push([
        chalk.bold(position.symbol),
        position.quantity.toLocaleString(),
        showValues ? formatCurrency(position.marketValue) : '***',
        showValues ? formatCurrency(position.costBasis) : '***',
        showValues ? chalk[pnlColor](`${pnlSign}${formatCurrency(Math.abs(position.unrealizedPnL))}`) : '***',
        chalk[pnlColor](formatPercentage(pnlPercent))
      ]);
    });

    console.log(table.toString());
  }

  /**
   * Display portfolio composition chart
   */
  private displayPortfolioComposition(accountInfo: AccountInfo, showValues: boolean): void {
    if (accountInfo.positions.length === 0) return;

    console.log(chalk.white('\n🥧 Portfolio Composition:'));
    
    const sortedPositions = [...accountInfo.positions]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 10); // Top 10 positions

    sortedPositions.forEach(position => {
      const percentage = (position.marketValue / accountInfo.portfolioValue) * 100;
      const barLength = Math.round(percentage / 2); // Scale bar to max 50 chars
      const bar = '█'.repeat(barLength) + '░'.repeat(Math.max(0, 25 - barLength));
      
      console.log(
        `${chalk.bold(position.symbol.padEnd(6))} ${bar} ${formatPercentage(percentage).padStart(6)} ${
          showValues ? formatCurrency(position.marketValue).padStart(12) : '***'.padStart(12)
        }`
      );
    });
  }

  /**
   * Calculate diversification score (0-100)
   */
  private calculateDiversificationScore(positions: Position[]): number {
    if (positions.length === 0) return 0;
    if (positions.length === 1) return 20;

    const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
    
    // Calculate concentration (Herfindahl-Hirschman Index)
    const hhi = positions.reduce((sum, pos) => {
      const weight = pos.marketValue / totalValue;
      return sum + (weight * weight);
    }, 0);

    // Convert HHI to diversification score (inverted and scaled 0-100)
    const maxHHI = 1; // All money in one stock
    const minHHI = 1 / positions.length; // Equally distributed
    
    let score = ((maxHHI - hhi) / (maxHHI - minHHI)) * 100;
    
    // Bonus for having more positions
    const positionBonus = Math.min(positions.length * 5, 30);
    score = Math.min(100, score + positionBonus);
    
    return Math.round(score);
  }



  /**
   * Get number of days for time range
   */
  private getTimeRangeDays(timeRange: string): number {
    switch (timeRange) {
      case '1D': return 1;
      case '1W': return 7;
      case '1M': return 30;
      case '3M': return 90;
      case '6M': return 180;
      case '1Y': return 365;
      default: return 30;
    }
  }







  /**
   * Display position details
   */
  private displayPositionDetails(position: Position, marketData: any): void {
    const currentPrice = position.marketValue / position.quantity;
    const costBasisPerShare = position.costBasis / position.quantity;
    const pnlPerShare = currentPrice - costBasisPerShare;
    const pnlPercent = (pnlPerShare / costBasisPerShare) * 100;

    const table = new Table({
      head: ['Property', 'Value'],
      style: { head: ['cyan'] }
    });

    table.push(['Symbol', chalk.bold(position.symbol)]);
    table.push(['Shares', position.quantity.toLocaleString()]);
    table.push(['Current Price', formatCurrency(currentPrice)]);
    table.push(['Cost Basis (per share)', formatCurrency(costBasisPerShare)]);
    table.push(['Market Value', formatCurrency(position.marketValue)]);
    table.push(['Total Cost Basis', formatCurrency(position.costBasis)]);
    
    const pnlColor = position.unrealizedPnL >= 0 ? 'green' : 'red';
    const pnlSign = position.unrealizedPnL >= 0 ? '+' : '';
    table.push(['Unrealized P&L', chalk[pnlColor](`${pnlSign}${formatCurrency(Math.abs(position.unrealizedPnL))}`)]);
    table.push(['P&L %', chalk[pnlColor](formatPercentage(pnlPercent))]);

    console.log(table.toString());
  }

  /**
   * Display position risk analysis
   */
  private async displayPositionRiskAnalysis(position: Position, marketData: any): Promise<void> {
    console.log(chalk.white('\n⚠️  Risk Analysis:'));
    
    // Calculate position size as % of portfolio
    // This would need portfolio total value - using market value as proxy
    const positionWeight = 100; // Placeholder

    const riskTable = new Table({
      head: ['Risk Factor', 'Value', 'Status'],
      style: { head: ['cyan'] }
    });

    // Position concentration
    const concentrationColor = positionWeight > 20 ? 'red' : positionWeight > 10 ? 'yellow' : 'green';
    riskTable.push([
      'Position Size',
      formatPercentage(positionWeight),
      chalk[concentrationColor](
        positionWeight > 20 ? 'High Risk' : 
        positionWeight > 10 ? 'Moderate Risk' : 'Low Risk'
      )
    ]);

    // Add more risk metrics here (volatility, beta, etc.)

    console.log(riskTable.toString());
  }

  /**
   * Calculate and display diversification data
   */
  private calculateDiversification(accountInfo: AccountInfo): { sectorBreakdown: Array<{ sector: string; value: number; percentage: number }> } {
    // Sector mapping requires market data API integration
    const sectorMap: { [symbol: string]: string } = {
      'AAPL': 'Technology',
      'MSFT': 'Technology', 
      'GOOGL': 'Technology',
      'AMZN': 'Consumer Discretionary',
      'TSLA': 'Consumer Discretionary',
      'JNJ': 'Healthcare',
      'JPM': 'Financial Services',
      'XOM': 'Energy'
    };

    const sectorTotals: { [sector: string]: number } = {};
    
    accountInfo.positions.forEach(position => {
      const sector = sectorMap[position.symbol] || 'Unknown';
      sectorTotals[sector] = (sectorTotals[sector] || 0) + position.marketValue;
    });

    const sectorBreakdown = Object.entries(sectorTotals).map(([sector, value]) => ({
      sector,
      value,
      percentage: (value / accountInfo.portfolioValue) * 100
    })).sort((a, b) => b.value - a.value);

    return { sectorBreakdown };
  }

  /**
   * Display sector breakdown
   */
  private displaySectorBreakdown(sectors: Array<{ sector: string; value: number; percentage: number }>): void {
    console.log(chalk.white('\n🏭 Sector Breakdown:'));
    
    const table = new Table({
      head: ['Sector', 'Value', 'Weight', 'Bar'],
      style: { head: ['cyan'] }
    });

    sectors.forEach(sector => {
      const barLength = Math.round(sector.percentage / 2);
      const bar = '█'.repeat(barLength) + '░'.repeat(Math.max(0, 25 - barLength));
      
      table.push([
        sector.sector,
        formatCurrency(sector.value),
        formatPercentage(sector.percentage),
        bar
      ]);
    });

    console.log(table.toString());
  }

  /**
   * Display concentration risk
   */
  private displayConcentrationRisk(positions: Position[]): void {
    const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0);
    const top5Value = positions
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5)
      .reduce((sum, pos) => sum + pos.marketValue, 0);
    
    const concentrationRatio = (top5Value / totalValue) * 100;
    const riskLevel = concentrationRatio > 80 ? 'High' : 
                     concentrationRatio > 60 ? 'Moderate' : 'Low';
    const riskColor = concentrationRatio > 80 ? 'red' : 
                     concentrationRatio > 60 ? 'yellow' : 'green';

    console.log(chalk.white('\n⚖️  Concentration Risk:'));
    console.log(`Top 5 positions: ${formatPercentage(concentrationRatio)} of portfolio`);
    console.log(`Risk Level: ${chalk[riskColor](riskLevel)}`);
  }

  /**
   * Display correlation analysis
   */
  private async displayCorrelationAnalysis(positions: Position[]): Promise<void> {
    console.log(chalk.white('\n🔗 Correlation Analysis:'));
    console.log(chalk.gray('(Enhanced correlation analysis would require historical price data)'));
    
    // Correlation analysis requires historical price data
    console.log('Correlation matrix and sector correlation analysis would be displayed here.');
  }
} 