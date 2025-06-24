import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ActivityIcon, DollarSignIcon, TrendingUpIcon, BarChart3Icon } from 'lucide-react'
import { apiService } from '@/lib/api'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { TradingInterface } from './TradingInterface'
import { PortfolioOverview } from './PortfolioOverview'
import { MarketStatus } from './MarketStatus'
import { PositionsList } from './PositionsList'

interface TradingDashboardProps {
  wsConnected: boolean
}

export function TradingDashboard({ wsConnected }: TradingDashboardProps) {
  const [selectedTab, setSelectedTab] = useState<'trade' | 'portfolio' | 'positions' | 'market'>('trade')

  // Fetch account information
  const { data: accountInfo, isLoading: accountLoading, error: accountError } = useQuery({
    queryKey: ['account'],
    queryFn: apiService.getAccountInfo,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Fetch health status
  const { data: healthStatus } = useQuery({
    queryKey: ['health'],
    queryFn: apiService.getHealth,
    refetchInterval: 60000, // Refresh every minute
  })

  // Fetch market status
  const { data: marketStatus } = useQuery({
    queryKey: ['market-status'],
    queryFn: apiService.getMarketStatus,
    refetchInterval: 60000,
  })

  const totalPnL = accountInfo?.positions?.reduce((sum, pos) => sum + pos.unrealizedPnL, 0) || 0
  const totalPnLPercent = accountInfo && accountInfo.portfolioValue > 0 
    ? (totalPnL / (accountInfo.portfolioValue - totalPnL)) * 100 
    : 0

  const tabs = [
    { id: 'trade', label: 'Trade', icon: DollarSignIcon },
    { id: 'portfolio', label: 'Portfolio', icon: BarChart3Icon },
    { id: 'positions', label: 'Positions', icon: TrendingUpIcon },
    { id: 'market', label: 'Market', icon: ActivityIcon },
  ] as const

  return (
    <div className="min-h-screen bg-gray-50/30 p-6 lg:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 pb-4">
          <div className="mb-6 lg:mb-0 min-w-0 flex-1">
            <h1 className="text-3xl lg:text-4xl xl:text-5xl font-bold gradient-text mb-6 break-words leading-normal py-1">
              Natural Language Trading Extension
            </h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 lg:flex-shrink-0">
            {/* Connection Status */}
            <div className={`status-indicator ${wsConnected ? 'status-connected' : 'status-disconnected'}`}>
              <div className={`w-1.5 h-1.5 rounded-full mr-2 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              {wsConnected ? 'Connected' : 'Disconnected'}
            </div>
            
            {/* Trading Mode */}
            {healthStatus && (
              <div className={`status-indicator ${
                healthStatus.mode === 'paper' ? 'status-paper' : 'status-live'
              }`}>
                {healthStatus.mode === 'paper' ? 'Paper Trading' : 'Live Trading'}
              </div>
            )}
            
            {/* Market Status */}
            {marketStatus && (
              <div className={`status-indicator ${
                marketStatus.isOpen ? 'status-market-open' : 'status-market-closed'
              }`}>
                {marketStatus.isOpen ? 'Market Open' : 'Market Closed'}
              </div>
            )}
          </div>
        </div>

        {/* Quick Stats */}
        {accountInfo && !accountLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="metric-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-600">Portfolio Value</p>
                <TrendingUpIcon className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(accountInfo.portfolioValue)}
              </p>
            </div>
            
            <div className="metric-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-600">Buying Power</p>
                <DollarSignIcon className="w-4 h-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(accountInfo.buyingPower)}
              </p>
            </div>
            
            <div className="metric-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-600">Today's P&L</p>
                <ActivityIcon className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className={`text-2xl font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totalPnL)}
                </p>
                <p className={`text-sm ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatPercentage(totalPnLPercent)}
                </p>
              </div>
            </div>
            
            <div className="metric-card">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-600">Positions</p>
                <BarChart3Icon className="w-4 h-4 text-gray-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {accountInfo.positions.length}
                </p>
                <p className="text-sm text-gray-600">
                  {accountInfo.dayTradeCount} day trades
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="mb-8">
          <div className="flex justify-center">
            <div className="flex space-x-1 bg-gray-100 p-1 rounded-xl w-fit">
              {tabs.map((tab) => {
                const Icon = tab.icon
                const isSelected = selectedTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedTab(tab.id)}
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isSelected
                        ? 'bg-gray-900 text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="space-y-6 max-w-4xl mx-auto">
          {selectedTab === 'trade' && <TradingInterface />}
          {selectedTab === 'portfolio' && <PortfolioOverview accountInfo={accountInfo} />}
          {selectedTab === 'positions' && <PositionsList positions={accountInfo?.positions || []} />}
          {selectedTab === 'market' && <MarketStatus />}
        </div>

        {/* Error Handling */}
        {accountError && (
          <div className="fixed bottom-6 right-6 max-w-md">
            <div className="error-card glass-card p-4 rounded-xl border">
              <h4 className="font-medium mb-1">Connection Error</h4>
              <p className="text-sm opacity-90">
                {accountError.message}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 