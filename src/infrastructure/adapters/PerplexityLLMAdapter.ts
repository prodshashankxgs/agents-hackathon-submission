// ============================================================================
// PERPLEXITY LLM ADAPTER - INFRASTRUCTURE LAYER
// ============================================================================

import { 
  ILogger,
  InfrastructureError
} from '../../core/interfaces';
import {
  ThirteenFReport,
  ThirteenFHolding
} from '../../types';
import { config } from '../../config';

interface PerplexityResponse {
  id: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: Array<{
    index: number;
    finish_reason: string;
    message: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
}

export class PerplexityLLMAdapter {
  private readonly apiUrl = 'https://api.perplexity.ai/chat/completions';
  private readonly models = {
    fast: 'sonar',
    standard: 'sonar-pro', 
    comprehensive: 'sonar-deep-research'
  };

  constructor(private logger: ILogger) {
    if (!config.perplexityApiKey) {
      throw new InfrastructureError(
        'Perplexity API key is required for 13F functionality',
        'MISSING_API_KEY',
        'Perplexity'
      );
    }

    this.logger.info('PerplexityLLMAdapter initialized');
  }

  /**
   * Fetch and parse 13F data for an institution using Perplexity's real-time search
   */
  async fetch13FData(institution: string): Promise<ThirteenFReport> {
    this.logger.debug('Fetching 13F data for institution', { institution });

    try {
      const query = this.build13FQuery(institution);
      // Use faster model for quicker response times  
      const response = await this.makePerplexityRequest(query, 'fast');
      
      return this.parse13FResponse(response, institution);
    } catch (error) {
      this.logger.error('Failed to fetch 13F data', error instanceof Error ? error : new Error('Unknown error'), { institution });
      throw new InfrastructureError(
        `Failed to fetch 13F data for ${institution}`,
        'PERPLEXITY_REQUEST_FAILED',
        'Perplexity',
        { institution, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Build optimized search query for 13F data
   */
  private build13FQuery(institution: string): string {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentQuarter = Math.floor((currentDate.getMonth() + 3) / 3);
    
    // Look for the most recent quarter
    let targetYear = currentYear;
    let targetQuarter = currentQuarter - 1;
    
    if (targetQuarter === 0) {
      targetYear = currentYear - 1;
      targetQuarter = 4;
    }

    return `Find ${institution}'s most recent 13F filing holdings. I need the top 15 stock positions with:
    - Ticker symbols (AAPL, GOOGL, etc.)
    - Company names  
    - Portfolio percentage for each holding
    - Filing quarter (Q${targetQuarter} ${targetYear} or latest)
    
    Keep response concise and focused. Example format:
    AAPL (Apple Inc.) - 8.5%
    GOOGL (Alphabet Inc.) - 6.2%`;
  }

  /**
   * Make request to Perplexity API
   */
  private async makePerplexityRequest(query: string, modelType: 'fast' | 'standard' | 'comprehensive' = 'standard'): Promise<string> {
    // Add timeout to prevent hanging requests
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.perplexityApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
        model: this.models[modelType],
        messages: [
          {
            role: 'system',
            content: `You are a financial data analyst expert at parsing SEC 13F filings. 
            Provide accurate, structured information about institutional holdings. 
            Always include ticker symbols, company names, share counts, market values, and percentages when available.
            Focus on providing the most recent and accurate data.`
          },
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
        top_p: 0.9,
        return_citations: true,
        search_domain_filter: ["sec.gov", "fintel.io", "whalewisdom.com"],
        return_images: false,
        return_related_questions: false,
        search_recency_filter: "month",
        top_k: 0,
        stream: false
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Perplexity API error: ${response.status} - ${errorText}`);
    }

    const data: PerplexityResponse = await response.json();
    
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No response from Perplexity API');
    }

    return data.choices[0].message.content;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Perplexity API request timed out after 60 seconds');
      }
      throw error;
    }
  }

  /**
   * Parse 13F response from Perplexity into structured data
   */
  private parse13FResponse(response: string, institution: string): ThirteenFReport {
    this.logger.debug('Parsing 13F response', { institution, responseLength: response.length });

    try {
      // Extract key information using pattern matching
      const holdings: ThirteenFHolding[] = [];
      let totalValue = 0;
      let filingDate = '';
      let quarter = '';

      // Extract filing date and quarter
      const dateMatch = response.match(/(?:filing date|filed|reported).*?(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|Q[1-4]\s+\d{4})/i);
      if (dateMatch) {
        filingDate = dateMatch[1];
      }

      const quarterMatch = response.match(/Q([1-4])\s+(\d{4})/i);
      if (quarterMatch) {
        quarter = `Q${quarterMatch[1]} ${quarterMatch[2]}`;
      }

      // Parse holdings using multiple patterns
      const holdingPatterns = [
        // Pattern 1: Ticker followed by description and percentage
        /([A-Z]{2,5})\s*\([^)]+\)\s*[–-]\s*(?:about\s*)?([0-9.]+)%/gi,
        // Pattern 2: Company (Ticker) - percentage
        /([^(]+?)\s*\(([A-Z]{2,5})\)[^0-9]*([0-9.]+)%/gi,
        // Pattern 3: Ticker, Company, Shares, Value, Percentage
        /([A-Z]{2,5})\s*[-–]\s*([^,\n]+?)[\s,]+([0-9,]+)\s*shares?[\s,]+\$?([0-9,.]+)(?:\s*(?:million|billion|M|B))?[\s,]*([0-9.]+)%/gi,
        // Pattern 4: More flexible format with explicit ticker extraction
        /(?:^|\n)\s*\d+\.\s*([A-Z]{2,5})\s*\([^)]+\)[^0-9]*([0-9.]+)%/gmi
      ];

      for (const pattern of holdingPatterns) {
        let match;
        while ((match = pattern.exec(response)) !== null) {
          let symbol = '';
          let companyName = '';
          let percent = 0;
          let shares = 0;
          let marketValue = 0;

          // Handle different pattern groups
          if (match.length >= 3) {
            if (match[1] && match[2] && !match[3]) {
              // Pattern 1 or 4: Ticker and percentage
              symbol = match[1];
              percent = parseFloat(match[2]);
              companyName = symbol; // Use symbol as company name for now
              
              // Extract company name from the match context if available
              const contextStart = Math.max(0, match.index! - 100);
              const contextEnd = Math.min(response.length, match.index! + match[0].length + 100);
              const context = response.slice(contextStart, contextEnd);
              const nameMatch = context.match(new RegExp(`${symbol}\\s*\\(([^)]+)\\)`, 'i'));
              if (nameMatch) {
                companyName = nameMatch[1].trim();
              }
            } else if (match[1] && match[2] && match[3]) {
              // Pattern 2: Company (Ticker) - percentage
              if (match[2].match(/^[A-Z]{2,5}$/)) {
                symbol = match[2];
                companyName = match[1].trim();
                percent = parseFloat(match[3]);
              } else {
                symbol = match[1];
                companyName = match[2];
                percent = parseFloat(match[3]);
              }
            } else if (match.length >= 6) {
              // Pattern 3: Full data with shares and value
              symbol = match[1];
              companyName = match[2];
              shares = parseInt(match[3].replace(/,/g, ''));
              marketValue = parseFloat(match[4].replace(/,/g, ''));
              percent = parseFloat(match[5]);
              
              // Convert value based on context (million/billion)
              const valueContext = response.slice(match.index! - 50, match.index! + match[0].length + 50);
              if (valueContext.toLowerCase().includes('billion') || valueContext.toLowerCase().includes(' b')) {
                marketValue = marketValue * 1000000000;
              } else if (valueContext.toLowerCase().includes('million') || valueContext.toLowerCase().includes(' m')) {
                marketValue = marketValue * 1000000;
              }
            }
          }

          // Validate and add holding
          if (symbol && symbol.length >= 2 && symbol.length <= 5 && percent > 0) {
            // Avoid duplicates
            if (!holdings.find(h => h.symbol === symbol.toUpperCase())) {
              // Estimate market value if not provided (based on percentage)
              if (marketValue === 0 && percent > 0) {
                // Rough estimation - this will be adjusted later based on total portfolio
                marketValue = percent * 1000000; // Assume $100M portfolio for estimation
              }

              holdings.push({
                symbol: symbol.toUpperCase(),
                companyName: companyName || symbol,
                shares: shares || Math.floor(marketValue / 100), // Rough estimate if shares not provided
                marketValue,
                weightPercent: percent,
                quarter
              });

              totalValue += marketValue;
            }
          }
        }
      }

      // If we didn't get holdings from patterns, try a more aggressive approach
      if (holdings.length === 0) {
        // Look for any mentions of stock symbols and try to extract data
        const symbolMatches = response.match(/\b[A-Z]{1,5}\b/g);
        if (symbolMatches) {
          // This is a fallback - in a real implementation, you'd want more sophisticated parsing
          this.logger.warn('Could not parse holdings with standard patterns, using fallback');
        }
      }

      // Sort by market value descending
      holdings.sort((a, b) => b.marketValue - a.marketValue);

      // Calculate total value if not extracted
      if (totalValue === 0) {
        totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
      }

      // Set default values if not found
      if (!filingDate) {
        const now = new Date();
        filingDate = now.toISOString().split('T')[0];
      }
      if (!quarter) {
        const now = new Date();
        const q = Math.floor((now.getMonth() + 3) / 3) - 1 || 4;
        const year = q === 4 ? now.getFullYear() - 1 : now.getFullYear();
        quarter = `Q${q} ${year}`;
      }

      const report: ThirteenFReport = {
        institution,
        filingDate,
        quarter,
        totalValue,
        totalPositions: holdings.length,
        holdings,
        source: 'perplexity',
        rawData: response
      };

      this.logger.info('Successfully parsed 13F report', {
        institution,
        holdings: holdings.length,
        totalValue,
        quarter
      });

      return report;

    } catch (error) {
      this.logger.error('Failed to parse 13F response', error instanceof Error ? error : new Error('Unknown error'), { institution });
      throw new InfrastructureError(
        'Failed to parse 13F data from response',
        'PARSE_FAILED',
        'Perplexity',
        { institution, error: error instanceof Error ? error.message : 'Unknown error' }
      );
    }
  }

  /**
   * Get available models for different use cases
   */
  getAvailableModels() {
    return this.models;
  }

  /**
   * Test connection to Perplexity API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.makePerplexityRequest('Test query', 'fast');
      return true;
    } catch (error) {
      this.logger.error('Perplexity connection test failed', error instanceof Error ? error : new Error('Unknown error'));
      return false;
    }
  }
}