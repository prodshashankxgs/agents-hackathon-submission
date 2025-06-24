# Natural Language Trading CLI

A command-line interface that allows you to execute stock trades using natural language commands. Simply type what you want to trade in plain English, and the CLI will parse your intent and execute the trade through Alpaca Markets.

## Features

- 🗣️ **Natural Language Processing**: Trade using conversational commands like "buy $100 worth of Apple"
- 🤖 **AI-Powered Intent Parsing**: Uses OpenAI to understand your trading intentions
- 📊 **Real-time Market Data**: Get current prices and validate trades before execution
- ✅ **Comprehensive Validation**: Checks account balance, position limits, and market hours
- 🛡️ **Safety First**: Confirmation prompts, spending limits, and paper trading mode
- 📈 **Account Management**: View your portfolio, positions, and buying power

## Prerequisites

- Node.js 18+ installed
- OpenAI API key
- Alpaca Markets account (paper trading recommended)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd natural-language-trading-cli
```

2. Install dependencies:
```bash
npm install
```

3. Copy the environment template and add your API keys:
```bash
cp env.example .env
```

4. Edit `.env` and add your credentials:
```
OPENAI_API_KEY=your_openai_api_key_here
ALPACA_API_KEY=your_alpaca_paper_trading_key_here
ALPACA_SECRET_KEY=your_alpaca_paper_trading_secret_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets
```

5. Build the TypeScript code:
```bash
npm run build
```

6. Link the CLI globally (optional):
```bash
npm link
```

## Usage

### Basic Trade Command

Execute a trade with natural language:

```bash
nltrade trade "buy 100 dollars of Microsoft"
nltrade trade "sell 50 shares of AAPL"
nltrade trade "buy 10 shares of Tesla at limit price 200"
```

### Interactive Mode

Start an interactive trading session:

```bash
nltrade interactive
```

### View Account Information

Check your account balance and positions:

```bash
nltrade account
```

### Dry Run Mode

Test trades without executing them:

```bash
nltrade trade "buy $500 of GOOGL" --dry-run
```

## Natural Language Examples

The CLI understands various ways to express trades:

- "Buy 100 dollars worth of Apple"
- "Purchase $500 of MSFT"
- "Sell 25 shares of Google"
- "Buy 10 Tesla shares at $200 limit"
- "Get rid of my 50 Amazon shares"
- "Invest $1000 in Microsoft stock"

## Safety Features

1. **Paper Trading Mode**: By default, uses Alpaca's paper trading API
2. **Confirmation Prompts**: Always asks for confirmation before executing
3. **Position Limits**: Configurable maximum position size (default: $500)
4. **Daily Spending Limits**: Maximum daily spending (default: $1000)
5. **Validation Checks**: 
   - Account balance verification
   - Market hours checking
   - Symbol validation
   - Price reasonability checks

## Configuration

Edit `.env` to customize limits:

```
MAX_DAILY_SPENDING=1000  # Maximum daily spending in dollars
MAX_POSITION_SIZE=500    # Maximum size per position in dollars
```

## Development

Run in development mode with hot reloading:

```bash
npm run dev
```

Type check without building:

```bash
npm run type-check
```

Clean build artifacts:

```bash
npm run clean
```

## Project Structure

```
src/
├── cli/           # CLI interface and commands
├── llm/           # OpenAI integration for parsing
├── trading/       # Trade validation logic
├── brokers/       # Alpaca API integration
├── config/        # Configuration management
└── types/         # TypeScript type definitions
```

## Error Handling

The CLI provides clear error messages for common issues:

- Missing API keys
- Invalid symbols
- Insufficient funds
- Market closed
- Network errors

## ⚠️ Important Notes

1. **Start with Paper Trading**: Always test with Alpaca's paper trading API first
2. **API Costs**: OpenAI API calls incur costs (~$0.01-0.03 per trade command)
3. **Market Hours**: Some trades may be queued if markets are closed
4. **Rate Limits**: Be aware of API rate limits for both OpenAI and Alpaca

## Troubleshooting

### "Missing required environment variable"
- Ensure `.env` file exists with all required API keys

### "Invalid symbol"
- Check that the stock symbol is correct and tradable on Alpaca

### "Insufficient buying power"
- Your paper trading account may need more funds
- Reset your paper account on Alpaca's dashboard

### TypeScript errors
- Run `npm run type-check` to see detailed errors
- Ensure you're using Node.js 18+