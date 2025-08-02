#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { runOptimizedCLI } from './cli/optimized-trading-cli';
import { TradingChatbot } from './cli/chatbot';

/**
 * Main entry point for the Natural Language Trading application
 * Routes to different modes based on command line arguments
 */
async function main(): Promise<void> {
  const program = new Command();

  program
    .name('nltrade')
    .description('Natural Language Trading - CLI and Chat Interface')
    .version('1.1.0');

  // Chat mode - start the interactive chatbot
  program
    .command('chat')
    .description('Start interactive chatbot mode')
    .action(async () => {
      console.log(chalk.blue('🤖 Starting Trading Chatbot...'));
      const chatbot = new TradingChatbot();
      await chatbot.start();
    });

  // Server mode - start the web server
  program
    .command('server')
    .description('Start the web server')
    .action(async () => {
      console.log(chalk.blue('🚀 Starting web server...'));
      // Import and start server
      const serverModule = await import('./server');
      // Server starts automatically when imported
    });

  // CLI mode - start the trading CLI (default)
  program
    .command('cli')
    .description('Start the trading CLI (default mode)')
    .action(async () => {
      await runOptimizedCLI();
    });

  // Default action when no command is specified
  program.action(async () => {
    console.log(chalk.yellow('⚡ Starting default CLI mode...'));
    console.log(chalk.gray('Use "nltrade chat" for chatbot or "nltrade server" for web interface\n'));
    await runOptimizedCLI();
  });

  // Parse command line arguments
  await program.parseAsync(process.argv);
}

// Handle errors and start the application
if (require.main === module) {
  main().catch((error) => {
    console.error(chalk.red('Application Error:'), error);
    process.exit(1);
  });
}

export { main };