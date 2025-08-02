# LLM Provider Integration Guide

This document explains how to use and configure different LLM providers (OpenAI and Anthropic Claude) in the natural language trading application.

## Overview

The application now supports two LLM providers:
- **OpenAI GPT Models** (GPT-4, GPT-4o, GPT-4o-mini)
- **Anthropic Claude Models** (Claude 3 Haiku, Sonnet, Opus)

Both providers can parse natural language trading commands and generate market analysis with high accuracy.

## Configuration

### Environment Variables

Add both API keys to your `.env` file:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Anthropic Claude API Configuration  
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### API Key Setup

#### OpenAI
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a new API key
3. Add billing information and set usage limits
4. Copy the key to your `.env` file

#### Anthropic Claude
1. Visit [Anthropic Console](https://console.anthropic.com/)
2. Create an account and add billing information
3. Generate an API key
4. Copy the key to your `.env` file

## Usage

### Using the Parsing Service

```typescript
import { optimizedParsingService } from '../parsing/parsing-service';

// Switch to OpenAI (default)
optimizedParsingService.setLLMProvider('openai');
const result1 = await optimizedParsingService.parseTradeIntent('buy $100 of AAPL');

// Switch to Claude
optimizedParsingService.setLLMProvider('claude');
const result2 = await optimizedParsingService.parseTradeIntent('sell 50 shares of TSLA');

// Check current provider
console.log('Current provider:', optimizedParsingService.getLLMProvider());
```

### Using LLM Adapters Directly

```typescript
import { resolveOpenAILLMAdapter, resolveClaudeLLMAdapter } from '../infrastructure/di/Container';

// Use OpenAI adapter
const openaiAdapter = resolveOpenAILLMAdapter();
const openaiResult = await openaiAdapter.parseNaturalLanguage('buy Microsoft stock');

// Use Claude adapter
const claudeAdapter = resolveClaudeLLMAdapter();
const claudeResult = await claudeAdapter.parseNaturalLanguage('sell all my Google shares');
```

### Container-Level Configuration

```typescript
import { configureLLMProvider, configureProductionContainer } from '../infrastructure/di/Container';

// Switch default provider
configureLLMProvider('claude');

// Or configure for production with specific provider
const container = configureProductionContainer({
  llmProvider: 'claude',
  enableRedis: true
});
```

## Model Selection

### OpenAI Models
- **gpt-4o-mini**: Fast, cost-effective for simple trades
- **gpt-4o**: Standard model for most operations
- **gpt-4-turbo**: Complex analysis and multi-step reasoning

### Claude Models
- **claude-3-haiku-20240307**: Fast, efficient for simple parsing
- **claude-3-sonnet-20240229**: Balanced performance for standard operations
- **claude-3-opus-20240229**: Most capable for complex analysis

The application automatically selects the appropriate model based on input complexity.

## Performance Comparison

| Feature | OpenAI | Claude |
|---------|--------|--------|
| Speed | Fast | Very Fast |
| Accuracy | High | High |
| Cost | Medium | Low-Medium |
| Complex Reasoning | Excellent | Excellent |
| JSON Parsing | Native | Reliable |

## Error Handling

Both providers implement comprehensive error handling:

```typescript
try {
  const result = await optimizedParsingService.parseTradeIntent(userInput);
  console.log('Success:', result);
} catch (error) {
  if (error instanceof LLMError) {
    console.error('LLM Error:', error.message);
    console.error('Details:', error.details);
  }
}
```

## Best Practices

### Provider Selection
- Use **OpenAI** for:
  - Function calling features
  - Structured JSON responses
  - Complex multi-step reasoning

- Use **Claude** for:
  - Cost optimization
  - Fast response times
  - High-accuracy text parsing

### Fallback Strategy
Implement provider fallback for reliability:

```typescript
async function parseWithFallback(input: string) {
  try {
    optimizedParsingService.setLLMProvider('claude');
    return await optimizedParsingService.parseTradeIntent(input);
  } catch (error) {
    console.warn('Claude failed, falling back to OpenAI');
    optimizedParsingService.setLLMProvider('openai');
    return await optimizedParsingService.parseTradeIntent(input);
  }
}
```

### Monitoring and Metrics
Track performance across providers:

```typescript
const stats = optimizedParsingService.getPerformanceStats();
console.log('Parsing metrics:', stats.metrics);
console.log('Cache performance:', stats.cacheStats);
console.log('Optimization recommendations:', stats.recommendations);
```

## Troubleshooting

### Common Issues

#### API Key Not Found
```
Error: Anthropic API key is required
```
- Ensure `ANTHROPIC_API_KEY` is set in your `.env` file
- Check the key is valid and has sufficient credits

#### Rate Limits
```
Error: Rate limit exceeded
```
- Implement retry logic with exponential backoff
- Consider upgrading your API plan
- Switch to alternative provider temporarily

#### Invalid JSON Response (Claude)
```
Error: Invalid JSON response from Claude
```
- This is rare but can happen with very complex inputs
- The system automatically falls back to rule-based parsing
- Consider simplifying the input or using OpenAI for complex cases

### Debug Mode
Enable debug logging to troubleshoot issues:

```typescript
// Set LOG_LEVEL=debug in your .env file
console.log('Provider:', optimizedParsingService.getLLMProvider());
console.log('Input preprocessing result:', preprocessedInput);
```

## Examples

See `src/examples/llm-provider-example.ts` for comprehensive usage examples including:
- Provider switching
- Direct adapter usage
- Performance comparison
- Container configuration

Run the example:
```bash
npm run dev -- src/examples/llm-provider-example.ts
```

## Migration Guide

### From OpenAI-only to Multi-provider

1. **Update Environment Variables**
   ```bash
   # Add to .env
   ANTHROPIC_API_KEY=your_key_here
   ```

2. **Update Service Initialization**
   ```typescript
   // Before
   const service = new OptimizedParsingService();
   
   // After
   const service = new OptimizedParsingService('claude'); // or 'openai'
   ```

3. **Update Container Configuration**
   ```typescript
   // Configure default provider
   configureLLMProvider('claude');
   ```

4. **Test Both Providers**
   ```typescript
   // Test switching between providers
   service.setLLMProvider('openai');
   // ... test trades ...
   service.setLLMProvider('claude');
   // ... test trades ...
   ```

## Future Enhancements

Planned improvements:
- Automatic provider selection based on input type
- Load balancing between providers
- Cost optimization algorithms
- Provider-specific prompt engineering
- Real-time performance monitoring
- A/B testing framework for provider comparison