import inquirer from 'inquirer';
import chalk from 'chalk';
import { UnifiedTradeProcessor } from '../llm/unified-trade-processor';
import { AdvancedTradingService } from '../llm/trading';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';
import { ValidationService } from '../trading/validation-service';
import { ThirteenFService } from '../services/thirteenf-service';
import { ConsoleLogger } from '../infrastructure/logging/ConsoleLogger';
import { TradeIntent, UnifiedTradeIntent, OptionsTradeIntent, AccountInfo, TradeResult, AdvancedTradeIntent } from '../types';

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
  private thirteenFService: ThirteenFService;
  private logger: ConsoleLogger;
  private context: ChatContext;

  constructor() {
    this.tradeProcessor = new UnifiedTradeProcessor();
    this.advancedTrading = new AdvancedTradingService();
    this.broker = new AlpacaAdapter();
    this.validator = new ValidationService(this.broker);
    this.logger = new ConsoleLogger();
    this.thirteenFService = new ThirteenFService(this.logger, this.broker);
    
    this.context = {
      conversationHistory: []
    };
  }

  // Type guard functions
  private isOptionsIntent(intent: UnifiedTradeIntent): intent is OptionsTradeIntent {
    return 'underlying' in intent && 'contractType' in intent;
  }

  private isStockIntent(intent: UnifiedTradeIntent): intent is TradeIntent {
    return 'symbol' in intent && 'amountType' in intent;
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
      const { message } = await inquirer.prompt({
        type: 'input',
        name: 'message',
        message: chalk.cyan('You:'),
        transformer: (input: string) => chalk.white(input)
      });

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
      } else if (simpleIntent.type === '13f' && simpleIntent.institution) {
        await this.handle13FIntent(simpleIntent.institution, simpleIntent.amount);
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

  private async determineSimpleIntent(message: string): Promise<{ type: string; symbol?: string; institution?: string; amount?: number }> {
    const lowerMessage = message.toLowerCase();
    
    // Check for 13F filing requests
    if (lowerMessage.includes('13f') || 
        (lowerMessage.includes('bridgewater') && (lowerMessage.includes('filing') || lowerMessage.includes('portfolio') || lowerMessage.includes('holdings'))) ||
        (lowerMessage.includes('berkshire') && (lowerMessage.includes('filing') || lowerMessage.includes('portfolio') || lowerMessage.includes('holdings'))) ||
        (lowerMessage.includes('show me') && (lowerMessage.includes('bridgewater') || lowerMessage.includes('berkshire') || lowerMessage.includes('13f')))) {
      
      // Extract institution name
      let institution = '';
      if (lowerMessage.includes('bridgewater')) {
        institution = 'Bridgewater Associates';
      } else if (lowerMessage.includes('berkshire')) {
        institution = 'Berkshire Hathaway';
      } else {
        // Try to extract institution from the message
        const institutionPatterns = [
          /(?:show me|get|fetch)\s+([^'s\n]+?)(?:'s)?\s+(?:13f|filing|portfolio)/i,
          /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:13f|filing)/i
        ];
        
        for (const pattern of institutionPatterns) {
          const match = message.match(pattern);
          if (match?.[1]) {
            institution = match[1].trim();
            break;
          }
        }
      }
      
      // Extract investment amount if specified
      let amount = undefined;
      const amountMatch = message.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
      if (amountMatch) {
        amount = parseFloat(amountMatch[1].replace(/,/g, ''));
      }
      
      return { type: '13f', institution, amount };
    }
    
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
      if (this.isStockIntent(intent)) {
        console.log(`\nI understand you want to ${intent.action} ${intent.amountType === 'dollars' ? '$' + intent.amount : intent.amount + ' shares'} of ${intent.symbol}.`);
      } else if (this.isOptionsIntent(intent)) {
        console.log(`\nI understand you want to ${intent.action} ${intent.quantity} contract(s) of ${intent.underlying} ${intent.contractType} strike ${intent.strikePrice} expiring ${intent.expirationDate}.`);
      }
      
      // Validate the trade
      let validation;
      try {
        if (this.isStockIntent(intent)) {
          validation = await this.validator.validateTrade(intent);
        } else {
          // For now, skip validation for options until we update the validator
          validation = { 
            isValid: true, 
            estimatedCost: intent.quantity * 100, 
            marginRequired: 0, 
            potentialReturn: 0,
            errors: [],
            warnings: []
          };
        }
      } catch (error) {
        // Handle validation errors (like market data failures when market is closed)
        console.log('\n' + chalk.yellow('Note: I cannot fetch current market data (market may be closed).'));
        console.log('Would you like to proceed with the order anyway? It will be queued for the next market open.');
        
        // Validate trading hours for orders  
        if (this.isStockIntent(intent)) {
          validation = {
            isValid: true,
            errors: [],
            warnings: ['Market is closed. Order will be queued for next market open.'],
            estimatedCost: intent.amountType === 'dollars' ? intent.amount : 0,
            accountBalance: this.context.accountInfo?.buyingPower || 0
          };
        } else {
          validation = {
            isValid: true,
            errors: [],
            warnings: ['Market is closed. Order will be queued for next market open.'],
            estimatedCost: intent.quantity * 100, // Options cost estimate
            accountBalance: this.context.accountInfo?.buyingPower || 0
          };
        }
      }
      
      if (!validation.isValid) {
        console.log('\n' + chalk.red('I cannot execute this trade because:'));
        validation.errors?.forEach(error => console.log(chalk.red(`• ${error}`)));
        return;
      }
      
      if (validation.warnings && validation.warnings.length > 0) {
        console.log('\n' + chalk.yellow('Please note:'));
        validation.warnings.forEach(warning => console.log(chalk.yellow(`• ${warning}`)));
      }
      
      // Show trade details
      console.log('\n' + chalk.white('Trade Summary:'));
      console.log(`• Action: ${intent.action.toUpperCase()}`);
      
      if (this.isStockIntent(intent)) {
        console.log(`• Symbol: ${intent.symbol}`);
        console.log(`• Amount: ${intent.amountType === 'dollars' ? '$' + intent.amount : intent.amount + ' shares'}`);
      } else if (this.isOptionsIntent(intent)) {
        console.log(`• Underlying: ${intent.underlying}`);
        console.log(`• Contract: ${intent.contractType.toUpperCase()} ${intent.strikePrice} ${intent.expirationDate}`);
        console.log(`• Quantity: ${intent.quantity} contract(s)`);
      }
      
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
          let result;
          if (this.isStockIntent(intent)) {
            result = await this.broker.executeOrder(intent);
          } else if (this.isOptionsIntent(intent)) {
            result = await this.broker.executeOptionsOrder(intent);
          } else {
            throw new Error('Unknown trade intent type');
          }
          this.context.lastTrade = result;
          
          if (result.success) {
            console.log(chalk.green('\n✅ Trade executed successfully!'));
            console.log(`Order ID: ${result.orderId}`);
            if ('executedPrice' in result && result.executedPrice) {
              console.log(`Executed at: $${result.executedPrice.toFixed(2)}`);
            }
          } else {
            console.log(chalk.red('\n❌ Trade execution failed'));
            console.log(`Reason: ${result.error || 'Unknown error'}`);
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

  private async handleTradeExecution(intent: UnifiedTradeIntent): Promise<void> {
    // Show what we understood
    if (this.isStockIntent(intent)) {
      console.log(`\nI understand you want to ${intent.action} ${intent.amountType === 'dollars' ? '$' + intent.amount : intent.amount + ' shares'} of ${intent.symbol}.`);
    } else if (this.isOptionsIntent(intent)) {
      console.log(`\nI understand you want to ${intent.action} ${intent.quantity} contract(s) of ${intent.underlying} ${intent.contractType} strike ${intent.strikePrice} expiring ${intent.expirationDate}.`);
    }
    
    // Validate the trade
    let validation;
    try {
      if (this.isStockIntent(intent)) {
        validation = await this.validator.validateTrade(intent);
      } else {
        // For now, skip validation for options until we update the validator
        validation = { 
          isValid: true, 
          estimatedCost: intent.quantity * 100, 
          marginRequired: 0, 
          potentialReturn: 0,
          errors: [],
          warnings: []
        };
      }
    } catch (error) {
      // Handle validation errors (like market data failures when market is closed)
      console.log('\n' + chalk.yellow('Note: I cannot fetch current market data (market may be closed).'));
      console.log('Would you like to proceed with the order anyway? It will be queued for the next market open.');
      
      // Validate trading hours for orders
      if (this.isStockIntent(intent)) {
        validation = {
          isValid: true,
          errors: [],
          warnings: ['Market is closed. Order will be queued for next market open.'],
          estimatedCost: intent.amountType === 'dollars' ? intent.amount : 0,
          accountBalance: this.context.accountInfo?.buyingPower || 0
        };
      } else {
        validation = {
          isValid: true,
          errors: [],
          warnings: ['Market is closed. Order will be queued for next market open.'],
          estimatedCost: intent.quantity * 100,
          accountBalance: this.context.accountInfo?.buyingPower || 0
        };
      }
    }
    
    if (!validation.isValid) {
      console.log('\n' + chalk.red('I cannot execute this trade because:'));
      validation.errors?.forEach(error => console.log(chalk.red(`• ${error}`)));
      return;
    }
    
    if (validation.warnings && validation.warnings.length > 0) {
      console.log('\n' + chalk.yellow('Please note:'));
      validation.warnings.forEach(warning => console.log(chalk.yellow(`• ${warning}`)));
    }
    
    // Show trade details
    console.log('\n' + chalk.white('Trade Summary:'));
    console.log(`• Action: ${intent.action.toUpperCase()}`);
    
    if (this.isStockIntent(intent)) {
      console.log(`• Symbol: ${intent.symbol}`);
      console.log(`• Amount: ${intent.amountType === 'dollars' ? '$' + intent.amount : intent.amount + ' shares'}`);
    } else if (this.isOptionsIntent(intent)) {
      console.log(`• Underlying: ${intent.underlying}`);
      console.log(`• Contract: ${intent.contractType.toUpperCase()} ${intent.strikePrice} ${intent.expirationDate}`);
      console.log(`• Quantity: ${intent.quantity} contract(s)`);
    }
    
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
        let result;
        if (this.isStockIntent(intent)) {
          result = await this.broker.executeOrder(intent);
        } else if (this.isOptionsIntent(intent)) {
          result = await this.broker.executeOptionsOrder(intent);
        } else {
          throw new Error('Unknown trade intent type');
        }
        this.context.lastTrade = result;
        
        if (result.success) {
          console.log(chalk.green('\n✅ Trade executed successfully!'));
          console.log(`Order ID: ${result.orderId}`);
          if ('executedPrice' in result && result.executedPrice) {
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

  /**
   * Handle 13F filing requests - fetch institutional holdings and create investable basket
   */
  private async handle13FIntent(institution: string, amount?: number): Promise<void> {
    try {
      console.log(chalk.cyan(`📊 Fetching ${institution}'s latest 13F filing...`));
      console.log(chalk.gray('This may take a moment as I search for the most recent data.\n'));

      // Get investment amount if not provided
      let investmentAmount = amount;
      if (!investmentAmount) {
        const response = await inquirer.prompt({
          type: 'input',
          name: 'amount',
          message: 'How much would you like to invest in this basket?',
          default: '10000',
          validate: (input) => {
            const num = parseFloat(input.replace(/[,$]/g, ''));
            if (isNaN(num) || num <= 0) {
              return 'Please enter a valid positive number';
            }
            if (num < 100) {
              return 'Minimum investment amount is $100';
            }
            return true;
          }
        });
        investmentAmount = parseFloat(response.amount.replace(/[,$]/g, ''));
      }

      // Process the 13F request
      const basket = await this.thirteenFService.process13FRequest(institution, investmentAmount, {
        maxPositions: 25,
        minWeight: 0.5,
        rebalanceThreshold: 5.0
      });

      console.log(chalk.green('✅ Successfully created 13F basket!\n'));
      
      // Display basket summary
      console.log(chalk.bold(`${basket.name}`));
      console.log(chalk.gray(`Institution: ${basket.institution}`));
      console.log(chalk.gray(`Total Value: ${this.formatCurrency(basket.totalValue)}`));
      console.log(chalk.gray(`Positions: ${basket.allocations.length}`));
      console.log(chalk.gray(`Basket ID: ${basket.id}\n`));

      // Show top allocations
      console.log(chalk.bold('Top Holdings:'));
      const topHoldings = basket.allocations.slice(0, 10);
      
      topHoldings.forEach((allocation: any, index: number) => {
        const weight = (allocation.targetWeight * 100).toFixed(1);
        const value = this.formatCurrency(allocation.targetValue);
        console.log(`${index + 1}. ${chalk.bold(allocation.symbol)} - ${allocation.companyName}`);
        console.log(`   Weight: ${weight}% | Value: ${value}\n`);
      });

      if (basket.allocations.length > 10) {
        console.log(chalk.gray(`... and ${basket.allocations.length - 10} more positions\n`));
      }

      // Ask if user wants to execute the basket
      const { shouldExecute } = await inquirer.prompt({
        type: 'confirm',
        name: 'shouldExecute',
        message: 'Would you like to execute trades for this basket now?',
        default: false
      });

      if (shouldExecute) {
        console.log(chalk.yellow('\n🔄 Executing basket trades...'));
        console.log(chalk.gray('This will place market orders for all positions.\n'));

        try {
          await this.thirteenFService.executeBasket(basket.id);
          console.log(chalk.green('✅ Basket execution completed!'));
          console.log(chalk.gray('Check your portfolio to see the executed positions.'));
        } catch (error) {
          console.log(chalk.red('❌ Some trades failed to execute.'));
          console.log(chalk.gray('The basket has been saved and you can retry execution later.'));
          if (error instanceof Error) {
            console.log(chalk.gray(`Error: ${error.message}`));
          }
        }
      } else {
        console.log(chalk.blue('\n📝 Basket saved for later execution.'));
        console.log(chalk.gray('You can execute it later from the Portfolio Baskets tab.'));
      }

      // Add context to conversation
      this.context.conversationHistory.push({
        role: 'assistant',
        content: `Created 13F basket for ${institution} with ${basket.allocations.length} positions totaling ${this.formatCurrency(basket.totalValue)}`
      });

    } catch (error) {
      console.log(chalk.red('❌ Failed to process 13F request.'));
      
      if (error instanceof Error) {
        if (error.message.includes('API key')) {
          console.log(chalk.yellow('\n💡 To use 13F functionality, you need a Perplexity API key.'));
          console.log(chalk.gray('Add PERPLEXITY_API_KEY to your .env file.'));
          console.log(chalk.gray('Get one at: https://docs.perplexity.ai/'));
        } else if (error.message.includes('13F data')) {
          console.log(chalk.yellow(`\n💡 Could not find recent 13F data for "${institution}".`));
          console.log(chalk.gray('Try a different institution name or check if they file 13F forms.'));
          console.log(chalk.gray('Examples: "Bridgewater Associates", "Berkshire Hathaway", "Renaissance Technologies"'));
        } else {
          console.log(chalk.gray(`Error: ${error.message}`));
        }
      }
    }
  }

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

} 