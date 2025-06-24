import { useQuery } from '@tanstack/react-query'
import { ClockIcon, TrendingUpIcon, CalendarIcon, InfoIcon } from 'lucide-react'
import { apiService } from '@/lib/api'

export function MarketStatus() {
  const { data: marketStatus, isLoading } = useQuery({
    queryKey: ['market-status'],
    queryFn: apiService.getMarketStatus,
    refetchInterval: 60000, // Refresh every minute
  })

  const currentTime = new Date()
  const marketOpenTime = new Date()
  marketOpenTime.setHours(9, 30, 0, 0) // 9:30 AM EST
  const marketCloseTime = new Date()
  marketCloseTime.setHours(16, 0, 0, 0) // 4:00 PM EST

  const isWeekend = currentTime.getDay() === 0 || currentTime.getDay() === 6
  const isAfterHours = currentTime < marketOpenTime || currentTime > marketCloseTime

  return (
    <div className="space-y-6">
      {/* Market Status Header */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <ClockIcon className="w-6 h-6 mr-3 text-gray-600" />
              Market Status
            </h2>
            <p className="text-gray-600">
              Current trading session information
            </p>
          </div>
          
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            marketStatus?.isOpen 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              marketStatus?.isOpen ? 'bg-green-500' : 'bg-red-500'
            }`} />
            {isLoading ? 'Checking...' : marketStatus?.isOpen ? 'Market Open' : 'Market Closed'}
          </div>
        </div>
      </div>

      {/* Trading Hours Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mr-3">
              <ClockIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Regular Hours</h3>
              <p className="text-sm text-gray-600">Monday - Friday</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Open:</span>
              <span className="text-sm font-medium text-gray-900">9:30 AM EST</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Close:</span>
              <span className="text-sm font-medium text-gray-900">4:00 PM EST</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mr-3">
              <TrendingUpIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Pre-Market</h3>
              <p className="text-sm text-gray-600">Extended hours</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Start:</span>
              <span className="text-sm font-medium text-gray-900">4:00 AM EST</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">End:</span>
              <span className="text-sm font-medium text-gray-900">9:30 AM EST</span>
            </div>
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center mr-3">
              <TrendingUpIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">After Hours</h3>
              <p className="text-sm text-gray-600">Extended hours</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Start:</span>
              <span className="text-sm font-medium text-gray-900">4:00 PM EST</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">End:</span>
              <span className="text-sm font-medium text-gray-900">8:00 PM EST</span>
            </div>
          </div>
        </div>
      </div>

      {/* Current Session Info */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <InfoIcon className="w-5 h-5 mr-2 text-gray-600" />
          Current Session
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Local Time</span>
              <span className="text-sm font-semibold text-gray-900">
                {currentTime.toLocaleTimeString()}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Market Date</span>
              <span className="text-sm font-semibold text-gray-900">
                {currentTime.toLocaleDateString()}
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Day of Week</span>
              <span className="text-sm font-semibold text-gray-900">
                {currentTime.toLocaleDateString('en-US', { weekday: 'long' })}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className={`p-4 rounded-lg border ${
              isWeekend 
                ? 'bg-yellow-50 border-yellow-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Weekend Status</span>
                <span className={`text-sm font-semibold ${
                  isWeekend ? 'text-yellow-800' : 'text-green-800'
                }`}>
                  {isWeekend ? 'Weekend' : 'Weekday'}
                </span>
              </div>
            </div>

            <div className={`p-4 rounded-lg border ${
              isAfterHours 
                ? 'bg-blue-50 border-blue-200' 
                : 'bg-green-50 border-green-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Trading Session</span>
                <span className={`text-sm font-semibold ${
                  isAfterHours ? 'text-blue-800' : 'text-green-800'
                }`}>
                  {isAfterHours ? 'After Hours' : 'Regular Hours'}
                </span>
              </div>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Trading Mode</span>
                <span className="text-sm font-semibold text-gray-900">
                  Paper Trading
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Market Holidays Notice */}
      <div className="glass-card p-6">
        <div className="flex items-start space-x-3">
          <CalendarIcon className="w-5 h-5 text-gray-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Market Holidays</h3>
            <p className="text-sm text-gray-600 mb-3">
              The stock market is closed on federal holidays and some other designated days.
            </p>
            <div className="text-xs text-gray-500">
              <p>• New Year's Day</p>
              <p>• Martin Luther King Jr. Day</p>
              <p>• Presidents' Day</p>
              <p>• Good Friday</p>
              <p>• Memorial Day</p>
              <p>• Juneteenth</p>
              <p>• Independence Day</p>
              <p>• Labor Day</p>
              <p>• Thanksgiving Day</p>
              <p>• Christmas Day</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
} 