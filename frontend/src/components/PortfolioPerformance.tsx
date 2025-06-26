import { useState } from 'react'
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
import { format, parseISO, subDays } from 'date-fns'
import { TrendingUpIcon, TrendingDownIcon, CalendarIcon, PercentIcon } from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/utils'

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
  accountInfo: any
}

export function PortfolioPerformance({ accountInfo }: PortfolioPerformanceProps) {
  const [timeRange, setTimeRange] = useState<'1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'>('1M')
  const [chartType, setChartType] = useState<'value' | 'return' | 'comparison'>('value')

  // Mock data for demonstration - in production, this would come from the API
  const generateMockHistoricalData = (): PortfolioHistoryPoint[] => {
    const days = timeRange === '1W' ? 7 : timeRange === '1M' ? 30 : timeRange === '3M' ? 90 : 
                 timeRange === '6M' ? 180 : timeRange === '1Y' ? 365 : 730
    
    const data: PortfolioHistoryPoint[] = []
    const startPortfolio = accountInfo?.portfolioValue || 100000
    const startSP500 = 4500
    
    for (let i = days; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
      const randomPortfolioChange = (Math.random() - 0.5) * 0.02 // ±2% daily change
      const randomSP500Change = (Math.random() - 0.5) * 0.015 // ±1.5% daily change
      
      const portfolioValue = i === days ? startPortfolio : 
        data[data.length - 1].portfolioValue * (1 + randomPortfolioChange)
      
      const sp500Value = i === days ? startSP500 : 
        data[data.length - 1].sp500Value * (1 + randomSP500Change)
      
      const portfolioReturn = ((portfolioValue - startPortfolio) / startPortfolio) * 100
      const sp500Return = ((sp500Value - startSP500) / startSP500) * 100
      
      data.push({
        date,
        portfolioValue,
        sp500Value,
        portfolioReturn,
        sp500Return,
        dayPnL: i === days ? 0 : portfolioValue - data[data.length - 1]?.portfolioValue
      })
    }
    
    return data
  }

  const { data: historicalData = generateMockHistoricalData() } = useQuery({
    queryKey: ['portfolio-history', timeRange],
    queryFn: async () => {
      // In production, this would call an API endpoint
      // return apiService.getPortfolioHistory(timeRange)
      return generateMockHistoricalData()
    },
    staleTime: 60000, // Cache for 1 minute
  })

  // Calculate performance metrics
  const calculateMetrics = (): PerformanceMetrics => {
    if (!historicalData || historicalData.length === 0) {
      return {
        totalReturn: 0,
        totalReturnPercent: 0,
        sp500Return: 0,
        sp500ReturnPercent: 0,
        alpha: 0,
        volatility: 0,
        sharpeRatio: 0,
        maxDrawdown: 0
      }
    }

    const first = historicalData[0]
    const last = historicalData[historicalData.length - 1]
    
    const totalReturn = last.portfolioValue - first.portfolioValue
    const totalReturnPercent = (totalReturn / first.portfolioValue) * 100
    const sp500Return = last.sp500Value - first.sp500Value
    const sp500ReturnPercent = (sp500Return / first.sp500Value) * 100
    const alpha = totalReturnPercent - sp500ReturnPercent
    
    // Calculate volatility (simplified)
    const returns = historicalData.slice(1).map((point, i) => 
      (point.portfolioValue - historicalData[i].portfolioValue) / historicalData[i].portfolioValue
    )
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length
    const volatility = Math.sqrt(variance * 252) * 100 // Annualized
    
    // Calculate max drawdown
    let peak = first.portfolioValue
    let maxDrawdown = 0
    historicalData.forEach(point => {
      if (point.portfolioValue > peak) {
        peak = point.portfolioValue
      }
      const drawdown = ((peak - point.portfolioValue) / peak) * 100
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    })
    
    // Simplified Sharpe Ratio (assuming 2% risk-free rate)
    const riskFreeRate = 0.02
    const excessReturn = (totalReturnPercent / 100) - riskFreeRate
    const sharpeRatio = volatility > 0 ? (excessReturn / (volatility / 100)) : 0
    
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
  }

  const metrics = calculateMetrics()

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
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
    }
    return null
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
            <p className="text-sm text-gray-600">Track your portfolio value over time</p>
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