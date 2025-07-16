import { useState, useMemo } from 'react'
import { 
  DollarSignIcon, 
  TrendingUpIcon, 
  BarChart3Icon, 
  PieChartIcon,
  CalendarDaysIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ActivityIcon,
  EyeIcon,
  EyeOffIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilterIcon,
  DownloadIcon,
  MoreVerticalIcon,
  MinusIcon,
  TrendingDownIcon,
  WalletIcon
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { usePositionSorting } from '../hooks/usePositionSorting'
import type { AccountInfo } from '../lib/api'


interface PortfolioOverviewProps {
  accountInfo: AccountInfo | undefined
}


export function PortfolioOverview({ accountInfo }: PortfolioOverviewProps) {
  const [showValues, setShowValues] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<number | null>(null)
  const { sortedPositions, sortConfig, handleSort } = usePositionSorting(accountInfo?.positions || [])
  const [selectedPositions, setSelectedPositions] = useState<string[]>([])
  const [isTopHoldingsExpanded, setIsTopHoldingsExpanded] = useState(false)
  const [isAllPositionsExpanded, setIsAllPositionsExpanded] = useState(false)

  if (!accountInfo) {
    return (
      <div className="glass-card p-8 sm:p-12 text-center">
        <div className="w-16 sm:w-20 h-16 sm:h-20 mx-auto mb-4 sm:mb-6 bg-gray-100 rounded-2xl flex items-center justify-center">
          <BarChart3Icon className="w-8 sm:w-10 h-8 sm:h-10 text-gray-400 animate-pulse" />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Loading Portfolio</h3>
        <p className="text-sm sm:text-base text-gray-500">Fetching your account information...</p>
        
        {/* Modern loading skeleton */}
        <div className="mt-6 sm:mt-8 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="brokerage-card p-4 sm:p-6">
                <div className="skeleton h-3 sm:h-4 w-20 sm:w-24 mb-2 sm:mb-3 rounded"></div>
                <div className="skeleton h-6 sm:h-8 w-24 sm:w-32 mb-1.5 sm:mb-2 rounded"></div>
                <div className="skeleton h-2.5 sm:h-3 w-16 sm:w-20 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const totalPnL = accountInfo.positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)
  const totalCostBasis = accountInfo.positions.reduce((sum, pos) => sum + pos.costBasis, 0)
  const totalPnLPercent = totalCostBasis > 0 ? (totalPnL / totalCostBasis) * 100 : 0
  const totalValue = accountInfo.positions.reduce((sum, pos) => sum + pos.marketValue, 0)

  // Calculate position breakdown with memoization
  const positionBreakdown = useMemo(() => {
    if (!accountInfo || accountInfo.portfolioValue === 0) return []
    
    return accountInfo.positions.map(pos => ({
      symbol: pos.symbol,
      percentage: (pos.marketValue / accountInfo.portfolioValue) * 100,
      value: pos.marketValue,
      pnl: pos.unrealizedPnL,
      pnlPercent: pos.costBasis > 0 ? (pos.unrealizedPnL / pos.costBasis) * 100 : 0
    })).sort((a, b) => b.percentage - a.percentage)
  }, [accountInfo])

  const togglePositionSelection = (symbol: string) => {
    setSelectedPositions(prev => 
      prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    )
  }

  const metrics = [
    {
      title: 'Net Worth',
      value: formatCurrency(accountInfo.portfolioValue),
      icon: WalletIcon,
      description: 'Total portfolio value',
      trend: totalPnL >= 0 ? 'up' : 'down',
      trendValue: formatPercentage(totalPnLPercent),
      color: 'gray',
      accentColor: 'gray'
    },
    {
      title: 'Cash Balance',
      value: formatCurrency(accountInfo.buyingPower),
      icon: DollarSignIcon,
      description: 'Available for trading',
      color: 'green',
      accentColor: 'green'
    },
    {
      title: 'Unrealized P&L',
      value: formatCurrency(totalPnL),
      icon: totalPnL >= 0 ? TrendingUpIcon : BarChart3Icon,
      description: `${formatPercentage(totalPnLPercent)} return`,
      trend: totalPnL >= 0 ? 'up' : 'down',
      color: totalPnL >= 0 ? 'green' : 'red',
      accentColor: totalPnL >= 0 ? 'green' : 'red',
      isHighlighted: true
    },
    {
      title: 'Day Trades',
      value: `${accountInfo.dayTradeCount}/3`,
      icon: CalendarDaysIcon,
      description: 'PDT limit remaining',
      color: accountInfo.dayTradeCount >= 3 ? 'red' : 'gray',
      accentColor: accountInfo.dayTradeCount >= 3 ? 'red' : 'gray',
      showWarning: accountInfo.dayTradeCount >= 3
    }
  ]

  // Prepare data for pie chart with modern colors
  // Memoize expensive pie chart data calculation
  const pieChartData = useMemo(() => {
    if (!positionBreakdown.length) return []
    
    const chartData = positionBreakdown.slice(0, 8).map((position, index) => ({
      name: position.symbol,
      value: position.percentage,
      marketValue: position.value,
      pnl: position.pnl,
      pnlPercent: position.pnlPercent,
      color: getPositionColor(index)
    }))

    // If there are more than 8 positions, group the rest as "Others"
    if (positionBreakdown.length > 8) {
      const othersPercentage = positionBreakdown.slice(8).reduce((sum, pos) => sum + pos.percentage, 0)
      const othersValue = positionBreakdown.slice(8).reduce((sum, pos) => sum + pos.value, 0)
      const othersPnL = positionBreakdown.slice(8).reduce((sum, pos) => sum + pos.pnl, 0)
      
      chartData.push({
        name: 'Others',
        value: othersPercentage,
        marketValue: othersValue,
        pnl: othersPnL,
        pnlPercent: 0,
        color: '#9CA3AF'
      })
    }

    // Add cash position if there's available buying power
    if (accountInfo && accountInfo.buyingPower > 0) {
      const cashPercentage = accountInfo.portfolioValue > 0 ? (accountInfo.buyingPower / accountInfo.portfolioValue) * 100 : 0
      if (cashPercentage > 0) {
        chartData.push({
          name: 'Cash',
          value: cashPercentage,
          marketValue: accountInfo.buyingPower,
          pnl: 0,
          pnlPercent: 0,
          color: '#10B981'
        })
      }
    }
    
    return chartData
  }, [positionBreakdown, accountInfo?.buyingPower, accountInfo?.portfolioValue])

  // Rainbow color palette
  function getPositionColor(index: number): string {
    const colors = [
      '#FF6B6B', // Coral Red
      '#4ECDC4', // Turquoise
      '#45B7D1', // Sky Blue
      '#96CEB4', // Mint Green
      '#FFEAA7', // Warm Yellow
      '#DDA0DD', // Plum
      '#98D8C8', // Seafoam
      '#F7DC6F', // Golden Yellow
      '#BB8FCE', // Lavender
      '#85C1E9', // Light Blue
      '#F8C471', // Peach
      '#82E0AA', // Light Green
    ]
    return colors[index % colors.length]
  }

  // Custom tooltip for pie chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="glass-card p-4 min-w-[200px]">
          <p className="font-semibold text-gray-900 text-sm">{data.name}</p>
          <div className="space-y-1 mt-2">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Allocation:</span>
              <span className="font-medium">{formatPercentage(data.value)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Value:</span>
              <span className="font-medium">{formatCurrency(data.marketValue)}</span>
            </div>
            {data.pnl !== 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">P&L:</span>
                <span className={`font-medium ${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(data.pnl)} ({formatPercentage(data.pnlPercent)})
                </span>
              </div>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  if (accountInfo.positions.length === 0) {
    return (
      <div className="space-y-6">
        {/* Portfolio Metrics */}
        <div className="brokerage-card p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-white opacity-50" />
          <div className="relative">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-3xl font-semibold text-gray-900 tracking-tight">Portfolio Overview</h2>
                <p className="text-gray-500 mt-1">Your investment dashboard</p>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowValues(!showValues)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors group"
                >
                  {showValues ? (
                    <EyeIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                  ) : (
                    <EyeOffIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                  )}
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {metrics.map((metric, index) => {
                const Icon = metric.icon
                const isSelected = selectedMetric === index
                
                return (
                  <div 
                    key={metric.title}
                    className={`metric-card ${isSelected ? 'ring-2 ring-gray-200' : ''} hover-lift cursor-pointer transition-all duration-300`}
                    style={{ animationDelay: `${index * 100}ms` }}
                    onClick={() => setSelectedMetric(isSelected ? null : index)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl transition-all duration-300 ${
                        metric.isHighlighted 
                          ? metric.color === 'green' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                          : 'bg-gray-50 text-gray-600'
                      }`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      
                      {metric.showWarning && (
                        <div className="p-1.5 bg-red-50 rounded-lg">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                        {metric.title}
                      </p>
                      <p className={`text-2xl font-semibold transition-all duration-300 ${
                        metric.isHighlighted 
                          ? metric.color === 'green' ? 'text-green-600' : 'text-red-600'
                          : 'text-gray-900'
                      }`}>
                        {showValues ? metric.value : '••••••'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        {metric.description}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Empty State */}
        <div className="glass-card p-12 text-center">
          <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-3xl flex items-center justify-center">
            <PieChartIcon className="w-12 h-12 text-gray-400" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-900 mb-3">No Positions Yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Start trading to see your portfolio allocation and performance metrics.
          </p>
          <button className="brokerage-button mt-6">
            Make Your First Trade
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Portfolio Metrics */}
      <div className="brokerage-card p-4 sm:p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-white opacity-50" />
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 lg:mb-8 space-y-3 sm:space-y-0">
            <div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 tracking-tight">Portfolio Overview</h2>
              <p className="text-sm sm:text-base text-gray-500 mt-0.5 sm:mt-1">{accountInfo.positions.length} active position{accountInfo.positions.length !== 1 ? 's' : ''}</p>
            </div>
            
            <div className="flex items-center space-x-1.5 sm:space-x-2 lg:space-x-3">
              <button
                onClick={() => setShowValues(!showValues)}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors group"
              >
                {showValues ? (
                  <EyeIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 group-hover:text-gray-600" />
                ) : (
                  <EyeOffIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 group-hover:text-gray-600" />
                )}
              </button>
              <button className="hidden sm:block p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors group">
                <FilterIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 group-hover:text-gray-600" />
              </button>
              <button className="hidden sm:block p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors group">
                <DownloadIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 group-hover:text-gray-600" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
            {metrics.map((metric, index) => {
              const Icon = metric.icon
              const isSelected = selectedMetric === index
              
              return (
                <div 
                  key={metric.title}
                  className={`metric-card p-3 sm:p-4 lg:p-6 ${isSelected ? 'ring-2 ring-gray-200' : ''} hover-lift cursor-pointer transition-all duration-300`}
                  style={{ animationDelay: `${index * 100}ms` }}
                  onClick={() => setSelectedMetric(isSelected ? null : index)}
                >
                  <div className="flex items-start justify-between mb-2 sm:mb-3 lg:mb-4">
                    <div className={`p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl transition-all duration-300 ${
                      metric.isHighlighted 
                        ? metric.color === 'green' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                        : 'bg-gray-50 text-gray-600'
                    }`}>
                      <Icon className="w-3.5 sm:w-4 lg:w-5 h-3.5 sm:h-4 lg:h-5" />
                    </div>
                    
                    {metric.showWarning && (
                      <div className="p-1 sm:p-1.5 bg-red-50 rounded-lg">
                        <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-red-500 rounded-full animate-pulse" />
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5 sm:mb-1">
                      {metric.title}
                    </p>
                    <p className={`text-base sm:text-xl lg:text-2xl font-semibold transition-all duration-300 ${
                      metric.isHighlighted 
                        ? metric.color === 'green' ? 'text-green-600' : 'text-red-600'
                        : 'text-gray-900'
                    }`}>
                      {showValues ? metric.value : '••••••'}
                    </p>
                    <p className="hidden sm:block text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
                      {metric.description}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Portfolio Allocation */}
      <div className="brokerage-card p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 lg:mb-8 space-y-2 sm:space-y-0">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center">
            <PieChartIcon className="w-4 sm:w-5 h-4 sm:h-5 mr-1.5 sm:mr-2 text-gray-600" />
            Portfolio Allocation
          </h3>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <span className="text-xs sm:text-sm text-gray-500">
              {accountInfo.positions.length} position{accountInfo.positions.length !== 1 ? 's' : ''}
            </span>
            <div className="badge bg-gray-100 text-gray-700 px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm">
              <ActivityIcon className="w-2.5 sm:w-3 h-2.5 sm:h-3 mr-0.5 sm:mr-1" />
              Live
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
          {/* Modern Pie Chart */}
          <div className="flex flex-col items-center">
            <div className="w-full h-80 sm:h-96 lg:h-[28rem] portfolio-chart-enter">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={130}
                    paddingAngle={2}
                    dataKey="value"
                    animationBegin={0}
                    animationDuration={800}
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.color}
                        className="hover:opacity-80 transition-opacity cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Modern Position List */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h4 className="text-xs sm:text-sm font-semibold text-gray-900 uppercase tracking-wider">Top Holdings</h4>
              <button 
                onClick={() => setIsTopHoldingsExpanded(!isTopHoldingsExpanded)}
                className="flex items-center space-x-1 text-[10px] sm:text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
              >
                <span>{isTopHoldingsExpanded ? 'Collapse' : 'Expand'}</span>
                {isTopHoldingsExpanded ? (
                  <ChevronUpIcon className="w-3 h-3" />
                ) : (
                  <ChevronDownIcon className="w-3 h-3" />
                )}
              </button>
            </div>
            
            {/* Show only top 3 positions when collapsed, all when expanded */}
            <div className="space-y-1.5 sm:space-y-2 max-h-80 sm:max-h-96 overflow-y-auto custom-scrollbar pr-1 sm:pr-2">
              {positionBreakdown.slice(0, isTopHoldingsExpanded ? 10 : 3).map((position, index) => (
                <div 
                  key={position.symbol} 
                  className="brokerage-card p-4 hover-lift position-row-enter"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-1 h-8 rounded-full"
                        style={{ backgroundColor: getPositionColor(index) }}
                      />
                      <div>
                        <p className="font-semibold text-gray-900">{position.symbol}</p>
                        <p className="text-xs text-gray-500">
                          {formatPercentage(position.percentage)} of portfolio
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {showValues ? formatCurrency(position.value) : '••••••'}
                      </p>
                      <div className={`flex items-center justify-end space-x-1 text-xs ${
                        position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {position.pnl >= 0 ? (
                          <ArrowUpIcon className="w-3 h-3" />
                        ) : (
                          <ArrowDownIcon className="w-3 h-3" />
                        )}
                        <span className="font-medium">
                          {showValues 
                            ? `${position.pnl >= 0 ? '+' : ''}${formatCurrency(position.pnl)}`
                            : '••••'
                          }
                        </span>
                        <span>({formatPercentage(position.pnlPercent)})</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {!isTopHoldingsExpanded && positionBreakdown.length > 3 && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500">
                    +{positionBreakdown.length - 3} more positions
                  </p>
                </div>
              )}
              
              {isTopHoldingsExpanded && positionBreakdown.length > 10 && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-500">
                    +{positionBreakdown.length - 10} more positions
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Positions Table */}
      <div className="brokerage-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h3 className="text-lg font-semibold text-gray-900">All Positions</h3>
            <button 
              onClick={() => setIsAllPositionsExpanded(!isAllPositionsExpanded)}
              className="flex items-center space-x-1 text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
            >
              <span>{isAllPositionsExpanded ? 'Collapse' : 'Expand'}</span>
              {isAllPositionsExpanded ? (
                <ChevronUpIcon className="w-4 h-4" />
              ) : (
                <ChevronDownIcon className="w-4 h-4" />
              )}
            </button>
          </div>
          {selectedPositions.length > 0 && (
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-500">{selectedPositions.length} selected</span>
              <button className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Actions
              </button>
            </div>
          )}
        </div>
        
        {isAllPositionsExpanded && (
          <div className="overflow-x-auto">
            <table className="brokerage-table w-full">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="w-12 px-6 py-4">
                  <input 
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    checked={selectedPositions.length === accountInfo.positions.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPositions(accountInfo.positions.map(p => p.symbol))
                      } else {
                        setSelectedPositions([])
                      }
                    }}
                  />
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('symbol')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Symbol</span>
                    {sortConfig.field === 'symbol' && (
                      sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('quantity')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Quantity</span>
                    {sortConfig.field === 'quantity' && (
                      sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Price
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Price
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('marketValue')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Market Value</span>
                    {sortConfig.field === 'marketValue' && (
                      sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('unrealizedPnL')}
                >
                  <div className="flex items-center space-x-1">
                    <span>P&L</span>
                    {sortConfig.field === 'unrealizedPnL' && (
                      sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('costBasis')}
                >
                  <div className="flex items-center space-x-1">
                    <span>P&L %</span>
                    {sortConfig.field === 'costBasis' && (
                      sortConfig.direction === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedPositions.map((position, index) => {
                const avgPrice = position.costBasis / position.quantity
                const currentPrice = position.marketValue / position.quantity
                const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100
                const isPositive = position.unrealizedPnL > 0
                const isNeutral = position.unrealizedPnL === 0
                const isSelected = selectedPositions.includes(position.symbol)

                return (
                  <tr 
                    key={position.symbol}
                    className={`position-row-enter ${
                      isSelected ? 'bg-gray-50' : 'hover:bg-gray-50/50'
                    } transition-all duration-200`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox"
                        className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                        checked={isSelected}
                        onChange={() => togglePositionSelection(position.symbol)}
                      />
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center mr-3">
                          <span className="text-sm font-bold text-white">
                            {position.symbol.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {position.symbol}
                          </div>
                          <div className={`text-xs font-medium ${
                            position.side === 'long' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {position.side === 'long' ? 'LONG' : 'SHORT'}
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {position.quantity.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        shares
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {showValues ? formatCurrency(avgPrice) : '•••'}
                      </div>
                      <div className="text-xs text-gray-500">
                        cost basis
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {showValues ? formatCurrency(currentPrice) : '•••'}
                      </div>
                      <div className={`text-xs font-medium flex items-center ${
                        currentPrice > avgPrice ? 'text-green-600' : 
                        currentPrice < avgPrice ? 'text-red-600' : 
                        'text-gray-500'
                      }`}>
                        {currentPrice > avgPrice ? (
                          <ArrowUpIcon className="w-3 h-3 mr-0.5" />
                        ) : currentPrice < avgPrice ? (
                          <ArrowDownIcon className="w-3 h-3 mr-0.5" />
                        ) : null}
                        {formatPercentage(Math.abs(((currentPrice - avgPrice) / avgPrice) * 100))}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">
                        {showValues ? formatCurrency(position.marketValue) : '••••••'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatPercentage((position.marketValue / totalValue) * 100)} of total
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`flex items-center space-x-1 text-sm font-semibold ${
                        isPositive ? 'text-green-600' : isNeutral ? 'text-gray-600' : 'text-red-600'
                      }`}>
                        {isPositive ? (
                          <TrendingUpIcon className="w-4 h-4" />
                        ) : isNeutral ? (
                          <MinusIcon className="w-4 h-4" />
                        ) : (
                          <TrendingDownIcon className="w-4 h-4" />
                        )}
                        <span>
                          {showValues 
                            ? `${isPositive ? '+' : isNeutral ? '' : '-'}${formatCurrency(Math.abs(position.unrealizedPnL))}`
                            : '••••'
                          }
                        </span>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${
                        isPositive 
                          ? 'bg-green-100 text-green-700' 
                          : isNeutral 
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-red-100 text-red-700'
                      }`}>
                        {isPositive ? '+' : isNeutral ? '' : '-'}{formatPercentage(Math.abs(pnlPercent))}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors group">
                        <MoreVerticalIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            </table>
          </div>
        )}
        
        {!isAllPositionsExpanded && (
          <div className="px-6 py-8 text-center">
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto bg-gray-100 rounded-xl flex items-center justify-center">
                <BarChart3Icon className="w-6 h-6 text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  {accountInfo.positions.length} positions available
                </p>
                <p className="text-xs text-gray-500">
                  Click "Expand" to view detailed position information
                </p>
              </div>
              <div className="flex items-center justify-center space-x-4 text-xs text-gray-500">
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>{accountInfo.positions.filter(p => p.unrealizedPnL > 0).length} winners</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span>{accountInfo.positions.filter(p => p.unrealizedPnL < 0).length} losers</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modern Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="brokerage-card p-6 text-center hover-lift">
          <div className="w-14 h-14 mx-auto mb-4 bg-green-100 rounded-2xl flex items-center justify-center">
            <TrendingUpIcon className="w-7 h-7 text-green-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Winners</p>
          <p className="text-2xl font-semibold text-gray-900">
            {accountInfo.positions.filter(p => p.unrealizedPnL > 0).length}
          </p>
          <div className="mt-2 flex items-center justify-center space-x-1 text-sm text-green-600">
            <ArrowUpIcon className="w-3 h-3" />
            <span className="font-medium">
              {formatCurrency(accountInfo.positions.filter(p => p.unrealizedPnL > 0).reduce((sum, p) => sum + p.unrealizedPnL, 0))}
            </span>
          </div>
        </div>

        <div className="brokerage-card p-6 text-center hover-lift">
          <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-2xl flex items-center justify-center">
            <TrendingDownIcon className="w-7 h-7 text-red-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Losers</p>
          <p className="text-2xl font-semibold text-gray-900">
            {accountInfo.positions.filter(p => p.unrealizedPnL < 0).length}
          </p>
          <div className="mt-2 flex items-center justify-center space-x-1 text-sm text-red-600">
            <ArrowDownIcon className="w-3 h-3" />
            <span className="font-medium">
              {formatCurrency(Math.abs(accountInfo.positions.filter(p => p.unrealizedPnL < 0).reduce((sum, p) => sum + p.unrealizedPnL, 0)))}
            </span>
          </div>
        </div>

        <div className="brokerage-card p-6 text-center hover-lift">
          <div className="w-14 h-14 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
            <BarChart3Icon className="w-7 h-7 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Win Rate</p>
          <p className="text-2xl font-semibold text-gray-900">
            {Math.round((accountInfo.positions.filter(p => p.unrealizedPnL > 0).length / accountInfo.positions.length) * 100)}%
          </p>
          <div className="mt-2 text-sm text-gray-500">
            {accountInfo.positions.filter(p => p.unrealizedPnL > 0).length}/{accountInfo.positions.length} profitable
          </div>
        </div>
      </div>
    </div>
  )
} 