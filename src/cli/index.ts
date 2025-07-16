#!/usr/bin/env node
import { EnhancedTradingCLI } from './enhanced-cli';

async function main() {
  const enhancedCLI = new EnhancedTradingCLI();
  const program = enhancedCLI.createProgram();
  
  // Parse command line arguments
  await program.parseAsync(process.argv);
}

// Handle unhandled errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

main().catch((error) => {
  console.error('CLI error:', error);
  process.exit(1);
}); 