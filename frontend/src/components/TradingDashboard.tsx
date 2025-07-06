import { useState, lazy, Suspense, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ActivityIcon, 
  DollarSignIcon, 
  TrendingUpIcon, 
  BarChart3Icon,
  PieChartIcon,
  CreditCardIcon,
  LineChartIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  BellIcon,
  SettingsIcon,
  SearchIcon,
  XCircleIcon
} from 'lucide-react'
import { apiService } from '@/lib/api'
import { formatCurrency, formatPercentage } from '@/lib/utils'
import { TradingInterface } from './TradingInterface'
import { PortfolioOverview } from './PortfolioOverview'
import { MarketStatus } from './MarketStatus'
import { PositionsList } from './PositionsList'
import { PortfolioBaskets } from './PortfolioBaskets'

// Lazy load the PortfolioPerformance component since it includes heavy charting libraries
const PortfolioPerformance = lazy(() => import('./PortfolioPerformance').then(module => ({ default: module.PortfolioPerformance })))

interface TradingDashboardProps {
  wsConnected: boolean
}

export function TradingDashboard({ wsConnected }: TradingDashboardProps) {
  const [selectedTab, setSelectedTab] = useState<'trade' | 'portfolio' | 'performance' | 'positions' | 'baskets' | 'market'>('trade')
  const [previousPnL, setPreviousPnL] = useState<number | null>(null)

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

  // Track PnL changes for animations
  useEffect(() => {
    if (previousPnL !== null && totalPnL !== previousPnL) {
      // Trigger animation
    }
    setPreviousPnL(totalPnL)
  }, [totalPnL, previousPnL])

  const navigationItems = [
    { id: 'trade', label: 'Trade', icon: DollarSignIcon },
    { id: 'portfolio', label: 'Portfolio', icon: PieChartIcon },
    { id: 'performance', label: 'Performance', icon: LineChartIcon },
    { id: 'positions', label: 'Positions', icon: BarChart3Icon },
    { id: 'baskets', label: 'Baskets', icon: CreditCardIcon },
    { id: 'market', label: 'Market', icon: ActivityIcon },
  ] as const

  return (
    <div className="flex h-screen bg-white">
      {/* Modern Left Sidebar */}
      <div className="w-72 bg-white border-r border-gray-100 flex flex-col relative overflow-hidden">
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 grid-pattern opacity-[0.02]" />
        
        {/* Header with glassmorphism effect */}
        <div className="relative p-8 border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/50">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              Terminal
            </h1>
            <div className="flex items-center space-x-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 group">
                <BellIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 group">
                <SettingsIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-500 font-medium">AI-Powered Trading</p>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search symbols..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-gray-300 focus:outline-none transition-all duration-200"
            />
          </div>
        </div>

        {/* Navigation with modern styling */}
        <nav className="flex-1 px-4 py-2 overflow-y-auto custom-scrollbar">
          <div className="space-y-1">
            {navigationItems.map((item, index) => {
              const Icon = item.icon
              const isSelected = selectedTab === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedTab(item.id)}
                  className={`nav-item w-full ${isSelected ? 'active' : ''} group`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <Icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${
                    isSelected ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'
                  }`} />
                  <span className="font-medium">{item.label}</span>
                  {isSelected && (
                    <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Modern Status Section */}
        <div className="p-6 border-t border-gray-100 space-y-4 bg-gradient-to-t from-gray-50/50 to-white">
          {/* Connection Status with animation */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Status</span>
            <div className={`flex items-center space-x-2 text-xs font-medium ${wsConnected ? 'text-green-600' : 'text-red-600'}`}>
              <div className={`status-dot ${wsConnected ? 'status-connected' : 'status-disconnected'}`} />
              <span className="transition-all duration-300">{wsConnected ? 'Live' : 'Offline'}</span>
            </div>
          </div>
          
          {/* Trading Mode with badge styling */}
          {healthStatus && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</span>
              <div className={`badge ${healthStatus.mode === 'paper' ? 'badge-warning' : 'badge-error'} px-3 py-1`}>
                <span className="font-medium">{healthStatus.mode === 'paper' ? 'Paper' : 'Live'}</span>
              </div>
            </div>
          )}
          
          {/* Market Status with modern indicator */}
          {marketStatus && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Market</span>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  marketStatus.isOpen ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-gray-400'
                }`} />
                <span className={`text-xs font-medium ${
                  marketStatus.isOpen ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {marketStatus.isOpen ? 'Open' : 'Closed'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50/30">
        {/* Modern Top Header */}
        <header className="bg-white border-b border-gray-100 px-8 py-6 relative overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-gray-50/0 via-gray-50/50 to-gray-50/0 opacity-50" />
          
          <div className="relative flex items-center justify-between">
            <div className="slide-in-right">
              <h2 className="text-3xl font-semibold text-gray-900 capitalize tracking-tight">
                {selectedTab}
              </h2>
              <p className="text-sm text-gray-500 mt-1 font-medium">
                {selectedTab === 'trade' && 'Execute trades using natural language'}
                {selectedTab === 'portfolio' && 'Monitor your investment performance'}
                {selectedTab === 'performance' && 'Analyze returns and benchmarks'}
                {selectedTab === 'positions' && 'Manage your current holdings'}
                {selectedTab === 'baskets' && 'Explore institutional portfolios'}
                {selectedTab === 'market' && 'Real-time market intelligence'}
              </p>
            </div>
            
            {/* Organized Portfolio Metrics */}
            {accountInfo && !accountLoading && (
              <div className="grid grid-cols-3 gap-6">
                {/* Net Worth Card */}
                <div className="metric-card p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 scale-in" style={{ animationDelay: '100ms' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Worth</p>
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <TrendingUpIcon className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 number-counter mb-1">
                    {formatCurrency(accountInfo.portfolioValue)}
                  </p>
                  <p className="text-sm text-gray-500 font-medium">Total Portfolio Value</p>
                </div>

                {/* Day Change Card */}
                <div className={`metric-card p-6 border rounded-xl shadow-sm hover:shadow-md transition-all duration-300 scale-in ${
                  totalPnL >= 0 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`} style={{ animationDelay: '200ms' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Day Change</p>
                    <div className={`p-2 rounded-lg ${
                      totalPnL >= 0 ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {totalPnL >= 0 ? (
                        <ArrowUpIcon className="w-4 h-4 text-green-600" />
                      ) : (
                        <ArrowDownIcon className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-2 mb-1">
                    <p className={`text-3xl font-bold price-ticker ${
                      totalPnL >= 0 ? 'text-green-600 price-up' : 'text-red-600 price-down'
                    }`}>
                      {totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)}
                    </p>
                  </div>
                  <p className={`text-sm font-medium ${
                    totalPnL >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {totalPnL >= 0 ? '+' : ''}{formatPercentage(totalPnLPercent)}
                  </p>
                </div>

                {/* Cash Card */}
                <div className="metric-card p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-all duration-300 scale-in" style={{ animationDelay: '300ms' }}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Cash</p>
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <DollarSignIcon className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-gray-900 number-counter mb-1">
                    {formatCurrency(accountInfo.buyingPower)}
                  </p>
                  <p className="text-sm text-gray-500 font-medium">Available for Trading</p>
                </div>
                              </div>
              )}

            {/* Loading State for Header Metrics */}
            {accountLoading && (
              <div className="grid grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="metric-card p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="skeleton h-3 w-16 rounded"></div>
                      <div className="skeleton h-8 w-8 rounded-lg"></div>
                    </div>
                    <div className="skeleton h-8 w-24 mb-1 rounded"></div>
                    <div className="skeleton h-4 w-20 rounded"></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Content Area with modern styling */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-gradient-to-b from-gray-50/30 to-white">
          <div className="max-w-7xl mx-auto p-8">
            {/* Modern Stats Grid */}
            {accountInfo && !accountLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {[
                  {
                    icon: TrendingUpIcon,
                    label: 'Portfolio Value',
                    value: formatCurrency(accountInfo.portfolioValue),
                    subtext: 'Total Assets',
                    color: 'gray'
                  },
                  {
                    icon: CreditCardIcon,
                    label: 'Buying Power',
                    value: formatCurrency(accountInfo.buyingPower),
                    subtext: 'Available Cash',
                    color: 'gray'
                  },
                  {
                    icon: ActivityIcon,
                    label: "Today's P&L",
                    value: formatCurrency(totalPnL),
                    subtext: `${totalPnL >= 0 ? '+' : ''}${formatPercentage(totalPnLPercent)}`,
                    color: totalPnL >= 0 ? 'green' : 'red',
                    isAnimated: true
                  },
                  {
                    icon: BarChart3Icon,
                    label: 'Positions',
                    value: accountInfo.positions.length.toString(),
                    subtext: 'Active Holdings',
                    color: 'gray'
                  }
                ].map((stat, index) => (
                  <div 
                    key={stat.label}
                    className="metric-card group hover-lift"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`p-3 rounded-xl bg-gray-50 group-hover:bg-gray-100 transition-colors duration-300`}>
                        <stat.icon className={`w-5 h-5 ${
                          stat.color === 'green' ? 'text-green-600' : 
                          stat.color === 'red' ? 'text-red-600' : 
                          'text-gray-600'
                        }`} />
                      </div>
                      {stat.isAnimated && (
                        <div className={`badge ${totalPnL >= 0 ? 'badge-success' : 'badge-error'}`}>
                          {totalPnL >= 0 ? (
                            <ArrowUpIcon className="w-3 h-3 mr-1" />
                          ) : (
                            <ArrowDownIcon className="w-3 h-3 mr-1" />
                          )}
                          {stat.subtext}
                        </div>
                      )}
                    </div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">
                      {stat.label}
                    </p>
                    <p className={`text-2xl font-semibold ${
                      stat.color === 'green' ? 'text-green-600' : 
                      stat.color === 'red' ? 'text-red-600' : 
                      'text-gray-900'
                    } ${stat.isAnimated ? 'price-ticker' : ''}`}>
                      {stat.value}
                    </p>
                    {!stat.isAnimated && (
                      <p className="text-sm text-gray-500 mt-1">{stat.subtext}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Loading State with modern skeleton */}
            {accountLoading && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="metric-card">
                    <div className="flex items-center justify-between mb-4">
                      <div className="skeleton h-12 w-12 rounded-xl"></div>
                      <div className="skeleton h-6 w-16 rounded-full"></div>
                    </div>
                    <div className="skeleton h-4 w-24 mb-2 rounded"></div>
                    <div className="skeleton h-8 w-32 mb-1 rounded"></div>
                    <div className="skeleton h-3 w-20 rounded"></div>
                  </div>
                ))}
              </div>
            )}

            {/* Main Content with tab animation */}
            <div key={selectedTab} className="tab-content-enter">
              {selectedTab === 'trade' && (
                <div className="slide-in-bottom">
                  <TradingInterface />
                </div>
              )}
              {selectedTab === 'portfolio' && (
                <div className="slide-in-bottom">
                  <PortfolioOverview accountInfo={accountInfo} />
                </div>
              )}
              {selectedTab === 'performance' && (
                <div className="slide-in-bottom">
                  <Suspense fallback={
                    <div className="glass-card p-12 text-center">
                      <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-2xl flex items-center justify-center">
                        <LineChartIcon className="w-10 h-10 text-gray-400 animate-pulse" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Loading Performance Analytics</h3>
                      <p className="text-gray-500">Preparing your portfolio insights...</p>
                      <div className="mt-8 flex justify-center">
                        <div className="spinner" />
                      </div>
                    </div>
                  }>
                    <PortfolioPerformance accountInfo={accountInfo} />
                  </Suspense>
                </div>
              )}
              {selectedTab === 'positions' && (
                <div className="slide-in-bottom">
                  <PositionsList positions={accountInfo?.positions || []} />
                </div>
              )}
              {selectedTab === 'baskets' && (
                <div className="slide-in-bottom">
                  <PortfolioBaskets />
                </div>
              )}
              {selectedTab === 'market' && (
                <div className="slide-in-bottom">
                  <MarketStatus />
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Modern Error Toast */}
        {accountError && (
          <div className="fixed bottom-8 right-8 max-w-md z-50 slide-in-bottom">
            <div className="glass-card p-6 border-red-200 bg-red-50/90">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircleIcon className="w-5 h-5 text-red-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-gray-900 mb-1">Connection Error</h4>
                  <p className="text-sm text-gray-600">
                    {accountError.message}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 