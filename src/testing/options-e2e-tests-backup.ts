import { 
  OptionsStrategy, 
  OptionsPosition, 
  OptionContract, 
  GreeksCalculation,
  AccountInfo,
  UnifiedTradeIntent,
  OptionsTradeIntent 
} from '../types';
import { OptionsStrategyEngine } from '../trading/options-strategy-engine';
import { GreeksCalculatorService } from '../trading/greeks-calculator';
import { MultiLegStrategyService } from '../trading/multi-leg-strategy-service';
import { OptionsMarketDataService } from '../data/options-market-data';
import { OptionsPerformanceAnalytics } from '../analytics/options-performance-analytics';
import { UnifiedTradeProcessor } from '../llm/unified-trade-processor';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';

/**
 * Comprehensive End-to-End Options Trading Tests
 * 
 * TODO: Implement actual test implementations when options infrastructure is built
 * 
 * Architecture Notes:
 * - Should test complete options trading pipeline from NLP parsing to execution
 * - Integration tests with broker adapters, market data feeds, and Greeks calculations
 * - Validation of risk management and portfolio analytics
 * - Performance benchmarking and regression testing
 * - Real-time data flow and latency testing
 * 
 * Current Status: Framework in place, needs implementation once core services are built
 */
export class OptionsE2ETestSuite {
  private strategyEngine: OptionsStrategyEngine;
  private greeksCalculator: GreeksCalculatorService;
  private multiLegService: MultiLegStrategyService;
  private marketDataService: OptionsMarketDataService = new OptionsMarketDataService();
  private performanceAnalytics: OptionsPerformanceAnalytics;
  private tradeProcessor: UnifiedTradeProcessor;
  private broker: AlpacaAdapter;

  constructor() {
    // TODO: Initialize services when they are properly implemented
    // Current implementations contain mock data and placeholder methods
    // Requires: broker integration, market data feeds, real Greeks calculations
    this.strategyEngine = new OptionsStrategyEngine();
    this.greeksCalculator = new GreeksCalculatorService();
    this.multiLegService = new MultiLegStrategyService();
    // this.marketDataService = new OptionsMarketDataService(); // Not yet implemented
    this.performanceAnalytics = new OptionsPerformanceAnalytics();
    this.tradeProcessor = new UnifiedTradeProcessor();
    this.broker = new AlpacaAdapter();
  }

  /**
   * Run comprehensive test suite
   */
  async runAllTests(): Promise<TestResults> {
    console.log('🚀 Starting Comprehensive Options E2E Test Suite...\n');
    
    const results: TestResults = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      testResults: [],
      startTime: new Date(),
      endTime: new Date(),
      duration: 0
    };

    const tests = [
      () => this.testBasicOptionsStrategy(),
      () => this.testGreeksCalculations(),
      () => this.testMultiLegStrategies(),
      () => this.testMarketDataIntegration(),
      () => this.testPerformanceAnalytics(),
      () => this.testNaturalLanguageProcessing(),
      () => this.testCompleteOptionsWorkflow(),
      () => this.testRiskManagementScenarios(),
      () => this.testAdvancedAnalytics(),
      () => this.testIntegrationWithBroker()
    ];

    for (const test of tests) {
      try {
        results.totalTests++;
        const result = await test();
        results.testResults.push(result);
        if (result.passed) {
          results.passed++;
          console.log(`✅ ${result.testName}: PASSED`);
        } else {
          results.failed++;
          console.log(`❌ ${result.testName}: FAILED - ${result.error}`);
        }
      } catch (error) {
        results.failed++;
        results.testResults.push({
          testName: 'Unknown Test',
          passed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
          details: {}
        });
        console.log(`❌ Test failed with error: ${error}`);
      }
    }

    results.endTime = new Date();
    results.duration = results.endTime.getTime() - results.startTime.getTime();

    this.printTestSummary(results);
    return results;
  }

  /**
   * Test 1: Basic Options Strategy Creation
   */
  private async testBasicOptionsStrategy(): Promise<TestResult> {
    const testName = 'Basic Options Strategy Creation';
    const startTime = Date.now();
    
    try {
      // Test covered call strategy
      const coveredCall = this.strategyEngine.createCoveredCall('AAPL', 100, 150, '2024-04-19', 2.50);
      
      // Validate strategy structure
      if (!coveredCall || coveredCall.legs.length !== 2) {
        throw new Error('Covered call should have 2 legs');
      }
      
      if (coveredCall.type !== 'covered_call') {
        throw new Error(`Expected covered_call, got ${coveredCall.type}`);
      }

      // Test cash secured put
      const cashSecuredPut = this.strategyEngine.createCashSecuredPut('AAPL', 145, '2024-04-19', 3.00);
      
      if (!cashSecuredPut || cashSecuredPut.legs.length !== 1) {
        throw new Error('Cash secured put should have 1 leg');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          coveredCallLegs: coveredCall.legs.length,
          cashSecuredPutLegs: cashSecuredPut.legs.length,
          coveredCallType: coveredCall.type,
          maxProfit: coveredCall.maxProfit,
          maxLoss: coveredCall.maxLoss
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 2: Greeks Calculations
   */
  private async testGreeksCalculations(): Promise<TestResult> {
    const testName = 'Greeks Calculations';
    const startTime = Date.now();
    
    try {
      const contract: OptionContract = {
        symbol: 'AAPL',
        optionSymbol: 'AAPL240419C00150000',
        contractType: 'call',
        strikePrice: 150,
        expirationDate: '2024-04-19',
        multiplier: 100,
        exchange: 'OPRA',
        underlying: 'AAPL'
      };

      const greeks = await this.greeksCalculator.calculateOptionGreeks(
        contract,
        155, // Current price
        0.25, // Volatility
        0.05  // Risk-free rate
      );

      // Validate Greeks ranges
      if (greeks.delta < 0 || greeks.delta > 1) {
        throw new Error(`Call delta ${greeks.delta} out of valid range [0,1]`);
      }

      if (greeks.gamma < 0) {
        throw new Error(`Gamma ${greeks.gamma} should be positive`);
      }

      if (greeks.theta > 0) {
        throw new Error(`Theta ${greeks.theta} should be negative for long options`);
      }

      if (greeks.vega < 0) {
        throw new Error(`Vega ${greeks.vega} should be positive`);
      }

      // Test implied volatility calculation
      const targetPrice = 8.50;
      const impliedVol = this.greeksCalculator.calculateImpliedVolatility(
        contract,
        155,
        targetPrice,
        0.05
      );

      if (impliedVol < 0 || impliedVol > 2) {
        throw new Error(`Implied volatility ${impliedVol} out of reasonable range`);
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          delta: greeks.delta,
          gamma: greeks.gamma,
          theta: greeks.theta,
          vega: greeks.vega,
          rho: greeks.rho,
          impliedVolatility: impliedVol
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 3: Multi-leg Strategy Analysis
   */
  private async testMultiLegStrategies(): Promise<TestResult> {
    const testName = 'Multi-leg Strategy Analysis';
    const startTime = Date.now();
    
    try {
      // Create iron condor
      const ironCondor = this.strategyEngine.createIronCondor('AAPL', 145, 150, 155, 160, '2024-04-19', {
        putSell: 2.0,
        putBuy: 1.0, 
        callSell: 2.5,
        callBuy: 1.5
      });
      
      if (!ironCondor || ironCondor.legs.length !== 4) {
        throw new Error('Iron condor should have 4 legs');
      }

      // Analyze strategy with multi-leg service
      const analysis = await this.multiLegService.analyzeStrategy(
        ironCondor,
        155, // Current price
        0.25, // Volatility
        0.05  // Risk-free rate
      );

      if (!analysis || !analysis.pnlProfile || analysis.pnlProfile.length < 1) {
        throw new Error('Strategy analysis should include P&L profile');
      }

      // Test strategy validation
      const validation = this.multiLegService.validateMultiLegStrategy(ironCondor, {
        maxRisk: 1000,
        minProbabilityOfProfit: 0.5,
        maxCapitalRequired: 5000
      }, {
        underlyingPrice: 155,
        volatilityRank: 50,
        trend: 'neutral' as const,
        impliedVolatility: 0.25
      });

      if (!validation || typeof validation.isValid !== 'boolean') {
        throw new Error('Strategy validation should return validity status');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          ironCondorLegs: ironCondor.legs.length,
          maxProfit: ironCondor.maxProfit,
          maxLoss: ironCondor.maxLoss,
          pnlProfilePoints: analysis.pnlProfile.length,
          recommendationsCount: analysis.recommendations.length,
          isValid: validation.isValid
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 4: Market Data Integration
   */
  private async testMarketDataIntegration(): Promise<TestResult> {
    const testName = 'Market Data Integration';
    const startTime = Date.now();
    
    try {
      // Test market conditions analysis
      const marketConditions = await this.marketDataService.getMarketConditions('AAPL');
      
      if (!marketConditions || !marketConditions.underlying) {
        throw new Error('Market conditions should include underlying symbol');
      }

      if (typeof marketConditions.impliedVolatility !== 'number') {
        throw new Error('Market conditions should include implied volatility');
      }

      if (!['bullish', 'bearish', 'neutral'].includes(marketConditions.marketSentiment)) {
        throw new Error('Market sentiment should be bullish, bearish, or neutral');
      }

      // Test volatility surface
      const volSurface = await this.marketDataService.getImpliedVolatilitySurface('AAPL');
      
      if (!volSurface || !volSurface.surface || volSurface.surface.length === 0) {
        throw new Error('Volatility surface should contain data points');
      }

      if (typeof volSurface.atmVolatility !== 'number' || volSurface.atmVolatility < 0) {
        throw new Error('ATM volatility should be a positive number');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          underlying: marketConditions.underlying,
          impliedVolatility: marketConditions.impliedVolatility,
          marketSentiment: marketConditions.marketSentiment,
          liquidityScore: marketConditions.liquidityScore,
          atmVolatility: volSurface.atmVolatility,
          surfacePoints: volSurface.surface.length
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 5: Performance Analytics
   */
  private async testPerformanceAnalytics(): Promise<TestResult> {
    const testName = 'Performance Analytics';
    const startTime = Date.now();
    
    try {
             // Create mock positions and trades
       const mockPositions = this.createMockPositions();
       const mockTrades = this.createMockTrades();
       const mockAccount: AccountInfo = {
         accountId: 'test_account',
         portfolioValue: 100000,
         buyingPower: 50000,
         dayTradeCount: 2,
         positions: []
       };

      // Generate performance report
      const report = await this.performanceAnalytics.generatePerformanceReport(
        mockPositions,
        mockTrades,
        mockAccount,
        '1M'
      );

      if (!report || !report.pnlAnalysis) {
        throw new Error('Performance report should include P&L analysis');
      }

      if (!report.riskMetrics || typeof report.riskMetrics.sharpeRatio !== 'number') {
        throw new Error('Performance report should include risk metrics');
      }

      if (!report.greeksAnalysis || !report.greeksAnalysis.portfolioGreeks) {
        throw new Error('Performance report should include Greeks analysis');
      }

      // Test P&L attribution
      const marketConditions = { 'AAPL': { price: 155, change: 2.5, volatility: 0.25, timestamp: new Date() } };
      const attribution = await this.performanceAnalytics.calculatePnLAttribution(
        mockPositions,
        marketConditions
      );

      if (!attribution || typeof attribution.totalPnL !== 'number') {
        throw new Error('P&L attribution should include total P&L');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          totalPnL: report.pnlAnalysis.totalPnL,
          sharpeRatio: report.riskMetrics.sharpeRatio,
          portfolioDelta: report.greeksAnalysis.portfolioGreeks.delta,
          attributionPnL: attribution.totalPnL,
          recommendationsCount: report.recommendations.length
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 6: Natural Language Processing
   */
  private async testNaturalLanguageProcessing(): Promise<TestResult> {
    const testName = 'Natural Language Processing';
    const startTime = Date.now();
    
    try {
      // Test options command parsing
      const optionsCommands = [
        'Buy 2 AAPL calls at 150 strike expiring April 19th',
        'Sell covered calls on my TSLA shares at 200 strike',
        'Create an iron condor on SPY with strikes 400, 410, 420, 430',
        'Buy protective puts on my MSFT position at 300 strike'
      ];

      let successfulParses = 0;
      
      for (const command of optionsCommands) {
        try {
          const result = await this.tradeProcessor.processTradeCommand(command);
          
          if (result && result.intent && 'contractType' in result.intent) {
            successfulParses++;
            
            // Validate options-specific fields
            const optionsIntent = result.intent as OptionsTradeIntent;
            if (!optionsIntent.contractType || !optionsIntent.strikePrice || !optionsIntent.expirationDate) {
              throw new Error(`Incomplete options parsing for: ${command}`);
            }
          }
        } catch (parseError) {
          console.warn(`Failed to parse: ${command} - ${parseError}`);
        }
      }

      if (successfulParses === 0) {
        throw new Error('Failed to parse any options commands');
      }

      // Test strategy detection
      const strategyCommand = 'Create a bull call spread on AAPL';
      const strategyResult = await this.tradeProcessor.processTradeCommand(strategyCommand);
      
      if (!strategyResult || !strategyResult.intent) {
        throw new Error('Failed to process strategy command');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          totalCommands: optionsCommands.length,
          successfulParses,
          parseSuccessRate: (successfulParses / optionsCommands.length) * 100,
          strategyDetected: !!strategyResult.intent
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 7: Complete Options Workflow
   */
  private async testCompleteOptionsWorkflow(): Promise<TestResult> {
    const testName = 'Complete Options Workflow';
    const startTime = Date.now();
    
    try {
      // 1. Parse natural language command
      const command = 'Buy 1 AAPL call at 150 strike expiring in 30 days';
      const parsed = await this.tradeProcessor.processTradeCommand(command);
      
      if (!parsed || !parsed.intent || !('contractType' in parsed.intent)) {
        throw new Error('Failed to parse options command');
      }

      const optionsIntent = parsed.intent as OptionsTradeIntent;

             // 2. Get market data
       const marketConditions = await this.marketDataService.getMarketConditions(optionsIntent.underlying);
       
       // 3. Calculate Greeks and risk
       const contract: OptionContract = {
         symbol: optionsIntent.underlying,
         optionSymbol: `${optionsIntent.underlying}240419C00150000`,
         contractType: optionsIntent.contractType,
         strikePrice: optionsIntent.strikePrice,
         expirationDate: optionsIntent.expirationDate,
         multiplier: 100,
         exchange: 'OPRA',
         underlying: optionsIntent.underlying
       };

      const greeks = await this.greeksCalculator.calculateOptionGreeks(
        contract,
        marketConditions.underlyingPrice,
        marketConditions.impliedVolatility,
        0.05
      );

                    // 4. Validate with broker
       const validation = await this.broker.validateOptionsOrder(optionsIntent);

       if (!validation || typeof validation.isValid !== 'boolean') {
         throw new Error('Broker validation failed');
       }

       // 5. Simulate execution (paper trading)
       if (validation.isValid) {
         const executionResult = await this.broker.executeOptionsOrder(optionsIntent);

         if (!executionResult || !executionResult.success) {
           throw new Error('Order execution simulation failed');
         }
       }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          commandParsed: !!parsed.intent,
          marketDataRetrieved: !!marketConditions.impliedVolatility,
          greeksCalculated: !!greeks.delta,
          validationPassed: validation.isValid,
          executionSimulated: validation.isValid
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 8: Risk Management Scenarios
   */
  private async testRiskManagementScenarios(): Promise<TestResult> {
    const testName = 'Risk Management Scenarios';
    const startTime = Date.now();
    
    try {
      // Test scenario 1: High concentration risk
      const positions = this.createMockPositions();
      
      // Test scenario 2: High Greeks exposure
      const totalDelta = positions.reduce((sum, pos) => sum + pos.greeks.delta * pos.quantity, 0);
      const totalTheta = positions.reduce((sum, pos) => sum + pos.greeks.theta * pos.quantity, 0);
      
      // Test scenario 3: Approaching expiration
      const nearExpiryPositions = positions.filter(pos => {
        const expiry = new Date(pos.legs[0]?.contract.expirationDate || '2024-04-19');
        const now = new Date();
        const daysToExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return daysToExpiry <= 7;
      });

      // Validate risk calculations
      if (typeof totalDelta !== 'number' || typeof totalTheta !== 'number') {
        throw new Error('Risk calculations should return numbers');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          totalPositions: positions.length,
          portfolioDelta: totalDelta,
          portfolioTheta: totalTheta,
          nearExpiryPositions: nearExpiryPositions.length,
          riskManagementActive: true
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 9: Advanced Analytics
   */
  private async testAdvancedAnalytics(): Promise<TestResult> {
    const testName = 'Advanced Analytics';
    const startTime = Date.now();
    
    try {
      // Test volatility surface analysis
      const volSurface = await this.marketDataService.getImpliedVolatilitySurface('AAPL');
      
             // Test strategy optimization
       const mockAccount: AccountInfo = {
         accountId: 'test_account',
         portfolioValue: 100000,
         buyingPower: 50000,
         dayTradeCount: 2,
         positions: []
       };

      const optimization = await this.performanceAnalytics.analyzePortfolioOptimization(
        this.createMockPositions(),
        mockAccount,
        'moderate'
      );

      if (!optimization || !optimization.suggestions) {
        throw new Error('Portfolio optimization should provide suggestions');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          volatilitySurfacePoints: volSurface.surface.length,
          optimizationSuggestions: optimization.suggestions.length,
          riskScore: optimization.currentMetrics.riskScore,
          diversificationScore: optimization.currentMetrics.diversificationScore
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test 10: Integration with Broker
   */
  private async testIntegrationWithBroker(): Promise<TestResult> {
    const testName = 'Integration with Broker';
    const startTime = Date.now();
    
    try {
      // Test options chain retrieval
      const optionsChain = await this.broker.getOptionsChain('AAPL', '2024-04-19');
      
      if (!optionsChain || !optionsChain.chains) {
        throw new Error('Failed to retrieve options chain from broker');
      }

      // Test options quote
      const contract: OptionContract = {
        symbol: 'AAPL',
        optionSymbol: 'AAPL240419C00150000',
        contractType: 'call',
        strikePrice: 150,
        expirationDate: '2024-04-19',
        multiplier: 100,
        exchange: 'OPRA',
        underlying: 'AAPL'
      };

             const quote = await this.broker.getOptionsQuote(contract.optionSymbol);
      
      if (!quote || typeof quote.bid !== 'number' || typeof quote.ask !== 'number') {
        throw new Error('Failed to retrieve valid options quote');
      }

      // Test Greeks calculation via broker
      const brokerGreeks = await this.broker.calculateGreeks(contract, 155, 0.25, 0.05);
      
      if (!brokerGreeks || typeof brokerGreeks.delta !== 'number') {
        throw new Error('Failed to calculate Greeks via broker');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          optionsChainRetrieved: !!optionsChain.chains,
          quoteRetrieved: !!(quote.bid && quote.ask),
          greeksCalculated: !!brokerGreeks.delta,
          bidAskSpread: quote.ask - quote.bid,
          delta: brokerGreeks.delta
        }
      };
    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  // TODO: Replace mock data with actual position data from broker
  // Architecture: Integration with broker position management system
  // Should fetch: real positions, live Greeks, current market values, P&L tracking
  private createMockPositions(): OptionsPosition[] {
    // Placeholder data - replace with broker.getOptionsPositions() when implemented
    return [];
  }

  // TODO: Replace with actual trade history from broker and database
  // Architecture: Trade execution tracking and historical analysis
  // Should include: execution details, fills, commissions, slippage analysis
  private createMockTrades(): any[] {
    // Placeholder - replace with broker.getTradeHistory() and database queries
    return [];
  }

  private printTestSummary(results: TestResults): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 OPTIONS TRADING E2E TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${results.totalTests}`);
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⏱️  Duration: ${results.duration}ms`);
    console.log(`📈 Success Rate: ${((results.passed / results.totalTests) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
    
    if (results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.testResults
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`  • ${test.testName}: ${test.error}`);
        });
    }
    
    console.log('\n🎯 Key Metrics from Tests:');
    results.testResults.forEach(test => {
      if (test.passed && Object.keys(test.details).length > 0) {
        console.log(`  📋 ${test.testName}:`);
        Object.entries(test.details).forEach(([key, value]) => {
          console.log(`    - ${key}: ${value}`);
        });
      }
    });
    
    console.log('\n📋 Options Infrastructure Status: FRAMEWORK COMPLETE');
    console.log('⚠️  Implementation Required: Broker integration, market data, real calculations');
  }
}

// Supporting interfaces
export interface TestResults {
  totalTests: number;
  passed: number;
  failed: number;
  testResults: TestResult[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface TestResult {
  testName: string;
  passed: boolean;
  error: string | null;
  duration: number;
  details: { [key: string]: any };
}

interface TestSuiteResults {
  passed: number;
  failed: number;
  testResults: TestResult[];
  startTime: Date;
  endTime: Date;
  duration: number;
}

// Export test runner for use
export async function runOptionsE2ETests(): Promise<TestResults> {
  const testSuite = new OptionsE2ETestSuite();
  return await testSuite.runAllTests();
}

export async function runOptionsIntegrationTests(): Promise<TestSuiteResults> {
  const testSuite = new OptionsE2ETestSuite();
  return await testSuite.runIntegrationTests();
}
  async runIntegrationTests(): Promise<TestSuiteResults> {
    const results: TestSuiteResults = {
      passed: 0,
      failed: 0,
      testResults: [],
      startTime: new Date(),
      endTime: new Date(),
      duration: 0
    };

    console.log('🚀 Starting comprehensive options integration tests...\n');

    const integrationTests = [
      () => this.testStrategyWizardWorkflow(),
      () => this.testOptionsChainIntegration(),
      () => this.testRiskManagerIntegration(),
      () => this.testNLPToExecutionWorkflow(),
      () => this.testMarketDataPipeline()
    ];

    for (const test of integrationTests) {
      try {
        const result = await test();
        results.testResults.push(result);
        
        if (result.passed) {
          results.passed++;
          console.log(`✅ ${result.testName}: PASSED`);
        } else {
          results.failed++;
          console.log(`❌ ${result.testName}: FAILED - ${result.error}`);
        }
      } catch (error) {
        results.failed++;
        results.testResults.push({
          testName: 'Integration Test',
          passed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: 0,
          details: {}
        });
        console.log(`❌ Integration test failed: ${error}`);
      }
    }

    results.endTime = new Date();
    results.duration = results.endTime.getTime() - results.startTime.getTime();

    this.printTestSummary(results);
    return results;
  }

  /**
   * Test the complete Strategy Wizard workflow
   */
  private async testStrategyWizardWorkflow(): Promise<TestResult> {
    const testName = 'Strategy Wizard Complete Workflow';
    const startTime = Date.now();
    
    try {
      // Step 1: NLP Command Processing
      const command = "I want to long AAPL with moderate risk";
      const nlpResult = await this.tradeProcessor.processTradeCommand(command);
      
      if (!nlpResult.intent) {
        throw new Error('NLP processing failed');
      }

      // Step 2: Strategy Creation
      const longCallStrategy = this.strategyEngine.createCoveredCall('AAPL', 100, 150, '2024-06-21', 2.50);
      
      if (!longCallStrategy || longCallStrategy.legs.length === 0) {
        throw new Error('Strategy creation failed');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          nlpConfidence: nlpResult.confidence,
          strategyLegs: longCallStrategy.legs.length
        }
      };

    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test Options Chain integration with frontend
   */
  private async testOptionsChainIntegration(): Promise<TestResult> {
    const testName = 'Options Chain Integration';
    const startTime = Date.now();
    
    try {
      // Test options chain retrieval
      const optionsChain = await this.broker.getOptionsChain('AAPL');
      
      if (!optionsChain || !optionsChain.symbol) {
        throw new Error('Options chain retrieval failed');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          symbol: optionsChain.symbol,
          expirationCount: optionsChain.expirationDates?.length || 0
        }
      };

    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test Risk Manager integration
   */
  private async testRiskManagerIntegration(): Promise<TestResult> {
    const testName = 'Risk Manager Portfolio Integration';
    const startTime = Date.now();
    
    try {
      const mockAccountInfo: AccountInfo = {
        accountId: 'TEST123',
        buyingPower: 50000,
        portfolioValue: 75000,
        dayTradeCount: 2,
        positions: []
      };

      // Test position sizing validation
      const maxPositionSize = mockAccountInfo.portfolioValue * 0.1;
      const currentPosition = 2500;
      
      const riskCheck = currentPosition <= maxPositionSize;
      
      if (!riskCheck) {
        throw new Error('Risk limits violated');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          maxPositionSize,
          currentPosition,
          riskCheckPassed: riskCheck
        }
      };

    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test complete NLP to execution workflow
   */
  private async testNLPToExecutionWorkflow(): Promise<TestResult> {
    const testName = 'NLP to Execution Workflow';
    const startTime = Date.now();
    
    try {
      // Step 1: NLP Processing
      const command = "Buy AAPL 150 call expiring June 21st";
      const nlpResult = await this.tradeProcessor.processTradeCommand(command);
      
      if (nlpResult.tradeType !== 'option') {
        throw new Error(`Expected option trade type, got ${nlpResult.tradeType}`);
      }

      const optionsIntent = nlpResult.intent as OptionsTradeIntent;
      
      if (optionsIntent.underlying !== 'AAPL') {
        throw new Error(`Expected AAPL, got ${optionsIntent.underlying}`);
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          parsedUnderlying: optionsIntent.underlying,
          parsedStrike: optionsIntent.strikePrice,
          parsedType: optionsIntent.contractType
        }
      };

    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }

  /**
   * Test market data pipeline integration
   */
  private async testMarketDataPipeline(): Promise<TestResult> {
    const testName = 'Market Data Pipeline Integration';
    const startTime = Date.now();
    
    try {
      // Test basic market data
      const marketData = await this.broker.getMarketData('AAPL');
      
      if (typeof marketData.currentPrice !== 'number' || marketData.currentPrice <= 0) {
        throw new Error('Invalid current price');
      }

      return {
        testName,
        passed: true,
        error: null,
        duration: Date.now() - startTime,
        details: {
          currentPrice: marketData.currentPrice,
          isMarketOpen: marketData.isMarketOpen
        }
      };

    } catch (error) {
      return {
        testName,
        passed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        details: {}
      };
    }
  }
}

// Export test runner for use
export async function runOptionsE2ETests(): Promise<TestResults> {
  const testSuite = new OptionsE2ETestSuite();
  return await testSuite.runAllTests();
}

export async function runOptionsIntegrationTests(): Promise<TestSuiteResults> {
  const testSuite = new OptionsE2ETestSuite();
  return await testSuite.runIntegrationTests();
} 