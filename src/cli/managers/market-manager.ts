import chalk from 'chalk';
import Table from 'cli-table3';
import { AlpacaAdapter } from '../../brokers/alpaca-adapter';
import { formatCurrency, formatPercentage, formatDuration } from '../utils/formatters';

export interface MarketHours {
  isOpen: boolean;
  nextOpen: Date | null;
  nextClose: Date | null;
  timeUntilOpen: string;
  timeUntilClose: string;
  marketSession: 'premarket' | 'regular' | 'afterhours' | 'closed';
}

export interface MarketAlert {
  type: 'volatility' | 'volume' | 'price' | 'news';
  symbol: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export class MarketManager {
  private broker: AlpacaAdapter;
  private alerts: MarketAlert[] = [];

  constructor() {
    this.broker = new AlpacaAdapter();
  }

  /**
   * Display comprehensive market status
   */
  async showMarketStatus(): Promise<void> {
    try {
      console.log(chalk.blue('\n🌍 Market Status Dashboard'));
      console.log(chalk.gray('═'.repeat(50)));

      // Get current market hours
      const marketHours = await this.getMarketHours();
      this.displayMarketHours(marketHours);

      // Display market indices
      await this.displayMarketIndices();

      // Display market news/alerts
      this.displayMarketAlerts();

          // Economic calendar requires external data provider
    console.log(chalk.yellow('⚠️ Economic calendar feature not yet implemented - requires financial news API integration.'));

    } catch (error) {
      console.log(chalk.red('\n❌ Could not fetch market status'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Display detailed market hours information
   */
  async showMarketHours(): Promise<void> {
    try {
      console.log(chalk.blue('\n🕐 Market Hours'));
      console.log(chalk.gray('═'.repeat(50)));

      const marketHours = await this.getMarketHours();
      
      // Current status
      const statusColor = marketHours.isOpen ? 'green' : 'red';
      const statusText = marketHours.isOpen ? 'OPEN' : 'CLOSED';
      
      console.log(`\nMarket Status: ${chalk[statusColor](statusText)}`);
      console.log(`Current Session: ${chalk.white(marketHours.marketSession.toUpperCase())}`);

      if (!marketHours.isOpen && marketHours.timeUntilOpen) {
        console.log(`Time until open: ${chalk.yellow(marketHours.timeUntilOpen)}`);
      }
      
      if (marketHours.isOpen && marketHours.timeUntilClose) {
        console.log(`Time until close: ${chalk.yellow(marketHours.timeUntilClose)}`);
      }

      // Trading sessions
      console.log(chalk.white('\n📅 Trading Sessions (ET):'));
      const sessionsTable = new Table({
        head: ['Session', 'Hours', 'Status'],
        style: { head: ['cyan'] }
      });

      const now = new Date();
      const currentET = this.toEasternTime(now);
      
      sessionsTable.push([
        'Pre-Market',
        '4:00 AM - 9:30 AM',
        this.getSessionStatus(currentET, { start: 4, end: 9.5 })
      ]);
      
      sessionsTable.push([
        'Regular Hours',
        '9:30 AM - 4:00 PM',
        this.getSessionStatus(currentET, { start: 9.5, end: 16 })
      ]);
      
      sessionsTable.push([
        'After Hours',
        '4:00 PM - 8:00 PM',
        this.getSessionStatus(currentET, { start: 16, end: 20 })
      ]);

      console.log(sessionsTable.toString());

      // Market holidays
      this.displayUpcomingHolidays();

    } catch (error) {
      console.log(chalk.red('\n❌ Could not fetch market hours'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Monitor specific symbols for alerts
   */
  async monitorSymbols(symbols: string[]): Promise<void> {
    console.log(chalk.blue(`\n👁  Monitoring ${symbols.length} symbols for market activity`));
    console.log(chalk.gray('Press Ctrl+C to stop monitoring\n'));

    const monitoringInterval = setInterval(async () => {
      try {
        for (const symbol of symbols) {
          await this.checkSymbolAlerts(symbol);
        }
        
        // Display alerts if any
        if (this.alerts.length > 0) {
          this.displayRecentAlerts();
        }
        
      } catch (error) {
        console.log(chalk.red(`Error monitoring symbols: ${error}`));
      }
    }, 30000); // Check every 30 seconds

    // Clean up on exit
    process.on('SIGINT', () => {
      clearInterval(monitoringInterval);
      console.log(chalk.yellow('\n\n📊 Monitoring stopped'));
      process.exit(0);
    });
  }

  /**
   * Get current market hours and status
   */
  private async getMarketHours(): Promise<MarketHours> {
    const now = new Date();
    const easternTime = this.toEasternTime(now);
    const hour = easternTime.getHours() + easternTime.getMinutes() / 60;

    // Market hours in ET
    const preMarketStart = 4;
    const regularStart = 9.5;
    const regularEnd = 16;
    const afterHoursEnd = 20;

    let isOpen = false;
    let marketSession: 'premarket' | 'regular' | 'afterhours' | 'closed' = 'closed';

    // Check if it's a weekday (Monday-Friday)
    const dayOfWeek = easternTime.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (isWeekday) {
      if (hour >= preMarketStart && hour < regularStart) {
        marketSession = 'premarket';
        isOpen = true;
      } else if (hour >= regularStart && hour < regularEnd) {
        marketSession = 'regular';
        isOpen = true;
      } else if (hour >= regularEnd && hour < afterHoursEnd) {
        marketSession = 'afterhours';
        isOpen = true;
      }
    }

    // Calculate next open/close times
    const nextOpen = this.getNextMarketOpen(easternTime);
    const nextClose = this.getNextMarketClose(easternTime);

    const timeUntilOpen = nextOpen ? this.getTimeUntil(nextOpen) : '';
    const timeUntilClose = nextClose ? this.getTimeUntil(nextClose) : '';

    return {
      isOpen,
      nextOpen,
      nextClose,
      timeUntilOpen,
      timeUntilClose,
      marketSession
    };
  }

  /**
   * Display market hours in a formatted table
   */
  private displayMarketHours(marketHours: MarketHours): void {
    const statusColor = marketHours.isOpen ? 'green' : 'red';
    const statusIcon = marketHours.isOpen ? '🟢' : '🔴';
    const statusText = marketHours.isOpen ? 'OPEN' : 'CLOSED';

    console.log(`\n${statusIcon} Market is ${chalk[statusColor](statusText)} - ${chalk.white(marketHours.marketSession.toUpperCase())} session`);

    if (!marketHours.isOpen && marketHours.timeUntilOpen) {
      console.log(`⏰ Opens in: ${chalk.yellow(marketHours.timeUntilOpen)}`);
    }
    
    if (marketHours.isOpen && marketHours.timeUntilClose) {
      console.log(`⏰ Closes in: ${chalk.yellow(marketHours.timeUntilClose)}`);
    }
  }

  /**
   * Display major market indices
   */
  private async displayMarketIndices(): Promise<void> {
    console.log(chalk.white('\n📊 Major Indices:'));

    const indices = ['SPY', 'QQQ', 'IWM', 'VIX'];
    const indicesTable = new Table({
      head: ['Index', 'Price', 'Change', 'Change %'],
      style: { head: ['cyan'] }
    });

    for (const symbol of indices) {
      try {
        const marketData = await this.broker.getMarketData(symbol);
        const changeColor = marketData.changePercent >= 0 ? 'green' : 'red';
        const changeSign = marketData.changePercent >= 0 ? '+' : '';

        indicesTable.push([
          symbol,
          formatCurrency(marketData.currentPrice),
          chalk[changeColor](`${changeSign}${(marketData.currentPrice - marketData.previousClose).toFixed(2)}`),
          chalk[changeColor](`${changeSign}${formatPercentage(marketData.changePercent)}`)
        ]);
      } catch (error) {
        indicesTable.push([symbol, 'N/A', 'N/A', 'N/A']);
      }
    }

    console.log(indicesTable.toString());
  }

  /**
   * Display current market alerts
   */
  private displayMarketAlerts(): void {
    if (this.alerts.length === 0) {
      console.log(chalk.white('\n🔔 No current market alerts'));
      return;
    }

    console.log(chalk.white('\n🔔 Market Alerts:'));
    
    const recentAlerts = this.alerts.slice(-5); // Show last 5 alerts
    recentAlerts.forEach(alert => {
      const severityColor = alert.severity === 'high' ? 'red' : 
                           alert.severity === 'medium' ? 'yellow' : 'gray';
      const icon = alert.severity === 'high' ? '🚨' : 
                   alert.severity === 'medium' ? '⚠️' : 'ℹ️';
      
      console.log(`${icon} ${chalk[severityColor](alert.symbol)} - ${alert.message}`);
      console.log(`   ${chalk.gray(alert.timestamp.toLocaleTimeString())}`);
    });
  }

  /**
   * Display recent alerts
   */
  private displayRecentAlerts(): void {
    const newAlerts = this.alerts.filter(alert => 
      Date.now() - alert.timestamp.getTime() < 60000 // Last minute
    );
    
    if (newAlerts.length > 0) {
      console.log(chalk.yellow('\n🔔 New Alerts:'));
      newAlerts.forEach(alert => {
        const severityColor = alert.severity === 'high' ? 'red' : 
                             alert.severity === 'medium' ? 'yellow' : 'gray';
        console.log(`${chalk[severityColor](alert.symbol)}: ${alert.message}`);
      });
    }
  }



  /**
   * Display upcoming market holidays
   */
  private displayUpcomingHolidays(): void {
    console.log(chalk.yellow('⚠️ Market holidays feature not yet implemented - requires market calendar API integration.'));
  }

  /**
   * Check for symbol-specific alerts
   */
  private async checkSymbolAlerts(symbol: string): Promise<void> {
    try {
      const marketData = await this.broker.getMarketData(symbol);
      
      // Check for high volatility (>5% change)
      if (Math.abs(marketData.changePercent) > 5) {
        this.addAlert({
          type: 'volatility',
          symbol,
          message: `High volatility detected: ${formatPercentage(marketData.changePercent)} change`,
          severity: 'high',
          timestamp: new Date()
        });
      }
      
      // Volume analysis requires historical data (would need API for thresholds)

    } catch (error) {
      // Silently handle market data errors during monitoring
    }
  }

  /**
   * Add a new alert
   */
  private addAlert(alert: MarketAlert): void {
    // Avoid duplicate alerts for the same symbol within 5 minutes
    const recentAlert = this.alerts.find(a => 
      a.symbol === alert.symbol && 
      a.type === alert.type &&
      Date.now() - a.timestamp.getTime() < 300000
    );
    
    if (!recentAlert) {
      this.alerts.push(alert);
      
      // Keep only last 50 alerts
      if (this.alerts.length > 50) {
        this.alerts = this.alerts.slice(-50);
      }
    }
  }

  /**
   * Get session status for current time
   */
  private getSessionStatus(currentTime: Date, session: { start: number; end: number }): string {
    const hour = currentTime.getHours() + currentTime.getMinutes() / 60;
    const dayOfWeek = currentTime.getDay();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
    
    if (!isWeekday) {
      return chalk.gray('Closed (Weekend)');
    }
    
    if (hour >= session.start && hour < session.end) {
      return chalk.green('ACTIVE');
    } else {
      return chalk.gray('Closed');
    }
  }

  /**
   * Convert to Eastern Time
   */
  private toEasternTime(date: Date): Date {
    // This is a simplified conversion - in production, use a proper timezone library
    const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
    const easternOffset = -5; // EST, would need to handle DST
    return new Date(utc + (easternOffset * 3600000));
  }

  /**
   * Get next market open time
   */
  private getNextMarketOpen(currentET: Date): Date | null {
    const tomorrow = new Date(currentET);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 30, 0, 0); // 9:30 AM ET
    return tomorrow;
  }

  /**
   * Get next market close time
   */
  private getNextMarketClose(currentET: Date): Date | null {
    const today = new Date(currentET);
    today.setHours(16, 0, 0, 0); // 4:00 PM ET
    
    if (currentET.getTime() < today.getTime()) {
      return today;
    }
    
    const tomorrow = new Date(currentET);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(16, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Get human-readable time until a specific date
   */
  private getTimeUntil(targetDate: Date): string {
    const now = new Date();
    const diff = targetDate.getTime() - now.getTime();
    
    if (diff <= 0) return 'Now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }
} 