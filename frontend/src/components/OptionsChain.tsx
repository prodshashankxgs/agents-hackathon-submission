import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Eye,
  EyeOff,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

/**
 * Advanced Options Chain Component
 * 
 * Features:
 * - Real-time options data with live updates
 * - Interactive table with advanced filtering
 * - Greeks visualization and heatmaps
 * - Strike price ladders with moneyness indicators
 * - Volume and open interest analysis
 * - Quick strategy builder integration
 * - Multi-expiration date support
 * - Mobile-responsive design
 */

interface OptionQuote {
  strike: number;
  callBid: number;
  callAsk: number;
  callLast: number;
  callVolume: number;
  callOpenInterest: number;
  callIV: number;
  callDelta: number;
  callGamma: number;
  callTheta: number;
  callVega: number;
  putBid: number;
  putAsk: number;
  putLast: number;
  putVolume: number;
  putOpenInterest: number;
  putIV: number;
  putDelta: number;
  putGamma: number;
  putTheta: number;
  putVega: number;
  intrinsicValue: number;
  timeValue: number;
  moneyness: 'ITM' | 'ATM' | 'OTM';
}

interface OptionsChainData {
  symbol: string;
  underlyingPrice: number;
  underlyingChange: number;
  underlyingChangePercent: number;
  expirationDates: string[];
  quotes: { [expiration: string]: OptionQuote[] };
  lastUpdated: Date;
  analytics?: {
    impliedVolatilityRank: number;
    putCallRatio: number;
    marketSentiment: 'bullish' | 'bearish' | 'neutral';
    liquidityScore: number;
    volatilitySurface?: any;
  };
}

interface FilterOptions {
  minVolume: number;
  minOpenInterest: number;
  maxStrike: number;
  minStrike: number;
  moneyness: ('ITM' | 'ATM' | 'OTM')[];
  showOnlyLiquid: boolean;
}

interface OptionsChainProps {
  symbol: string;
  onOptionSelect?: (option: OptionQuote, type: 'call' | 'put', expiration: string) => void;
  onStrategyBuilder?: (strikes: number[], expiration: string) => void;
  className?: string;
}

export const OptionsChain: React.FC<OptionsChainProps> = ({
  symbol,
  onOptionSelect,
  onStrategyBuilder,
  className = ''
}) => {
  // State management
  const [chainData, setChainData] = useState<OptionsChainData | null>(null);
  const [selectedExpiration, setSelectedExpiration] = useState<string>('');
  const [filters] = useState<FilterOptions>({
    minVolume: 0,
    minOpenInterest: 0,
    maxStrike: 0,
    minStrike: 0,
    moneyness: ['ITM', 'ATM', 'OTM'],
    showOnlyLiquid: false
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'strike' | 'volume' | 'openInterest' | 'iv'>('strike');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showGreeks, setShowGreeks] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedStrikes, setSelectedStrikes] = useState<number[]>([]);

  /**
   * Fetch enhanced options chain data with real-time analytics
   * Integrates with Phase 3 advanced market data APIs
   */
  const fetchOptionsChain = useCallback(async () => {
    if (!symbol) return;

    setIsLoading(true);
    setError(null);

    try {
      // Call Phase 3 enhanced options chain API
      const response = await fetch(`/api/advanced/market/options-chain/${symbol.toUpperCase()}${selectedExpiration ? `?expiration=${selectedExpiration}` : ''}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch options data: ${response.status} ${response.statusText}`);
      }

      const { success, data: enhancedChainData } = await response.json();
      
      if (!success || !enhancedChainData) {
        throw new Error('Invalid response from options chain API');
      }
      
      // Transform enhanced data for the UI
      const transformedData: OptionsChainData = {
        symbol: enhancedChainData.chain.symbol,
        underlyingPrice: enhancedChainData.chain.underlyingPrice,
        underlyingChange: enhancedChainData.marketConditions?.underlyingChange || 0,
        underlyingChangePercent: enhancedChainData.marketConditions?.underlyingChangePercent || 0,
        expirationDates: enhancedChainData.chain.expirationDates,
        quotes: enhancedChainData.chain.chains || {},
        lastUpdated: new Date(enhancedChainData.lastUpdated),
        // Enhanced analytics from Phase 3
        analytics: {
          impliedVolatilityRank: enhancedChainData.marketConditions?.ivPercentile || 0,
          putCallRatio: enhancedChainData.marketConditions?.volumeProfile?.putCallRatio || 1,
          marketSentiment: enhancedChainData.marketConditions?.marketSentiment || 'neutral',
          liquidityScore: enhancedChainData.marketConditions?.liquidityScore || 0,
          volatilitySurface: enhancedChainData.volatilitySurface
        }
      };
      
      setChainData(transformedData);
      
      // Set selected expiration if not set
      if (!selectedExpiration && enhancedChainData.chain.expirationDates && enhancedChainData.chain.expirationDates.length > 0) {
        setSelectedExpiration(enhancedChainData.chain.expirationDates[0]);
      }

    } catch (err) {
      console.error('Options chain fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch options data');
      // Clear data on error
      setChainData(null);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, selectedExpiration]);

  // Auto-refresh effect
  useEffect(() => {
    fetchOptionsChain();
    
    if (autoRefresh) {
      const interval = setInterval(fetchOptionsChain, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [fetchOptionsChain, autoRefresh]);

  // Filter and sort options quotes
  const filteredQuotes = useMemo(() => {
    if (!chainData || !selectedExpiration) return [];

    let quotes = chainData.quotes[selectedExpiration] || [];

    // Apply filters
    quotes = quotes.filter(quote => {
      if (filters.minVolume > 0 && Math.max(quote.callVolume, quote.putVolume) < filters.minVolume) return false;
      if (filters.minOpenInterest > 0 && Math.max(quote.callOpenInterest, quote.putOpenInterest) < filters.minOpenInterest) return false;
      if (filters.maxStrike > 0 && quote.strike > filters.maxStrike) return false;
      if (filters.minStrike > 0 && quote.strike < filters.minStrike) return false;
      if (!filters.moneyness.includes(quote.moneyness)) return false;
      if (filters.showOnlyLiquid && (quote.callBid === 0 || quote.putBid === 0)) return false;
      return true;
    });

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      quotes = quotes.filter(quote => 
        quote.strike.toString().includes(search)
      );
    }

    // Apply sorting
    quotes.sort((a, b) => {
      let aValue: number, bValue: number;
      
      switch (sortBy) {
        case 'volume':
          aValue = Math.max(a.callVolume, a.putVolume);
          bValue = Math.max(b.callVolume, b.putVolume);
          break;
        case 'openInterest':
          aValue = Math.max(a.callOpenInterest, a.putOpenInterest);
          bValue = Math.max(b.callOpenInterest, b.putOpenInterest);
          break;
        case 'iv':
          aValue = Math.max(a.callIV, a.putIV);
          bValue = Math.max(b.callIV, b.putIV);
          break;
        default:
          aValue = a.strike;
          bValue = b.strike;
      }

      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

    return quotes;
  }, [chainData, selectedExpiration, filters, searchTerm, sortBy, sortDirection]);

  // Calculate chain statistics
  const chainStats = useMemo(() => {
    if (!filteredQuotes.length) return null;

    const totalCallVolume = filteredQuotes.reduce((sum, q) => sum + q.callVolume, 0);
    const totalPutVolume = filteredQuotes.reduce((sum, q) => sum + q.putVolume, 0);
    const totalCallOI = filteredQuotes.reduce((sum, q) => sum + q.callOpenInterest, 0);
    const totalPutOI = filteredQuotes.reduce((sum, q) => sum + q.putOpenInterest, 0);
    const putCallRatio = totalCallVolume > 0 ? totalPutVolume / totalCallVolume : 0;

    return {
      totalCallVolume,
      totalPutVolume,
      totalCallOI,
      totalPutOI,
      putCallRatio,
      averageIV: filteredQuotes.reduce((sum, q) => sum + Math.max(q.callIV, q.putIV), 0) / filteredQuotes.length
    };
  }, [filteredQuotes]);

  // Handle option selection
  const handleOptionClick = (quote: OptionQuote, type: 'call' | 'put') => {
    if (onOptionSelect) {
      onOptionSelect(quote, type, selectedExpiration);
    }
  };

  // Handle strike selection for strategy building
  const handleStrikeSelect = (strike: number) => {
    setSelectedStrikes(prev => {
      const newSelected = prev.includes(strike) 
        ? prev.filter(s => s !== strike)
        : [...prev, strike].sort((a, b) => a - b);
      return newSelected;
    });
  };

  // Handle strategy builder
  const handleStrategyBuilder = () => {
    if (onStrategyBuilder && selectedStrikes.length > 0) {
      onStrategyBuilder(selectedStrikes, selectedExpiration);
    }
  };

  if (error) {
    return (
      <Card className={`${className} border-red-200`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-red-600">
            <AlertCircle className="h-5 w-5 mr-2" />
            <span>Error loading options chain: {error}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchOptionsChain}
              className="ml-4"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Options Chain - {symbol}</CardTitle>
              {chainData && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-4 text-sm text-gray-600">
                    <span className="font-medium">${chainData.underlyingPrice.toFixed(2)}</span>
                    <span className={`flex items-center ${chainData.underlyingChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {chainData.underlyingChange >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                      {chainData.underlyingChange.toFixed(2)} ({chainData.underlyingChangePercent.toFixed(2)}%)
                    </span>
                    <span className="text-xs">
                      Last updated: {chainData.lastUpdated.toLocaleTimeString()}
                    </span>
                  </div>
                  {chainData.analytics && (
                    <div className="flex items-center space-x-2">
                      <Badge 
                        variant={chainData.analytics.marketSentiment === 'bullish' ? 'default' : 
                                 chainData.analytics.marketSentiment === 'bearish' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {chainData.analytics.marketSentiment === 'bullish' ? '🐂 Bullish' : 
                         chainData.analytics.marketSentiment === 'bearish' ? '🐻 Bearish' : '➡️ Neutral'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        P/C: {chainData.analytics.putCallRatio.toFixed(2)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        IV Rank: {chainData.analytics.impliedVolatilityRank.toFixed(0)}%
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        Liquidity: {chainData.analytics.liquidityScore.toFixed(0)}/100
                      </Badge>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGreeks(!showGreeks)}
              >
                {showGreeks ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                Greeks
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
              >
                <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchOptionsChain}
                disabled={isLoading}
              >
                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Refresh'}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          {/* Controls */}
          <div className="flex flex-wrap gap-4 mb-4">
            {/* Expiration Dates */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Expiration Date</label>
              <select
                value={selectedExpiration}
                onChange={(e) => setSelectedExpiration(e.target.value)}
                className="w-full p-2 border rounded-md"
              >
                {chainData?.expirationDates.map(date => (
                  <option key={date} value={date}>
                    {new Date(date).toLocaleDateString()} ({getDaysToExpiration(date)} days)
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Search Strike</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Strike price..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Sort */}
            <div className="flex-1 min-w-[150px]">
              <label className="text-sm font-medium mb-2 block">Sort By</label>
              <select
                value={`${sortBy}-${sortDirection}`}
                onChange={(e) => {
                  const [by, direction] = e.target.value.split('-');
                  setSortBy(by as any);
                  setSortDirection(direction as any);
                }}
                className="w-full p-2 border rounded-md"
              >
                <option value="strike-asc">Strike ↑</option>
                <option value="strike-desc">Strike ↓</option>
                <option value="volume-desc">Volume ↓</option>
                <option value="openInterest-desc">Open Interest ↓</option>
                <option value="iv-desc">IV ↓</option>
              </select>
            </div>
          </div>

          {/* Chain Statistics */}
          {chainStats && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-sm text-gray-600">Call Volume</div>
                <div className="font-semibold">{chainStats.totalCallVolume.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600">Put Volume</div>
                <div className="font-semibold">{chainStats.totalPutVolume.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600">Call OI</div>
                <div className="font-semibold">{chainStats.totalCallOI.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600">Put OI</div>
                <div className="font-semibold">{chainStats.totalPutOI.toLocaleString()}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600">Put/Call Ratio</div>
                <div className="font-semibold">{chainStats.putCallRatio.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-600">Avg IV</div>
                <div className="font-semibold">{(chainStats.averageIV * 100).toFixed(1)}%</div>
              </div>
            </div>
          )}

          {/* Strategy Builder Controls */}
          {selectedStrikes.length > 0 && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">Selected Strikes: </span>
                  <span className="text-sm">{selectedStrikes.join(', ')}</span>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedStrikes([])}
                  >
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleStrategyBuilder}
                  >
                    Build Strategy
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Options Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <RefreshCw className="h-6 w-6 animate-spin mr-2" />
              <span>Loading options data...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-3 text-xs font-medium text-gray-500 uppercase text-center w-8"></th>
                    {/* Call Side Headers */}
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Vol</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">OI</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">IV</th>
                    {showGreeks && <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Δ</th>}
                    {showGreeks && <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Γ</th>}
                    {showGreeks && <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Θ</th>}
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Bid</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Ask</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Last</th>
                    
                    {/* Strike */}
                    <th className="px-4 py-3 text-xs font-medium text-gray-900 uppercase text-center bg-yellow-50 border-x">Strike</th>
                    
                    {/* Put Side Headers */}
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Last</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Bid</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Ask</th>
                    {showGreeks && <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Δ</th>}
                    {showGreeks && <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Γ</th>}
                    {showGreeks && <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Θ</th>}
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">IV</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">OI</th>
                    <th className="px-3 py-3 text-xs font-medium text-gray-500 uppercase text-center">Vol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredQuotes.map((quote) => (
                    <OptionsRow
                      key={quote.strike}
                      quote={quote}
                      underlyingPrice={chainData?.underlyingPrice || 0}
                      showGreeks={showGreeks}
                      isSelected={selectedStrikes.includes(quote.strike)}
                      onCallClick={() => handleOptionClick(quote, 'call')}
                      onPutClick={() => handleOptionClick(quote, 'put')}
                      onStrikeSelect={() => handleStrikeSelect(quote.strike)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Individual option row component
const OptionsRow: React.FC<{
  quote: OptionQuote;
  underlyingPrice: number;
  showGreeks: boolean;
  isSelected: boolean;
  onCallClick: () => void;
  onPutClick: () => void;
  onStrikeSelect: () => void;
}> = ({ quote, underlyingPrice, showGreeks, isSelected, onCallClick, onPutClick, onStrikeSelect }) => {
  const isATM = Math.abs(quote.strike - underlyingPrice) < 2.5;
  const callITM = quote.strike < underlyingPrice;
  const putITM = quote.strike > underlyingPrice;

  return (
    <tr className={`hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}>
      {/* Selection checkbox */}
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onStrikeSelect}
          className="rounded"
        />
      </td>
      
      {/* Call side */}
      <td className="px-3 py-2 text-sm text-center">{quote.callVolume.toLocaleString()}</td>
      <td className="px-3 py-2 text-sm text-center">{quote.callOpenInterest.toLocaleString()}</td>
      <td className="px-3 py-2 text-sm text-center">{(quote.callIV * 100).toFixed(1)}%</td>
      {showGreeks && <td className="px-3 py-2 text-sm text-center">{quote.callDelta.toFixed(3)}</td>}
      {showGreeks && <td className="px-3 py-2 text-sm text-center">{quote.callGamma.toFixed(3)}</td>}
      {showGreeks && <td className="px-3 py-2 text-sm text-center">{quote.callTheta.toFixed(3)}</td>}
      <td 
        className={`px-3 py-2 text-sm text-center cursor-pointer hover:bg-green-100 ${callITM ? 'bg-green-50' : ''}`}
        onClick={onCallClick}
      >
        {quote.callBid.toFixed(2)}
      </td>
      <td 
        className={`px-3 py-2 text-sm text-center cursor-pointer hover:bg-green-100 ${callITM ? 'bg-green-50' : ''}`}
        onClick={onCallClick}
      >
        {quote.callAsk.toFixed(2)}
      </td>
      <td 
        className={`px-3 py-2 text-sm text-center cursor-pointer hover:bg-green-100 ${callITM ? 'bg-green-50' : ''}`}
        onClick={onCallClick}
      >
        {quote.callLast.toFixed(2)}
      </td>
      
      {/* Strike */}
      <td className={`px-4 py-2 text-sm font-medium text-center border-x cursor-pointer ${
        isATM ? 'bg-yellow-100 text-yellow-800' : 'bg-yellow-50'
      }`} onClick={onStrikeSelect}>
        {quote.strike}
        {isATM && <Badge variant="secondary" className="ml-1 text-xs">ATM</Badge>}
      </td>
      
      {/* Put side */}
      <td 
        className={`px-3 py-2 text-sm text-center cursor-pointer hover:bg-red-100 ${putITM ? 'bg-red-50' : ''}`}
        onClick={onPutClick}
      >
        {quote.putLast.toFixed(2)}
      </td>
      <td 
        className={`px-3 py-2 text-sm text-center cursor-pointer hover:bg-red-100 ${putITM ? 'bg-red-50' : ''}`}
        onClick={onPutClick}
      >
        {quote.putBid.toFixed(2)}
      </td>
      <td 
        className={`px-3 py-2 text-sm text-center cursor-pointer hover:bg-red-100 ${putITM ? 'bg-red-50' : ''}`}
        onClick={onPutClick}
      >
        {quote.putAsk.toFixed(2)}
      </td>
      {showGreeks && <td className="px-3 py-2 text-sm text-center">{quote.putDelta.toFixed(3)}</td>}
      {showGreeks && <td className="px-3 py-2 text-sm text-center">{quote.putGamma.toFixed(3)}</td>}
      {showGreeks && <td className="px-3 py-2 text-sm text-center">{quote.putTheta.toFixed(3)}</td>}
      <td className="px-3 py-2 text-sm text-center">{(quote.putIV * 100).toFixed(1)}%</td>
      <td className="px-3 py-2 text-sm text-center">{quote.putOpenInterest.toLocaleString()}</td>
      <td className="px-3 py-2 text-sm text-center">{quote.putVolume.toLocaleString()}</td>
    </tr>
  );
};

function getDaysToExpiration(expiration: string): number {
  const now = new Date();
  const expiryDate = new Date(expiration);
  return Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default OptionsChain; 