import { useState, lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ActivityIcon,
  CreditCardIcon,
  DollarSignIcon, 
  PieChartIcon,
  LineChartIcon,
  BellIcon,
  SettingsIcon,
  SearchIcon,
  XCircleIcon,
  MenuIcon,
  XIcon
} from 'lucide-react'
import { apiService } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { TradingInterface } from './TradingInterface'
import { PortfolioOverview } from './PortfolioOverview'
import { MarketStatus } from './MarketStatus'
import { PortfolioBaskets } from './PortfolioBaskets'

// Lazy load the PortfolioPerformance component since it includes heavy charting libraries
const PortfolioPerformance = lazy(() => import('./PortfolioPerformance').then(module => ({ default: module.PortfolioPerformance })))

interface TradingDashboardProps {
  wsConnected: boolean
}

export function TradingDashboard({ wsConnected }: TradingDashboardProps) {
  const [selectedTab, setSelectedTab] = useState<'trade' | 'portfolio' | 'performance' | 'baskets' | 'market'>('trade')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Fetch account information
  const { data: accountInfo, error: accountError } = useQuery({
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



  const navigationItems = [
    { id: 'trade', label: 'Trade', icon: DollarSignIcon },
    { id: 'portfolio', label: 'Portfolio', icon: PieChartIcon },
    { id: 'performance', label: 'Performance', icon: LineChartIcon },
    { id: 'baskets', label: 'Baskets', icon: CreditCardIcon },
    { id: 'market', label: 'Market', icon: ActivityIcon },
  ] as const

  return (
    <div className="flex h-screen bg-gray-50/30 relative overflow-hidden">
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Modern Left Sidebar - Responsive */}
      <div className={`
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50
        w-[85vw] sm:w-80 lg:w-64 xl:w-72 2xl:w-80
        bg-white border-r border-gray-100 flex flex-col
        transition-transform duration-300 ease-in-out
      `}>
        {/* Subtle grid pattern background */}
        <div className="absolute inset-0 grid-pattern opacity-[0.02]" />
        
        {/* Header with glassmorphism effect */}
        <div className="relative p-4 sm:p-5 lg:p-6 bg-gradient-to-b from-white to-gray-50/30 backdrop-blur-sm border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 tracking-tight">
              Terminal
            </h1>
            <div className="flex items-center space-x-1 sm:space-x-2">
              {/* Mobile Close Button */}
              <button 
                className="lg:hidden p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 group"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <XIcon className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
              <button className="hidden sm:block p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 group">
                <BellIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
              <button className="hidden sm:block p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200 group">
                <SettingsIcon className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </button>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">AI-Powered Trading</p>
        </div>

        {/* Search Bar */}
        <div className="px-3 sm:px-4 lg:px-5 py-2 sm:py-3">
          <div className="relative">
            <SearchIcon className="absolute left-2.5 sm:left-3 top-1/2 transform -translate-y-1/2 w-3.5 sm:w-4 h-3.5 sm:h-4 text-gray-400" />
            <input 
              type="text"
              placeholder="Search symbols..."
              className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs sm:text-sm focus:bg-white focus:border-gray-300 focus:outline-none transition-all duration-200"
            />
          </div>
        </div>

        {/* Navigation with modern styling */}
        <nav className="flex-1 px-2 sm:px-3 py-2 sm:py-4 space-y-0.5 sm:space-y-1 overflow-y-auto">
          {navigationItems.map((item) => {
              const Icon = item.icon
            const isActive = selectedTab === item.id
            
              return (
                <button
                  key={item.id}
                onClick={() => {
                  setSelectedTab(item.id)
                  setIsMobileMenuOpen(false)
                }}
                className={`nav-item w-full text-xs sm:text-sm ${
                  isActive ? 'active' : 'text-gray-600 hover:text-gray-900'
                }`}
                >
                <Icon className="w-4 sm:w-5 h-4 sm:h-5 flex-shrink-0" />
                  <span className="font-medium">{item.label}</span>
                </button>
              )
            })}
        </nav>

        {/* Bottom Section with Account Status */}
        <div className="relative p-3 sm:p-4 lg:p-5 border-t border-gray-100 bg-gradient-to-t from-gray-50 to-white">
          <div className="space-y-3 sm:space-y-4">
            {/* Connection Status */}
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm text-gray-600">Status</span>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <div className={`status-dot ${wsConnected ? 'status-connected' : 'status-disconnected'}`} />
                <span className="text-xs sm:text-sm font-medium text-gray-900">
                  {wsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          
            {/* Account Info Summary */}
            {accountInfo && (
              <div className="pt-2 sm:pt-3 border-t border-gray-100 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Portfolio</span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">
                    {formatCurrency(accountInfo.portfolioValue)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Buying Power</span>
                  <span className="text-xs sm:text-sm font-semibold text-gray-900">
                    {formatCurrency(accountInfo.buyingPower)}
                </span>
              </div>
            </div>
          )}

            {/* Market Status Badge */}
            {marketStatus && (
              <div className={`flex items-center justify-center py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs font-medium ${
                marketStatus.isOpen 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}>
                <ActivityIcon className="w-3 sm:w-3.5 h-3 sm:h-3.5 mr-1 sm:mr-1.5" />
                Market {marketStatus.isOpen ? 'Open' : 'Closed'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50/30">
        {/* Modern Top Header */}
        <header className="bg-white border-b border-gray-100 px-3 sm:px-4 lg:px-6 xl:px-8 py-3 sm:py-4 lg:py-5 relative">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-gray-50/0 via-gray-50/50 to-gray-50/0 opacity-50" />
          
          <div className="relative flex items-center justify-between">
            <div className="flex items-center space-x-3 sm:space-x-4">
              {/* Mobile Hamburger Menu */}
              <button 
                className="lg:hidden p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors duration-200"
                onClick={() => setIsMobileMenuOpen(true)}
              >
                <MenuIcon className="w-4 sm:w-5 h-4 sm:h-5 text-gray-600" />
              </button>
              <div className="slide-in-right">
                <h2 className="text-lg sm:text-xl lg:text-2xl xl:text-3xl font-semibold text-gray-900 capitalize tracking-tight">
                  {selectedTab}
                </h2>
                <p className="hidden sm:block text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1 font-medium">
                  {selectedTab === 'trade' && 'Execute trades using natural language'}
                  {selectedTab === 'portfolio' && 'Monitor your investment performance'}
                  {selectedTab === 'performance' && 'Analyze returns and benchmarks'}
                  {selectedTab === 'baskets' && 'Explore institutional portfolios'}
                  {selectedTab === 'market' && 'Real-time market intelligence'}
                </p>
              </div>
            </div>

            {/* Desktop Health Status */}
            <div className="hidden lg:flex items-center space-x-3 xl:space-x-4">
              {healthStatus && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Mode</p>
                  <p className="text-sm font-semibold text-gray-900 capitalize">
                    {healthStatus.mode}
                  </p>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Area with modern styling */}
        <main className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="w-full max-w-[1920px] mx-auto p-3 sm:p-4 lg:p-6 xl:p-8">
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
                    <div className="glass-card p-8 sm:p-12 text-center">
                      <div className="w-16 sm:w-20 h-16 sm:h-20 mx-auto mb-4 sm:mb-6 bg-gray-100 rounded-2xl flex items-center justify-center">
                        <LineChartIcon className="w-8 sm:w-10 h-8 sm:h-10 text-gray-400 animate-pulse" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">Loading Performance Analytics</h3>
                      <p className="text-sm sm:text-base text-gray-500">Preparing your portfolio insights...</p>
                      <div className="mt-6 sm:mt-8 flex justify-center">
                        <div className="spinner" />
                      </div>
                    </div>
                  }>
                    <PortfolioPerformance accountInfo={accountInfo} />
                  </Suspense>
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
          <div className="fixed bottom-4 sm:bottom-6 lg:bottom-8 right-4 sm:right-6 lg:right-8 max-w-[90vw] sm:max-w-md z-50 slide-in-bottom">
            <div className="glass-card p-4 sm:p-6 border-red-200 bg-red-50/90">
              <div className="flex items-start space-x-3">
                <div className="p-1.5 sm:p-2 bg-red-100 rounded-lg flex-shrink-0">
                  <XCircleIcon className="w-4 sm:w-5 h-4 sm:h-5 text-red-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-gray-900 mb-0.5 sm:mb-1 text-sm sm:text-base">Connection Error</h4>
                  <p className="text-xs sm:text-sm text-gray-600 break-words">
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