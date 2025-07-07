import dotenv from 'dotenv';
import path from 'path';
import { AppConfig } from '../types';

// Load environment variables with explicit path
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Debug: Log environment variable loading
console.log('🔍 Environment variables debug:');
console.log('Current working directory:', process.cwd());
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('ALPACA_API_KEY exists:', !!process.env.ALPACA_API_KEY);
console.log('QUIVER_API_KEY exists:', !!process.env.QUIVER_API_KEY);

export function loadConfig(): AppConfig {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // In development, provide helpful instructions if env vars are missing
  if (isDevelopment) {
    const missingVars = [];
    if (!process.env.OPENAI_API_KEY) missingVars.push('OPENAI_API_KEY');
    if (!process.env.ALPACA_API_KEY) missingVars.push('ALPACA_API_KEY');
    if (!process.env.ALPACA_SECRET_KEY) missingVars.push('ALPACA_SECRET_KEY');
    
    if (missingVars.length > 0) {
      console.warn('\n⚠️  Missing environment variables:', missingVars.join(', '));
      console.warn('\n📝 To fix this, create a .env file in the root directory with:');
      console.warn('----------------------------------------');
      console.warn('OPENAI_API_KEY=your_openai_api_key');
      console.warn('ALPACA_API_KEY=your_alpaca_api_key');
      console.warn('ALPACA_SECRET_KEY=your_alpaca_secret_key');
      console.warn('ALPACA_BASE_URL=https://paper-api.alpaca.markets');
      console.warn('QUIVER_API_KEY=your_quiver_api_key (optional)');
      console.warn('----------------------------------------');
      console.warn('\n🔗 Get your API keys from:');
      console.warn('   - OpenAI: https://platform.openai.com/api-keys');
      console.warn('   - Alpaca: https://app.alpaca.markets/');
      console.warn('   - QuiverQuant: https://api.quiverquant.com/ (for real 13F data)');
      console.warn('\n⚡ Running in development mode with mock values...\n');
    }
  }

  // In production, require all environment variables
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'ALPACA_API_KEY',
    'ALPACA_SECRET_KEY'
  ];

  if (!isDevelopment) {
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Missing required environment variable: ${envVar}`);
      }
    }
  }

  return {
    openaiApiKey: process.env.OPENAI_API_KEY || (isDevelopment ? 'development-mock-key' : ''),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '', // Keep for backward compatibility
    alpacaApiKey: process.env.ALPACA_API_KEY || (isDevelopment ? 'development-mock-key' : ''),
    alpacaSecretKey: process.env.ALPACA_SECRET_KEY || (isDevelopment ? 'development-mock-secret' : ''),
    alpacaBaseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    quiverApiKey: process.env.QUIVER_API_KEY || '', // Optional for enhanced 13F data
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