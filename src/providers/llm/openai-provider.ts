import { 
  LLMProvider, 
  LLMProviderConfig, 
  LLMRequest, 
  LLMResponse, 
  BatchRequest, 
  BatchResult 
} from '../../core/interfaces';
import { BaseLLMProvider } from '../../core/factories/llm-provider.factory';

export class OpenAIProvider extends BaseLLMProvider {
  name = 'openai';
  version = '1.0.0';

  constructor(config: LLMProviderConfig) {
    super({
      ...config,
      baseUrl: config.baseUrl || 'https://api.openai.com/v1',
      model: config.model || 'gpt-4o-mini'
    });
    this.validateConfig();
  }

  async parseIntent<T>(request: LLMRequest<T>): Promise<LLMResponse<T>> {
    const startTime = Date.now();
    
    const prompt = this.buildPrompt(request);
    const tools = this.buildTools(request.schema);
    
    const response = await this.makeRequest('/chat/completions', {
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You are a trading assistant that parses user intents.' },
        { role: 'user', content: prompt }
      ],
      tools,
      tool_choice: { type: 'function', function: { name: 'parse_intent' } },
      temperature: request.schema.temperature || this.config.temperature || 0.1,
      max_tokens: request.schema.maxTokens || this.config.maxTokens || 1000
    });

    const toolCall = response.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call found in OpenAI response');
    }

    const parsedData = JSON.parse(toolCall.function.arguments);
    const validatedData = request.schema.validator(parsedData);

    return {
      id: request.id,
      data: validatedData,
      confidence: this.calculateConfidence(response),
      model: this.config.model!,
      tokens: {
        input: response.usage.prompt_tokens,
        output: response.usage.completion_tokens
      },
      latency: Date.now() - startTime,
      cached: false
    };
  }

  async generateResponse(prompt: string, context?: any): Promise<string> {
    const response = await this.makeRequest('/chat/completions', {
      model: this.config.model,
      messages: [
        { role: 'system', content: 'You are a helpful trading assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.maxTokens || 1000
    });

    return response.choices[0]?.message?.content || '';
  }

  async batchProcess<T>(batch: BatchRequest<T>): Promise<BatchResult<T>> {
    const startTime = Date.now();
    const maxConcurrency = batch.options?.maxConcurrency || 10;
    
    const results: (LLMResponse<T> | Error)[] = [];
    
    // Process in batches to respect rate limits
    for (let i = 0; i < batch.requests.length; i += maxConcurrency) {
      const batchSlice = batch.requests.slice(i, i + maxConcurrency);
      
      const batchResults = await Promise.allSettled(
        batchSlice.map(request => this.parseIntent(request))
      );

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(new Error(result.reason));
        }
      }
    }

    const successful = results.filter(r => !(r instanceof Error));
    const failed = results.filter(r => r instanceof Error);

    return {
      results,
      stats: {
        successful: successful.length,
        failed: failed.length,
        totalLatency: Date.now() - startTime,
        totalTokens: successful.reduce((sum, result) => {
          if (!(result instanceof Error)) {
            return sum + result.tokens.input + result.tokens.output;
          }
          return sum;
        }, 0)
      }
    };
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await this.makeRequest('/models', {}, { timeout: 5000, retries: 1 });
      return response && response.data && response.data.length > 0;
    } catch {
      return false;
    }
  }

  async getCosts(): Promise<{ inputCostPer1kTokens: number; outputCostPer1kTokens: number; }> {
    // OpenAI pricing (approximate)
    const modelCosts: Record<string, { input: number; output: number }> = {
      'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
      'gpt-4': { input: 0.03, output: 0.06 },
      'gpt-3.5-turbo': { input: 0.001, output: 0.002 }
    };

    const costs = modelCosts[this.config.model!] || modelCosts['gpt-4o-mini'];
    
    return {
      inputCostPer1kTokens: costs?.input || 0.00015,
      outputCostPer1kTokens: costs?.output || 0.0006
    };
  }

  private buildPrompt<T>(request: LLMRequest<T>): string {
    let prompt = request.schema.promptTemplate.replace('{input}', request.input);
    
    if (request.schema.examples.length > 0) {
      const examples = request.schema.examples
        .map(example => `Example: ${JSON.stringify(example)}`)
        .join('\n');
      prompt += `\n\nExamples:\n${examples}`;
    }

    if (request.context) {
      prompt += `\n\nContext: ${JSON.stringify(request.context)}`;
    }

    return prompt;
  }

  private buildTools(schema: any): any[] {
    return [
      {
        type: 'function',
        function: {
          name: 'parse_intent',
          description: schema.description,
          parameters: {
            type: 'object',
            properties: this.generateJsonSchema(schema),
            required: ['type', 'symbol']
          }
        }
      }
    ];
  }

  private generateJsonSchema(schema: any): any {
    // Generate JSON schema from intent schema
    return {
      type: { type: 'string', description: 'The type of trading intent' },
      symbol: { type: 'string', description: 'The trading symbol' },
      quantity: { type: 'number', description: 'The quantity to trade' },
      price: { type: 'number', description: 'The price limit' },
      orderType: { type: 'string', enum: ['market', 'limit', 'stop', 'stop_limit'] },
      metadata: { type: 'object', description: 'Additional metadata' }
    };
  }

  private calculateConfidence(response: any): number {
    // Simple confidence calculation based on response quality
    const choice = response.choices[0];
    if (!choice) return 0;

    let confidence = 0.5;
    
    // Higher confidence for tool calls
    if (choice.message?.tool_calls) {
      confidence += 0.3;
    }

    // Adjust based on finish_reason
    if (choice.finish_reason === 'tool_calls') {
      confidence += 0.2;
    } else if (choice.finish_reason === 'stop') {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }
}