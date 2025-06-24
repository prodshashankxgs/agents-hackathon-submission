import dotenv from 'dotenv';
import { AppConfig } from '../types';

// Load environment variables
dotenv.config();

export function loadConfig(): AppConfig {
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'ALPACA_API_KEY',
    'ALPACA_SECRET_KEY'
  ];

  // Check for required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  return {
    openaiApiKey: process.env.OPENAI_API_KEY!,
    alpacaApiKey: process.env.ALPACA_API_KEY!,
    alpacaSecretKey: process.env.ALPACA_SECRET_KEY!,
    alpacaBaseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    maxDailySpending: parseInt(process.env.MAX_DAILY_SPENDING || '1000'),
    maxPositionSize: parseInt(process.env.MAX_POSITION_SIZE || '500'),
    nodeEnv: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info'
  };
}

export function validateConfig(config: AppConfig): void {
  if (config.maxDailySpending <= 0) {
    throw new Error('MAX_DAILY_SPENDING must be greater than 0');
  }

  if (config.maxPositionSize <= 0) {
    throw new Error('MAX_POSITION_SIZE must be greater than 0');
  }

  if (!config.alpacaBaseUrl.includes('paper-api') && config.nodeEnv !== 'production') {
    console.warn('⚠️  WARNING: Using live trading API in non-production environment');
  }
}

export const config = loadConfig();
validateConfig(config); 