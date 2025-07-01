import { useState, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ActivityIcon, 
  DollarSignIcon, 
  TrendingUpIcon, 
  BarChart3Icon,
  PieChartIcon,
  CreditCardIcon,
  LineChartIcon
} from 'lucide-react'
import { apiService } from '@/lib/api'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { TradingInterface } from './TradingInterface'
import { PortfolioOverview } from './PortfolioOverview'
import { MarketStatus } from './MarketStatus'
import { PositionsList } from './PositionsList'

// Lazy load the PortfolioPerformance component since it includes heavy charting libraries
const PortfolioPerformance = lazy(() => import('./PortfolioPerformance').then(module => ({ default: module.PortfolioPerformance })))

interface TradingDashboardProps {
  wsConnected: boolean
}

export function TradingDashboard({ wsConnected }: TradingDashboardProps) {
  const [selectedTab, setSelectedTab] = useState<'trade' | 'portfolio' | 'performance' | 'positions' | 'market'>('trade')

  // Fetch account information
  const { data: accountInfo, isLoading: accountLoading, error: accountError } = useQuery({
    queryKey: ['account'],
    queryFn: apiService.getAccountInfo,
    refetchInterval: 30000,
  })

  // Fetch health status
  const { data: healthStatus } = useQuery({
    queryKey: ['health'],
    queryFn: apiService.getHealth,
    refetchInterval: 60000,
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

  const navigationItems = [
    { id: 'trade', label: 'Trade', icon: DollarSignIcon },
    { id: 'portfolio', label: 'Portfolio', icon: PieChartIcon },
    { id: 'performance', label: 'Performance', icon: LineChartIcon },
    { id: 'positions', label: 'Positions', icon: BarChart3Icon },
    { id: 'market', label: 'Market', icon: ActivityIcon },
  ] as const

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Mobile Navigation Overlay */}
      {selectedTab !== 'trade' && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSelectedTab('trade')}
        />
      )}
      
      {/* Left Sidebar */}
      <div className={`w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
        selectedTab === 'trade' ? '-translate-x-full' : 'translate-x-0'
      } fixed inset-y-0 left-0 z-50 lg:z-0`}>
        {/* Header */}
        <div className="p-6 border-b border-gray-100">
          <h1 className="text-xl font-semibold text-gray-900">
            Trading Platform
          </h1>
          <p className="text-sm text-gray-600 mt-1">Natural Language Trading</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6">
          <div className="space-y-2">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isSelected = selectedTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedTab(item.id)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-gray-900 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isSelected ? 'text-white' : 'text-gray-400'}`} />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* Status Indicators */}
        <div className="p-4 border-t border-gray-100 space-y-3">
          {/* Connection Status */}
          <div className={`flex items-center space-x-2 text-xs ${wsConnected ? 'text-green-600' : 'text-red-600'}`}>
            <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          
          {/* Trading Mode */}
          {healthStatus && (
            <div className={`flex items-center space-x-2 text-xs ${
              healthStatus.mode === 'paper' ? 'text-amber-600' : 'text-red-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                healthStatus.mode === 'paper' ? 'bg-amber-500' : 'bg-red-500'
              }`} />
              <span>{healthStatus.mode === 'paper' ? 'Paper Trading' : 'Live Trading'}</span>
            </div>
          )}
          
          {/* Market Status */}
          {marketStatus && (
            <div className={`flex items-center space-x-2 text-xs ${
              marketStatus.isOpen ? 'text-green-600' : 'text-gray-600'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                marketStatus.isOpen ? 'bg-green-500' : 'bg-gray-400'
              }`} />
              <span>{marketStatus.isOpen ? 'Market Open' : 'Market Closed'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Trading Platform</h1>
          <button
            onClick={() => setSelectedTab(selectedTab === 'trade' ? 'portfolio' : 'trade')}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
        {/* Top Header */}
        <header className="bg-white border-b border-gray-200 px-4 lg:px-8 py-4 lg:py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div>
              <h2 className="text-xl lg:text-2xl font-semibold text-gray-900 capitalize">
                {selectedTab}
              </h2>
              <p className="text-sm text-gray-600 mt-1 hidden sm:block">
                {selectedTab === 'trade' && 'Execute trades using natural language'}
                {selectedTab === 'portfolio' && 'View your portfolio performance'}
                {selectedTab === 'performance' && 'Track portfolio performance vs benchmarks'}
                {selectedTab === 'positions' && 'Manage your current positions'}
                {selectedTab === 'market' && 'Monitor market conditions'}
              </p>
            </div>
            
            {/* Quick Stats */}
            {accountInfo && !accountLoading && (
              <div className="flex items-center space-x-4 lg:space-x-8 overflow-x-auto">
                <div className="text-center flex-shrink-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Portfolio Value</p>
                  <p className="text-base lg:text-lg font-semibold text-gray-900">
                    {formatCurrency(accountInfo.portfolioValue)}
                  </p>
                </div>
                <div className="text-center flex-shrink-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Today's P&L</p>
                  <p className={`text-base lg:text-lg font-semibold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalPnL)}
                  </p>
                </div>
                <div className="text-center flex-shrink-0">
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Buying Power</p>
                  <p className="text-base lg:text-lg font-semibold text-gray-900">
                    {formatCurrency(accountInfo.buyingPower)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-6xl mx-auto p-4 lg:p-8">
            {/* Account Stats Cards */}
            {accountInfo && !accountLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
                <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-sm transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <TrendingUpIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">Portfolio</span>
                  </div>
                  <p className="text-2xl font-semibold text-gray-900 mb-1">
                    {formatCurrency(accountInfo.portfolioValue)}
                  </p>
                  <p className="text-sm text-gray-600">Total Value</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-sm transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <CreditCardIcon className="w-5 h-5 text-gray-400" />
                    <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">Cash</span>
                  </div>
                  <p className="text-2xl font-semibold text-gray-900 mb-1">
                    {formatCurrency(accountInfo.buyingPower)}
                  </p>
                  <p className="text-sm text-gray-600">Buying Power</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-sm transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <ActivityIcon className={`w-5 h-5 ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`} />
                    <span className={`text-xs px-2 py-1 rounded ${
                      totalPnL >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'
                    }`}>
                      {totalPnL >= 0 ? '+' : ''}{formatPercentage(totalPnLPercent)}
                    </span>
                  </div>
                  <p className={`text-2xl font-semibold mb-1 ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(totalPnL)}
                  </p>
                  <p className="text-sm text-gray-600">Today's P&L</p>
                </div>
                
                <div className="bg-white rounded-xl p-6 border border-gray-200 hover:shadow-sm transition-shadow duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <BarChart3Icon className="w-5 h-5 text-gray-400" />
                    <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">Holdings</span>
                  </div>
                  <p className="text-2xl font-semibold text-gray-900 mb-1">
                    {accountInfo.positions.length}
                  </p>
                  <p className="text-sm text-gray-600">Positions</p>
                </div>
              </div>
            )}

            {/* Loading State for Stats */}
            {accountLoading && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl p-6 border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div className="skeleton h-5 w-5 rounded"></div>
                      <div className="skeleton h-5 w-16 rounded"></div>
                    </div>
                    <div className="skeleton h-8 w-24 mb-1 rounded"></div>
                    <div className="skeleton h-4 w-20 rounded"></div>
                  </div>
                ))}
              </div>
            )}

            {/* Main Content */}
            <div key={selectedTab} className="animate-fade-in-static">
              {selectedTab === 'trade' && (
                <div>
                  <TradingInterface />
                </div>
              )}
              {selectedTab === 'portfolio' && (
                <div>
                  <PortfolioOverview accountInfo={accountInfo} />
                </div>
              )}
              {selectedTab === 'performance' && (
                <div>
                  <Suspense fallback={
                    <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm text-center">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                        <LineChartIcon className="w-8 h-8 text-gray-400 animate-pulse" />
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading Performance Charts</h3>
                      <p className="text-gray-600">Please wait while we prepare your portfolio analytics...</p>
                      <div className="mt-8 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          {[...Array(4)].map((_, i) => (
                            <div key={i} className="p-4 bg-gray-50 rounded-lg">
                              <div className="skeleton h-4 w-20 mb-2"></div>
                              <div className="skeleton h-8 w-16 mb-1"></div>
                              <div className="skeleton h-3 w-24"></div>
                            </div>
                          ))}
                        </div>
                        <div className="skeleton h-96 w-full rounded-lg"></div>
                      </div>
                    </div>
                  }>
                    <PortfolioPerformance accountInfo={accountInfo} />
                  </Suspense>
                </div>
              )}
              {selectedTab === 'positions' && (
                <div>
                  <PositionsList positions={accountInfo?.positions || []} />
                </div>
              )}
              {selectedTab === 'market' && (
                <div>
                  <MarketStatus />
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Error Handling */}
        {accountError && (
          <div className="fixed bottom-6 right-6 max-w-md z-50">
            <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl shadow-lg">
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