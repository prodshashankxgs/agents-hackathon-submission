import { 
  IntentPlugin, 
  IntentProcessor, 
  IntentValidator, 
  IntentSchema, 
  TradeIntent 
} from '../core/interfaces';

interface AnalysisData {
  type: 'analysis';
  symbol: string;
  analysisType: 'fundamental' | 'technical' | 'sentiment' | 'comprehensive';
  timeframe?: string;
  metrics?: string[];
}

class AnalysisProcessor implements IntentProcessor<AnalysisData> {
  async process(data: AnalysisData, context?: any): Promise<TradeIntent> {
    return {
      id: `analysis-${Date.now()}`,
      type: 'analysis',
      symbol: data.symbol.toUpperCase(),
      metadata: {
        analysisType: data.analysisType,
        timeframe: data.timeframe,
        metrics: data.metrics,
        requestedAt: new Date().toISOString()
      },
      context: {
        reasoning: `Requested ${data.analysisType} analysis for ${data.symbol}`,
        confidence: 0.9,
        riskLevel: 'low'
      }
    };
  }

  validate(data: AnalysisData): boolean {
    return !!(data.type === 'analysis' && data.symbol && data.analysisType);
  }

  transform(data: AnalysisData): TradeIntent {
    return {
      id: `analysis-${Date.now()}`,
      type: 'analysis',
      symbol: data.symbol.toUpperCase(),
      metadata: {
        analysisType: data.analysisType,
        timeframe: data.timeframe,
        metrics: data.metrics
      }
    };
  }
}

class AnalysisValidator implements IntentValidator<AnalysisData> {
  validate(data: AnalysisData): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (data.type !== 'analysis') {
      errors.push('Type must be "analysis"');
    }

    if (!data.symbol || data.symbol.length === 0) {
      errors.push('Symbol is required');
    }

    if (!data.analysisType || !['fundamental', 'technical', 'sentiment', 'comprehensive'].includes(data.analysisType)) {
      errors.push('Invalid analysis type');
    }

    if (data.timeframe && !['1d', '1w', '1m', '3m', '6m', '1y'].includes(data.timeframe)) {
      warnings.push('Unknown timeframe, using default');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  sanitize(data: AnalysisData): AnalysisData {
    return {
      type: 'analysis',
      symbol: data.symbol.toUpperCase().trim(),
      analysisType: data.analysisType,
      timeframe: data.timeframe || '1m',
      metrics: data.metrics || []
    };
  }
}

export class AnalysisPlugin implements IntentPlugin<AnalysisData> {
  type = 'analysis';
  version = '1.0.0';
  description = 'Handles stock analysis requests';
  priority = 30;
  enabled = true;

  schema: IntentSchema<AnalysisData> = {
    type: 'analysis',
    description: 'Parse stock analysis requests',
    validator: (data: any) => {
      const validator = new AnalysisValidator();
      const validated = validator.validate(data);
      if (!validated.isValid) {
        throw new Error(validated.errors.join(', '));
      }
      return validator.sanitize(data);
    },
    promptTemplate: `
Parse the following stock analysis request:
"{input}"

Extract:
- type: "analysis"
- symbol: the stock symbol
- analysisType: "fundamental", "technical", "sentiment", or "comprehensive"
- timeframe: time period (1d, 1w, 1m, 3m, 6m, 1y)
- metrics: specific metrics requested (optional)

Return JSON with these fields.
    `,
    examples: [
      { type: 'analysis', symbol: 'AAPL', analysisType: 'technical', timeframe: '1m' },
      { type: 'analysis', symbol: 'TSLA', analysisType: 'fundamental', timeframe: '1y', metrics: ['pe_ratio', 'revenue_growth'] }
    ]
  };

  processor = new AnalysisProcessor();
  validator = new AnalysisValidator();

  canHandle(input: string): boolean {
    const lowerInput = input.toLowerCase();
    const analysisKeywords = ['analyze', 'analysis', 'fundamental', 'technical', 'sentiment', 'report', 'research'];
    
    return (
      analysisKeywords.some(keyword => lowerInput.includes(keyword)) &&
      /\b[A-Z]{1,5}\b/.test(input) // Contains a stock symbol pattern
    );
  }

  getComplexity(input: string): number {
    let complexity = 30; // Base complexity for analysis
    
    if (input.toLowerCase().includes('comprehensive')) complexity += 20;
    if (input.toLowerCase().includes('fundamental')) complexity += 15;
    if (input.toLowerCase().includes('technical')) complexity += 10;
    if (input.toLowerCase().includes('sentiment')) complexity += 10;
    
    return complexity;
  }

  getEstimatedCost(input: string): number {
    return Math.max(100, input.length * 1.2); // Analysis typically uses more tokens
  }

  async initialize(): Promise<void> {
    // Plugin initialization logic
  }

  async cleanup(): Promise<void> {
    // Plugin cleanup logic
  }
}