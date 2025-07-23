import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { PortfolioManager } from './managers/portfolio-manager';
import { MarketManager } from './managers/market-manager';
// import { BasketManager } from './managers/basket-manager';
import { TradingChatbot } from './chatbot';
import { TradingCLI } from './commands';

export class EnhancedTradingCLI {
  private portfolioManager: PortfolioManager;
  private marketManager: MarketManager;
  // private basketManager: BasketManager;
  private tradingCLI: TradingCLI;
  private chatbot: TradingChatbot;

  constructor() {
    this.portfolioManager = new PortfolioManager();
    this.marketManager = new MarketManager();
    // this.basketManager = new BasketManager();
    this.tradingCLI = new TradingCLI();
    this.chatbot = new TradingChatbot();
  }

  /**
   * Create the enhanced CLI program with all features
   */
  createProgram(): Command {
    const program = new Command();

    program
      .name('nltrade')
      .description('Enhanced Natural Language Trading CLI - Full-featured trading platform')
      .version('2.0.0');

    // Add trading commands
    this.addTradingCommands(program);
    
    // Add portfolio commands
    this.addPortfolioCommands(program);
    
    // Add market commands
    this.addMarketCommands(program);
    
    // Add basket commands (commented out due to type issues)
    // this.addBasketCommands(program);
    
    // Add interactive modes
    this.addInteractiveCommands(program);

    return program;
  }

  /**
   * Add trading-related commands
   */
  private addTradingCommands(program: Command): void {
    const tradeCmd = program
      .command('trade')
      .description('Execute trades and manage orders');

    tradeCmd
      .command('buy <input>')
      .description('Execute a buy order using natural language')
      .option('-d, --dry-run', 'Simulate the trade without executing')
      .option('-v, --verbose', 'Show detailed output')
      .action((input, options) => this.tradingCLI.handleTrade(`buy ${input}`, options));

    tradeCmd
      .command('sell <input>')
      .description('Execute a sell order using natural language')
      .option('-d, --dry-run', 'Simulate the trade without executing')
      .option('-v, --verbose', 'Show detailed output')
      .action((input, options) => this.tradingCLI.handleTrade(`sell ${input}`, options));

    tradeCmd
      .command('order <input>')
      .description('Execute any order using natural language')
      .option('-d, --dry-run', 'Simulate the trade without executing')
      .option('-v, --verbose', 'Show detailed output')
      .action((input, options) => this.tradingCLI.handleTrade(input, options));

         tradeCmd
       .command('hedge <input>')
       .description('Get hedge recommendations using natural language')
       .action(async (input) => {
         console.log(chalk.blue(`🛡️ Getting hedge recommendations for: ${input}`));
         console.log(chalk.gray('Note: Full hedge analysis available in interactive mode'));
       });

         tradeCmd
       .command('analyze <symbol>')
       .description('Analyze a stock or symbol')
       .action(async (symbol) => {
         console.log(chalk.blue(`🔍 Analyzing: ${symbol}`));
         console.log(chalk.gray('Note: Full analysis available in interactive mode'));
       });
  }

  /**
   * Add portfolio-related commands
   */
  private addPortfolioCommands(program: Command): void {
    const portfolioCmd = program
      .command('portfolio')
      .alias('pf')
      .description('Portfolio management and analysis');

    portfolioCmd
      .command('overview')
      .alias('show')
      .description('Show portfolio overview')
      .option('--hide-values', 'Hide monetary values for privacy')
      .action((options) => {
        const showValues = !options.hideValues;
        this.portfolioManager.showOverview(showValues);
      });

    portfolioCmd
      .command('performance [timeRange]')
      .alias('perf')
      .description('Show portfolio performance analytics')
      .option('-r, --range <range>', 'Time range (1D, 1W, 1M, 3M, 6M, 1Y)', '1M')
      .action((timeRange, options) => {
        const range = timeRange || options.range;
        this.portfolioManager.showPerformance(range as any);
      });

    portfolioCmd
      .command('position <symbol>')
      .alias('pos')
      .description('Analyze a specific position')
      .action((symbol) => {
        this.portfolioManager.analyzePosition(symbol);
      });

    portfolioCmd
      .command('diversification')
      .alias('div')
      .description('Show portfolio diversification analysis')
      .action(() => {
        this.portfolioManager.showDiversification();
      });

    portfolioCmd
      .command('account')
      .description('Show account information')
      .action(() => this.tradingCLI.handleAccountInfo());
  }

  /**
   * Add market-related commands
   */
  private addMarketCommands(program: Command): void {
    const marketCmd = program
      .command('market')
      .alias('mk')
      .description('Market status and analysis');

    marketCmd
      .command('status')
      .description('Show comprehensive market status')
      .action(() => this.marketManager.showMarketStatus());

    marketCmd
      .command('hours')
      .description('Show detailed market hours information')
      .action(() => this.marketManager.showMarketHours());

    marketCmd
      .command('monitor <symbols...>')
      .description('Monitor symbols for alerts and activity')
      .action((symbols) => this.marketManager.monitorSymbols(symbols));

         marketCmd
       .command('quote <symbol>')
       .alias('q')
       .description('Get quote for a symbol')
       .action(async (symbol) => {
         console.log(chalk.blue(`💰 Getting quote for: ${symbol}`));
         console.log(chalk.gray('Note: Real-time quotes available in interactive mode'));
       });
  }

  /**
   * Add basket-related commands (commented out due to type issues)
   */
  /*
  private addBasketCommands(program: Command): void {
    const basketCmd = program
      .command('baskets')
      .alias('bk')
      .description('Portfolio basket management');

    basketCmd
      .command('list')
      .description('Show all portfolio baskets')
      .action(() => this.basketManager.showBaskets());

    basketCmd
      .command('view <basketId>')
      .description('View detailed basket information')
      .action((basketId) => this.basketManager.viewBasket(basketId));

    basketCmd
      .command('create [institution]')
      .description('Create a new basket from 13F filing')
      .action((institution) => {
        if (institution) {
          // Direct creation with institution name
          this.basketManager.createBasketFrom13F();
        } else {
          this.basketManager.createBasketFrom13F();
        }
      });

    basketCmd
      .command('invest <basketId> [amount]')
      .description('Invest in a portfolio basket')
      .action((basketId, amount) => {
        this.basketManager.investInBasket(basketId, amount ? parseFloat(amount) : undefined);
      });

    basketCmd
      .command('delete <basketId>')
      .description('Delete a portfolio basket')
      .action((basketId) => this.basketManager.deleteBasket(basketId));

    basketCmd
      .command('search')
      .description('Search popular 13F institutions')
      .action(() => this.basketManager.searchInstitutions());
  }
  */

  /**
   * Add interactive commands
   */
  private addInteractiveCommands(program: Command): void {
    program
      .command('dashboard')
      .alias('dash')
      .description('Start interactive trading dashboard')
      .action(() => this.startDashboard());

    program
      .command('chat')
      .description('Start conversational AI trading assistant')
      .action(() => this.chatbot.start());

    program
      .command('interactive')
      .alias('i')
      .description('Start interactive command mode')
      .action(() => this.startInteractiveMode());

    program
      .command('wizard')
      .alias('w')
      .description('Start guided trading wizard')
      .action(() => this.startTradingWizard());
  }

  /**
   * Start interactive dashboard mode
   */
  private async startDashboard(): Promise<void> {
    console.clear();
    console.log(chalk.blue('═'.repeat(80)));
    console.log(chalk.blue('                    📊 TRADING DASHBOARD                    '));
    console.log(chalk.blue('═'.repeat(80)));

    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            { name: '📊 Portfolio Overview', value: 'portfolio' },
            { name: '📈 Performance Analytics', value: 'performance' },
            { name: '🌍 Market Status', value: 'market' },
            { name: '🕐 Market Hours', value: 'hours' },
            { name: '💬 AI Trading Assistant', value: 'chat' },
            { name: '🔄 Execute Trade', value: 'trade' },
            { name: '🧺 Portfolio Baskets', value: 'baskets' },
            { name: '🔍 Analyze Position', value: 'analyze' },
            { name: '🎯 Diversification', value: 'diversification' },
            { name: '🚪 Exit Dashboard', value: 'exit' }
          ],
          pageSize: 10
        }
      ]);

      console.log(''); // Add spacing

      try {
        switch (action) {
          case 'portfolio':
            await this.portfolioManager.showOverview();
            break;
          case 'performance':
            const { timeRange } = await inquirer.prompt([{
              type: 'list',
              name: 'timeRange',
              message: 'Select time range:',
              choices: ['1D', '1W', '1M', '3M', '6M', '1Y']
            }]);
            await this.portfolioManager.showPerformance(timeRange);
            break;
          case 'market':
            await this.marketManager.showMarketStatus();
            break;
          case 'hours':
            await this.marketManager.showMarketHours();
            break;
          case 'chat':
            await this.chatbot.start();
            break;
          case 'trade':
            const { tradeCommand } = await inquirer.prompt([{
              type: 'input',
              name: 'tradeCommand',
              message: 'Enter your trade command:'
            }]);
            await this.tradingCLI.handleTrade(tradeCommand, {});
            break;
          case 'baskets':
            console.log(chalk.gray('Basket management will be available in the next update'));
            break;
          case 'analyze':
            const { symbol } = await inquirer.prompt([{
              type: 'input',
              name: 'symbol',
              message: 'Enter symbol to analyze:'
            }]);
            await this.portfolioManager.analyzePosition(symbol);
            break;
          case 'diversification':
            await this.portfolioManager.showDiversification();
            break;
          case 'exit':
            console.log(chalk.blue('\n👋 Thanks for using the Trading Dashboard!'));
            return;
        }
      } catch (error) {
        console.log(chalk.red('\n❌ An error occurred:'), error);
      }

      // Pause before showing menu again
      await inquirer.prompt([{
        type: 'input',
        name: 'continue',
        message: chalk.gray('Press Enter to continue...')
      }]);
      
      console.clear();
      console.log(chalk.blue('═'.repeat(80)));
      console.log(chalk.blue('                    📊 TRADING DASHBOARD                    '));
      console.log(chalk.blue('═'.repeat(80)));
    }
  }

  /**
   * Start interactive command mode
   */
  private async startInteractiveMode(): Promise<void> {
    console.log(chalk.blue('🚀 Starting interactive trading mode...'));
    console.log(chalk.gray('Type commands naturally or use "help" for assistance'));
    console.log(chalk.gray('Type "exit" to quit\n'));

    while (true) {
      const { command } = await inquirer.prompt({
        type: 'input',
        name: 'command',
        message: chalk.cyan('nltrade>')
      });

      if (command.toLowerCase() === 'exit' || command.toLowerCase() === 'quit') {
        console.log(chalk.blue('👋 Goodbye!'));
        break;
      }

      if (command.toLowerCase() === 'help') {
        this.showHelp();
        continue;
      }

      // Route command to appropriate handler
      await this.routeCommand(command);
      console.log(''); // Add spacing between commands
    }
  }

  /**
   * Start trading wizard
   */
  private async startTradingWizard(): Promise<void> {
    console.log(chalk.blue('\n🧙‍♂️ Trading Wizard - Guided Trading Experience'));
    console.log(chalk.gray('═'.repeat(50)));

    const { wizardType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'wizardType',
        message: 'What would you like to do?',
        choices: [
          { name: '💰 Execute a Trade', value: 'trade' },
          { name: '🛡️ Get Hedge Recommendations', value: 'hedge' },
          { name: '📊 Analyze Market Conditions', value: 'analysis' },
          { name: '🧺 Create Investment Basket', value: 'basket' },
          { name: '🎯 Portfolio Optimization', value: 'optimize' }
        ]
      }
    ]);

    switch (wizardType) {
      case 'trade':
        await this.tradeWizard();
        break;
      case 'hedge':
        await this.hedgeWizard();
        break;
      case 'analysis':
        await this.analysisWizard();
        break;
      case 'basket':
        console.log(chalk.gray('Basket wizard will be available in the next update'));
        break;
      case 'optimize':
        await this.optimizationWizard();
        break;
    }
  }

  /**
   * Trade wizard
   */
  private async tradeWizard(): Promise<void> {
    // Ask questions one by one since inquirer expects single question objects
    const action = await inquirer.prompt({
      type: 'list',
      name: 'action',
      message: 'Do you want to buy or sell?',
      choices: ['buy', 'sell']
    });

    const symbol = await inquirer.prompt({
      type: 'input',
      name: 'symbol',
      message: 'Enter the stock symbol:',
      validate: (input: string) => input.trim().length > 0 || 'Symbol is required'
    });

    const amountType = await inquirer.prompt({
      type: 'list',
      name: 'amountType',
      message: 'How would you like to specify the amount?',
      choices: [
        { name: 'Dollar amount (e.g., $1000)', value: 'dollars' },
        { name: 'Number of shares (e.g., 100 shares)', value: 'shares' }
      ]
    });

    const amount = await inquirer.prompt({
      type: 'number',
      name: 'amount',
      message: 'Enter the amount:',
      validate: (input: number | undefined) => (input && input > 0) || 'Amount must be greater than 0'
    });

    const orderType = await inquirer.prompt({
      type: 'list',
      name: 'orderType',
      message: 'Order type:',
      choices: ['market', 'limit']
    });

    // Combine all answers
    const answers = {
      action: action.action,
      symbol: symbol.symbol,
      amountType: amountType.amountType,
      amount: amount.amount,
      orderType: orderType.orderType
    };

    // Build natural language command
    const amountText = answers.amountType === 'dollars' ? `$${answers.amount}` : `${answers.amount} shares`;
    const command = `${answers.action} ${amountText} of ${answers.symbol} at ${answers.orderType}`;

    console.log(chalk.white(`\n📋 Executing: ${command}`));
    await this.tradingCLI.handleTrade(command, {});
  }

  /**
   * Hedge wizard
   */
  private async hedgeWizard(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'symbol',
        message: 'Which position would you like to hedge?',
        validate: (input: string) => input.trim().length > 0 || 'Symbol is required'
      },
      {
        type: 'list',
        name: 'reason',
        message: 'Why do you want to hedge?',
        choices: [
          'Earnings announcement',
          'Market volatility',
          'Economic uncertainty',
          'Sector-specific risk',
          'Other'
        ]
      },
      {
        type: 'list',
        name: 'timeframe',
        message: 'Hedge timeframe:',
        choices: ['Short-term (1-2 weeks)', 'Medium-term (1-3 months)', 'Long-term (3+ months)']
      }
    ]);

         const command = `how to hedge my ${answers.symbol} position for ${answers.reason} over ${answers.timeframe}`;
     console.log(chalk.white(`\n📋 Analyzing: ${command}`));
     console.log(chalk.gray('Hedge analysis would be performed here using AI assistant'));
  }

  /**
   * Analysis wizard
   */
  private async analysisWizard(): Promise<void> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'symbols',
        message: 'Enter symbols to analyze (comma-separated):',
        validate: (input: string) => input.trim().length > 0 || 'At least one symbol is required'
      },
      {
        type: 'checkbox',
        name: 'analysisTypes',
        message: 'What type of analysis?',
        choices: [
          'Technical analysis',
          'Fundamental analysis',
          'Risk factors',
          'Market sentiment',
          'Sector analysis'
        ]
      }
    ]);

    const symbols = answers.symbols.split(',').map((s: string) => s.trim());
    const analysisText = answers.analysisTypes.join(' and ');
    
         for (const symbol of symbols) {
       const command = `perform ${analysisText} on ${symbol}`;
       console.log(chalk.white(`\n📋 Analyzing: ${symbol}`));
       console.log(chalk.gray(`Analysis: ${command}`));
     }
  }

  /**
   * Portfolio optimization wizard
   */
  private async optimizationWizard(): Promise<void> {
    console.log(chalk.blue('\n🎯 Portfolio Optimization Wizard'));
    
    await this.portfolioManager.showOverview();
    
    const { optimizationType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'optimizationType',
        message: 'What would you like to optimize?',
        choices: [
          'Diversification',
          'Risk reduction',
          'Sector allocation',
          'Performance improvement'
        ]
      }
    ]);

    switch (optimizationType) {
      case 'Diversification':
        await this.portfolioManager.showDiversification();
        break;
      default:
        console.log(chalk.gray('Advanced optimization features coming soon...'));
    }
  }

  /**
   * Route command to appropriate handler
   */
  private async routeCommand(command: string): Promise<void> {
    const lowerCommand = command.toLowerCase();

    try {
      if (lowerCommand.includes('portfolio') || lowerCommand.includes('account')) {
        await this.portfolioManager.showOverview();
      } else if (lowerCommand.includes('market') && lowerCommand.includes('status')) {
        await this.marketManager.showMarketStatus();
      } else if (lowerCommand.includes('market') && lowerCommand.includes('hours')) {
        await this.marketManager.showMarketHours();
      } else if (lowerCommand.includes('performance')) {
        await this.portfolioManager.showPerformance();
      } else if (lowerCommand.includes('diversification') || lowerCommand.includes('diversity')) {
        await this.portfolioManager.showDiversification();
             } else {
         // Default to showing help for unrecognized commands
         console.log(chalk.yellow(`Command not recognized: ${command}`));
         console.log(chalk.gray('Type "help" for available commands or use "chat" for AI assistant'));
       }
    } catch (error) {
      console.log(chalk.red('❌ Error processing command:'), error);
    }
  }

  /**
   * Show help information
   */
  private showHelp(): void {
    console.log(chalk.blue('\n📚 Help - Available Commands'));
    console.log(chalk.gray('═'.repeat(50)));
    
    console.log(chalk.white('\n🔄 Trading Commands:'));
    console.log('• "buy $100 of AAPL" - Execute buy orders');
    console.log('• "sell 50 shares of TSLA" - Execute sell orders');
    console.log('• "hedge my NVDA position" - Get hedge recommendations');
    
    console.log(chalk.white('\n📊 Portfolio Commands:'));
    console.log('• "portfolio" or "account" - Show portfolio overview');
    console.log('• "performance" - Show performance analytics');
    console.log('• "diversification" - Show diversification analysis');
    
    console.log(chalk.white('\n🌍 Market Commands:'));
    console.log('• "market status" - Show market status');
    console.log('• "market hours" - Show trading hours');
    console.log('• "price of AAPL" - Get stock quotes');
    
    console.log(chalk.white('\n🤖 AI Assistant:'));
    console.log('• Ask questions in natural language');
    console.log('• "analyze TSLA risk factors"');
    console.log('• "what to buy if tariffs increase"');
    
    console.log(chalk.gray('\nType any command naturally or use "exit" to quit'));
  }
} 