# 🏗️ Layered Architecture Guide

This document describes the new layered architecture implementation of the Natural Language Trading Application.

## 🎯 Architecture Overview

The application has been refactored into a clean, layered architecture following Domain-Driven Design (DDD) principles:

```
┌─────────────────────────────────────────┐
│              Presentation Layer          │
│  ┌─────────────┐    ┌─────────────────┐ │
│  │ REST API    │    │ CLI Interface   │ │
│  │ Controllers │    │ Commands        │ │
│  └─────────────┘    └─────────────────┘ │
├─────────────────────────────────────────┤
│              Application Layer          │
│  ┌─────────────┐    ┌─────────────────┐ │
│  │ Trade       │    │ Portfolio       │ │
│  │ Orchestrator│    │ Service         │ │
│  └─────────────┘    └─────────────────┘ │
├─────────────────────────────────────────┤
│              Domain Layer               │
│  ┌─────────────┐ ┌──────────┐ ┌────────┐ │
│  │ Parsing     │ │ Validation│ │ Risk   │ │
│  │ Service     │ │ Service   │ │ Mgmt   │ │
│  └─────────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────┤
│              Infrastructure Layer       │
│  ┌─────────────┐ ┌──────────┐ ┌────────┐ │
│  │ Alpaca      │ │ OpenAI   │ │ Cache  │ │
│  │ Adapter     │ │ Client   │ │ Service│ │
│  └─────────────┘ └──────────┘ └────────┘ │
└─────────────────────────────────────────┘
```

## 📁 Directory Structure

```
src/
├── core/
│   └── interfaces/         # Core interfaces and types
├── infrastructure/         # External services, adapters, DI
│   ├── adapters/           # External API adapters
│   ├── caching/            # Cache implementations
│   ├── logging/            # Logging implementations
│   ├── events/             # Event bus implementation
│   └── di/                 # Dependency injection container
├── domain/                 # Business logic and rules
│   └── services/           # Domain services
├── application/            # Use cases and orchestration
│   ├── orchestrators/      # High-level workflow orchestration
│   └── services/           # Application services
├── presentation/           # User interfaces
│   ├── controllers/        # REST API controllers
│   └── routes/             # Route definitions
├── layered-server.ts       # New layered server entry point
└── layered-cli.ts          # New layered CLI entry point
```

## 🚀 Getting Started

### 1. Build the Application

```bash
npm run build
```

### 2. Start the Layered Server

```bash
# Development
npm run dev:layered

# Production  
npm run start:layered
```

### 3. Use the Layered CLI

```bash
# Development
npm run dev:cli:layered

# Production
npm run start:cli:layered

# Or use the binary directly
nltrade-layered --help
```

## 🔌 Key Components

### Core Interfaces (`src/core/interfaces/`)

Defines all contracts and types used throughout the application:
- **Domain Entities**: TradeEntity, PositionEntity, AccountEntity, etc.
- **Service Interfaces**: IParsingService, IValidationService, IBrokerAdapter, etc.
- **Value Objects**: TradeCommand, ValidationResult, RiskAssessment, etc.
- **Events**: DomainEvent, TradeExecutedEvent, PositionUpdatedEvent, etc.

### Infrastructure Layer

#### Adapters (`src/infrastructure/adapters/`)
- **AlpacaBrokerAdapter**: Clean interface to Alpaca Markets API
- **OpenAILLMAdapter**: Structured interface to OpenAI API

#### Caching (`src/infrastructure/caching/`)
- **RedisCacheService**: In-memory cache with Redis-like interface (ready for Redis upgrade)

#### Events (`src/infrastructure/events/`)
- **InMemoryEventBus**: Event-driven communication between layers

#### Dependency Injection (`src/infrastructure/di/`)
- **Container**: IoC container managing all service dependencies
- **Typed resolvers**: Type-safe service resolution

### Domain Layer (`src/domain/services/`)

Pure business logic with no external dependencies:
- **ParsingService**: Multi-tier parsing (rule-based → semantic cache → LLM)
- **ValidationService**: Comprehensive trade validation
- **RiskManagementService**: Position sizing and risk assessment

### Application Layer

#### Orchestrators (`src/application/orchestrators/`)
- **TradeOrchestrator**: Complete trade workflow orchestration

#### Services (`src/application/services/`)
- **PortfolioService**: Portfolio management and performance metrics

### Presentation Layer

#### Controllers (`src/presentation/controllers/`)
- **TradingController**: Clean, focused API controllers

#### Routes (`src/presentation/routes/`)
- **Centralized routing**: All API endpoints with proper error handling
- **Legacy compatibility**: Maintains compatibility with existing frontend

## 🛠️ Usage Examples

### REST API

```bash
# Execute a trade
curl -X POST http://localhost:3001/api/trades/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "buy $100 of AAPL"}'

# Preview a trade
curl -X POST http://localhost:3001/api/trades/preview \
  -H "Content-Type: application/json" \
  -d '{"command": "sell 10 shares TSLA"}'

# Get portfolio
curl http://localhost:3001/api/portfolio

# Get market data
curl http://localhost:3001/api/market/AAPL
```

### CLI Interface

```bash
# Execute a trade
nltrade-layered trade "buy $500 of MSFT"

# Preview a trade
nltrade-layered preview "sell all GOOGL"

# Interactive mode
nltrade-layered interactive

# Get portfolio
nltrade-layered portfolio

# Get market data
nltrade-layered quote AAPL

# System status
nltrade-layered status
```

## 🔄 Migration from Legacy Code

### Benefits of Layered Architecture

1. **Separation of Concerns**: Each layer has a single responsibility
2. **Testability**: Easy to unit test with dependency injection
3. **Maintainability**: Changes in one layer don't affect others
4. **Scalability**: Can easily extract services or add new features
5. **Error Handling**: Consistent error handling across all layers

### Compatibility

The new layered architecture maintains full compatibility with:
- ✅ Existing frontend React application
- ✅ Current API endpoints (`/api/command/execute`, etc.)
- ✅ WebSocket connections for real-time updates
- ✅ All configuration and environment variables

### Running Both Versions

You can run both the legacy and layered versions simultaneously:

```bash
# Legacy server (port 3001)
npm run dev:optimized

# Layered server (port 3002)
PORT=3002 npm run dev:layered
```

## 🧪 Testing

The layered architecture makes testing much easier:

### Unit Testing

```typescript
// Example: Testing the parsing service
import { ParsingService } from '../domain/services/ParsingService';
import { configureTestContainer } from '../infrastructure/di/Container';

describe('ParsingService', () => {
  it('should parse buy commands correctly', async () => {
    const mockLLM = { parseNaturalLanguage: jest.fn() };
    const mockCache = { get: jest.fn(), set: jest.fn() };
    const mockLogger = { info: jest.fn(), debug: jest.fn() };
    
    const testContainer = configureTestContainer({
      ILLMAdapter: mockLLM,
      ICacheService: mockCache,
      ILogger: mockLogger
    });
    
    const parsingService = testContainer.resolve('IParsingService');
    // ... test implementation
  });
});
```

### Integration Testing

```typescript
// Example: Testing the trade orchestrator
import { TradeOrchestrator } from '../application/orchestrators/TradeOrchestrator';

describe('TradeOrchestrator Integration', () => {
  it('should execute complete trade workflow', async () => {
    // Use real dependencies or sophisticated mocks
    const result = await tradeOrchestrator.executeTrade('buy $100 AAPL');
    expect(result.success).toBe(true);
  });
});
```

## 🎛️ Configuration

### Environment Variables

All existing environment variables work with the layered architecture:
- `ALPACA_API_KEY`
- `ALPACA_SECRET_KEY`  
- `ALPACA_BASE_URL`
- `OPENAI_API_KEY`
- `NODE_ENV`
- `PORT`

### Dependency Injection Configuration

```typescript
// Custom service registration
container.registerSingleton('ICustomService', CustomService, ['IDependency']);

// Test configuration
const testContainer = configureTestContainer({
  IBrokerAdapter: mockBroker,
  ILLMAdapter: mockLLM
});
```

## 📈 Performance Benefits

The layered architecture provides several performance improvements:

1. **Smart Caching**: Multi-level caching with intelligent TTL
2. **Dependency Injection**: Efficient service reuse and lifecycle management
3. **Event-Driven Architecture**: Decoupled communication reduces bottlenecks
4. **Error Boundaries**: Failures in one layer don't cascade to others
5. **Resource Management**: Better connection pooling and resource cleanup

## 🚧 Future Enhancements

The layered architecture sets the foundation for future improvements:

### Short Term
- [ ] Add comprehensive unit and integration tests
- [ ] Implement real Redis cache service
- [ ] Add structured logging with correlation IDs
- [ ] Add API rate limiting and throttling

### Medium Term  
- [ ] Extract services into microservices
- [ ] Add event sourcing for trade history
- [ ] Implement CQRS for complex queries
- [ ] Add real-time risk monitoring

### Long Term
- [ ] Multi-broker support
- [ ] Advanced analytics and ML features
- [ ] Distributed caching with Redis Cluster
- [ ] GraphQL API layer

## 🤝 Contributing

When contributing to the layered architecture:

1. **Follow the layer boundaries**: Don't skip layers or create circular dependencies
2. **Use dependency injection**: Register all services in the DI container
3. **Write tests**: Each layer should have comprehensive tests
4. **Document interfaces**: Keep the core interfaces well-documented
5. **Error handling**: Use the appropriate error types for each layer

## 📚 Additional Resources

- [Domain-Driven Design Principles](https://martinfowler.com/bliki/DomainDrivenDesign.html)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [Dependency Injection Patterns](https://martinfowler.com/articles/injection.html)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)

---

The layered architecture provides a solid foundation for building scalable, maintainable trading applications. The clean separation of concerns makes it easy to understand, test, and extend the application as requirements evolve.