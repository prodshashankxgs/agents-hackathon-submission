import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { OpenAIService } from '../llm/openai-service';
import { ClaudeService } from '../llm/claude-service';
import { optimizedParsingService } from '../parsing/parsing-service';
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
      const result = await optimizedParsingService.parseTradeIntent(tradeInput);
      const intent = result.intent;
      
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
    const { input } = await inquirer.prompt({
      type: 'input',
      name: 'input',
      message: '💬 What would you like to trade?',
      transformer: (input: string) => chalk.cyan(input)
    });
    
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
   * Handle LLM provider switching
   */
  async handleLLMSwitch(provider: string): Promise<void> {
    try {
      if (provider !== 'openai' && provider !== 'claude') {
        console.log(chalk.red('❌ Invalid provider. Use "openai" or "claude"'));
        return;
      }

      const currentProvider = optimizedParsingService.getLLMProvider();
      
      if (currentProvider === provider) {
        console.log(chalk.yellow(`⚠️ Already using ${provider} provider`));
        return;
      }

      optimizedParsingService.setLLMProvider(provider as 'openai' | 'claude');
      console.log(chalk.green(`✅ Switched to ${provider} provider`));
      
      // Show quick test
      console.log(chalk.gray('\nTesting with sample input...'));
      const testResult = await optimizedParsingService.parseTradeIntent('buy $100 of AAPL');
      console.log(chalk.blue(`🤖 Test result: ${optimizedParsingService.generateTradeSummary(testResult.intent)}`));
      console.log(chalk.gray(`   Confidence: ${testResult.confidence.toFixed(3)} | Method: ${testResult.method} | Time: ${testResult.processingTime}ms`));
      
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Test both LLM providers
   */
  async handleLLMTest(input?: string): Promise<void> {
    try {
      const testInput = input || 'buy $100 of AAPL';
      console.log(chalk.blue(`🧪 Testing LLM providers with: "${testInput}"\n`));

      const originalProvider = optimizedParsingService.getLLMProvider();

      // Test OpenAI
      console.log(chalk.yellow('🤖 Testing OpenAI:'));
      optimizedParsingService.setLLMProvider('openai');
      try {
        const openaiResult = await optimizedParsingService.parseTradeIntent(testInput);
        console.log(chalk.green(`   ✅ ${optimizedParsingService.generateTradeSummary(openaiResult.intent)}`));
        console.log(chalk.gray(`   Confidence: ${openaiResult.confidence.toFixed(3)} | Time: ${openaiResult.processingTime}ms`));
      } catch (error) {
        console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }

      console.log('');

      // Test Claude
      console.log(chalk.yellow('🧠 Testing Claude:'));
      optimizedParsingService.setLLMProvider('claude');
      try {
        const claudeResult = await optimizedParsingService.parseTradeIntent(testInput);
        console.log(chalk.green(`   ✅ ${optimizedParsingService.generateTradeSummary(claudeResult.intent)}`));
        console.log(chalk.gray(`   Confidence: ${claudeResult.confidence.toFixed(3)} | Time: ${claudeResult.processingTime}ms`));
      } catch (error) {
        console.log(chalk.red(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }

      // Restore original provider
      optimizedParsingService.setLLMProvider(originalProvider);
      console.log(chalk.blue(`\n🔄 Restored to ${originalProvider} provider`));

      // Show performance stats
      console.log(chalk.blue('\n📊 Performance Stats:'));
      const stats = optimizedParsingService.getPerformanceStats();
      console.log(chalk.gray(JSON.stringify(stats.metrics, null, 2)));

    } catch (error) {
      this.handleError(error);
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
        const { command } = await inquirer.prompt({
          type: 'input',
          name: 'command',
          message: 'nltrade>'
        });
        
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

  program
    .command('llm')
    .description('LLM provider management')
    .addCommand(
      new Command('provider')
        .description('Show current LLM provider')
        .action(() => {
          const currentProvider = optimizedParsingService.getLLMProvider();
          console.log(chalk.blue(`🤖 Current LLM provider: ${currentProvider}`));
        })
    )
    .addCommand(
      new Command('switch')
        .description('Switch LLM provider')
        .argument('<provider>', 'LLM provider (openai|claude)')
        .action((provider) => cli.handleLLMSwitch(provider))
    )
    .addCommand(
      new Command('test')
        .description('Test both LLM providers with sample input')
        .argument('[input]', 'Test input (default: "buy $100 of AAPL")')
        .action((input) => cli.handleLLMTest(input))
    );

  return program;
} 