import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/utils'

interface Position {
  symbol: string
  quantity: number
  marketValue: number
  costBasis: number
  unrealizedPnL: number
  side: 'long' | 'short'
}

interface PositionsListProps {
  positions: Position[]
}

export function PositionsList({ positions }: PositionsListProps) {
  if (positions.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
          <TrendingUpIcon className="w-8 h-8 text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No Positions</h3>
        <p className="text-gray-600">
          You don't have any open positions. Start trading to see your portfolio here.
        </p>
      </div>
    )
  }

  const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)
  const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0)

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Portfolio Positions</h2>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm text-gray-600">Total Value</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatCurrency(totalValue)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Total P&L</p>
              <p className={`text-lg font-semibold ${
                totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(totalPnL)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Positions</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Symbol
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Avg Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Market Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  P&L
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  P&L %
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {positions.map((position) => {
                const avgPrice = position.costBasis / position.quantity
                const currentPrice = position.marketValue / position.quantity
                const pnlPercent = ((currentPrice - avgPrice) / avgPrice) * 100
                const isPositive = position.unrealizedPnL >= 0
                const isNeutral = position.unrealizedPnL === 0

                return (
                  <tr 
                    key={position.symbol} 
                    className="hover:bg-gray-50 transition-colors duration-200"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center mr-3">
                          <span className="text-xs font-medium text-gray-600">
                            {position.symbol.slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {position.symbol}
                          </div>
                          <div className={`text-xs ${
                            position.side === 'long' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {position.side === 'long' ? 'Long Position' : 'Short Position'}
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
                        {formatCurrency(avgPrice)}
                      </div>
                      <div className="text-xs text-gray-500">
                        avg cost
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(position.marketValue)}
                      </div>
                      <div className="text-xs text-gray-500">
                        @ {formatCurrency(currentPrice)}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`flex items-center text-sm font-medium ${
                        isPositive ? 'text-green-600' : isNeutral ? 'text-gray-600' : 'text-red-600'
                      }`}>
                        <div>
                          {isPositive ? (
                            <TrendingUpIcon className="w-4 h-4 mr-1" />
                          ) : isNeutral ? (
                            <MinusIcon className="w-4 h-4 mr-1" />
                          ) : (
                            <TrendingDownIcon className="w-4 h-4 mr-1" />
                          )}
                        </div>
                        {isPositive ? '+' : isNeutral ? '' : '-'}{formatCurrency(Math.abs(position.unrealizedPnL))}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isPositive 
                          ? 'bg-green-100 text-green-800' 
                          : isNeutral 
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-red-100 text-red-800'
                      }`}>
                        {isPositive ? '+' : isNeutral ? '' : '-'}{formatPercentage(Math.abs(pnlPercent))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center">
            <TrendingUpIcon className="w-6 h-6 text-green-600" />
          </div>
          <p className="text-sm text-gray-600 mb-1">Profitable Positions</p>
          <p className="text-lg font-semibold text-gray-900">
            {positions.filter(p => p.unrealizedPnL > 0).length}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {positions.length > 0 ? Math.round((positions.filter(p => p.unrealizedPnL > 0).length / positions.length) * 100) : 0}% of portfolio
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-red-100 rounded-full flex items-center justify-center">
            <TrendingDownIcon className="w-6 h-6 text-red-600" />
          </div>
          <p className="text-sm text-gray-600 mb-1">Losing Positions</p>
          <p className="text-lg font-semibold text-gray-900">
            {positions.filter(p => p.unrealizedPnL < 0).length}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {positions.length > 0 ? Math.round((positions.filter(p => p.unrealizedPnL < 0).length / positions.length) * 100) : 0}% of portfolio
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm text-center">
          <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
            <MinusIcon className="w-6 h-6 text-gray-600" />
          </div>
          <p className="text-sm text-gray-600 mb-1">Neutral Positions</p>
          <p className="text-lg font-semibold text-gray-900">
            {positions.filter(p => p.unrealizedPnL === 0).length}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {positions.length > 0 ? Math.round((positions.filter(p => p.unrealizedPnL === 0).length / positions.length) * 100) : 0}% of portfolio
          </p>
        </div>
      </div>
    </div>
  )
} 