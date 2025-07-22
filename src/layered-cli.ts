#!/usr/bin/env node

// ============================================================================
// LAYERED CLI - MAIN ENTRY POINT
// ============================================================================

import { program } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';

import { 
  resolveLogger,
  resolveTradeOrchestrator,
  resolvePortfolioService,
  resolveBrokerAdapter
} from './infrastructure/di/Container';
import { config } from './config';
import { ApplicationError, DomainError, InfrastructureError } from './core/interfaces';

// Initialize services
const logger = resolveLogger();
const tradeOrchestrator = resolveTradeOrchestrator();
const portfolioService = resolvePortfolioService();
const brokerAdapter = resolveBrokerAdapter();

// ===== CLI CONFIGURATION =====

program
  .name('nltrade')
  .description('Natural Language Trading CLI - Layered Architecture')
  .version('2.0.0');

// ===== TRADING COMMANDS =====

program
  .command('trade')
  .description('Execute a trade using natural language')
  .argument('[command]', 'Trading command (e.g., "buy $100 of AAPL")')
  .option('-p, --preview', 'Preview the trade without executing')
  .option('-f, --force', 'Skip confirmation prompts')
  .action(async (command, options) => {
    try {
      await handleTradeCommand(command, options);
    } catch (error) {
      await handleError(error, 'trade execution');
      process.exit(1);
    }
  });

program
  .command('preview')
  .description('Preview a trade without executing it')
  .argument('<command>', 'Trading command to preview')
  .action(async (command) => {
    try {
      await handlePreviewCommand(command);
    } catch (error) {
      await handleError(error, 'trade preview');
      process.exit(1);
    }
  });

// ===== PORTFOLIO COMMANDS =====

program
  .command('portfolio')
  .alias('pf')
  .description('Show current portfolio')
  .option('-d, --detailed', 'Show detailed position information')
  .action(async (options) => {
    try {
      await handlePortfolioCommand(options);
    } catch (error) {
      await handleError(error, 'portfolio fetch');
      process.exit(1);
    }
  });

program
  .command('positions')
  .alias('pos')
  .description('Show current positions')
  .action(async () => {
    try {
      await handlePositionsCommand();
    } catch (error) {
      await handleError(error, 'positions fetch');
      process.exit(1);
    }
  });

program
  .command('performance')
  .alias('perf')
  .description('Show portfolio performance metrics')
  .option('-p, --period <period>', 'Time period (1D, 1W, 1M, 3M, 6M, 1Y, YTD)', '1M')
  .action(async (options) => {
    try {
      await handlePerformanceCommand(options);
    } catch (error) {
      await handleError(error, 'performance metrics');
      process.exit(1);
    }
  });

// ===== MARKET DATA COMMANDS =====

program
  .command('quote')
  .alias('q')
  .description('Get market data for a symbol')
  .argument('<symbol>', 'Stock symbol (e.g., AAPL)')
  .action(async (symbol) => {
    try {
      await handleQuoteCommand(symbol);
    } catch (error) {
      await handleError(error, 'market data');
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check market status and system health')
  .action(async () => {
    try {
      await handleStatusCommand();
    } catch (error) {
      await handleError(error, 'status check');
      process.exit(1);
    }
  });

// ===== INTERACTIVE COMMANDS =====

program
  .command('interactive')
  .alias('i')
  .description('Start interactive trading session')
  .action(async () => {
    try {
      await startInteractiveSession();
    } catch (error) {
      await handleError(error, 'interactive session');
      process.exit(1);
    }
  });

// ===== COMMAND HANDLERS =====

async function handleTradeCommand(command: string | undefined, options: any): Promise<void> {
  let tradeCommand = command;

  // If no command provided, ask for it
  if (!tradeCommand) {
    const response = await inquirer.prompt([
      {
        type: 'input',
        name: 'command',
        message: 'Enter your trading command:',
        validate: (input) => input.trim().length > 0 || 'Command cannot be empty'
      }
    ]);
    tradeCommand = response.command;
  }

  logger.info('Processing trade command', { command: tradeCommand });

  // Preview mode or explicit preview flag
  if (options.preview) {
    await handlePreviewCommand(tradeCommand!);
    return;
  }

  // Preview first, then ask for confirmation
  console.log(chalk.blue('\n📋 Trade Preview:'));
  const preview = await tradeOrchestrator.previewTrade(tradeCommand!);

  // Display preview
  displayTradePreview(preview);

  // Check for validation errors
  if (!preview.validation.isValid) {
    console.log(chalk.red('\n❌ Trade validation failed:'));
    preview.validation.errors.forEach(error => {
      console.log(chalk.red(`  • ${error.message}`));
    });
    return;
  }

  // Show warnings
  if (preview.validation.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    preview.validation.warnings.forEach(warning => {
      console.log(chalk.yellow(`  • ${warning}`));
    });
  }

  // Confirmation (unless --force flag is used)
  if (!options.force) {
    const confirmation = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Do you want to execute this trade?',
        default: false
      }
    ]);

    if (!confirmation.proceed) {
      console.log(chalk.gray('Trade cancelled.'));
      return;
    }
  }

  // Execute trade
  console.log(chalk.blue('\n🚀 Executing trade...'));
  const result = await tradeOrchestrator.executeTrade(tradeCommand!);

  if (result.success) {
    console.log(chalk.green('\n✅ Trade executed successfully!'));
    console.log(chalk.green(`Order ID: ${result.orderId}`));
    if (result.executedPrice) {
      console.log(chalk.green(`Executed at: $${result.executedPrice.toFixed(2)}`));
    }
    if (result.executedQuantity) {
      console.log(chalk.green(`Quantity: ${result.executedQuantity} shares`));
    }
  } else {
    console.log(chalk.red('\n❌ Trade execution failed:'));
    console.log(chalk.red(result.error || result.message));
  }
}

async function handlePreviewCommand(command: string): Promise<void> {
  console.log(chalk.blue('\n📋 Previewing trade...'));
  
  const preview = await tradeOrchestrator.previewTrade(command);
  displayTradePreview(preview);
  
  if (!preview.validation.isValid) {
    console.log(chalk.red('\n❌ Validation Errors:'));
    preview.validation.errors.forEach(error => {
      console.log(chalk.red(`  • ${error.message}`));
    });
  }
  
  if (preview.validation.warnings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Warnings:'));
    preview.validation.warnings.forEach(warning => {
      console.log(chalk.yellow(`  • ${warning}`));
    });
  }
}

async function handlePortfolioCommand(options: any): Promise<void> {
  console.log(chalk.blue('\n📊 Portfolio Overview'));
  
  const portfolio = await portfolioService.getPortfolio();
  
  console.log(`\nTotal Value: ${chalk.green('$' + portfolio.totalValue.toFixed(2))}`);
  console.log(`Total Cost: $${portfolio.totalCost.toFixed(2)}`);
  console.log(`Total Return: ${portfolio.totalReturn >= 0 ? chalk.green('+') : chalk.red('')}$${portfolio.totalReturn.toFixed(2)} (${portfolio.totalReturnPercent.toFixed(2)}%)`);
  console.log(`Available Cash: $${portfolio.cash.toFixed(2)}`);
  console.log(`Day Change: ${portfolio.dayChange >= 0 ? chalk.green('+') : chalk.red('')}$${portfolio.dayChange.toFixed(2)} (${portfolio.dayChangePercent.toFixed(2)}%)`);
  
  if (portfolio.positions.length > 0) {
    console.log(`\nPositions (${portfolio.positions.length}):`);
    
    portfolio.positions.forEach(position => {
      const pnlColor = position.unrealizedPnL >= 0 ? chalk.green : chalk.red;
      const side = position.side === 'long' ? '🟢' : '🔴';
      
      console.log(`  ${side} ${position.symbol}: ${position.quantity} shares @ $${position.averagePrice.toFixed(2)}`);
      console.log(`     Market Value: $${position.marketValue.toFixed(2)}`);
      console.log(`     P&L: ${pnlColor('$' + position.unrealizedPnL.toFixed(2))}`);
      
      if (options.detailed) {
        console.log(`     Last Updated: ${position.lastUpdated.toLocaleString()}`);
      }
    });
  } else {
    console.log('\nNo positions found.');
  }
}

async function handlePositionsCommand(): Promise<void> {
  console.log(chalk.blue('\n📍 Current Positions'));
  
  const positions = await portfolioService.getPositions();
  
  if (positions.length === 0) {
    console.log('\nNo positions found.');
    return;
  }
  
  positions.forEach((position, index) => {
    const pnlColor = position.unrealizedPnL >= 0 ? chalk.green : chalk.red;
    const side = position.side === 'long' ? '🟢 LONG' : '🔴 SHORT';
    
    console.log(`\n${index + 1}. ${position.symbol} (${side})`);
    console.log(`   Quantity: ${position.quantity} shares`);
    console.log(`   Average Price: $${position.averagePrice.toFixed(2)}`);
    console.log(`   Market Value: $${position.marketValue.toFixed(2)}`);
    console.log(`   Unrealized P&L: ${pnlColor('$' + position.unrealizedPnL.toFixed(2))}`);
    console.log(`   Last Updated: ${position.lastUpdated.toLocaleString()}`);
  });
}

async function handlePerformanceCommand(options: any): Promise<void> {
  console.log(chalk.blue(`\n📈 Performance Metrics (${options.period})`));
  
  const metrics = await portfolioService.getPerformanceMetrics(options.period);
  
  const returnColor = metrics.totalReturn >= 0 ? chalk.green : chalk.red;
  const annualizedColor = metrics.annualizedReturn >= 0 ? chalk.green : chalk.red;
  
  console.log(`\nTotal Return: ${returnColor('$' + metrics.totalReturn.toFixed(2))}`);
  console.log(`Annualized Return: ${annualizedColor(metrics.annualizedReturn.toFixed(2) + '%')}`);
  console.log(`Volatility: ${metrics.volatility.toFixed(2)}%`);
  console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
  console.log(`Max Drawdown: ${chalk.red(metrics.maxDrawdown.toFixed(2) + '%')}`);
  console.log(`Win Rate: ${metrics.winRate.toFixed(1)}%`);
  console.log(`Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
}

async function handleQuoteCommand(symbol: string): Promise<void> {
  console.log(chalk.blue(`\n💹 Market Data for ${symbol.toUpperCase()}`));
  
  const marketData = await brokerAdapter.getMarketData(symbol.toUpperCase());
  
  const changeColor = marketData.changePercent >= 0 ? chalk.green : chalk.red;
  const changeSymbol = marketData.changePercent >= 0 ? '+' : '';
  const marketStatus = marketData.isMarketOpen ? chalk.green('OPEN') : chalk.gray('CLOSED');
  
  console.log(`\nSymbol: ${marketData.symbol}`);
  console.log(`Current Price: $${marketData.currentPrice.toFixed(2)}`);
  console.log(`Previous Close: $${marketData.previousClose.toFixed(2)}`);
  console.log(`Change: ${changeColor(changeSymbol + '$' + marketData.changeAmount.toFixed(2) + ' (' + changeSymbol + marketData.changePercent.toFixed(2) + '%)')}`);
  console.log(`Volume: ${marketData.volume.toLocaleString()}`);
  console.log(`Market Status: ${marketStatus}`);
  console.log(`Updated: ${marketData.timestamp.toLocaleString()}`);
}

async function handleStatusCommand(): Promise<void> {
  console.log(chalk.blue('\n🏥 System Status'));
  
  try {
    const [account, isMarketOpen] = await Promise.all([
      brokerAdapter.getAccountInfo(),
      brokerAdapter.isMarketOpen()
    ]);
    
    const marketStatus = isMarketOpen ? chalk.green('OPEN') : chalk.gray('CLOSED');
    const accountStatus = account.status === 'active' ? chalk.green('ACTIVE') : chalk.yellow(account.status.toUpperCase());
    const mode = config.alpacaBaseUrl.includes('paper') ? chalk.yellow('PAPER TRADING') : chalk.red('LIVE TRADING');
    
    console.log(`\nTrading Mode: ${mode}`);
    console.log(`Market Status: ${marketStatus}`);
    console.log(`Account Status: ${accountStatus}`);
    console.log(`Account ID: ${account.accountNumber}`);
    console.log(`Buying Power: $${account.buyingPower.toFixed(2)}`);
    console.log(`Portfolio Value: $${account.portfolioValue.toFixed(2)}`);
    console.log(`Day Trade Count: ${account.dayTradeCount}`);
    console.log(`\n✅ All systems operational`);
    
  } catch (error) {
    console.log(`\n❌ System check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

async function startInteractiveSession(): Promise<void> {
  console.log(chalk.blue('\n🎯 Interactive Trading Session Started'));
  console.log(chalk.gray('Type "exit" to quit, "help" for commands\n'));
  
  while (true) {
    try {
      const response = await inquirer.prompt([
        {
          type: 'input',
          name: 'command',
          message: '> ',
          validate: (input) => input.trim().length > 0 || 'Please enter a command'
        }
      ]);
      
      const command = response.command.trim().toLowerCase();
      
      if (command === 'exit' || command === 'quit') {
        console.log(chalk.gray('Goodbye! 👋'));
        break;
      }
      
      if (command === 'help') {
        displayInteractiveHelp();
        continue;
      }
      
      if (command.startsWith('portfolio') || command === 'pf') {
        await handlePortfolioCommand({ detailed: false });
        continue;
      }
      
      if (command.startsWith('positions') || command === 'pos') {
        await handlePositionsCommand();
        continue;
      }
      
      if (command.startsWith('quote ') || command.startsWith('q ')) {
        const symbol = command.split(' ')[1];
        if (symbol) {
          await handleQuoteCommand(symbol);
        } else {
          console.log(chalk.red('Usage: quote <symbol>'));
        }
        continue;
      }
      
      if (command === 'status') {
        await handleStatusCommand();
        continue;
      }
      
      // Treat everything else as a potential trade command
      await handleTradeCommand(response.command, { preview: false, force: false });
      
    } catch (error) {
      await handleError(error, 'interactive command');
      // Continue the session instead of exiting
    }
  }
}

// ===== UTILITY FUNCTIONS =====

function displayTradePreview(preview: any): void {
  console.log(`\nSymbol: ${preview.command.symbol}`);
  console.log(`Action: ${preview.command.action.toUpperCase()}`);
  console.log(`Amount: ${preview.command.amount} ${preview.command.amountType}`);
  console.log(`Order Type: ${preview.command.orderType.toUpperCase()}`);
  
  if (preview.command.limitPrice) {
    console.log(`Limit Price: $${preview.command.limitPrice.toFixed(2)}`);
  }
  
  console.log(`\nEstimated Cost: $${preview.estimatedCost.toFixed(2)}`);
  if (preview.estimatedShares) {
    console.log(`Estimated Shares: ${preview.estimatedShares}`);
  }
  console.log(`Market Price: $${preview.marketPrice?.toFixed(2) || 'N/A'}`);
  
  if (preview.impact) {
    console.log(`\nTiming: ${preview.impact.timing.toUpperCase()}`);
    console.log(`Liquidity Score: ${(preview.impact.liquidityScore * 100).toFixed(1)}%`);
  }
  
  const validationStatus = preview.validation.isValid ? chalk.green('✅ Valid') : chalk.red('❌ Invalid');
  console.log(`\nValidation: ${validationStatus}`);
}

function displayInteractiveHelp(): void {
  console.log(chalk.blue('\n📚 Available Commands:'));
  console.log('  • Trading: "buy $100 AAPL", "sell 10 shares TSLA"');
  console.log('  • Portfolio: "portfolio" or "pf"');
  console.log('  • Positions: "positions" or "pos"');
  console.log('  • Quotes: "quote AAPL" or "q AAPL"');
  console.log('  • Status: "status"');
  console.log('  • Exit: "exit" or "quit"');
  console.log('  • Help: "help"');
}

async function handleError(error: any, operation: string): Promise<void> {
  if (error instanceof ApplicationError) {
    console.log(chalk.red(`\n❌ ${operation} failed: ${error.message}`));
    logger.debug('Application error details', { code: error.code, details: error.details });
  } else if (error instanceof DomainError) {
    console.log(chalk.red(`\n❌ ${operation} failed: ${error.message}`));
    logger.debug('Domain error details', { code: error.code, details: error.details });
  } else if (error instanceof InfrastructureError) {
    console.log(chalk.red(`\n❌ ${operation} failed: External service error`));
    console.log(chalk.red(`Source: ${error.source}`));
    logger.error('Infrastructure error', error);
  } else {
    console.log(chalk.red(`\n❌ ${operation} failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
    logger.error('Unexpected error', error as Error);
  }
}

// ===== MAIN EXECUTION =====

async function main() {
  try {
    // Display startup banner
    console.log(chalk.blue.bold('\n🚀 Natural Language Trading CLI v2.0'));
    console.log(chalk.gray('Layered Architecture | Built with TypeScript'));
    
    const mode = config.alpacaBaseUrl.includes('paper') ? 
      chalk.yellow('📋 PAPER TRADING MODE') : 
      chalk.red('⚠️  LIVE TRADING MODE');
    console.log(mode);
    console.log(chalk.gray('─'.repeat(50)));
    
    // Verify system status on startup
    if (process.argv.length <= 2) {
      console.log(chalk.blue('\n🔍 Verifying system status...'));
      await handleStatusCommand();
      console.log(chalk.gray('\nType "nltrade --help" for usage information.'));
      console.log(chalk.gray('Type "nltrade interactive" to start interactive mode.\n'));
      return;
    }
    
    // Parse command line arguments
    await program.parseAsync();
    
  } catch (error) {
    await handleError(error, 'CLI startup');
    process.exit(1);
  }
}

// Run CLI if this is the main module
if (require.main === module) {
  main().catch((error) => {
    logger.error('CLI startup failed', error);
    process.exit(1);
  });
}

export { program };