import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  ClockIcon, 
  CalendarIcon, 
  InfoIcon,
  ActivityIcon,
  BellIcon,
  ZapIcon,
  AlertCircleIcon,
  GlobeIcon,
  SunIcon,
  MoonIcon
} from 'lucide-react'
import { apiService } from '@/lib/api'

export function MarketStatus() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [timeUntilOpen, setTimeUntilOpen] = useState<string>('')
  const [timeUntilClose, setTimeUntilClose] = useState<string>('')

  const { data: marketStatus, isLoading } = useQuery({
    queryKey: ['market-status'],
    queryFn: apiService.getMarketStatus,
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  // Calculate time until market open/close
  useEffect(() => {
    const now = currentTime
    const marketOpenTime = new Date(now)
    marketOpenTime.setHours(9, 30, 0, 0) // 9:30 AM EST
    const marketCloseTime = new Date(now)
    marketCloseTime.setHours(16, 0, 0, 0) // 4:00 PM EST

    // If it's after close, set to next day's open
    if (now > marketCloseTime) {
      marketOpenTime.setDate(marketOpenTime.getDate() + 1)
    }

    // Calculate time differences
    const msUntilOpen = marketOpenTime.getTime() - now.getTime()
    const msUntilClose = marketCloseTime.getTime() - now.getTime()

    if (msUntilOpen > 0 && (now < marketOpenTime || now > marketCloseTime)) {
      const hours = Math.floor(msUntilOpen / (1000 * 60 * 60))
      const minutes = Math.floor((msUntilOpen % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((msUntilOpen % (1000 * 60)) / 1000)
      setTimeUntilOpen(`${hours}h ${minutes}m ${seconds}s`)
    } else {
      setTimeUntilOpen('')
    }

    if (msUntilClose > 0 && now >= marketOpenTime && now <= marketCloseTime) {
      const hours = Math.floor(msUntilClose / (1000 * 60 * 60))
      const minutes = Math.floor((msUntilClose % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((msUntilClose % (1000 * 60)) / 1000)
      setTimeUntilClose(`${hours}h ${minutes}m ${seconds}s`)
    } else {
      setTimeUntilClose('')
    }
  }, [currentTime])

  const marketOpenTime = new Date()
  marketOpenTime.setHours(9, 30, 0, 0)
  const marketCloseTime = new Date()
  marketCloseTime.setHours(16, 0, 0, 0)

  const isWeekend = currentTime.getDay() === 0 || currentTime.getDay() === 6
  const isPreMarket = currentTime.getHours() >= 4 && currentTime < marketOpenTime
  const isPostMarket = currentTime > marketCloseTime && currentTime.getHours() < 20

  // Market sessions data
  const sessions = [
    {
      name: 'Pre-Market',
      icon: SunIcon,
      start: '4:00 AM',
      end: '9:30 AM',
      active: isPreMarket && !isWeekend,
      color: 'amber'
    },
    {
      name: 'Regular Hours',
      icon: ActivityIcon,
      start: '9:30 AM',
      end: '4:00 PM',
      active: marketStatus?.isOpen || false,
      color: 'green'
    },
    {
      name: 'After Hours',
      icon: MoonIcon,
      start: '4:00 PM',
      end: '8:00 PM',
      active: isPostMarket && !isWeekend,
      color: 'indigo'
    }
  ]

  // Global markets data
  const globalMarkets = [
    { name: 'NYSE', status: marketStatus?.isOpen ? 'Open' : 'Closed', region: 'US' },
    { name: 'NASDAQ', status: marketStatus?.isOpen ? 'Open' : 'Closed', region: 'US' },
    { name: 'LSE', status: 'Closed', region: 'UK' },
    { name: 'TSE', status: 'Open', region: 'JP' },
    { name: 'SSE', status: 'Closed', region: 'CN' },
    { name: 'DAX', status: 'Closed', region: 'DE' }
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Modern Market Status Header */}
      <div className="brokerage-card p-4 sm:p-6 lg:p-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-white opacity-50" />
        
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 lg:mb-8 space-y-4 sm:space-y-0">
            <div>
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 tracking-tight flex items-center">
                <div className="p-2 sm:p-2.5 lg:p-3 bg-gray-900 rounded-lg sm:rounded-xl mr-2 sm:mr-3 lg:mr-4">
                  <ClockIcon className="w-4 sm:w-5 lg:w-6 h-4 sm:h-5 lg:h-6 text-white" />
                </div>
                Market Status
              </h2>
              <p className="text-gray-500 mt-1 sm:mt-2 text-sm sm:text-base lg:text-lg">
                Real-time trading session information
              </p>
            </div>
            
            <div className="flex items-center space-x-2 sm:space-x-3 lg:space-x-4">
              <div className={`flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 lg:px-6 py-1.5 sm:py-2 lg:py-3 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 ${
                marketStatus?.isOpen 
                  ? 'bg-green-100 text-green-700 shadow-[0_0_20px_rgba(34,197,94,0.2)]' 
                  : 'bg-gray-100 text-gray-700'
              }`}>
                <div className={`w-2 sm:w-2.5 lg:w-3 h-2 sm:h-2.5 lg:h-3 rounded-full ${
                  marketStatus?.isOpen ? 'bg-green-500' : 'bg-gray-400'
                } ${marketStatus?.isOpen ? 'animate-pulse' : ''}`} />
                <span>{isLoading ? 'Checking...' : marketStatus?.isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}</span>
              </div>
              
              <button className="hidden sm:block p-2 sm:p-2.5 lg:p-3 hover:bg-gray-100 rounded-lg transition-colors group">
                <BellIcon className="w-4 sm:w-4 lg:w-5 h-4 sm:h-4 lg:h-5 text-gray-400 group-hover:text-gray-600" />
              </button>
            </div>
          </div>

          {/* Live Clock and Countdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6 mb-4 sm:mb-6 lg:mb-8">
            <div className="metric-card p-3 sm:p-4">
              <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">Current Time</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 font-mono number-counter">
                {currentTime.toLocaleTimeString('en-US', { hour12: false })}
              </p>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            
            {timeUntilOpen && (
              <div className="metric-card p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">Opens In</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 font-mono">
                  {timeUntilOpen}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">Next trading session</p>
              </div>
            )}
            
            {timeUntilClose && (
              <div className="metric-card p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">Closes In</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-red-600 font-mono">
                  {timeUntilClose}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">Current session ends</p>
              </div>
            )}
            
            {!timeUntilOpen && !timeUntilClose && (
              <div className="metric-card p-3 sm:p-4">
                <p className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider mb-1 sm:mb-2">Session Status</p>
                <p className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">
                  {isWeekend ? 'Weekend' : 'After Hours'}
                </p>
                <p className="text-xs sm:text-sm text-gray-500 mt-0.5 sm:mt-1">Markets closed</p>
              </div>
            )}
          </div>

          {/* Trading Sessions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {sessions.map((session, index) => {
              const Icon = session.icon
              return (
                <div 
                  key={session.name}
                  className={`brokerage-card p-4 sm:p-5 lg:p-6 transition-all duration-300 ${
                    session.active ? 'ring-2 ring-gray-900 shadow-lg' : ''
                  }`}
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <div className="flex items-start justify-between mb-3 sm:mb-4">
                    <div className={`p-2 sm:p-2.5 lg:p-3 rounded-lg sm:rounded-xl ${
                      session.active 
                        ? session.color === 'green' ? 'bg-green-600' : 
                          session.color === 'amber' ? 'bg-amber-600' : 
                          'bg-indigo-600'
                        : 'bg-gray-100'
                    }`}>
                      <Icon className={`w-4 sm:w-4 lg:w-5 h-4 sm:h-4 lg:h-5 ${
                        session.active ? 'text-white' : 'text-gray-400'
                      }`} />
                    </div>
                    {session.active && (
                      <div className="badge bg-gray-900 text-white px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm">
                        <ZapIcon className="w-2.5 sm:w-3 h-2.5 sm:h-3 mr-0.5 sm:mr-1" />
                        Active
                      </div>
                    )}
                  </div>
                  
                  <h3 className="text-base sm:text-base lg:text-lg font-semibold text-gray-900 mb-0.5 sm:mb-1">{session.name}</h3>
                  <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4">Trading session</p>
                  
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-gray-500">Start:</span>
                      <span className="font-medium text-gray-900">{session.start} EST</span>
                    </div>
                    <div className="flex justify-between text-xs sm:text-sm">
                      <span className="text-gray-500">End:</span>
                      <span className="font-medium text-gray-900">{session.end} EST</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Global Markets Overview */}
      <div className="brokerage-card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-gray-900 flex items-center">
            <GlobeIcon className="w-5 h-5 mr-2 text-gray-600" />
            Global Markets
          </h3>
          <button className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            View All Markets
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {globalMarkets.map((market, index) => (
            <div 
              key={market.name}
              className="text-center p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-all duration-200 hover-lift"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
                market.status === 'Open' ? 'bg-green-100' : 'bg-gray-100'
              }`}>
                <span className="text-xs font-bold text-gray-700">{market.region}</span>
              </div>
              <p className="font-semibold text-gray-900">{market.name}</p>
              <p className={`text-xs font-medium mt-1 ${
                market.status === 'Open' ? 'text-green-600' : 'text-gray-500'
              }`}>
                {market.status}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Current Session Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="brokerage-card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <InfoIcon className="w-5 h-5 mr-2 text-gray-600" />
            Session Information
          </h3>

          <div className="space-y-3">
            <div className={`p-4 rounded-lg transition-all duration-200 ${
              isWeekend 
                ? 'bg-amber-50 border border-amber-200' 
                : 'bg-gray-50 border border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Day Type</span>
                <span className={`text-sm font-semibold ${
                  isWeekend ? 'text-amber-700' : 'text-gray-900'
                }`}>
                  {isWeekend ? 'Weekend' : 'Trading Day'}
                </span>
              </div>
            </div>

            <div className={`p-4 rounded-lg transition-all duration-200 ${
              marketStatus?.isOpen
                ? 'bg-green-50 border border-green-200' 
                : isPreMarket
                  ? 'bg-amber-50 border border-amber-200'
                  : isPostMarket
                    ? 'bg-indigo-50 border border-indigo-200'
                    : 'bg-gray-50 border border-gray-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Current Session</span>
                <span className={`text-sm font-semibold ${
                  marketStatus?.isOpen ? 'text-green-700' : 
                  isPreMarket ? 'text-amber-700' :
                  isPostMarket ? 'text-indigo-700' :
                  'text-gray-700'
                }`}>
                  {marketStatus?.isOpen ? 'Regular Trading' :
                   isPreMarket ? 'Pre-Market' :
                   isPostMarket ? 'After Hours' :
                   'Closed'}
                </span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Trading Mode</span>
                <div className="badge bg-gray-100 text-gray-700 px-3 py-1">
                  Paper Trading
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Market Holidays */}
        <div className="brokerage-card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <CalendarIcon className="w-5 h-5 mr-2 text-gray-600" />
            Upcoming Holidays
          </h3>
          
          <div className="space-y-3">
            {[
              { date: 'Feb 19', name: 'Presidents Day', daysAway: 45 },
              { date: 'Mar 29', name: 'Good Friday', daysAway: 84 },
              { date: 'May 27', name: 'Memorial Day', daysAway: 143 },
              { date: 'Jul 4', name: 'Independence Day', daysAway: 181 }
            ].map((holiday, index) => (
              <div 
                key={holiday.name}
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-xs font-bold text-gray-600">{holiday.date.split(' ')[0]}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{holiday.name}</p>
                    <p className="text-xs text-gray-500">{holiday.date}, 2024</p>
                  </div>
                </div>
                <span className="text-xs text-gray-500">{holiday.daysAway} days</span>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-4 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">
            View Full Calendar
          </button>
        </div>
      </div>

      {/* Market Alert */}
      {isWeekend && (
        <div className="glass-card p-6 border-amber-200 bg-amber-50/50 slide-in-bottom">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <AlertCircleIcon className="w-5 h-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-1">Weekend Trading Notice</h4>
              <p className="text-sm text-gray-600">
                Markets are closed on weekends. Trading will resume on Monday at 9:30 AM EST.
                You can still place orders, but they will be queued for execution when markets open.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 