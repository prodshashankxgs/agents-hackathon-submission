#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { UnifiedTradeProcessor } from '../llm/unified-trade-processor';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { ValidationService } from '../trading/validation-service';
import { TradeIntent, TradeResult, AccountInfo } from '../types';

/**
 * Streamlined Trading CLI - Optimized for core buy/sell operations
 * 
 * Features:
 * - Fast natural language parsing
 * - Streamlined execution flow
 * - Clear visual feedback
 * - Robust error handling
 * - Account management
 */
export class OptimizedTradingCLI {
  private tradeProcessor: UnifiedTradeProcessor;
  private broker: AlpacaAdapter;
  private validator: ValidationService;
  private accountInfo: AccountInfo | null = null;

  constructor() {
    this.tradeProcessor = new UnifiedTradeProcessor();
    this.broker = new AlpacaAdapter();
    this.validator = new ValidationService(this.broker);
  }

  /**
   * Create and configure the CLI program
   */
  createProgram(): Command {
    const program = new Command();

    program
      .name('trading-cli')
      .description('Streamlined Natural Language Trading CLI')
      .version('2.0.0');

    // Quick buy command
    program
      .command('buy <input...>')
      .description('Execute a buy order using natural language')
      .option('-d, --dry-run', 'Show what would be executed without trading')
      .option('-v, --verbose', 'Show detailed execution information')
      .action(async (input, options) => {
        const tradeInput = input.join(' ');
        await this.executeTrade(tradeInput, { ...options, action: 'buy' });
      });

    // Quick sell command
    program
      .command('sell <input...>')
      .description('Execute a sell order using natural language')
      .option('-d, --dry-run', 'Show what would be executed without trading')
      .option('-v, --verbose', 'Show detailed execution information')
      .action(async (input, options) => {
        const tradeInput = input.join(' ');
        await this.executeTrade(tradeInput, { ...options, action: 'sell' });
      });

    // Interactive trade command
    program
      .command('trade [input...]')
      .description('Interactive trading session')
      .option('-d, --dry-run', 'Show what would be executed without trading')
      .option('-v, --verbose', 'Show detailed execution information')
      .action(async (input, options) => {
        if (input && input.length > 0) {
          await this.executeTrade(input.join(' '), options);
        } else {
          await this.startInteractiveSession(options);
        }
      });

    // Account command
    program
      .command('account')
      .description('Show account information and portfolio')
      .action(() => this.showAccountInfo());

    // Portfolio command
    program
      .command('portfolio')
      .alias('positions')
      .description('Show current positions')
      .action(() => this.showPortfolio());

    // Default action for no command
    program.action(async () => {
      await this.startInteractiveSession({});
    });

    return program;
  }

  /**
   * Execute a single trade command
   */
  private async executeTrade(input: string, options: any = {}): Promise<void> {
    try {
      console.log(chalk.blue.bold('⚡ Optimized Trading CLI'));
      console.log(chalk.gray(`Processing: "${input}"\n`));

      // Parse the trade intent using unified processor
      const parseResult = await this.tradeProcessor.processTradeCommand(input);
      const intent = parseResult.intent;
      const parseTime = parseResult.processingTime;

      if (options.verbose) {
        console.log(chalk.cyan(`✓ Parsed in ${parseTime}ms`));
      }

      // Override action if specified in options
      if (options.action) {
        intent.action = options.action;
      }

      // Display parsed intent
      this.displayIntent(intent, options.verbose);

      // Validate the trade
      const validation = await this.validator.validateTrade(intent);
      this.displayValidation(validation);

      if (!validation.isValid) {
        console.log(chalk.red('❌ Trade cannot be executed due to validation errors.\\n'));
        return;
      }

      // Execute or simulate
      if (options.dryRun) {
        console.log(chalk.yellow('🔍 DRY RUN - No actual trade executed'));
        this.simulateTradeResult(intent, validation);
      } else {
        await this.executeRealTrade(intent, validation, options.verbose);
      }

    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Start an interactive trading session
   */
  private async startInteractiveSession(options: any): Promise<void> {
    console.clear();
    console.log(chalk.blue.bold('⚡ Interactive Trading Session'));
    console.log(chalk.gray('Type your trade commands in natural language or "exit" to quit\\n'));

    while (true) {
      try {
        const { input } = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: chalk.cyan('Trade:'),
          validate: (input: string) => {
            if (!input.trim()) return 'Please enter a trade command';
            return true;
          }
        }]);

        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          console.log(chalk.gray('👋 Goodbye!'));
          break;
        }

        if (input.toLowerCase() === 'account') {
          await this.showAccountInfo();
          continue;
        }

        if (input.toLowerCase() === 'portfolio' || input.toLowerCase() === 'positions') {
          await this.showPortfolio();
          continue;
        }

        console.log(''); // Add spacing
        await this.executeTrade(input, options);
        console.log(''); // Add spacing

      } catch (error) {
        if (error instanceof Error && error.name === 'ExitPromptError') {
          console.log(chalk.gray('\\n👋 Goodbye!'));
          break;
        }
        this.handleError(error as Error);
      }
    }
  }

  /**
   * Display parsed trade intent
   */
  private displayIntent(intent: TradeIntent, verbose: boolean = false): void {
    const action = intent.action.toUpperCase();
    const actionColor = intent.action === 'buy' ? chalk.green : chalk.red;
    
    console.log(chalk.white.bold('📋 Trade Intent:'));
    console.log(`   ${actionColor(action)} ${chalk.bold(intent.symbol)}`);
    console.log(`   Amount: ${intent.amountType === 'dollars' ? '$' + intent.amount : intent.amount + ' shares'}`);
    console.log(`   Order Type: ${intent.orderType}`);
    
    if (intent.orderType === 'limit' && intent.limitPrice) {
      console.log(`   Limit Price: $${intent.limitPrice.toFixed(2)}`);
    }

    if (verbose) {
      console.log(chalk.gray('   Raw intent:'), JSON.stringify(intent, null, 2));
    }
    console.log('');
  }

  /**
   * Display validation results
   */
  private displayValidation(validation: any): void {
    console.log(chalk.white.bold('🔍 Validation:'));
    
    if (validation.currentPrice) {
      console.log(`   Current Price: ${chalk.cyan('$' + validation.currentPrice.toFixed(2))}`);
    }
    
    console.log(`   Estimated Cost: ${chalk.yellow('$' + validation.estimatedCost.toFixed(2))}`);
    console.log(`   Buying Power: ${chalk.green('$' + validation.accountBalance.toFixed(2))}`);

    if (validation.warnings && validation.warnings.length > 0) {
      console.log(chalk.yellow('   ⚠️  Warnings:'));
      validation.warnings.forEach((warning: string) => {
        console.log(chalk.yellow(`      • ${warning}`));
      });
    }

    if (validation.errors && validation.errors.length > 0) {
      console.log(chalk.red('   ❌ Errors:'));
      validation.errors.forEach((error: string) => {
        console.log(chalk.red(`      • ${error}`));
      });
    }
    console.log('');
  }

  /**
   * Execute a real trade
   */
  private async executeRealTrade(intent: TradeIntent, validation: any, verbose: boolean): Promise<void> {
    // Confirm execution
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Execute this ${intent.action} order?`,
      default: false
    }]);

    if (!confirm) {
      console.log(chalk.yellow('🚫 Trade cancelled\\n'));
      return;
    }

    console.log(chalk.gray('⚡ Executing trade...'));
    const startTime = Date.now();

    try {
      const result: TradeResult = await this.broker.executeOrder(intent);
      const executionTime = Date.now() - startTime;

      if (result.success) {
        console.log(chalk.green.bold('✅ Trade Executed Successfully!'));
        console.log(`   Order ID: ${chalk.cyan(result.orderId || 'N/A')}`);
        
        if (result.executedPrice) {
          console.log(`   Executed Price: ${chalk.green('$' + result.executedPrice.toFixed(2))}`);
        }
        
        if (result.executedShares) {
          console.log(`   Shares: ${chalk.yellow(result.executedShares.toString())}`);
        }
        
        if (result.executedValue) {
          console.log(`   Total Value: ${chalk.green('$' + result.executedValue.toFixed(2))}`);
        }

        if (verbose) {
          console.log(`   Execution Time: ${executionTime}ms`);
        }
      } else {
        console.log(chalk.red.bold('❌ Trade Failed'));
        console.log(chalk.red(`   Error: ${result.error || result.message}`));
      }

    } catch (error) {
      console.log(chalk.red.bold('❌ Trade Execution Failed'));
      if (error instanceof Error) {
        console.log(chalk.red(`   Error: ${error.message}`));
        if (verbose) {
          console.error(error.stack);
        }
      }
    }
    console.log('');
  }

  /**
   * Simulate trade execution for dry run
   */
  private simulateTradeResult(intent: TradeIntent, validation: any): void {
    console.log(chalk.yellow.bold('🔍 SIMULATION RESULTS:'));
    console.log(`   Would ${intent.action.toUpperCase()} ${intent.symbol}`);
    console.log(`   Estimated Cost: $${validation.estimatedCost.toFixed(2)}`);
    console.log(`   Remaining Buying Power: $${(validation.accountBalance - validation.estimatedCost).toFixed(2)}`);
    
    if (validation.estimatedShares) {
      console.log(`   Estimated Shares: ${validation.estimatedShares}`);
    }
    
    console.log(chalk.yellow('   ✓ All validations passed - trade would execute'));
    console.log('');
  }

  /**
   * Show account information
   */
  private async showAccountInfo(): Promise<void> {
    try {
      console.log(chalk.blue.bold('📊 Account Information'));
      
      this.accountInfo = await this.broker.getAccountInfo();
      
      console.log(`   Account ID: ${chalk.cyan(this.accountInfo.accountId)}`);
      console.log(`   Portfolio Value: ${chalk.green('$' + this.accountInfo.portfolioValue.toFixed(2))}`);
      console.log(`   Buying Power: ${chalk.yellow('$' + this.accountInfo.buyingPower.toFixed(2))}`);
      
      if (this.accountInfo.dayTradingBuyingPower) {
        console.log(`   Day Trading BP: ${chalk.yellow('$' + this.accountInfo.dayTradingBuyingPower.toFixed(2))}`);
      }
      
      console.log(`   Day Trade Count: ${this.accountInfo.dayTradeCount}/3`);
      console.log('');
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to fetch account information'));
      this.handleError(error as Error);
    }
  }

  /**
   * Show portfolio positions
   */
  private async showPortfolio(): Promise<void> {
    try {
      console.log(chalk.blue.bold('📈 Portfolio Positions'));
      
      if (!this.accountInfo) {
        this.accountInfo = await this.broker.getAccountInfo();
      }
      
      if (this.accountInfo.positions.length === 0) {
        console.log(chalk.gray('   No positions found'));
        console.log('');
        return;
      }

      this.accountInfo.positions.forEach((position, index) => {
        const pnlColor = position.unrealizedPnL >= 0 ? chalk.green : chalk.red;
        const pnlSign = position.unrealizedPnL >= 0 ? '+' : '';
        
        console.log(`   ${index + 1}. ${chalk.bold(position.symbol)}`);
        console.log(`      Quantity: ${chalk.yellow(position.quantity.toString())} shares`);
        console.log(`      Market Value: ${chalk.green('$' + position.marketValue.toFixed(2))}`);
        console.log(`      Cost Basis: $${position.costBasis.toFixed(2)}`);
        console.log(`      P&L: ${pnlColor(pnlSign + '$' + position.unrealizedPnL.toFixed(2))}`);
        console.log('');
      });
      
    } catch (error) {
      console.log(chalk.red('❌ Failed to fetch portfolio information'));
      this.handleError(error as Error);
    }
  }

  /**
   * Handle errors consistently
   */
  private handleError(error: unknown): void {
    console.log('');
    console.log(chalk.red.bold('❌ An error occurred:'));
    
    if (error instanceof Error) {
      console.log(chalk.red(`   ${error.message}`));
      
      // Show specific guidance for common errors
      if (error.message.includes('API key')) {
        console.log(chalk.yellow('   💡 Check your API configuration in .env file'));
      }
      
      if (error.message.includes('market data')) {
        console.log(chalk.yellow('   💡 Market may be closed. Orders will queue for market open.'));
      }
      
      if (error.message.includes('insufficient')) {
        console.log(chalk.yellow('   💡 Check your account balance with "account" command'));
      }
    } else {
      console.log(chalk.red('   An unknown error occurred'));
    }
    console.log('');
  }
}

// Main execution function
export async function runOptimizedCLI(): Promise<void> {
  const cli = new OptimizedTradingCLI();
  const program = cli.createProgram();
  await program.parseAsync(process.argv);
}

// Direct execution when script is run
if (require.main === module) {
  runOptimizedCLI().catch((error) => {
    console.error(chalk.red('CLI Error:'), error);
    process.exit(1);
  });
}