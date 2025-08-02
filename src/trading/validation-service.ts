import { TradeIntent, TradeValidation, ValidationError } from '../types';
import { AlpacaAdapter } from '../brokers/alpaca-adapter';

export class ValidationService {
  constructor(private broker: AlpacaAdapter) {}

  /**
   * Perform comprehensive validation of a trade intent
   */
  async validateTrade(intent: TradeIntent): Promise<TradeValidation> {
    // First, get broker-specific validation
    const brokerValidation = await this.broker.validateOrder(intent);
    
    // Add additional application-level validations
    const additionalErrors: string[] = [];
    const additionalWarnings: string[] = [];
    
    // Validate symbol format
    if (!/^[A-Z]{1,5}$/.test(intent.symbol)) {
      additionalWarnings.push('Symbol format might be incorrect. Expected 1-5 uppercase letters.');
    }
    
    // Validate limit price logic
    if (intent.orderType === 'limit' && intent.limitPrice && brokerValidation.currentPrice) {
      if (intent.action === 'buy' && intent.limitPrice > brokerValidation.currentPrice * 1.1) {
        additionalWarnings.push('Limit buy price is more than 10% above current market price.');
      }
      if (intent.action === 'sell' && intent.limitPrice < brokerValidation.currentPrice * 0.9) {
        additionalWarnings.push('Limit sell price is more than 10% below current market price.');
      }
    }
    
    // Combine all validation results
    return {
      ...brokerValidation,
      errors: [...brokerValidation.errors, ...additionalErrors],
      warnings: [...brokerValidation.warnings, ...additionalWarnings]
    };
  }

  /**
   * Check if the trade meets minimum requirements
   */
  validateMinimumRequirements(intent: TradeIntent): void {
    if (intent.amount < 1) {
      throw new ValidationError('Trade amount must be at least $1 or 1 share');
    }
    
    if (intent.amountType === 'shares' && !Number.isInteger(intent.amount)) {
      throw new ValidationError('Share quantity must be a whole number');
    }
  }

  /**
   * Format validation results for display
   */
  formatValidationResults(validation: TradeValidation): string {
    const lines: string[] = [];
    
    if (validation.isValid) {
      lines.push('✅ Trade validation passed');
    } else {
      lines.push('❌ Trade validation failed');
    }
    
    if (validation.currentPrice) {
      lines.push(`Current price: $${validation.currentPrice.toFixed(2)}`);
    }
    
    if (validation.estimatedShares) {
      lines.push(`Estimated shares: ${validation.estimatedShares.toFixed(2)}`);
    }
    
    lines.push(`Estimated cost: $${validation.estimatedCost.toFixed(2)}`);
    lines.push(`Account balance: $${validation.accountBalance.toFixed(2)}`);
    
    if (validation.errors.length > 0) {
      lines.push('\nErrors:');
      validation.errors.forEach(error => lines.push(`  ❌ ${error}`));
    }
    
    if (validation.warnings.length > 0) {
      lines.push('\nWarnings:');
      validation.warnings.forEach(warning => lines.push(`  ⚠️  ${warning}`));
    }
    
    return lines.join('\n');
  }
} 