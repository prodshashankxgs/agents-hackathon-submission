import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  SendIcon, 
  SparklesIcon, 
  AlertTriangleIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  DollarSignIcon 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { apiService } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

interface ParsedCommand {
  action: 'buy' | 'sell'
  symbol: string
  quantity?: number
  amount?: number
  orderType: 'market' | 'limit'
  limitPrice?: number
  isValid: boolean
  errors?: string[]
  warnings?: string[]
}

interface TradeResult {
  success: boolean
  message: string
  order?: any
  error?: string
}

export function TradingInterface() {
  const [command, setCommand] = useState('')
  const [parsedCommand, setParsedCommand] = useState<ParsedCommand | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [tradeHistory, setTradeHistory] = useState<Array<{
    command: string
    result: TradeResult
    timestamp: Date
  }>>([])
  
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const parseCommandMutation = useMutation({
    mutationFn: (command: string) => apiService.parseCommand(command),
    onSuccess: (data) => {
      setParsedCommand(data)
    },
    onError: (error) => {
      console.error('Parse error:', error)
      setParsedCommand(null)
    }
  })

  const executeCommandMutation = useMutation({
    mutationFn: (command: string) => apiService.executeCommand(command),
    onSuccess: (data) => {
      setTradeHistory(prev => [{
        command,
        result: data,
        timestamp: new Date()
      }, ...prev])
      setCommand('')
      setParsedCommand(null)
      // Refresh account data after successful trade
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['account'] })
      }
    },
    onError: (error: any) => {
      setTradeHistory(prev => [{
        command,
        result: {
          success: false,
          message: error.message || 'Trade execution failed',
          error: error.message
        },
        timestamp: new Date()
      }, ...prev])
    }
  })

  const handleInputChange = (value: string) => {
    setCommand(value)
    if (value.trim()) {
      parseCommandMutation.mutate(value)
    } else {
      setParsedCommand(null)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return
    
    setIsLoading(true)
    executeCommandMutation.mutate(command, {
      onSettled: () => setIsLoading(false)
    })
  }

  return (
    <div className="space-y-6">
      {/* Main Input Card */}
      <div className="glass-card p-6 lg:p-8">
        <div className="mb-6">
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2 flex items-center">
            <SparklesIcon className="w-5 h-5 lg:w-6 lg:h-6 mr-2 lg:mr-3 text-gray-600 flex-shrink-0" />
            <span>Natural Language Trading</span>
          </h2>
          <p className="text-gray-600 text-sm lg:text-base">
            Type your trading commands in plain English. I'll parse and execute them safely.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <Input
              ref={inputRef}
              value={command}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Enter your trading command..."
              className="w-full px-6 py-5 border border-gray-200 rounded-xl bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none transition-all duration-200 placeholder:text-gray-500 text-base pr-12"
              disabled={isLoading}
            />
            <Button
              type="submit"
              disabled={!command.trim() || isLoading}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 p-0 bg-gray-900 hover:bg-gray-800 rounded-lg"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
              </svg>
            </Button>
          </div>

          {/* Command Preview */}
          {parsedCommand && (
            <div className={`p-4 rounded-xl border transition-all duration-200 ${
              parsedCommand.isValid 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start space-x-3">
                {parsedCommand.isValid ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircleIcon className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 lg:gap-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      parsedCommand.action === 'buy' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {parsedCommand.action === 'buy' ? (
                        <TrendingUpIcon className="w-3 h-3 mr-1" />
                      ) : (
                        <TrendingDownIcon className="w-3 h-3 mr-1" />
                      )}
                      {parsedCommand.action.toUpperCase()}
                    </span>
                    
                    <span className="font-medium text-gray-900">
                      {parsedCommand.symbol}
                    </span>
                    
                    {parsedCommand.quantity && (
                      <span className="text-gray-600 text-sm">
                        {parsedCommand.quantity} shares
                      </span>
                    )}
                    
                    {parsedCommand.amount && (
                      <span className="text-gray-600 flex items-center text-sm">
                        <DollarSignIcon className="w-3 h-3 mr-1" />
                        {formatCurrency(parsedCommand.amount)}
                      </span>
                    )}
                    
                    <span className={`px-2 py-1 rounded text-xs ${
                      parsedCommand.orderType === 'market' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {parsedCommand.orderType}
                    </span>
                  </div>

                  {parsedCommand.errors && parsedCommand.errors.length > 0 && (
                    <div className="space-y-1">
                      {parsedCommand.errors.map((error, index) => (
                        <p key={index} className="text-sm text-red-700 flex items-center">
                          <XCircleIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                          {error}
                        </p>
                      ))}
                    </div>
                  )}

                  {parsedCommand.warnings && parsedCommand.warnings.length > 0 && (
                    <div className="space-y-1">
                      {parsedCommand.warnings.map((warning, index) => (
                        <p key={index} className="text-sm text-amber-700 flex items-center">
                          <AlertTriangleIcon className="w-4 h-4 mr-2 flex-shrink-0" />
                          {warning}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Trade History */}
      {tradeHistory.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
            {tradeHistory.map((trade, index) => (
              <div
                key={index}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  trade.result.success 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center space-x-2 min-w-0 flex-1">
                    {trade.result.success ? (
                      <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                    ) : (
                      <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0" />
                    )}
                    <span className="font-medium text-gray-900 truncate">
                      "{trade.command}"
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {trade.timestamp.toLocaleTimeString()}
                  </span>
                </div>
                
                <p className={`text-sm ${
                  trade.result.success ? 'text-green-700' : 'text-red-700'
                }`}>
                  {trade.result.message}
                </p>
                
                {trade.result.order && (
                  <div className="mt-2 text-xs text-gray-600">
                    Order ID: {trade.result.order.id}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 