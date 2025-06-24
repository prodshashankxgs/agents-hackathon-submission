import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { OpenAIService } from '../llm/openai-service';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { ValidationService } from '../trading/validation-service';
import { TradeIntent, CLIOptions } from '../types';
import { TradingChatbot } from './chatbot';

export class TradingCLI {
  private openAI: OpenAIService;
  private broker: AlpacaAdapter;
  private validator: ValidationService;

  constructor() {
    this.openAI = new OpenAIService();
    this.broker = new AlpacaAdapter();
    this.validator = new ValidationService(this.broker);
  }

  /**
   * Main trade command handler
   */
  async handleTrade(input: string | undefined, options: CLIOptions): Promise<void> {
    try {
      console.log(chalk.blue('🤖 Natural Language Trading CLI\n'));

      // Get trade input if not provided
      const tradeInput = input || await this.promptForTradeInput();
      
      // Parse the natural language input
      console.log(chalk.gray('Parsing your trade request...'));
      const intent = await this.openAI.parseTradeIntent(tradeInput);
      
      // Show parsed intent
      this.displayTradeIntent(intent);
      
      // Validate the trade
      console.log(chalk.gray('\nValidating trade...'));
      const validation = await this.validator.validateTrade(intent);
      
      // Display validation results
      console.log('\n' + this.validator.formatValidationResults(validation));
      
      if (!validation.isValid) {
        console.log(chalk.red('\nTrade cannot be executed due to validation errors.'));
        return;
      }
      
      // Confirm trade execution
      if (!options.dryRun) {
        const confirmed = await this.confirmTrade(intent, validation);
        
        if (!confirmed) {
          console.log(chalk.yellow('\nTrade cancelled.'));
          return;
        }
        
        // Execute the trade
        console.log(chalk.gray('\nExecuting trade...'));
        const result = await this.broker.executeOrder(intent);
        
        // Display results
        this.displayTradeResult(result);
      } else {
        console.log(chalk.yellow('\n📋 Dry run mode - trade not executed'));
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Account info command handler
   */
  async handleAccountInfo(): Promise<void> {
    try {
      console.log(chalk.blue('📊 Fetching account information...\n'));
      
      const accountInfo = await this.broker.getAccountInfo();
      
      console.log(chalk.white('Account Summary:'));
      console.log(`Account ID: ${accountInfo.accountId}`);
      console.log(`Buying Power: ${chalk.green(`$${accountInfo.buyingPower.toFixed(2)}`)}`);
      console.log(`Portfolio Value: ${chalk.green(`$${accountInfo.portfolioValue.toFixed(2)}`)}`);
      console.log(`Day Trades: ${accountInfo.dayTradeCount}`);
      
      if (accountInfo.positions.length > 0) {
        console.log(chalk.white('\nPositions:'));
        accountInfo.positions.forEach(pos => {
          const pnl = pos.unrealizedPnL >= 0 ? chalk.green(`+$${pos.unrealizedPnL.toFixed(2)}`) : chalk.red(`-$${Math.abs(pos.unrealizedPnL).toFixed(2)}`);
          console.log(`  ${pos.symbol}: ${pos.quantity} shares @ $${(pos.marketValue / pos.quantity).toFixed(2)} (P&L: ${pnl})`);
        });
      } else {
        console.log(chalk.gray('\nNo open positions'));
      }
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Prompt for trade input
   */
  private async promptForTradeInput(): Promise<string> {
    const { input } = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message: 'What would you like to trade?',
        prefix: '💬',
        transformer: (input: string) => chalk.cyan(input)
      }
    ]);
    
    return input;
  }

  /**
   * Confirm trade execution
   */
  private async confirmTrade(intent: TradeIntent, validation: any): Promise<boolean> {
    console.log(chalk.yellow('\n⚠️  Please confirm your trade:'));
    console.log(chalk.white(this.openAI.generateTradeSummary(intent)));
    
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow('\nNote: This trade has warnings (see above)'));
    }
    
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Do you want to execute this trade?',
        default: false
      }
    ]);
    
    return confirmed;
  }

  /**
   * Display parsed trade intent
   */
  private displayTradeIntent(intent: TradeIntent): void {
    console.log(chalk.white('\n📋 Parsed Trade:'));
    console.log(`Action: ${chalk.bold(intent.action.toUpperCase())}`);
    console.log(`Symbol: ${chalk.bold(intent.symbol)}`);
    console.log(`Amount: ${chalk.bold(intent.amountType === 'dollars' ? `$${intent.amount}` : `${intent.amount} shares`)}`);
    console.log(`Order Type: ${chalk.bold(intent.orderType)}`);
    
    if (intent.limitPrice) {
      console.log(`Limit Price: ${chalk.bold(`$${intent.limitPrice}`)}`);
    }
  }

  /**
   * Display trade execution result
   */
  private displayTradeResult(result: any): void {
    if (result.success) {
      console.log(chalk.green('\n✅ Trade executed successfully!'));
      console.log(`Order ID: ${result.orderId}`);
      
      if (result.executedPrice) {
        console.log(`Executed Price: $${result.executedPrice.toFixed(2)}`);
      }
      
      if (result.executedShares) {
        console.log(`Executed Shares: ${result.executedShares}`);
      }
      
      if (result.executedValue) {
        console.log(`Total Value: $${result.executedValue.toFixed(2)}`);
      }
      
      console.log(`Status: ${result.message}`);
    } else {
      console.log(chalk.red('\n❌ Trade execution failed'));
      console.log(`Error: ${result.error || result.message}`);
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: unknown): void {
    if (error instanceof Error) {
      console.log(chalk.red(`\n❌ Error: ${error.message}`));
      
      if ('details' in error) {
        console.log(chalk.gray(JSON.stringify((error as any).details, null, 2)));
      }
    } else {
      console.log(chalk.red('\n❌ An unexpected error occurred'));
    }
  }
}

/**
 * Create the CLI program
 */
export function createProgram(): Command {
  const program = new Command();
  const cli = new TradingCLI();

  program
    .name('nltrade')
    .description('Natural Language Trading CLI - Execute trades using conversational commands')
    .version('1.0.0');

  program
    .command('trade [input]')
    .description('Execute a trade using natural language')
    .option('-d, --dry-run', 'Simulate the trade without executing')
    .option('-v, --verbose', 'Show detailed output')
    .action((input, options) => cli.handleTrade(input, options));

  program
    .command('account')
    .description('Show account information and positions')
    .action(() => cli.handleAccountInfo());

  program
    .command('interactive')
    .description('Start interactive trading mode')
    .action(async () => {
      console.log(chalk.blue('🚀 Starting interactive trading mode...'));
      console.log(chalk.gray('Type "exit" to quit\n'));
      
      while (true) {
        const { command } = await inquirer.prompt([
          {
            type: 'input',
            name: 'command',
            message: 'nltrade>',
            prefix: ''
          }
        ]);
        
        if (command.toLowerCase() === 'exit') {
          console.log(chalk.blue('👋 Goodbye!'));
          break;
        }
        
        await cli.handleTrade(command, {});
        console.log(''); // Add spacing between commands
      }
    });

  program
    .command('chat')
    .description('Start conversational chatbot mode')
    .action(async () => {
      const chatbot = new TradingChatbot();
      await chatbot.start();
    });

  return program;
} 