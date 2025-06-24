#!/usr/bin/env node

import { createProgram } from './cli/commands';
import { config } from './config';
import chalk from 'chalk';

/**
 * Main entry point for the Natural Language Trading CLI
 */
async function main() {
  try {
    // Verify configuration on startup
    console.log(chalk.gray('Initializing Natural Language Trading CLI...'));
    
    // Check if we're in paper trading mode
    if (config.alpacaBaseUrl.includes('paper')) {
      console.log(chalk.yellow('📋 Running in PAPER TRADING mode (simulated trades only)\n'));
    } else {
      console.log(chalk.red('⚠️  WARNING: Running in LIVE TRADING mode!\n'));
    }
    
    // Create and run the CLI program
    const program = createProgram();
    await program.parseAsync(process.argv);
    
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ Fatal error: ${error.message}`));
      
      // Provide helpful error messages for common issues
      if (error.message.includes('Missing required environment variable')) {
        console.error(chalk.yellow('\nPlease ensure you have a .env file with the required API keys.'));
        console.error(chalk.yellow('Copy env.example to .env and fill in your credentials.'));
      }
    } else {
      console.error(chalk.red('\n❌ An unexpected error occurred'));
    }
    
    process.exit(1);
  }
}

// Run the application
main(); 