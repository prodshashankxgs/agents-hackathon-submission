import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpIcon,
  ArrowDownIcon,
  XIcon,
  Maximize2,
  Minimize2,
  BarChart3,
  TrendingUp,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { apiService, type MarketData, tradingWS } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts'
import { format } from 'date-fns'

interface StockWidgetProps {
  symbol: string
  isOpen: boolean
  onClose: () => void
  onAddToPortfolio?: (symbol: string) => void
  className?: string
}

export function StockWidget({ symbol, isOpen, onClose, onAddToPortfolio, className = '' }: StockWidgetProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D')
  const [realtimeData, setRealtimeData] = useState<MarketData | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  
  const timeframes = [
    { label: '1D', value: '1D' },
    { label: '5D', value: '5D' },
    { label: '1M', value: '1M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' }
  ]

  // Stock details query
  const { data: stockDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ['stock-details', symbol],
    queryFn: () => apiService.getTickerInfo(symbol),
    refetchInterval: 10000,
    enabled: isOpen
  })

  // Historical data query
  const { data: historicalData, isLoading: isLoadingChart, error: chartError } = useQuery({
    queryKey: ['stock-history', symbol, selectedTimeframe],
    queryFn: async () => {
      try {
        console.log(`Fetching historical data for ${symbol}, timeframe: ${selectedTimeframe}`)
        const result = await apiService.getHistoricalData(symbol, selectedTimeframe, '1H')
        console.log('Historical data result:', result)
        return result.data || []
      } catch (error) {
        console.error('Error fetching historical data:', error)
        return []
      }
    },
    refetchInterval: 30000,
    retry: 1,
    enabled: isOpen
  })

  // Real-time WebSocket subscription
  useEffect(() => {
    if (tradingWS && symbol && isOpen) {
      const upperSymbol = symbol.toUpperCase()
      console.log(`Subscribing to real-time data for ${upperSymbol}`)
      
      // Try to connect and subscribe
      tradingWS.connect().then(() => {
        console.log('WebSocket connected, subscribing to', upperSymbol)
        tradingWS.subscribe(upperSymbol, (data: MarketData) => {
          console.log('Received real-time data:', data)
          setRealtimeData(data)
        })
      }).catch(error => {
        console.error('WebSocket connection failed:', error)
        // Fallback: try to subscribe anyway in case it's already connected
        tradingWS.subscribe(upperSymbol, (data: MarketData) => {
          console.log('Received real-time data:', data)
          setRealtimeData(data)
        })
      })
      
      return () => {
        // Cleanup subscription if needed
        console.log(`Unsubscribing from ${upperSymbol}`)
      }
    }
  }, [symbol, isOpen])

  // Get current market data
  const marketData = realtimeData || stockDetails?.marketData
  const currentPrice = marketData?.currentPrice || 0
  const previousClose = marketData?.previousClose || currentPrice
  const priceChange = currentPrice - previousClose
  const priceChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0
  const isPositive = priceChange >= 0

  // Debug logging
  useEffect(() => {
    console.log('Stock details:', stockDetails)
    console.log('Realtime data:', realtimeData)
    console.log('Market data:', marketData)
  }, [stockDetails, realtimeData, marketData])

  // Transform historical data for chart
  const chartData = historicalData?.map((point: any) => ({
    date: point.date || point.timestamp,
    price: point.close || point.price,
    volume: point.volume
  })) || []

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900">
            {format(new Date(label), selectedTimeframe === '1D' ? 'HH:mm' : 'MMM dd')}
          </p>
          <p className="text-sm text-gray-600">
            Price: <span className="font-medium">{formatCurrency(data.price)}</span>
          </p>
        </div>
      )
    }
    return null
  }

  if (!isOpen) return null

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              {symbol} Stock Information
            </h3>
          </div>
          <Badge variant="outline" className="text-xs">
            Live
          </Badge>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            <XIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={`p-4 space-y-4 ${isExpanded ? 'min-h-[600px]' : 'min-h-[400px]'}`}>
        {/* Price Header */}
        {isLoadingDetails ? (
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-32 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-48"></div>
          </div>
        ) : (
          <div>
            <h4 className="text-sm text-gray-600 mb-1">
              {stockDetails?.info?.name || `${symbol} Inc.`}
            </h4>
            <div className="flex items-baseline space-x-3">
              <span className="text-2xl font-light text-gray-900">
                {formatCurrency(currentPrice)}
              </span>
              <div className={`flex items-center space-x-1 text-sm ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {isPositive ? (
                  <ArrowUpIcon className="w-4 h-4" />
                ) : (
                  <ArrowDownIcon className="w-4 h-4" />
                )}
                <span className="font-medium">
                  {isPositive ? '+' : ''}{priceChangePercent.toFixed(2)}%
                </span>
                <span>
                  ({isPositive ? '+' : ''}{formatCurrency(Math.abs(priceChange))})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Timeframe Selection */}
        <div className="flex space-x-1">
          {timeframes.map((timeframe) => (
            <Button
              key={timeframe.value}
              variant={selectedTimeframe === timeframe.value ? "default" : "ghost"}
              size="sm"
              onClick={() => setSelectedTimeframe(timeframe.value)}
              className="px-3 py-1 text-xs"
            >
              {timeframe.label}
            </Button>
          ))}
        </div>

        {/* Chart */}
        <div className={`bg-gray-50 rounded-lg p-4 ${isExpanded ? 'h-96' : 'h-48'}`}>
          {isLoadingChart ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Loading chart...</p>
              </div>
            </div>
          ) : chartError ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-600 font-medium">Chart Error</p>
                <p className="text-xs text-gray-500 mt-1 max-w-sm">
                  {chartError instanceof Error ? chartError.message : 'Failed to load historical data'}
                </p>
              </div>
            </div>
          ) : !chartData || chartData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <BarChart3 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No data available</p>
                <p className="text-xs text-gray-400">No historical data for this timeframe</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(date) => {
                    try {
                      return format(new Date(date), selectedTimeframe === '1D' ? 'HH:mm' : 'MMM dd')
                    } catch {
                      return date
                    }
                  }}
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                />
                <YAxis 
                  domain={['dataMin - 0.01', 'dataMax + 0.01']}
                  tickFormatter={(value) => formatCurrency(value)}
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#3b82f6" 
                  strokeWidth={2}
                  dot={false}
                  fill="url(#colorPrice)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Action Buttons */}
        {isExpanded && (
          <div className="flex space-x-3 pt-2">
            <Button 
              onClick={() => onAddToPortfolio?.(symbol)}
              className="flex-1"
              size="sm"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Add to Portfolio
            </Button>
            <Button 
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => {
                // Could open full trading interface
                console.log(`Trade ${symbol}`)
              }}
            >
              Trade {symbol}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default StockWidget 