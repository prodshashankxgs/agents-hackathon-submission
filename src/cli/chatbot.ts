import inquirer from 'inquirer';
import chalk from 'chalk';
import { UnifiedTradeProcessor } from '../llm/unified-trade-processor';
import { AdvancedTradingService } from '../llm/trading';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { ValidationService } from '../trading/validation-service';
import { TradeIntent, AccountInfo, TradeResult, AdvancedTradeIntent } from '../types';

interface ChatContext {
  accountInfo?: AccountInfo;
  lastTrade?: TradeResult;
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export class TradingChatbot {
  private tradeProcessor: UnifiedTradeProcessor;
  private advancedTrading: AdvancedTradingService;
  private broker: AlpacaAdapter;
  private validator: ValidationService;
  private context: ChatContext;

  constructor() {
    this.tradeProcessor = new UnifiedTradeProcessor();
    this.advancedTrading = new AdvancedTradingService();
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
    console.log(chalk.gray('• Analyze hedging strategies (e.g., "how to hedge my LULU position for earnings")'));
    console.log(chalk.gray('• Provide market analysis (e.g., "analyze NVDA risk factors")'));
    console.log(chalk.gray('• Give trade recommendations (e.g., "what to buy if tariffs increase")'));
    console.log(chalk.gray('• Check your account (e.g., "show my portfolio")'));
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

      // First check for simple intents
      const simpleIntent = await this.determineSimpleIntent(message);
      
      console.log(chalk.green('\nAssistant:'), '');

      if (simpleIntent.type === 'account') {
        await this.handleAccountIntent();
      } else if (simpleIntent.type === 'price_check' && simpleIntent.symbol) {
        await this.handleMarketInfo(simpleIntent.symbol);
      } else {
        // Try unified trade processing first
        try {
          const result = await this.tradeProcessor.processTradeCommand(message);
          if (result.confidence > 0.8) {
            await this.handleTradeExecution(result.intent);
          } else {
            // Try advanced parsing for analysis/hedging queries
            try {
              const advancedIntent = await this.advancedTrading.parseAdvancedIntent(message, this.context.accountInfo);
              await this.handleAdvancedIntent(advancedIntent);
            } catch (error) {
              await this.handleGeneralQuery(message);
            }
          }
        } catch (error) {
          // Try advanced parsing for analysis/hedging queries
          try {
            const advancedIntent = await this.advancedTrading.parseAdvancedIntent(message, this.context.accountInfo);
            await this.handleAdvancedIntent(advancedIntent);
          } catch (error) {
            await this.handleGeneralQuery(message);
          }
        }
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

  private async determineSimpleIntent(message: string): Promise<{ type: string; symbol?: string }> {
    const lowerMessage = message.toLowerCase();
    
    // Check for account/portfolio keywords
    if (lowerMessage.includes('account') || lowerMessage.includes('portfolio') || 
        lowerMessage.includes('balance') || lowerMessage.includes('positions')) {
      return { type: 'account' };
    }
    
    // Check for simple price check
    if ((lowerMessage.includes('price') || lowerMessage.includes('cost') || 
         lowerMessage.includes('worth') || lowerMessage.includes('trading at')) &&
        !lowerMessage.includes('hedge') && !lowerMessage.includes('analyze')) {
      // Try to extract symbol
      const symbolMatch = message.match(/\b([A-Z]{1,5})\b/);
      if (symbolMatch?.[1]) {
        return { type: 'price_check', symbol: symbolMatch[1] };
      }
    }
    
    return { type: 'advanced' };
  }

  private async handleTradeIntent(message: string): Promise<void> {
    try {
      // Parse the trade intent using unified processor
      console.log(chalk.gray('Let me process your trade request...'));
      const result = await this.tradeProcessor.processTradeCommand(message);
      const intent = result.intent;
      
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
        
        // Validate trading hours for orders
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
      // Check if this might be a trade command first
      try {
        const result = await this.tradeProcessor.processTradeCommand(message);
        if (result.confidence > 0.7) {
          await this.handleTradeExecution(result.intent);
          return;
        }
      } catch {
        // Not a trade command, continue with general query
      }
      
      // Fallback to general conversational response
      console.log('I can help you trade stocks, check your account balance, or answer questions about the market. What would you like to know?');
      console.log('\nFor trading, try commands like:');
      console.log('• "buy $100 of Apple"');
      console.log('• "sell 50 shares of TSLA"');
      console.log('• "buy 10 MSFT limit $400"');
    } catch (error) {
      console.log('I can help you trade stocks, check your account balance, or answer questions about the market. What would you like to know?');
    }
  }

  private async handleAdvancedIntent(intent: AdvancedTradeIntent): Promise<void> {
    switch (intent.type) {
      case 'trade':
        // Handle regular trade
        const tradeIntent = intent as TradeIntent & { type: 'trade' };
        await this.handleTradeExecution(tradeIntent);
        break;
        
      case 'hedge':
        await this.handleHedgeIntent(intent);
        break;
        
      case 'analysis':
        await this.handleAnalysisIntent(intent);
        break;
        
      case 'recommendation':
        await this.handleRecommendationIntent(intent);
        break;
        
    }
  }

  private async handleTradeExecution(intent: TradeIntent): Promise<void> {
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
      
      // Validate trading hours for orders
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
  }

  private async handleHedgeIntent(intent: any): Promise<void> {
    console.log(chalk.cyan('Analyzing your hedging request...'));
    
    const hedgeIntent = intent;
    
    // Get market data for the position
    let marketData: any = {};
    try {
      marketData[hedgeIntent.primarySymbol] = await this.broker.getMarketData(hedgeIntent.primarySymbol);
    } catch (error) {
      console.log(chalk.yellow('Note: Market data unavailable. Analysis based on general strategies.'));
    }
    
    // Generate hedge recommendations
    const recommendation = await this.advancedTrading.generateHedgeRecommendation(hedgeIntent, marketData);
    
    console.log('\n' + chalk.white('Hedge Strategy Recommendation:'));
    console.log(`\nPosition: ${hedgeIntent.primarySymbol}`);
    console.log(`Reason for hedging: ${hedgeIntent.hedgeReason}`);
    console.log(`Risk tolerance: ${hedgeIntent.riskTolerance}`);
    
    console.log('\n' + chalk.yellow('Recommended Strategy:'));
    console.log(recommendation.strategy);
    
    console.log('\n' + chalk.white('Hedging Instruments:'));
    recommendation.instruments.forEach((instrument: any) => {
      console.log(`• ${instrument.action.toUpperCase()} ${instrument.quantity} ${instrument.symbol} (${instrument.type})`);
      console.log(`  Reasoning: ${instrument.reasoning}`);
    });
    
    console.log('\n' + chalk.white('Analysis:'));
    console.log(`• Estimated hedge cost: $${recommendation.costEstimate.toFixed(2)}`);
    console.log(`• Risk reduction: ${recommendation.riskReduction}%`);
    console.log(`• Timeline: ${recommendation.timeline}`);
    console.log('\n' + chalk.white('Exit Conditions:'));
    recommendation.exitConditions.forEach((condition: any) => {
      console.log(`• ${condition}`);
    });
    
    console.log('\n' + chalk.gray('Note: This is a strategic recommendation. Always consider your personal risk tolerance and consult with a financial advisor if needed.'));
  }

  private async handleAnalysisIntent(intent: any): Promise<void> {
    console.log(chalk.cyan('Performing market analysis...'));
    
    const analysisIntent = intent;
    
    // Get market data for the symbols
    const marketData: any = {};
    for (const symbol of analysisIntent.symbols) {
      try {
        marketData[symbol] = await this.broker.getMarketData(symbol);
      } catch (error) {
        console.log(chalk.yellow(`Note: Could not fetch market data for ${symbol}`));
      }
    }
    
    // Perform analysis
    const analysis = await this.advancedTrading.performMarketAnalysis(analysisIntent, marketData);
    
    console.log('\n' + chalk.white(`Analysis for ${analysis.symbol}:`));
    
    console.log(`\n${chalk.yellow('Sentiment:')} ${analysis.sentiment.toUpperCase()}`);
    console.log(`${chalk.white('Confidence:')} ${analysis.confidence}%`);
    console.log(`${chalk.white('Price Target:')} $${analysis.priceTarget.toFixed(2)}`);
    
    if (analysis.riskFactors.length > 0) {
      console.log('\n' + chalk.red('Risk Factors:'));
      analysis.riskFactors.forEach((risk: string) => console.log(`• ${risk}`));
    }
    
    if (analysis.opportunities.length > 0) {
      console.log('\n' + chalk.green('Opportunities:'));
      analysis.opportunities.forEach((opp: string) => console.log(`• ${opp}`));
    }
    
    console.log('\n' + chalk.white('Recommendation:'));
    console.log(`${analysis.recommendation.toUpperCase()}`);
    
    console.log('\n' + chalk.white('Reasoning:'));
    console.log(analysis.reasoning);
    
    console.log('\n' + chalk.gray('Note: This analysis is based on available data and AI interpretation. Always do your own research.'));
  }

  private async handleRecommendationIntent(intent: any): Promise<void> {
    console.log(chalk.cyan('Generating trade recommendations...'));
    
    const recommendationIntent = intent;
    
    if (!this.context.accountInfo) {
      console.log(chalk.yellow('I need your account information to provide personalized recommendations.'));
      await this.handleAccountIntent();
    }
    
    const recommendations = await this.advancedTrading.generateTradeRecommendations(
      recommendationIntent,
      this.context.accountInfo!
    );
    
    console.log('\n' + chalk.white('Trade Recommendations:'));
    console.log(`\nScenario: ${recommendationIntent.scenario}`);
    
    if (recommendations.recommendations) {
      console.log('\n' + chalk.yellow('Recommended Trades:'));
      recommendations.recommendations.forEach((rec: any) => {
        console.log(`\n• ${rec.action.toUpperCase()} ${rec.symbol}`);
        console.log(`  Amount: ${rec.allocation}`);
        console.log(`  Rationale: ${rec.rationale}`);
        if (rec.targetPrice) {
          console.log(`  Target price: $${rec.targetPrice}`);
        }
        if (rec.stopLoss) {
          console.log(`  Stop loss: $${rec.stopLoss}`);
        }
      });
    }
    
    if (recommendations.strategy) {
      console.log('\n' + chalk.white('Overall Strategy:'));
      console.log(recommendations.strategy);
    }
    
    if (recommendations.risks) {
      console.log('\n' + chalk.red('Key Risks:'));
      recommendations.risks.forEach((risk: string) => console.log(`• ${risk}`));
    }
    
    console.log('\n' + chalk.gray('Note: These are AI-generated recommendations. Always do your own due diligence.'));
  }

} 