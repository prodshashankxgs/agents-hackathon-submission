import { LLMProvider, TradingBroker, IntentRegistry } from './';

export interface TradingOrchestratorConfig {
  llm: {
    provider: LLMProvider;
    timeout: number;
    retries: number;
  };
  broker: {
    provider: TradingBroker;
    timeout: number;
    retries: number;
  };
  intents: {
    registry: IntentRegistry;
    timeout: number;
  };
  validation: {
    required: boolean;
    timeout: number;
  };
  execution: {
    timeout: number;
    retries: number;
  };
}