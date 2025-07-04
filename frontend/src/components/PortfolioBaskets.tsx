import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  TrendingUpIcon, 
  TrendingDownIcon, 
  PieChartIcon, 
  CalendarIcon,
  ExternalLinkIcon,
  TrashIcon,
  InfoIcon
} from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { apiService } from '@/lib/api'

export function PortfolioBaskets() {
  const [selectedBasket, setSelectedBasket] = useState<string | null>(null)
  
  const { data: basketsData, isLoading, refetch } = useQuery({
    queryKey: ['baskets'],
    queryFn: apiService.getBaskets,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  const baskets = basketsData?.baskets || []

  const handleDeleteBasket = async (basketId: string) => {
    if (!confirm('Are you sure you want to delete this basket? This action cannot be undone.')) {
      return
    }
    
    try {
      await apiService.deleteBasket(basketId)
      refetch()
      if (selectedBasket === basketId) {
        setSelectedBasket(null)
      }
    } catch (error) {
      console.error('Failed to delete basket:', error)
      alert('Failed to delete basket. Please try again.')
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'executed': return 'text-green-600 bg-green-100'
      case 'partial': return 'text-yellow-600 bg-yellow-100'
      case 'pending': return 'text-blue-600 bg-blue-100'
      case 'failed': return 'text-red-600 bg-red-100'
      default: return 'text-gray-600 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'executed': return <TrendingUpIcon className="w-4 h-4" />
      case 'partial': return <TrendingUpIcon className="w-4 h-4" />
      case 'pending': return <CalendarIcon className="w-4 h-4" />
      case 'failed': return <TrendingDownIcon className="w-4 h-4" />
      default: return <InfoIcon className="w-4 h-4" />
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-center mt-4 text-gray-600">Loading portfolio baskets...</p>
        </div>
      </div>
    )
  }

  if (baskets.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <PieChartIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Portfolio Baskets</h3>
          <p className="text-gray-600">
            You haven't created any portfolio baskets yet. Try asking about institutional holdings like 
            "What is Bridgewater's 13F?" or "Show me Renaissance Technologies' portfolio" to get started.
          </p>
        </div>
      </div>
    )
  }

  const selectedBasketData = selectedBasket ? baskets.find(b => b.id === selectedBasket) : null

  return (
    <div className="space-y-6">
      {/* Baskets Overview */}
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <PieChartIcon className="w-6 h-6 mr-3 text-gray-600" />
              Portfolio Baskets
            </h2>
            <p className="text-gray-600">
              Institutional portfolio spreads and basket investments
            </p>
          </div>
          
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Baskets</p>
            <p className="text-2xl font-bold text-gray-900">{baskets.length}</p>
          </div>
        </div>

        {/* Baskets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {baskets.map((basket) => {
            const totalActualValue = basket.holdings.reduce((sum, h) => sum + h.actualValue, 0)
            const executedHoldings = basket.holdings.filter(h => h.actualShares > 0).length
            
            return (
              <div 
                key={basket.id}
                className={`p-4 border rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md ${
                  selectedBasket === basket.id 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => setSelectedBasket(basket.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm">{basket.name}</h3>
                    <p className="text-xs text-gray-600 mt-1">{basket.institution}</p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(basket.status)}`}>
                      {getStatusIcon(basket.status)}
                      <span className="ml-1 capitalize">{basket.status}</span>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteBasket(basket.id)
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete basket"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Target Investment:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(basket.totalInvestment)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Actual Value:</span>
                    <span className="font-medium text-gray-900">{formatCurrency(totalActualValue)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Holdings:</span>
                    <span className="font-medium text-gray-900">
                      {executedHoldings}/{basket.holdings.length}
                    </span>
                  </div>
                  
                  <div className="text-xs text-gray-500 mt-2">
                    Created: {new Date(basket.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Selected Basket Details */}
      {selectedBasketData && (
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900">{selectedBasketData.name}</h3>
              <p className="text-gray-600">{selectedBasketData.institution}</p>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className={`inline-flex items-center px-3 py-2 rounded-full text-sm font-medium ${getStatusColor(selectedBasketData.status)}`}>
                {getStatusIcon(selectedBasketData.status)}
                <span className="ml-2 capitalize">{selectedBasketData.status}</span>
              </div>
              
              <button
                onClick={() => setSelectedBasket(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ExternalLinkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Basket Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Target Investment</p>
              <p className="text-xl font-bold text-gray-900">{formatCurrency(selectedBasketData.totalInvestment)}</p>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Actual Value</p>
              <p className="text-xl font-bold text-gray-900">
                {formatCurrency(selectedBasketData.holdings.reduce((sum, h) => sum + h.actualValue, 0))}
              </p>
            </div>
            
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Execution Rate</p>
              <p className="text-xl font-bold text-gray-900">
                {formatPercentage(
                  (selectedBasketData.holdings.filter(h => h.actualShares > 0).length / selectedBasketData.holdings.length) * 100
                )}
              </p>
            </div>
          </div>

          {/* Holdings Details */}
          <div>
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Holdings Breakdown</h4>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Symbol
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Target Weight
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actual Shares
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actual Value
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order ID
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {selectedBasketData.holdings.map((holding, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{holding.symbol}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{formatPercentage(holding.targetWeight * 100)}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {holding.actualShares > 0 ? holding.actualShares.toLocaleString() : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {holding.actualValue > 0 ? formatCurrency(holding.actualValue) : '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          holding.actualShares > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {holding.actualShares > 0 ? 'Executed' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">
                          {holding.orderId || '-'}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 