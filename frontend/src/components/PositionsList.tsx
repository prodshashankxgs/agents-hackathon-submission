import { useState, useMemo } from 'react'
import { 
  TrendingUpIcon, 
  TrendingDownIcon, 
  MinusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FilterIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  MoreVerticalIcon,
  AlertCircleIcon
} from 'lucide-react'
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

type SortField = 'symbol' | 'quantity' | 'marketValue' | 'unrealizedPnL' | 'pnlPercent'
type SortDirection = 'asc' | 'desc'

export function PositionsList({ positions }: PositionsListProps) {
  const [sortField, setSortField] = useState<SortField>('marketValue')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [showValues, setShowValues] = useState(true)
  const [selectedPositions, setSelectedPositions] = useState<string[]>([])

  // Calculate sorted positions
  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      let aValue: number
      let bValue: number

      switch (sortField) {
        case 'symbol':
          return sortDirection === 'asc' 
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol)
        case 'quantity':
          aValue = a.quantity
          bValue = b.quantity
          break
        case 'marketValue':
          aValue = a.marketValue
          bValue = b.marketValue
          break
        case 'unrealizedPnL':
          aValue = a.unrealizedPnL
          bValue = b.unrealizedPnL
          break
        case 'pnlPercent':
          aValue = ((a.marketValue / a.quantity - a.costBasis / a.quantity) / (a.costBasis / a.quantity)) * 100
          bValue = ((b.marketValue / b.quantity - b.costBasis / b.quantity) / (b.costBasis / b.quantity)) * 100
          break
        default:
          return 0
      }

      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
    })
  }, [positions, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }



  const togglePositionSelection = (symbol: string) => {
    setSelectedPositions(prev => 
      prev.includes(symbol) 
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol]
    )
  }

  if (positions.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-3xl flex items-center justify-center">
          <TrendingUpIcon className="w-12 h-12 text-gray-400" />
        </div>
        <h3 className="text-2xl font-semibold text-gray-900 mb-3">No Open Positions</h3>
        <p className="text-gray-500 max-w-md mx-auto">
          Your portfolio is empty. Start trading to see your positions and performance metrics here.
        </p>
        <button className="brokerage-button mt-6">
          Start Trading
        </button>
      </div>
    )
  }

  const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0)
  const totalValue = positions.reduce((sum, pos) => sum + pos.marketValue, 0)
  const totalCost = positions.reduce((sum, pos) => sum + pos.costBasis, 0)
  const totalPnLPercent = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0

  return (
    <div className="space-y-6">
      {/* Modern Summary Card */}
      <div className="brokerage-card p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-white opacity-50" />
        
        <div className="relative">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-3xl font-semibold text-gray-900 tracking-tight">Portfolio Positions</h2>
              <p className="text-gray-500 mt-1">{positions.length} active position{positions.length !== 1 ? 's' : ''}</p>
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
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors group">
                <FilterIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors group">
                <DownloadIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600" />
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="metric-card">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Total Value</p>
              <p className="text-2xl font-semibold text-gray-900">
                {showValues ? formatCurrency(totalValue) : '••••••'}
              </p>
              <p className="text-sm text-gray-500 mt-1">Market value</p>
            </div>
            
            <div className="metric-card">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Unrealized P&L</p>
              <div className="flex items-baseline space-x-2">
                <p className={`text-2xl font-semibold ${
                  totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {showValues ? formatCurrency(totalPnL) : '••••••'}
                </p>
                <div className={`flex items-center space-x-1 text-sm font-medium ${
                  totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {totalPnL >= 0 ? (
                    <ArrowUpIcon className="w-3 h-3" />
                  ) : (
                    <ArrowDownIcon className="w-3 h-3" />
                  )}
                  <span>{formatPercentage(Math.abs(totalPnLPercent))}</span>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-1">Total return</p>
            </div>
            
            <div className="metric-card">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Win Rate</p>
              <div className="flex items-baseline space-x-2">
                <p className="text-2xl font-semibold text-gray-900">
                  {Math.round((positions.filter(p => p.unrealizedPnL > 0).length / positions.length) * 100)}%
                </p>
                <span className="text-sm text-gray-500">
                  ({positions.filter(p => p.unrealizedPnL > 0).length}/{positions.length})
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">Profitable positions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modern Positions Table */}
      <div className="brokerage-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">All Positions</h3>
          {selectedPositions.length > 0 && (
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-500">{selectedPositions.length} selected</span>
              <button className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Actions
              </button>
            </div>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="brokerage-table w-full">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="w-12 px-6 py-4">
                  <input 
                    type="checkbox"
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                    checked={selectedPositions.length === positions.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPositions(positions.map(p => p.symbol))
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
                    {sortField === 'symbol' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('quantity')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Quantity</span>
                    {sortField === 'quantity' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
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
                    {sortField === 'marketValue' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('unrealizedPnL')}
                >
                  <div className="flex items-center space-x-1">
                    <span>P&L</span>
                    {sortField === 'unrealizedPnL' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700"
                  onClick={() => handleSort('pnlPercent')}
                >
                  <div className="flex items-center space-x-1">
                    <span>P&L %</span>
                    {sortField === 'pnlPercent' && (
                      sortDirection === 'asc' ? <ChevronUpIcon className="w-3 h-3" /> : <ChevronDownIcon className="w-3 h-3" />
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
      </div>

      {/* Modern Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="brokerage-card p-6 text-center hover-lift">
          <div className="w-14 h-14 mx-auto mb-4 bg-green-100 rounded-2xl flex items-center justify-center">
            <TrendingUpIcon className="w-7 h-7 text-green-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Winners</p>
          <p className="text-2xl font-semibold text-gray-900">
            {positions.filter(p => p.unrealizedPnL > 0).length}
          </p>
          <div className="mt-2 flex items-center justify-center space-x-1 text-sm text-green-600">
            <ArrowUpIcon className="w-3 h-3" />
            <span className="font-medium">
              {formatCurrency(positions.filter(p => p.unrealizedPnL > 0).reduce((sum, p) => sum + p.unrealizedPnL, 0))}
            </span>
          </div>
        </div>

        <div className="brokerage-card p-6 text-center hover-lift">
          <div className="w-14 h-14 mx-auto mb-4 bg-red-100 rounded-2xl flex items-center justify-center">
            <TrendingDownIcon className="w-7 h-7 text-red-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Losers</p>
          <p className="text-2xl font-semibold text-gray-900">
            {positions.filter(p => p.unrealizedPnL < 0).length}
          </p>
          <div className="mt-2 flex items-center justify-center space-x-1 text-sm text-red-600">
            <ArrowDownIcon className="w-3 h-3" />
            <span className="font-medium">
              {formatCurrency(Math.abs(positions.filter(p => p.unrealizedPnL < 0).reduce((sum, p) => sum + p.unrealizedPnL, 0)))}
            </span>
          </div>
        </div>

        <div className="brokerage-card p-6 text-center hover-lift">
          <div className="w-14 h-14 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
            <AlertCircleIcon className="w-7 h-7 text-gray-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">At Risk</p>
          <p className="text-2xl font-semibold text-gray-900">
            {positions.filter(p => p.unrealizedPnL < 0 && Math.abs(p.unrealizedPnL / p.costBasis) > 0.1).length}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Positions down &gt;10%
          </p>
        </div>
      </div>
    </div>
  )
} 