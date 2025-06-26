import { 
  DollarSignIcon, 
  TrendingUpIcon, 
  BarChart3Icon, 
  PieChartIcon,
  CalendarDaysIcon 
} from 'lucide-react'
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

      {/* Position Breakdown */}
      {accountInfo.positions.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <PieChartIcon className="w-5 h-5 mr-2 text-gray-600" />
              Position Allocation
            </h3>
            <p className="text-sm text-gray-600">
              {accountInfo.positions.length} position{accountInfo.positions.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="space-y-4">
            {positionBreakdown.slice(0, 10).map((position) => (
              <div 
                key={position.symbol} 
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-white rounded-full flex items-center justify-center border border-gray-200">
                    <span className="text-sm font-semibold text-gray-700">
                      {position.symbol.slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{position.symbol}</p>
                    <p className="text-sm text-gray-600">
                      {formatPercentage(position.percentage)} of portfolio
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    {formatCurrency(position.value)}
                  </p>
                  <p className={`text-sm ${
                    position.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {position.pnl >= 0 ? '+' : ''}{formatCurrency(position.pnl)}
                  </p>
                </div>
              </div>
            ))}

            {positionBreakdown.length > 10 && (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">
                  +{positionBreakdown.length - 10} more positions</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 