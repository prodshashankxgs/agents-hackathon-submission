// ============================================================================
// CONSOLE LOGGER - INFRASTRUCTURE LAYER
// ============================================================================

import { ILogger } from '../../core/interfaces';
import chalk from 'chalk';

export class ConsoleLogger implements ILogger {
  private readonly context: string;
  private readonly enableDebug: boolean;

  constructor(context: string = 'App', enableDebug: boolean = process.env.NODE_ENV === 'development') {
    this.context = context;
    this.enableDebug = enableDebug;
  }

  debug(message: string, meta?: any): void {
    if (this.enableDebug) {
      const timestamp = this.getTimestamp();
      const contextStr = chalk.blue(`[${this.context}]`);
      const levelStr = chalk.gray('[DEBUG]');
      
      console.debug(`${timestamp} ${contextStr} ${levelStr} ${message}`);
      
      if (meta) {
        console.debug(chalk.gray('  Meta:'), this.formatMeta(meta));
      }
    }
  }

  info(message: string, meta?: any): void {
    const timestamp = this.getTimestamp();
    const contextStr = chalk.blue(`[${this.context}]`);
    const levelStr = chalk.green('[INFO]');
    
    console.info(`${timestamp} ${contextStr} ${levelStr} ${message}`);
    
    if (meta) {
      console.info(chalk.gray('  Meta:'), this.formatMeta(meta));
    }
  }

  warn(message: string, meta?: any): void {
    const timestamp = this.getTimestamp();
    const contextStr = chalk.blue(`[${this.context}]`);
    const levelStr = chalk.yellow('[WARN]');
    
    console.warn(`${timestamp} ${contextStr} ${levelStr} ${message}`);
    
    if (meta) {
      console.warn(chalk.gray('  Meta:'), this.formatMeta(meta));
    }
  }

  error(message: string, error?: Error, meta?: any): void {
    const timestamp = this.getTimestamp();
    const contextStr = chalk.blue(`[${this.context}]`);
    const levelStr = chalk.red('[ERROR]');
    
    console.error(`${timestamp} ${contextStr} ${levelStr} ${message}`);
    
    if (error) {
      console.error(chalk.red('  Error:'), error.message);
      
      if (this.enableDebug && error.stack) {
        console.error(chalk.red('  Stack:'), error.stack);
      }
    }
    
    if (meta) {
      console.error(chalk.gray('  Meta:'), this.formatMeta(meta));
    }
  }

  // ===== HELPER METHODS =====

  private getTimestamp(): string {
    return chalk.gray(new Date().toISOString());
  }

  private formatMeta(meta: any): string {
    try {
      if (typeof meta === 'object' && meta !== null) {
        return JSON.stringify(meta, null, 2);
      }
      return String(meta);
    } catch (error) {
      return '[Circular or unserializable object]';
    }
  }

  /**
   * Create a child logger with additional context
   */
  child(childContext: string): ILogger {
    return new ConsoleLogger(`${this.context}:${childContext}`, this.enableDebug);
  }

  /**
   * Set log level filter (for future extensibility)
   */
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    // For now, just log the level change
    this.info(`Log level changed to: ${level}`);
  }
}