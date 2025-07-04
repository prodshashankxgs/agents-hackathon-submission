import { 
  DollarSignIcon, 
  TrendingUpIcon, 
  BarChart3Icon, 
  PieChartIcon,
  CalendarDaysIcon 
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
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
  if (!accountInfo) {
    return (
      <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <BarChart3Icon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Portfolio</h3>
        <p className="text-gray-600">Please wait while we fetch your account information...</p>
        
        {/* Loading skeleton */}
        <div className="mt-8 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg">
                <div className="skeleton h-4 w-20 mb-2"></div>
                <div className="skeleton h-8 w-16 mb-1"></div>
                <div className="skeleton h-3 w-24"></div>
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
      title: 'Total Portfolio Value',
      value: formatCurrency(accountInfo.portfolioValue),
      icon: DollarSignIcon,
      description: 'Current market value',
      color: 'text-gray-900',
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    {
      title: 'Available Buying Power',
      value: formatCurrency(accountInfo.buyingPower),
      icon: TrendingUpIcon,
      description: 'Cash available for trading',
      color: 'text-gray-900',
      bgColor: 'bg-green-100',
      iconColor: 'text-green-600'
    },
    {
      title: 'Unrealized P&L',
      value: formatCurrency(totalPnL),
      icon: BarChart3Icon,
      description: `${formatPercentage(totalPnLPercent)} total return`,
      color: totalPnL >= 0 ? 'text-green-600' : 'text-red-600',
      bgColor: totalPnL >= 0 ? 'bg-green-100' : 'bg-red-100',
      iconColor: totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
    },
    {
      title: 'Day Trades Used',
      value: `${accountInfo.dayTradeCount}/3`,
      icon: CalendarDaysIcon,
      description: 'Pattern day trade limit',
      color: accountInfo.dayTradeCount >= 3 ? 'text-red-600' : 'text-gray-900',
      bgColor: accountInfo.dayTradeCount >= 3 ? 'bg-red-100' : 'bg-gray-100',
      iconColor: accountInfo.dayTradeCount >= 3 ? 'text-red-600' : 'text-gray-600'
    }
  ]

  const positionBreakdown = accountInfo.positions.map(pos => ({
    symbol: pos.symbol,
    percentage: accountInfo.portfolioValue > 0 ? (pos.marketValue / accountInfo.portfolioValue) * 100 : 0,
    value: pos.marketValue,
    pnl: pos.unrealizedPnL
  })).sort((a, b) => b.percentage - a.percentage)

  // Prepare data for pie chart
  const pieChartData = positionBreakdown.slice(0, 8).map((position, index) => ({
    name: position.symbol,
    value: position.percentage,
    marketValue: position.value,
    pnl: position.pnl,
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
      color: '#9CA3AF'
    })
  }

  // Add cash position if there's available buying power
  if (accountInfo.buyingPower > 0) {
    const cashPercentage = accountInfo.portfolioValue > 0 ? (accountInfo.buyingPower / accountInfo.portfolioValue) * 100 : 0
    if (cashPercentage > 0.5) { // Only show if cash is more than 0.5% of portfolio
      pieChartData.push({
        name: 'Cash',
        value: cashPercentage,
        marketValue: accountInfo.buyingPower,
        pnl: 0,
        color: '#10B981'
      })
    }
  }

  // Color palette for positions (excluding green, which is reserved for cash)
  function getPositionColor(index: number): string {
    const colors = [
      '#3B82F6', // Blue
      '#EF4444', // Red
      '#F59E0B', // Amber
      '#8B5CF6', // Purple
      '#06B6D4', // Cyan
      '#F97316', // Orange
      '#EC4899', // Pink
      '#6366F1', // Indigo
    ]
    return colors[index % colors.length]
  }

  // Custom tooltip for pie chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900">{data.name}</p>
          <p className="text-sm text-gray-600">
            {formatPercentage(data.value)} of portfolio
          </p>
          <p className="text-sm font-medium text-gray-900">
            {formatCurrency(data.marketValue)}
          </p>
          {data.name !== 'Cash' && (
            <p className={`text-sm ${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              P&L: {data.pnl >= 0 ? '+' : ''}{formatCurrency(data.pnl)}
            </p>
          )}
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* Account Overview */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Portfolio Overview</h2>
            <p className="text-gray-600">Account ID: {accountInfo.accountId}</p>
          </div>
          <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            totalPnL >= 0 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {totalPnL >= 0 ? '+' : ''}{formatPercentage(totalPnLPercent)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {metrics.map((metric, index) => {
            const Icon = metric.icon
            return (
              <div 
                key={index} 
                className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-sm transition-shadow duration-200"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-600">{metric.title}</p>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${metric.bgColor}`}>
                    <Icon className={`w-4 h-4 ${metric.iconColor}`} />
                  </div>
                </div>
                <p className={`text-2xl font-bold ${metric.color}`}>
                  {metric.value}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {metric.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Portfolio Allocation with Pie Chart */}
      {accountInfo.positions.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <PieChartIcon className="w-5 h-5 mr-2 text-gray-600" />
              Portfolio Allocation
            </h3>
            <p className="text-sm text-gray-600">
              {accountInfo.positions.length} position{accountInfo.positions.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pie Chart */}
            <div className="flex flex-col items-center">
              <div className="w-full h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={120}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 mt-4 w-full max-w-sm">
                {pieChartData.map((entry) => (
                  <div key={entry.name} className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-xs text-gray-600 truncate">
                      {entry.name} ({formatPercentage(entry.value)})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Position Details */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-gray-900 mb-4">Position Details</h4>
              <div className="max-h-80 overflow-y-auto space-y-3">
                {positionBreakdown.slice(0, 10).map((position, index) => (
                  <div 
                    key={position.symbol} 
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                  >
                    <div className="flex items-center space-x-3">
                      <div 
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getPositionColor(index) }}
                      />
                      <div className="flex-shrink-0 w-8 h-8 bg-white rounded-full flex items-center justify-center border border-gray-200">
                        <span className="text-xs font-semibold text-gray-700">
                          {position.symbol.slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{position.symbol}</p>
                        <p className="text-xs text-gray-600">
                          {formatPercentage(position.percentage)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-semibold text-gray-900 text-sm">
                        {formatCurrency(position.value)}
                      </p>
                      <p className={`text-xs ${
                        position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                      </p>
                    </div>
                  </div>
                ))}

                {positionBreakdown.length > 10 && (
                  <div className="text-center py-2">
                    <p className="text-xs text-gray-500">
                      +{positionBreakdown.length - 10} more positions
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {accountInfo.positions.length === 0 && (
        <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <PieChartIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Positions</h3>
          <p className="text-gray-600">You don't have any positions yet. Start trading to see your portfolio allocation.</p>
        </div>
      )}
    </div>
  )
} 