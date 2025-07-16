import chalk from 'chalk';
import Table from 'cli-table3';
import inquirer from 'inquirer';
import { ThirteenFService, ThirteenFPortfolio, ThirteenFHolding } from '../../services/13f-service';
import { BasketStorageService, PortfolioBasket } from '../../storage/basket-storage';
import { AlpacaAdapter } from '../../brokers/alpaca-adapter';
import { ValidationService } from '../../trading/validation-service';
import { PerplexityClient } from '../../services/perplexity-client';
import { CacheManager } from '../../services/cache-manager';
import { formatCurrency, formatPercentage, formatLargeNumber } from '../utils/formatters';

export interface BasketInvestment {
  basketId: string;
  investmentAmount: number;
  allocations: Array<{
    symbol: string;
    targetShares: number;
    targetValue: number;
    actualShares?: number;
    actualValue?: number;
    orderId?: string;
    status: 'pending' | 'filled' | 'failed';
  }>;
  totalInvested: number;
  executionStatus: 'pending' | 'partial' | 'completed' | 'failed';
}

export class BasketManager {
  private thirteenFService: ThirteenFService;
  private basketStorage: BasketStorageService;
  private broker: AlpacaAdapter;
  private validator: ValidationService;
  private perplexityClient: PerplexityClient;
  private cacheManager: CacheManager;

  constructor() {
    this.basketStorage = new BasketStorageService();
    this.perplexityClient = new PerplexityClient();
    this.cacheManager = new CacheManager();
    this.thirteenFService = new ThirteenFService(
      this.basketStorage,
      this.perplexityClient,
      this.cacheManager
    );
    this.broker = new AlpacaAdapter();
    this.validator = new ValidationService(this.broker);
  }

  /**
   * Display all portfolio baskets
   */
  async showBaskets(): Promise<void> {
    try {
      console.log(chalk.blue('\n🧺 Portfolio Baskets'));
      console.log(chalk.gray('═'.repeat(50)));

             const baskets = await this.basketStorage.getBaskets();

       if (baskets.length === 0) {
         console.log(chalk.gray('\nNo baskets created yet.'));
         console.log(chalk.white('Create a basket from a 13F filing: ') + chalk.cyan('nltrade baskets create'));
         return;
       }

       const basketsTable = new Table({
         head: ['ID', 'Name', 'Institution', 'Holdings', 'Total Value', 'Status', 'Created'],
         style: { head: ['cyan'] }
       });

       baskets.forEach((basket: PortfolioBasket) => {
         const statusColor = this.getStatusColor(basket.status || 'pending');
         const createdDate = new Date(basket.createdAt).toLocaleDateString();
         
         basketsTable.push([
           basket.id.slice(0, 8),
           basket.name,
           basket.metadata?.institution || 'N/A',
           basket.allocations.length.toString(),
           formatCurrency(basket.totalValue),
           this.getStatusDisplay(basket.status || 'pending'),
           createdDate
         ]);
       });

      console.log(basketsTable.toString());

      // Show basket composition summary
      if (baskets.length > 0) {
        console.log(chalk.white('\n📊 Quick Actions:'));
        console.log(chalk.gray('• View details: ') + chalk.cyan('nltrade baskets view <id>'));
        console.log(chalk.gray('• Invest in basket: ') + chalk.cyan('nltrade baskets invest <id>'));
        console.log(chalk.gray('• Delete basket: ') + chalk.cyan('nltrade baskets delete <id>'));
      }

    } catch (error) {
      console.log(chalk.red('\n❌ Could not fetch baskets'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Display detailed view of a specific basket
   */
  async viewBasket(basketId: string): Promise<void> {
    try {
      console.log(chalk.blue(`\n🔍 Basket Details - ${basketId}`));
      console.log(chalk.gray('═'.repeat(50)));

      const basket = await this.basketStorage.getBasket(basketId);
      if (!basket) {
        console.log(chalk.red(`Basket ${basketId} not found`));
        return;
      }

      // Display basket metadata
      this.displayBasketMetadata(basket);

      // Display holdings
      this.displayBasketHoldings(basket);

      // Display performance if available
      await this.displayBasketPerformance(basket);

    } catch (error) {
      console.log(chalk.red(`\n❌ Could not view basket ${basketId}`));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Create a new basket from 13F filing
   */
  async createBasketFrom13F(): Promise<void> {
    try {
      console.log(chalk.blue('\n🏗️  Create Portfolio Basket from 13F Filing'));
      console.log(chalk.gray('═'.repeat(50)));

      // Get institution name
      const { institution } = await inquirer.prompt([
        {
          type: 'input',
          name: 'institution',
          message: 'Enter institution name (e.g., "Berkshire Hathaway"):',
          validate: (input: string) => input.trim().length > 0 || 'Institution name is required'
        }
      ]);

      console.log(chalk.gray('\n🔍 Fetching 13F data...'));

      // Fetch 13F portfolio
      const portfolio = await this.thirteenFService.getPortfolio(institution, {
        includeAnalytics: true,
        maxHoldings: 50
      });

      console.log(chalk.green(`✅ Found ${portfolio.holdings.length} holdings for ${portfolio.institution}`));
      console.log(`Total portfolio value: ${formatCurrency(portfolio.totalValue)}`);
      console.log(`Filing date: ${new Date(portfolio.filingDate).toLocaleDateString()}`);

      // Get basket configuration
      const config = await this.getBasketConfiguration(portfolio);

      // Create the basket
      const basket = await this.createBasketFromPortfolio(portfolio, config);

      console.log(chalk.green(`\n✅ Created basket: ${basket.name}`));
      console.log(`Basket ID: ${chalk.cyan(basket.id)}`);
      console.log(`Holdings: ${basket.allocations.length}`);
      console.log(`Total value: ${formatCurrency(basket.totalValue)}`);

      // Ask if user wants to invest now
      const { investNow } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'investNow',
          message: 'Would you like to invest in this basket now?',
          default: false
        }
      ]);

      if (investNow) {
        await this.investInBasket(basket.id);
      }

    } catch (error) {
      console.log(chalk.red('\n❌ Could not create basket from 13F filing'));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Invest in a basket
   */
  async investInBasket(basketId: string, amount?: number): Promise<void> {
    try {
      console.log(chalk.blue(`\n💰 Invest in Basket - ${basketId}`));
      console.log(chalk.gray('═'.repeat(50)));

      const basket = await this.basketStorage.getBasket(basketId);
      if (!basket) {
        console.log(chalk.red(`Basket ${basketId} not found`));
        return;
      }

      console.log(chalk.white(`Basket: ${basket.name}`));
      console.log(`Institution: ${basket.metadata?.institution || 'N/A'}`);
      console.log(`Holdings: ${basket.allocations.length}`);

             // Get investment amount if not provided
       let investmentAmount = amount;
       if (!investmentAmount) {
         const { amount: inputAmount } = await inquirer.prompt([
           {
             type: 'number',
             name: 'amount',
             message: 'How much would you like to invest?',
             validate: (input: number) => input > 0 || 'Investment amount must be greater than 0'
           }
         ]);
         investmentAmount = inputAmount;
       }

       if (!investmentAmount || investmentAmount <= 0) {
         console.log(chalk.red('Invalid investment amount'));
         return;
       }

       console.log(chalk.gray('\n⚖️  Calculating allocations...'));

       // Calculate allocations
       const investment = await this.calculateInvestmentAllocations(basket, investmentAmount);

      // Display investment preview
      this.displayInvestmentPreview(investment);

      // Confirm investment
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Invest ${formatCurrency(investmentAmount)} in ${basket.name}?`,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Investment cancelled'));
        return;
      }

      // Execute investment
      console.log(chalk.gray('\n🔄 Executing trades...'));
      await this.executeBasketInvestment(investment);

    } catch (error) {
      console.log(chalk.red(`\n❌ Could not invest in basket ${basketId}`));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Delete a basket
   */
  async deleteBasket(basketId: string): Promise<void> {
    try {
      const basket = await this.basketStorage.getBasket(basketId);
      if (!basket) {
        console.log(chalk.red(`Basket ${basketId} not found`));
        return;
      }

      console.log(chalk.yellow(`\n⚠️  Delete Basket: ${basket.name}`));
      console.log(`This will permanently delete the basket and all its data.`);

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: 'Are you sure you want to delete this basket?',
          default: false
        }
      ]);

      if (confirm) {
        await this.basketStorage.deleteBasket(basketId);
        console.log(chalk.green(`✅ Deleted basket: ${basket.name}`));
      } else {
        console.log(chalk.gray('Deletion cancelled'));
      }

    } catch (error) {
      console.log(chalk.red(`\n❌ Could not delete basket ${basketId}`));
      if (error instanceof Error) {
        console.log(chalk.gray(`Error: ${error.message}`));
      }
    }
  }

  /**
   * Search for popular 13F institutions
   */
  async searchInstitutions(): Promise<void> {
    console.log(chalk.blue('\n🔍 Popular 13F Institutions'));
    console.log(chalk.gray('═'.repeat(50)));

    const popularInstitutions = [
      { name: 'Berkshire Hathaway', symbol: 'BRK', focus: 'Value Investing' },
      { name: 'Ark Investment Management', symbol: 'ARKK', focus: 'Disruptive Innovation' },
      { name: 'Vanguard Group', symbol: 'VTI', focus: 'Passive Index Funds' },
      { name: 'BlackRock', symbol: 'BLK', focus: 'Diversified Holdings' },
      { name: 'Bridgewater Associates', symbol: 'N/A', focus: 'Hedge Fund' },
      { name: 'Renaissance Technologies', symbol: 'N/A', focus: 'Quantitative' },
      { name: 'Citadel LLC', symbol: 'N/A', focus: 'Multi-Strategy' },
      { name: 'Two Sigma', symbol: 'N/A', focus: 'Data Science' },
      { name: 'D.E. Shaw', symbol: 'N/A', focus: 'Quantitative' },
      { name: 'Tiger Global Management', symbol: 'N/A', focus: 'Tech Growth' }
    ];

    const institutionsTable = new Table({
      head: ['Institution', 'Focus', 'Create Basket'],
      style: { head: ['cyan'] }
    });

    popularInstitutions.forEach(inst => {
      institutionsTable.push([
        inst.name,
        inst.focus,
        chalk.cyan(`nltrade baskets create "${inst.name}"`)
      ]);
    });

    console.log(institutionsTable.toString());

    console.log(chalk.white('\n💡 Tips:'));
    console.log('• Use exact institution names for best results');
    console.log('• Most 13F data is from the previous quarter');
    console.log('• Minimum investment amount recommended: $1,000');
  }

  /**
   * Display basket metadata
   */
  private displayBasketMetadata(basket: PortfolioBasket): void {
    console.log(chalk.white('\n📄 Basket Information:'));
    
    const metaTable = new Table({
      head: ['Property', 'Value'],
      style: { head: ['cyan'] }
    });

    metaTable.push(['Name', basket.name]);
    metaTable.push(['ID', basket.id]);
    metaTable.push(['Institution', basket.metadata?.institution || 'N/A']);
    metaTable.push(['Created', new Date(basket.createdAt).toLocaleString()]);
    metaTable.push(['Holdings', basket.allocations.length.toString()]);
    metaTable.push(['Total Value', formatCurrency(basket.totalValue)]);
    metaTable.push(['Status', this.getStatusDisplay(basket.status || 'pending')]);

    if (basket.metadata?.filingDate) {
      metaTable.push(['Filing Date', new Date(basket.metadata.filingDate).toLocaleDateString()]);
    }

    console.log(metaTable.toString());
  }

  /**
   * Display basket holdings
   */
  private displayBasketHoldings(basket: PortfolioBasket): void {
    console.log(chalk.white('\n📊 Holdings:'));

    const holdingsTable = new Table({
      head: ['Symbol', 'Company', 'Target Weight', 'Target Value', 'Shares'],
      style: { head: ['cyan'] }
    });

    // Sort by target value descending
    const sortedHoldings = [...basket.allocations].sort((a, b) => b.targetValue - a.targetValue);

    sortedHoldings.slice(0, 15).forEach(holding => { // Show top 15
      holdingsTable.push([
        chalk.bold(holding.symbol),
        holding.companyName || 'N/A',
        formatPercentage(holding.targetWeight),
        formatCurrency(holding.targetValue),
                 (holding as any).targetShares?.toLocaleString() || 'N/A'
      ]);
    });

    console.log(holdingsTable.toString());

    if (sortedHoldings.length > 15) {
      console.log(chalk.gray(`... and ${sortedHoldings.length - 15} more holdings`));
    }
  }

  /**
   * Display basket performance
   */
  private async displayBasketPerformance(basket: PortfolioBasket): Promise<void> {
    console.log(chalk.white('\n📈 Performance:'));
    
    try {
      // Calculate current market values for holdings
      let totalCurrentValue = 0;
      let totalCostBasis = basket.totalValue;
      let successfulLookups = 0;

             for (const holding of basket.allocations.slice(0, 10)) { // Check top 10 for performance
         try {
           const marketData = await this.broker.getMarketData(holding.symbol);
           const shares = (holding as any).targetShares || holding.actualShares || 0;
           const currentValue = shares * marketData.currentPrice;
           totalCurrentValue += currentValue;
           successfulLookups++;
         } catch (error) {
           // Skip holdings with market data errors
         }
       }

      if (successfulLookups > 0) {
        const estimatedTotalValue = totalCurrentValue * (basket.allocations.length / successfulLookups);
        const performancePercent = ((estimatedTotalValue - totalCostBasis) / totalCostBasis) * 100;
        const performanceColor = performancePercent >= 0 ? 'green' : 'red';
        const performanceSign = performancePercent >= 0 ? '+' : '';

        console.log(`Estimated Value: ${formatCurrency(estimatedTotalValue)}`);
        console.log(`Performance: ${chalk[performanceColor](performanceSign + formatPercentage(performancePercent))}`);
        console.log(chalk.gray(`(Based on ${successfulLookups} holdings with current market data)`));
      } else {
        console.log(chalk.gray('Performance data unavailable (market closed or data access limited)'));
      }

    } catch (error) {
      console.log(chalk.gray('Performance calculation unavailable'));
    }
  }

  /**
   * Get basket configuration from user
   */
  private async getBasketConfiguration(portfolio: ThirteenFPortfolio): Promise<{
    basketName: string;
    maxHoldings: number;
    minWeight: number;
    excludeSectors: string[];
  }> {
    const config = await inquirer.prompt([
      {
        type: 'input',
        name: 'basketName',
        message: 'Enter basket name:',
        default: `${portfolio.institution} Portfolio`,
        validate: (input: string) => input.trim().length > 0 || 'Basket name is required'
      },
      {
        type: 'number',
        name: 'maxHoldings',
        message: 'Maximum number of holdings:',
        default: Math.min(portfolio.holdings.length, 25),
        validate: (input: number) => input > 0 && input <= 100 || 'Must be between 1 and 100'
      },
      {
        type: 'number',
        name: 'minWeight',
        message: 'Minimum position weight (%):', 
        default: 0.5,
        validate: (input: number) => input >= 0 && input <= 10 || 'Must be between 0 and 10'
      },
      {
        type: 'checkbox',
        name: 'excludeSectors',
        message: 'Exclude sectors (optional):',
        choices: [
          'Technology',
          'Healthcare', 
          'Financial Services',
          'Consumer Discretionary',
          'Communication Services',
          'Energy',
          'Utilities'
        ]
      }
    ]);

    return config;
  }

  /**
   * Create basket from 13F portfolio
   */
  private async createBasketFromPortfolio(
    portfolio: ThirteenFPortfolio, 
    config: { basketName: string; maxHoldings: number; minWeight: number; excludeSectors: string[] }
  ): Promise<PortfolioBasket> {
    // Filter and sort holdings
    let filteredHoldings = portfolio.holdings
      .filter(holding => holding.percentOfPortfolio >= config.minWeight)
      .filter(holding => !config.excludeSectors.includes(holding.sector || ''))
      .sort((a, b) => b.percentOfPortfolio - a.percentOfPortfolio)
      .slice(0, config.maxHoldings);

    // Calculate total value for selected holdings
    const totalSelectedValue = filteredHoldings.reduce((sum, h) => sum + h.marketValue, 0);

         // Create allocations
     const allocations = filteredHoldings.map(holding => ({
       symbol: holding.symbol,
       companyName: holding.companyName,
       targetWeight: (holding.marketValue / totalSelectedValue) * 100,
       targetValue: holding.marketValue,
       targetShares: holding.shares
     }));

     const basket: PortfolioBasket = {
       id: this.generateBasketId(),
       name: config.basketName,
       description: `13F-based portfolio from ${portfolio.institution}`,
       institution: portfolio.institution,
       createdAt: new Date(),
       totalValue: totalSelectedValue,
       allocations,
       metadata: {
         source: '13f',
         institution: portfolio.institution,
         filingDate: portfolio.filingDate,
         totalPositions: portfolio.holdings.length,
         rebalanceThreshold: 5
       },
       status: 'pending'
     };

     await this.basketStorage.saveBasket(basket);
     return basket;
  }

  /**
   * Calculate investment allocations
   */
  private async calculateInvestmentAllocations(basket: PortfolioBasket, amount: number): Promise<BasketInvestment> {
    const allocations = basket.allocations.map(allocation => {
      const targetValue = (allocation.targetWeight / 100) * amount;
             const targetShares = Math.floor(targetValue / (allocation.targetValue / ((allocation as any).targetShares || 1)));
      
      return {
        symbol: allocation.symbol,
        targetShares,
        targetValue,
        status: 'pending' as const
      };
    });

    return {
      basketId: basket.id,
      investmentAmount: amount,
      allocations,
      totalInvested: 0,
      executionStatus: 'pending'
    };
  }

  /**
   * Display investment preview
   */
  private displayInvestmentPreview(investment: BasketInvestment): void {
    console.log(chalk.white('\n📋 Investment Preview:'));
    
    const previewTable = new Table({
      head: ['Symbol', 'Shares', 'Est. Value', 'Weight'],
      style: { head: ['cyan'] }
    });

    investment.allocations.slice(0, 10).forEach(allocation => {
      const weight = (allocation.targetValue / investment.investmentAmount) * 100;
      previewTable.push([
        chalk.bold(allocation.symbol),
        allocation.targetShares.toLocaleString(),
        formatCurrency(allocation.targetValue),
        formatPercentage(weight)
      ]);
    });

    console.log(previewTable.toString());

    if (investment.allocations.length > 10) {
      console.log(chalk.gray(`... and ${investment.allocations.length - 10} more positions`));
    }

    console.log(chalk.white(`\nTotal Investment: ${formatCurrency(investment.investmentAmount)}`));
    console.log(chalk.white(`Number of Positions: ${investment.allocations.length}`));
  }

  /**
   * Execute basket investment
   */
  private async executeBasketInvestment(investment: BasketInvestment): Promise<void> {
    let successfulTrades = 0;
    let totalInvested = 0;

    for (const allocation of investment.allocations) {
      try {
        console.log(`Executing: ${allocation.symbol} (${allocation.targetShares} shares)`);
        
        // Create trade intent
        const tradeIntent = {
          action: 'buy' as const,
          symbol: allocation.symbol,
          amountType: 'shares' as const,
          amount: allocation.targetShares,
          orderType: 'market' as const
        };

        // Validate trade
        const validation = await this.validator.validateTrade(tradeIntent);
        
        if (validation.isValid) {
          // Execute trade
          const result = await this.broker.executeOrder(tradeIntent);
          
                     if (result.success) {
             if (result.executedShares !== undefined) allocation.actualShares = result.executedShares;
             if (result.executedValue !== undefined) allocation.actualValue = result.executedValue;
             if (result.orderId !== undefined) allocation.orderId = result.orderId;
            allocation.status = 'filled';
            successfulTrades++;
            totalInvested += result.executedValue || 0;
            
            console.log(chalk.green(`✅ ${allocation.symbol}: ${result.executedShares} shares at ${formatCurrency(result.executedPrice || 0)}`));
          } else {
            allocation.status = 'failed';
            console.log(chalk.red(`❌ ${allocation.symbol}: ${result.error || result.message}`));
          }
        } else {
          allocation.status = 'failed';
          console.log(chalk.red(`❌ ${allocation.symbol}: Validation failed`));
        }

      } catch (error) {
        allocation.status = 'failed';
        console.log(chalk.red(`❌ ${allocation.symbol}: ${error}`));
      }

      // Brief pause between trades
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update investment status
    investment.totalInvested = totalInvested;
    investment.executionStatus = successfulTrades === investment.allocations.length ? 'completed' :
                                successfulTrades > 0 ? 'partial' : 'failed';

    // Display summary
    console.log(chalk.white('\n📊 Investment Summary:'));
    console.log(`Successful trades: ${chalk.green(successfulTrades.toString())}/${investment.allocations.length}`);
    console.log(`Total invested: ${formatCurrency(totalInvested)}`);
    console.log(`Execution status: ${this.getStatusDisplay(investment.executionStatus)}`);
  }

  /**
   * Get status color for display
   */
  private getStatusColor(status: string): keyof typeof chalk {
    switch (status) {
      case 'completed':
      case 'executed':
      case 'filled':
        return 'green';
      case 'partial':
        return 'yellow';
      case 'pending':
        return 'blue';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  }

  /**
   * Get status display with color
   */
     private getStatusDisplay(status: string): string {
     const color = this.getStatusColor(status);
     switch (color) {
       case 'green': return chalk.green(status.toUpperCase());
       case 'yellow': return chalk.yellow(status.toUpperCase());
       case 'blue': return chalk.blue(status.toUpperCase());
       case 'red': return chalk.red(status.toUpperCase());
       default: return chalk.gray(status.toUpperCase());
     }
   }

  /**
   * Generate unique basket ID
   */
  private generateBasketId(): string {
    return 'basket_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
} 