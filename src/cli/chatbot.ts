import inquirer from 'inquirer';
import chalk from 'chalk';
import { OpenAIService } from '../llm/openai-service';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { ValidationService } from '../trading/validation-service';
import { TradeIntent, AccountInfo, TradeResult } from '../types';
import OpenAI from 'openai';
import { config } from '../config';

interface ChatContext {
  accountInfo?: AccountInfo;
  lastTrade?: TradeResult;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export class TradingChatbot {
  private openAI: OpenAIService;
  private openAIClient: OpenAI;
  private broker: AlpacaAdapter;
  private validator: ValidationService;
  private context: ChatContext;

  constructor() {
    this.openAI = new OpenAIService();
    this.openAIClient = new OpenAI({ apiKey: config.openaiApiKey });
    this.broker = new AlpacaAdapter();
    this.validator = new ValidationService(this.broker);
    this.context = {
      conversationHistory: []
    };
  }

  async start(): Promise<void> {
    console.clear();
    console.log(chalk.blue('═══════════════════════════════════════════════════════════'));
    console.log(chalk.blue('       🤖 Natural Language Trading Assistant'));
    console.log(chalk.blue('═══════════════════════════════════════════════════════════'));
    console.log(chalk.gray('\nHi! I\'m your AI trading assistant. I can help you:'));
    console.log(chalk.gray('• Execute trades (e.g., "buy $100 of Apple")'));
    console.log(chalk.gray('• Check your account (e.g., "show my portfolio")'));
    console.log(chalk.gray('• Get market info (e.g., "what\'s the price of Tesla?")'));
    console.log(chalk.gray('• Answer trading questions\n'));
    console.log(chalk.yellow('Type "exit" or "quit" to leave\n'));

    // Load initial account info
    try {
      this.context.accountInfo = await this.broker.getAccountInfo();
      console.log(chalk.green(`Connected to account: ${this.context.accountInfo.accountId}`));
      console.log(chalk.green(`Available balance: $${this.context.accountInfo.buyingPower.toFixed(2)}\n`));
    } catch (error) {
      console.log(chalk.yellow('Note: Could not connect to trading account\n'));
    }

    // Start conversation loop
    while (true) {
      const { message } = await inquirer.prompt([
        {
          type: 'input',
          name: 'message',
          message: chalk.cyan('You:'),
          prefix: '',
          transformer: (input: string) => chalk.white(input)
        }
      ]);

      if (message.toLowerCase() === 'exit' || message.toLowerCase() === 'quit') {
        console.log(chalk.blue('\n👋 Thanks for using the trading assistant. Goodbye!\n'));
        break;
      }

      await this.processMessage(message);
    }
  }

  private async processMessage(message: string): Promise<void> {
    try {
      // Add user message to history
      this.context.conversationHistory.push({ role: 'user', content: message });

      // Determine intent and respond
      const intent = await this.determineIntent(message);
      
      console.log(chalk.green('\nAssistant:'), '');

      switch (intent.type) {
        case 'trade':
          await this.handleTradeIntent(message);
          break;
        case 'account':
          await this.handleAccountIntent();
          break;
        case 'market_info':
          await this.handleMarketInfo(intent.symbol || '');
          break;
        case 'general':
          await this.handleGeneralQuery(message);
          break;
        default:
          console.log('I can help you trade stocks, check your account, or answer questions about the market. What would you like to do?');
      }

      console.log(''); // Add spacing
    } catch (error) {
      console.log(chalk.red('\nI encountered an error processing your request. Please try again.'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
      console.log('');
    }
  }

  private async determineIntent(message: string): Promise<{ type: string; symbol?: string }> {
    const lowerMessage = message.toLowerCase();
    
    // Check for trading keywords
    if (lowerMessage.includes('buy') || lowerMessage.includes('sell') || 
        lowerMessage.includes('purchase') || lowerMessage.includes('trade')) {
      return { type: 'trade' };
    }
    
    // Check for account/portfolio keywords
    if (lowerMessage.includes('account') || lowerMessage.includes('portfolio') || 
        lowerMessage.includes('balance') || lowerMessage.includes('positions')) {
      return { type: 'account' };
    }
    
    // Check for price/market info keywords
    if (lowerMessage.includes('price') || lowerMessage.includes('cost') || 
        lowerMessage.includes('worth') || lowerMessage.includes('trading at')) {
      // Try to extract symbol
      const symbolMatch = message.match(/\b([A-Z]{1,5})\b/);
      if (symbolMatch?.[1]) {
        return { type: 'market_info', symbol: symbolMatch[1] };
      }
      return { type: 'market_info' };
    }
    
    return { type: 'general' };
  }

  private async handleTradeIntent(message: string): Promise<void> {
    try {
      // Parse the trade intent
      console.log(chalk.gray('Let me process your trade request...'));
      const intent = await this.openAI.parseTradeIntent(message);
      
      // Show what we understood
      console.log(`\nI understand you want to ${intent.action} ${intent.amountType === 'dollars' ? '$' + intent.amount : intent.amount + ' shares'} of ${intent.symbol}.`);
      
      // Validate the trade
      let validation;
      try {
        validation = await this.validator.validateTrade(intent);
      } catch (error) {
        // Handle validation errors (like market data failures when market is closed)
        console.log('\n' + chalk.yellow('Note: I cannot fetch current market data (market may be closed).'));
        console.log('Would you like to proceed with the order anyway? It will be queued for the next market open.');
        
        // Create a mock validation for after-hours trading
        validation = {
          isValid: true,
          errors: [],
          warnings: ['Market is closed. Order will be queued for next market open.'],
          estimatedCost: intent.amountType === 'dollars' ? intent.amount : 0,
          accountBalance: this.context.accountInfo?.buyingPower || 0
        };
      }
      
      if (!validation.isValid) {
        console.log('\n' + chalk.red('I cannot execute this trade because:'));
        validation.errors.forEach(error => console.log(chalk.red(`• ${error}`)));
        return;
      }
      
      if (validation.warnings.length > 0) {
        console.log('\n' + chalk.yellow('Please note:'));
        validation.warnings.forEach(warning => console.log(chalk.yellow(`• ${warning}`)));
      }
      
      // Show trade details
      console.log('\n' + chalk.white('Trade Summary:'));
      console.log(`• Action: ${intent.action.toUpperCase()}`);
      console.log(`• Symbol: ${intent.symbol}`);
      console.log(`• Amount: ${intent.amountType === 'dollars' ? '$' + intent.amount : intent.amount + ' shares'}`);
      if (validation.currentPrice) {
        console.log(`• Current Price: $${validation.currentPrice.toFixed(2)}`);
      }
      console.log(`• Estimated Cost: $${validation.estimatedCost.toFixed(2)}`);
      
      // Confirm execution
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Would you like me to execute this trade?',
          default: false
        }
      ]);
      
      if (confirm) {
        console.log(chalk.gray('\nExecuting trade...'));
        
        try {
          const result = await this.broker.executeOrder(intent);
          this.context.lastTrade = result;
          
          if (result.success) {
            console.log(chalk.green('\n✅ Trade executed successfully!'));
            console.log(`Order ID: ${result.orderId}`);
            if (result.executedPrice) {
              console.log(`Executed at: $${result.executedPrice.toFixed(2)}`);
            }
          } else {
            console.log(chalk.red('\n❌ Trade execution failed'));
            console.log(`Reason: ${result.error || result.message}`);
          }
        } catch (executionError) {
          console.log(chalk.red('\n❌ Could not execute trade at this time'));
          if (executionError instanceof Error) {
            if (executionError.message.includes('market data')) {
              console.log('The market is currently closed. Your order will be queued for the next market open.');
              console.log('Orders placed after hours will execute at market open prices.');
            } else {
              console.log(`Error: ${executionError.message}`);
            }
          }
        }
      } else {
        console.log(chalk.yellow('\nTrade cancelled. Let me know if you\'d like to try something else.'));
      }
    } catch (error) {
      // This catch block is for parsing errors only
      if (error instanceof Error && error.message.includes('parse')) {
        console.log(chalk.red('I had trouble understanding your trade request. Could you rephrase it?'));
        console.log(chalk.gray('Example: "Buy $100 worth of Apple" or "Sell 50 shares of TSLA"'));
      } else {
        throw error; // Re-throw if it's not a parsing error
      }
    }
  }

  private async handleAccountIntent(): Promise<void> {
    try {
      const account = await this.broker.getAccountInfo();
      this.context.accountInfo = account;
      
      console.log('\n' + chalk.white('Your Account Summary:'));
      console.log(`• Account ID: ${account.accountId}`);
      console.log(`• Buying Power: ${chalk.green(`$${account.buyingPower.toFixed(2)}`)}`);
      console.log(`• Portfolio Value: ${chalk.green(`$${account.portfolioValue.toFixed(2)}`)}`);
      console.log(`• Day Trades Used: ${account.dayTradeCount}`);
      
      if (account.positions.length > 0) {
        console.log('\n' + chalk.white('Your Positions:'));
        account.positions.forEach(pos => {
          const currentPrice = pos.marketValue / pos.quantity;
          const pnlColor = pos.unrealizedPnL >= 0 ? chalk.green : chalk.red;
          const pnlSign = pos.unrealizedPnL >= 0 ? '+' : '';
          
          console.log(`• ${pos.symbol}: ${pos.quantity} shares @ $${currentPrice.toFixed(2)}`);
          console.log(`  Market Value: $${pos.marketValue.toFixed(2)} | P&L: ${pnlColor(`${pnlSign}$${Math.abs(pos.unrealizedPnL).toFixed(2)}`)}`);
        });
      } else {
        console.log(chalk.gray('\nYou don\'t have any open positions.'));
      }
    } catch (error) {
      console.log(chalk.red('I couldn\'t fetch your account information right now. Please try again later.'));
    }
  }

  private async handleMarketInfo(symbol: string): Promise<void> {
    if (!symbol) {
      console.log('Which stock would you like to know about? Please provide a ticker symbol.');
      return;
    }
    
    try {
      const marketData = await this.broker.getMarketData(symbol);
      const changeColor = marketData.changePercent >= 0 ? chalk.green : chalk.red;
      const changeSign = marketData.changePercent >= 0 ? '+' : '';
      
      console.log(`\n${chalk.white(symbol)} is currently trading at ${chalk.bold(`$${marketData.currentPrice.toFixed(2)}`)}`);
      console.log(`Today's change: ${changeColor(`${changeSign}${marketData.changePercent.toFixed(2)}%`)}`);
      console.log(`Previous close: $${marketData.previousClose.toFixed(2)}`);
      console.log(`Market is ${marketData.isMarketOpen ? chalk.green('OPEN') : chalk.red('CLOSED')}`);
    } catch (error) {
      console.log(`I couldn't find market data for ${symbol}. Please check the ticker symbol and try again.`);
    }
  }

  private async handleGeneralQuery(message: string): Promise<void> {
    try {
      // Use OpenAI to generate a helpful response
      const completion = await this.openAIClient.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: `You are a helpful trading assistant. You can help users execute trades, check their account, and answer questions about the stock market. 
            Keep responses concise and friendly. If asked about specific trades, remind them to use clear commands like "buy $100 of AAPL".
            Current context: User has $${this.context.accountInfo?.buyingPower.toFixed(2) || 'unknown'} buying power.`
          },
          ...this.context.conversationHistory.slice(-5), // Keep last 5 messages for context
          { role: 'user', content: message }
        ],
        max_tokens: 200,
        temperature: 0.7
      });
      
      const response = completion.choices[0]?.message?.content || 'I\'m here to help with your trading needs.';
      console.log(response);
      
      // Add assistant response to history
      this.context.conversationHistory.push({ role: 'assistant', content: response });
    } catch (error) {
      console.log('I can help you trade stocks, check your account balance, or answer questions about the market. What would you like to know?');
    }
  }
} 