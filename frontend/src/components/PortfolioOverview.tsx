import { useState } from 'react'
import { 
  DollarSignIcon, 
  TrendingUpIcon, 
  BarChart3Icon, 
  PieChartIcon,
  CalendarDaysIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ActivityIcon,
  WalletIcon,
  ShieldIcon,
  EyeIcon,
  EyeOffIcon
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from 'recharts'
import { formatCurrency, formatPercentage } from '@/lib/utils'

interface AccountInfo {
  accountId: string
  buyingPower: number
  portfolioValue: number
  dayTradeCount: number
  positions: Array<{
    symbol: string
    quantity: number
    marketValue: number
    costBasis: number
    unrealizedPnL: number
    side: 'long' | 'short'
  }>
}

interface PortfolioOverviewProps {
  accountInfo: AccountInfo | undefined
}

export function PortfolioOverview({ accountInfo }: PortfolioOverviewProps) {
  const [showValues, setShowValues] = useState(true)
  const [selectedMetric, setSelectedMetric] = useState<number | null>(null)

  if (!accountInfo) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-2xl flex items-center justify-center">
          <BarChart3Icon className="w-10 h-10 text-gray-400 animate-pulse" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">Loading Portfolio</h3>
        <p className="text-gray-500">Fetching your account information...</p>
        
        {/* Modern loading skeleton */}
        <div className="mt-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="brokerage-card p-6">
                <div className="skeleton h-4 w-24 mb-3 rounded"></div>
                <div className="skeleton h-8 w-32 mb-2 rounded"></div>
                <div className="skeleton h-3 w-20 rounded"></div>
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

  const positionBreakdown = accountInfo.positions.map(pos => ({
    symbol: pos.symbol,
    percentage: accountInfo.portfolioValue > 0 ? (pos.marketValue / accountInfo.portfolioValue) * 100 : 0,
    value: pos.marketValue,
    pnl: pos.unrealizedPnL,
    pnlPercent: pos.costBasis > 0 ? (pos.unrealizedPnL / pos.costBasis) * 100 : 0
  })).sort((a, b) => b.percentage - a.percentage)

  // Prepare data for pie chart with modern colors
  const pieChartData = positionBreakdown.slice(0, 8).map((position, index) => ({
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
    
    pieChartData.push({
      name: 'Others',
      value: othersPercentage,
      marketValue: othersValue,
      pnl: othersPnL,
      pnlPercent: 0,
      color: '#9CA3AF'
    })
  }

  // Add cash position if there's available buying power
  if (accountInfo.buyingPower > 0) {
    const cashPercentage = accountInfo.portfolioValue > 0 ? (accountInfo.buyingPower / accountInfo.portfolioValue) * 100 : 0
    if (cashPercentage > 0.5) {
      pieChartData.push({
        name: 'Cash',
        value: cashPercentage,
        marketValue: accountInfo.buyingPower,
        pnl: 0,
        pnlPercent: 0,
        color: '#10B981'
      })
    }
  }

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

  // Mock performance data for area chart
  const performanceData = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    value: accountInfo.portfolioValue * (1 + (Math.random() - 0.5) * 0.02 * (i / 30))
  }))

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
            {data.name !== 'Cash' && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">P&L:</span>
                <span className={`font-medium ${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl)} ({formatPercentage(data.pnlPercent)})
                </span>
              </div>
            )}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* Modern Account Header */}
      <div className="brokerage-card p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-white opacity-50" />
        
        <div className="relative">
          <div className="flex items-start justify-between mb-8">
            <div>
              <h2 className="text-3xl font-semibold text-gray-900 tracking-tight mb-2">Portfolio Overview</h2>
              <div className="flex items-center space-x-4">
                <p className="text-gray-500 font-medium">Account: {accountInfo.accountId}</p>
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
            <div className={`flex items-center space-x-2 px-4 py-2 rounded-full ${
              totalPnL >= 0 
                ? 'bg-green-100 text-green-700' 
                : 'bg-red-100 text-red-700'
            }`}>
              {totalPnL >= 0 ? (
                <ArrowUpIcon className="w-4 h-4" />
              ) : (
                <ArrowDownIcon className="w-4 h-4" />
              )}
              <span className="font-semibold">{formatPercentage(totalPnLPercent)}</span>
              <span className="text-sm">Today</span>
            </div>
          </div>

          {/* Modern Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {metrics.map((metric, index) => {
              const Icon = metric.icon
              const isSelected = selectedMetric === index
              return (
                <div 
                  key={index}
                  className={`metric-card group cursor-pointer ${isSelected ? 'ring-2 ring-gray-900' : ''}`}
                  onClick={() => setSelectedMetric(isSelected ? null : index)}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl transition-all duration-300 ${
                      isSelected ? 'bg-gray-900' : 'bg-gray-100 group-hover:bg-gray-200'
                    }`}>
                      <Icon className={`w-5 h-5 transition-colors duration-300 ${
                        isSelected ? 'text-white' : `text-${metric.accentColor}-600`
                      }`} />
                    </div>
                    {metric.trend && (
                      <div className={`flex items-center space-x-1 text-xs font-medium ${
                        metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {metric.trend === 'up' ? (
                          <ArrowUpIcon className="w-3 h-3" />
                        ) : (
                          <ArrowDownIcon className="w-3 h-3" />
                        )}
                        <span>{metric.trendValue}</span>
                      </div>
                    )}
                    {metric.showWarning && (
                      <ShieldIcon className="w-4 h-4 text-red-600 animate-pulse" />
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

      {/* Portfolio Performance Chart */}
      <div className="brokerage-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center">
            <ActivityIcon className="w-5 h-5 mr-2 text-gray-600" />
            30-Day Performance
          </h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-500">Current:</span>
            <span className="text-sm font-semibold text-gray-900">
              {showValues ? formatCurrency(accountInfo.portfolioValue) : '••••••'}
            </span>
          </div>
        </div>
        
        <div className="h-64 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={performanceData}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#000000" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#000000" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis 
                dataKey="day" 
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
              />
              <YAxis 
                stroke="#9ca3af"
                fontSize={12}
                tickLine={false}
                tickFormatter={(value) => showValues ? `$${(value / 1000).toFixed(0)}k` : '•••'}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value: any) => showValues ? formatCurrency(value) : '••••••'}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#000000" 
                fillOpacity={1} 
                fill="url(#colorValue)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Modern Portfolio Allocation */}
      {accountInfo.positions.length > 0 && (
        <div className="brokerage-card p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center">
              <PieChartIcon className="w-5 h-5 mr-2 text-gray-600" />
              Portfolio Allocation
            </h3>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                {accountInfo.positions.length} position{accountInfo.positions.length !== 1 ? 's' : ''}
              </span>
              <div className="badge bg-gray-100 text-gray-700 px-3 py-1">
                <ActivityIcon className="w-3 h-3 mr-1" />
                Live
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Modern Pie Chart */}
            <div className="flex flex-col items-center">
              <div className="w-full h-80 portfolio-chart-enter">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={80}
                      outerRadius={120}
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
              
              {/* Modern Legend */}
              <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-md">
                {pieChartData.slice(0, 6).map((entry, index) => (
                  <div 
                    key={entry.name} 
                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{entry.name}</p>
                      <p className="text-xs text-gray-500">{formatPercentage(entry.value)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modern Position List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Top Holdings</h4>
                <button className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors">
                  View All
                </button>
              </div>
              
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                {positionBreakdown.slice(0, 10).map((position, index) => (
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

                {positionBreakdown.length > 10 && (
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
      )}

      {/* Modern Empty State */}
      {accountInfo.positions.length === 0 && (
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
      )}
    </div>
  )
} 