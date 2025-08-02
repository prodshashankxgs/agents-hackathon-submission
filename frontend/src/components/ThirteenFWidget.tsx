import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  TrendingUpIcon, 
  SearchIcon, 
  DollarSignIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  LoaderIcon
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { apiService } from '@/lib/api'

interface ThirteenFWidgetProps {
  className?: string
}

export function ThirteenFWidget({ className = '' }: ThirteenFWidgetProps) {
  const [institution, setInstitution] = useState('')
  const [investmentAmount, setInvestmentAmount] = useState('10000')
  const [isCreatingBasket, setIsCreatingBasket] = useState(false)
  
  const queryClient = useQueryClient()

  const createBasketMutation = useMutation({
    mutationFn: ({ institution, amount }: { institution: string; amount: number }) =>
      apiService.create13FBasket(institution, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baskets'] })
      setInstitution('')
      setInvestmentAmount('10000')
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!institution.trim()) {
      return
    }

    const amount = parseFloat(investmentAmount.replace(/[,$]/g, ''))
    if (isNaN(amount) || amount < 100) {
      return
    }

    setIsCreatingBasket(true)
    try {
      await createBasketMutation.mutateAsync({ institution: institution.trim(), amount })
    } finally {
      setIsCreatingBasket(false)
    }
  }

  const popularInstitutions = [
    'Bridgewater Associates',
    'Berkshire Hathaway',
    'Renaissance Technologies',
    'BlackRock',
    'Vanguard Group',
    'State Street Corporation'
  ]

  const isLoading = createBasketMutation.isPending || isCreatingBasket
  const error = createBasketMutation.error
  const success = createBasketMutation.isSuccess

  return (
    <div className={`bg-white rounded-xl p-4 sm:p-6 border border-gray-200 shadow-sm ${className}`}>
      <div className="flex items-center mb-4 sm:mb-6">
        <TrendingUpIcon className="w-5 sm:w-6 h-5 sm:h-6 mr-2 sm:mr-3 text-blue-600" />
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">13F Portfolio Baskets</h2>
          <p className="text-xs sm:text-sm text-gray-600">
            Invest in institutional portfolio strategies
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Institution Input */}
        <div>
          <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-2">
            Institution Name
          </label>
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              id="institution"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="e.g., Bridgewater Associates"
              disabled={isLoading}
            />
          </div>
          
          {/* Popular Institutions */}
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-2">Popular institutions:</p>
            <div className="flex flex-wrap gap-1">
              {popularInstitutions.slice(0, 3).map((inst) => (
                <button
                  key={inst}
                  type="button"
                  onClick={() => setInstitution(inst)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                  disabled={isLoading}
                >
                  {inst}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Investment Amount Input */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
            Investment Amount
          </label>
          <div className="relative">
            <DollarSignIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              id="amount"
              value={investmentAmount}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '')
                setInvestmentAmount(value)
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              placeholder="10000"
              disabled={isLoading}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Minimum: $100. Amount: {formatCurrency(parseFloat(investmentAmount.replace(/[,$]/g, '')) || 0)}
          </p>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isLoading || !institution.trim() || parseFloat(investmentAmount) < 100}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center text-sm"
        >
          {isLoading ? (
            <>
              <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
              Creating Basket...
            </>
          ) : (
            <>
              <TrendingUpIcon className="w-4 h-4 mr-2" />
              Create 13F Basket
            </>
          )}
        </button>
      </form>

      {/* Status Messages */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start">
          <AlertCircleIcon className="w-4 h-4 text-red-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-700">
            <p className="font-medium">Failed to create basket</p>
            <p className="text-xs mt-1">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </p>
          </div>
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start">
          <CheckCircleIcon className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-green-700">
            <p className="font-medium">Basket created successfully!</p>
            <p className="text-xs mt-1">
              Check the Portfolio Baskets tab to view and execute your basket.
            </p>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start">
          <AlertCircleIcon className="w-4 h-4 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-blue-700">
            <p className="font-medium">How it works:</p>
            <ul className="mt-1 space-y-1">
              <li>• We fetch the latest 13F filing for the institution</li>
              <li>• Create a weighted portfolio based on their holdings</li>
              <li>• Generate buy orders proportional to your investment</li>
              <li>• Execute trades when you're ready</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}