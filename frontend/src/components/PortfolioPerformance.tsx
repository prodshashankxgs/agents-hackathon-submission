import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart
} from 'recharts'
import { format, parseISO, isValid as isValidDate } from 'date-fns'
import { TrendingUpIcon, TrendingDownIcon, CalendarIcon, PercentIcon } from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { apiService } from '@/lib/api'

interface PortfolioHistoryPoint {
  date: string
  portfolioValue: number
  sp500Value: number
  portfolioReturn: number
  sp500Return: number
  dayPnL?: number
}

interface PerformanceMetrics {
  totalReturn: number
  totalReturnPercent: number
  sp500Return: number
  sp500ReturnPercent: number
  alpha: number
  volatility: number
  sharpeRatio: number
  maxDrawdown: number
}

interface PortfolioPerformanceProps {
  accountInfo?: any
}

export function PortfolioPerformance({ accountInfo }: PortfolioPerformanceProps) {
  const [timeRange, setTimeRange] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'>('1M')
  const [chartType, setChartType] = useState<'value' | 'return' | 'comparison'>('value')
  const [accountCreationDate, setAccountCreationDate] = useState<Date | null>(null)

  // Get account creation date for better period handling
  useEffect(() => {
    const fetchAccountCreationDate = async () => {
      try {
        if (accountInfo?.createdAt) {
          setAccountCreationDate(new Date(accountInfo.createdAt))
        } else {
          // Try to get account info if not provided
          const info = await apiService.getAccountInfo()
          if (info && (info as any).createdAt) {
            setAccountCreationDate(new Date((info as any).createdAt))
          }
        }
      } catch (error) {
        console.warn('Could not fetch account creation date:', error)
      }
    }
    
    fetchAccountCreationDate()
  }, [accountInfo])

  // Convert timeframe based on period for better granularity
  const getTimeframe = (range: string) => {
    switch (range) {
      case '1W':
        return '1H' // Hourly data for 1 week
      case '1M':
        return '1D' // Daily data for 1 month
      case '3M':
      case '6M':
        return '1D' // Daily data for 3-6 months
      case '1Y':
        return '1D' // Daily data for 1 year
      case 'ALL':
        return '1D' // Daily data for all time
      default:
        return '1D'
    }
  }

  // Check if the requested period is longer than account age
  const shouldFallbackToAll = (range: string): boolean => {
    if (range === 'ALL') return false
    
    // If we don't have account creation date, we should still try to be smart about it
    // by checking if the requested period would likely be longer than a new account
    if (!accountCreationDate) {
      console.log(`No account creation date available, checking if ${range} should fallback based on current date`)
      // For very new accounts (like yours created today), assume we need fallback for all non-ALL periods
      return true
    }
    
    const now = new Date()
    const accountAge = Math.floor((now.getTime() - accountCreationDate.getTime()) / (1000 * 60 * 60 * 24))
    
    console.log(`Account age: ${accountAge} days, checking if ${range} needs fallback`)
    
    switch (range) {
      case '1W': return accountAge < 7
      case '1M': return accountAge < 30
      case '3M': return accountAge < 90
      case '6M': return accountAge < 180
      case '1Y': return accountAge < 365
      default: return false
    }
  }

  // Transform Alpaca data to our format with better error handling
  const transformAlpacaData = (alpacaData: any): PortfolioHistoryPoint[] => {
    try {
      if (!alpacaData || typeof alpacaData !== 'object') {
        console.warn('Invalid alpacaData:', alpacaData)
        return []
      }

      const { timestamp, equity, profit_loss_pct } = alpacaData
      
      if (!timestamp || !Array.isArray(timestamp) || timestamp.length === 0) {
        console.warn('No timestamp data available')
        return []
      }

      if (!equity || !Array.isArray(equity) || equity.length === 0) {
        console.warn('No equity data available')
        return []
      }

      if (!profit_loss_pct || !Array.isArray(profit_loss_pct)) {
        console.warn('No profit_loss_pct data available')
        return []
      }

      const data: PortfolioHistoryPoint[] = []
      const minLength = Math.min(timestamp.length, equity.length, profit_loss_pct.length)
      
      // For S&P 500 comparison, we'll simulate it for now
      const startSP500 = 4500
      
      for (let i = 0; i < minLength; i++) {
        try {
          // Validate timestamp
          const timestampValue = timestamp[i]
          if (!timestampValue || isNaN(timestampValue)) {
            console.warn(`Invalid timestamp at index ${i}:`, timestampValue)
            continue
          }

          // Convert timestamp from seconds to date string
          const date = new Date(timestampValue * 1000)
          if (!isValidDate(date)) {
            console.warn(`Invalid date at index ${i}:`, date)
            continue
          }
          
          const dateString = date.toISOString().split('T')[0]
          
          // Validate equity value
          const equityValue = equity[i]
          if (equityValue === null || equityValue === undefined || isNaN(equityValue)) {
            console.warn(`Invalid equity value at index ${i}:`, equityValue)
            continue
          }
          
          // Calculate portfolio return percentage
          const portfolioReturn = (profit_loss_pct[i] || 0) * 100
          
          // Simulate S&P 500 data (in production, use real data)
          const sp500Return = portfolioReturn * 0.7 + (Math.random() - 0.5) * 2
          const sp500Value = startSP500 * (1 + sp500Return / 100)
          
          // Calculate day P&L
          const dayPnL = i > 0 ? equityValue - equity[i - 1] : 0
          
          data.push({
            date: dateString,
            portfolioValue: equityValue,
            sp500Value,
            portfolioReturn,
            sp500Return,
            dayPnL
          })
        } catch (error) {
          console.warn(`Error processing data point ${i}:`, error)
          continue
        }
      }
      
      return data.sort((a, b) => a.date.localeCompare(b.date))
    } catch (error) {
      console.error('Error transforming Alpaca data:', error)
      return []
    }
  }

  // Check if we're showing data from account inception
  const isShowingAccountInception = (data: PortfolioHistoryPoint[], selectedRange: string) => {
    if (data.length === 0) return false
    
    try {
      const firstDataPoint = new Date(data[0].date)
      const now = new Date()
      const daysDiff = Math.floor((now.getTime() - firstDataPoint.getTime()) / (1000 * 60 * 60 * 24))
      
      // If selected range is longer than available data, we're showing from inception
      switch (selectedRange) {
        case '1W': return daysDiff < 7
        case '1M': return daysDiff < 30
        case '3M': return daysDiff < 90
        case '6M': return daysDiff < 180
        case '1Y': return daysDiff < 365
        case 'ALL': return true // ALL always shows from inception
        default: return false
      }
    } catch (error) {
      console.warn('Error checking account inception:', error)
      return false
    }
  }

  // Get a user-friendly message about the data being shown
  const getDataMessage = () => {
    if (historicalData.length === 0) return null
    
    try {
      const firstDate = format(parseISO(historicalData[0].date), 'MMM dd, yyyy')
      const isFromInception = isShowingAccountInception(historicalData, timeRange)
      
      if (timeRange === 'ALL') {
        return {
          text: `Complete account history from ${firstDate}`,
          type: 'success' as const
        }
      } else if (isFromInception) {
        return {
          text: `Showing all available data from account inception (${firstDate})`,
          type: 'info' as const
        }
      }
      
      return null
    } catch (error) {
      console.warn('Error generating data message:', error)
      return null
    }
  }

  const { data: historicalData = [], isLoading, error } = useQuery({
    queryKey: ['portfolio-history', timeRange, accountCreationDate?.getTime()],
    queryFn: async () => {
      try {
        // Determine the effective period to request
        const shouldFallback = shouldFallbackToAll(timeRange)
        const effectivePeriod = shouldFallback ? 'ALL' : timeRange
        
        console.log(`Portfolio history request:`)
        console.log(`- Requested timeRange: ${timeRange}`)
        console.log(`- Should fallback to ALL: ${shouldFallback}`)
        console.log(`- Effective period: ${effectivePeriod}`)
        console.log(`- Account creation date: ${accountCreationDate ? accountCreationDate.toISOString() : 'Not available'}`)
        
        const alpacaData = await apiService.getPortfolioHistory(effectivePeriod, getTimeframe(effectivePeriod))
        const transformed = transformAlpacaData(alpacaData)
        
        console.log(`Received ${transformed.length} data points for ${effectivePeriod}`)
        
        // If we got no data, try again with 'ALL' period
        if (transformed.length === 0 && effectivePeriod !== 'ALL') {
          console.log(`No data for ${effectivePeriod}, trying with 'ALL' period as secondary fallback`)
          const fallbackData = await apiService.getPortfolioHistory('ALL', getTimeframe('ALL'))
          const fallbackTransformed = transformAlpacaData(fallbackData)
          console.log(`Secondary fallback returned ${fallbackTransformed.length} data points`)
          return fallbackTransformed
        }
        
        return transformed
      } catch (error) {
        console.error('Failed to fetch portfolio history:', error)
        
        // If the primary request failed and it wasn't for 'ALL', try with 'ALL'
        if (timeRange !== 'ALL') {
          try {
            console.log('Falling back to ALL period due to error')
            const fallbackData = await apiService.getPortfolioHistory('ALL', getTimeframe('ALL'))
            const fallbackTransformed = transformAlpacaData(fallbackData)
            console.log(`Error fallback returned ${fallbackTransformed.length} data points`)
            return fallbackTransformed
          } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError)
          }
        }
        
        // Return empty array on error to prevent crashes
        return []
      }
    },
    staleTime: 60000, // Cache for 1 minute
    retry: 1,
  })

  const dataMessage = getDataMessage()

  // Calculate performance metrics with better error handling
  const calculateMetrics = (): PerformanceMetrics => {
    const defaultMetrics: PerformanceMetrics = {
      totalReturn: 0,
      totalReturnPercent: 0,
      sp500Return: 0,
      sp500ReturnPercent: 0,
      alpha: 0,
      volatility: 0,
      sharpeRatio: 0,
      maxDrawdown: 0
    }

    try {
      if (!historicalData || historicalData.length === 0) {
        return defaultMetrics
      }

      // Need at least 2 data points for meaningful calculations
      if (historicalData.length < 2) {
        return defaultMetrics
      }

      const first = historicalData[0]
      const last = historicalData[historicalData.length - 1]
      
      // Validate data points
      if (!first || !last || 
          first.portfolioValue === null || first.portfolioValue === undefined ||
          last.portfolioValue === null || last.portfolioValue === undefined ||
          first.portfolioValue <= 0 || last.portfolioValue <= 0) {
        console.warn('Invalid portfolio values for metrics calculation')
        return defaultMetrics
      }
      
      const totalReturn = last.portfolioValue - first.portfolioValue
      const totalReturnPercent = (totalReturn / first.portfolioValue) * 100
      
      // S&P 500 calculations with validation
      const sp500Return = (last.sp500Value && first.sp500Value) ? 
        last.sp500Value - first.sp500Value : 0
      const sp500ReturnPercent = (last.sp500Value && first.sp500Value && first.sp500Value > 0) ? 
        (sp500Return / first.sp500Value) * 100 : 0
      
      const alpha = totalReturnPercent - sp500ReturnPercent
      
      // Calculate volatility (simplified) with error handling
      let volatility = 0
      let sharpeRatio = 0
      
      try {
        const returns = []
        for (let i = 1; i < historicalData.length; i++) {
          const prevValue = historicalData[i - 1].portfolioValue
          const currValue = historicalData[i].portfolioValue
          
          if (prevValue > 0 && currValue !== null && currValue !== undefined) {
            returns.push((currValue - prevValue) / prevValue)
          }
        }
        
        if (returns.length > 1) {
          const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
          const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length
          volatility = Math.sqrt(variance * 252) * 100 // Annualized
          
          // Simplified Sharpe Ratio (assuming 2% risk-free rate)
          const riskFreeRate = 0.02
          const excessReturn = (totalReturnPercent / 100) - riskFreeRate
          sharpeRatio = volatility > 0 ? (excessReturn / (volatility / 100)) : 0
        }
      } catch (error) {
        console.warn('Error calculating volatility/Sharpe ratio:', error)
      }
      
      // Calculate max drawdown with error handling
      let maxDrawdown = 0
      try {
        let peak = first.portfolioValue
        for (const point of historicalData) {
          if (point.portfolioValue > peak) {
            peak = point.portfolioValue
          }
          if (peak > 0) {
            const drawdown = ((peak - point.portfolioValue) / peak) * 100
            if (drawdown > maxDrawdown) {
              maxDrawdown = drawdown
            }
          }
        }
      } catch (error) {
        console.warn('Error calculating max drawdown:', error)
      }
      
      return {
        totalReturn,
        totalReturnPercent,
        sp500Return,
        sp500ReturnPercent,
        alpha,
        volatility,
        sharpeRatio,
        maxDrawdown
      }
    } catch (error) {
      console.error('Error calculating metrics:', error)
      return defaultMetrics
    }
  }

  const metrics = calculateMetrics()

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      try {
        return (
          <div className="bg-white p-4 rounded-lg shadow-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-600 mb-2">
              {format(parseISO(label), 'MMM dd, yyyy')}
            </p>
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center justify-between space-x-4">
                <span className="text-sm" style={{ color: entry.color }}>
                  {entry.name}:
                </span>
                <span className="text-sm font-semibold">
                  {chartType === 'value' ? 
                    formatCurrency(entry.value) : 
                    formatPercentage(entry.value)
                  }
                </span>
              </div>
            ))}
          </div>
        )
      } catch (error) {
        console.warn('Error rendering tooltip:', error)
        return null
      }
    }
    return null
  }

  // Handle loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-center mt-4 text-gray-600">Loading portfolio history...</p>
        </div>
      </div>
    )
  }

  // Handle error state
  if (error) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
          <div className="text-center">
            <p className="text-red-600 font-medium">Failed to load portfolio history</p>
            <p className="text-sm text-gray-500 mt-2">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Handle no data state
  if (historicalData.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
          <div className="text-center">
            <p className="text-gray-600 font-medium">No portfolio history available</p>
            <p className="text-sm text-gray-500 mt-2">
              Portfolio history will be available after your first trade or after some time has passed since account creation.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              New accounts may take up to 24 hours to show portfolio history data.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Performance Summary - Compact */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              {metrics.totalReturn >= 0 ? 
                <TrendingUpIcon className="w-3 h-3 text-green-500 mr-1" /> : 
                <TrendingDownIcon className="w-3 h-3 text-red-500 mr-1" />
              }
              <span className="text-xs text-gray-500 uppercase tracking-wide">Total Return</span>
            </div>
            <p className={`text-xl font-bold ${metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(metrics.totalReturn)}
            </p>
            <p className={`text-xs ${metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.totalReturn >= 0 ? '+' : ''}{formatPercentage(metrics.totalReturnPercent)}
            </p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <PercentIcon className="w-3 h-3 text-gray-400 mr-1" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">vs S&P 500</span>
            </div>
            <p className={`text-xl font-bold ${metrics.alpha >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.alpha >= 0 ? '+' : ''}{metrics.alpha.toFixed(2)}%
            </p>
            <p className="text-xs text-gray-500">Alpha</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <CalendarIcon className="w-3 h-3 text-gray-400 mr-1" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">Volatility</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{metrics.volatility.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">Annualized</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center mb-1">
              <TrendingDownIcon className="w-3 h-3 text-red-400 mr-1" />
              <span className="text-xs text-gray-500 uppercase tracking-wide">Max Drawdown</span>
            </div>
            <p className="text-xl font-bold text-red-600">-{metrics.maxDrawdown.toFixed(1)}%</p>
            <p className="text-xs text-gray-500">From Peak</p>
          </div>
        </div>
      </div>

      {/* Chart Controls */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 space-y-4 sm:space-y-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Portfolio Performance</h3>
            <div className="flex flex-col space-y-1">
              <p className="text-sm text-gray-600">Track your portfolio value over time</p>
              {dataMessage && (
                <p className={`text-xs px-2 py-1 rounded ${
                  dataMessage.type === 'success' 
                    ? 'text-green-600 bg-green-50' 
                    : 'text-blue-600 bg-blue-50'
                }`}>
                  {dataMessage.text}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-4">
            {/* Time Range Selector */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              {(['1W', '1M', '3M', '6M', '1Y', 'ALL'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    timeRange === range
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Chart Type Selector */}
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setChartType('value')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  chartType === 'value'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Value
              </button>
              <button
                onClick={() => setChartType('return')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  chartType === 'return'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Returns
              </button>
              <button
                onClick={() => setChartType('comparison')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  chartType === 'comparison'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Compare
              </button>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'value' ? (
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => format(parseISO(date), 'MMM dd')}
                  stroke="#9ca3af"
                />
                <YAxis 
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  stroke="#9ca3af"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="portfolioValue" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Portfolio"
                  dot={false}
                />
              </LineChart>
            ) : chartType === 'return' ? (
              <ComposedChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => format(parseISO(date), 'MMM dd')}
                  stroke="#9ca3af"
                />
                <YAxis 
                  tickFormatter={(value) => `${value}%`}
                  stroke="#9ca3af"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="portfolioReturn"
                  fill="#3b82f6"
                  fillOpacity={0.1}
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Portfolio Return"
                />
                <Line
                  type="monotone"
                  dataKey="sp500Return"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="S&P 500"
                  dot={false}
                />
              </ComposedChart>
            ) : (
              <LineChart data={historicalData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => format(parseISO(date), 'MMM dd')}
                  stroke="#9ca3af"
                />
                <YAxis 
                  tickFormatter={(value) => `${value}%`}
                  stroke="#9ca3af"
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="portfolioReturn" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  name="Portfolio"
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="sp500Return" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  name="S&P 500"
                  dot={false}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Performance Statistics - Compact */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">Performance Statistics</h3>
          <span className="text-xs text-gray-500">{timeRange} Period</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Sharpe Ratio</p>
            <p className="text-lg font-bold text-gray-900">{metrics.sharpeRatio.toFixed(2)}</p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Portfolio</p>
            <p className={`text-lg font-bold ${metrics.totalReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.totalReturnPercent >= 0 ? '+' : ''}{metrics.totalReturnPercent.toFixed(1)}%
            </p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">S&P 500</p>
            <p className={`text-lg font-bold ${metrics.sp500ReturnPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.sp500ReturnPercent >= 0 ? '+' : ''}{metrics.sp500ReturnPercent.toFixed(1)}%
            </p>
          </div>
          <div className="text-center p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Alpha</p>
            <p className={`text-lg font-bold ${metrics.alpha >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {metrics.alpha >= 0 ? '+' : ''}{metrics.alpha.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 