import { useState, useRef, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  SparklesIcon, 
  AlertTriangleIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  DollarSignIcon,
  LoaderIcon,
  ArrowRightIcon,
  CheckIcon,
  XIcon,
  ShieldIcon,
  BarChart3Icon,
  LightbulbIcon,
  BrainCircuitIcon,
  ShieldCheckIcon,
  RocketIcon
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { apiService, type HedgeRecommendation, type MarketAnalysis } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { ProcessingSteps, type ProcessingStep } from './ProcessingSteps'

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
  const [hedgeRecommendation, setHedgeRecommendation] = useState<HedgeRecommendation | null>(null)
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis[] | null>(null)
  const [tradeRecommendations, setTradeRecommendations] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [tradeHistory, setTradeHistory] = useState<Array<{
    command: string
    result: TradeResult
    timestamp: Date
  }>>([])
  
  // New state for processing steps
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [showProcessingContainer, setShowProcessingContainer] = useState(false)
  const [requestType, setRequestType] = useState<'trade' | 'hedge' | 'analysis' | 'recommendation' | null>(null)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Helper functions for processing steps
  const initializeProcessingSteps = (type: string) => {
    let steps: ProcessingStep[] = []
    
    if (type === 'trade') {
      steps = [
        { id: 'parse', label: 'Understanding your request', status: 'pending' },
        { id: 'validate', label: 'Validating trade parameters', status: 'pending' },
        { id: 'confirm', label: 'Ready for confirmation', status: 'pending' }
      ]
    } else if (type === 'hedge') {
      steps = [
        { id: 'parse', label: 'Analyzing your hedging request', status: 'pending' },
        { id: 'portfolio', label: 'Reviewing portfolio positions', status: 'pending' },
        { id: 'strategy', label: 'Calculating optimal hedge strategy', status: 'pending' },
        { id: 'recommend', label: 'Preparing recommendations', status: 'pending' }
      ]
    } else if (type === 'analysis') {
      steps = [
        { id: 'parse', label: 'Processing analysis request', status: 'pending' },
        { id: 'market', label: 'Gathering market data', status: 'pending' },
        { id: 'analyze', label: 'Performing technical analysis', status: 'pending' },
        { id: 'report', label: 'Generating insights', status: 'pending' }
      ]
    } else if (type === 'recommendation') {
      steps = [
        { id: 'parse', label: 'Understanding your criteria', status: 'pending' },
        { id: 'scan', label: 'Scanning market opportunities', status: 'pending' },
        { id: 'evaluate', label: 'Evaluating risk/reward', status: 'pending' },
        { id: 'recommend', label: 'Finalizing recommendations', status: 'pending' }
      ]
    }
    
    setProcessingSteps(steps)
    setCurrentStep(-1)
    setShowProcessingContainer(true)
  }

  const updateStepStatus = (stepIndex: number, status: ProcessingStep['status'], message?: string) => {
    setProcessingSteps(prev => prev.map((step, idx) => 
      idx === stepIndex 
        ? { ...step, status, message } 
        : step
    ))
  }

  const advanceToStep = async (stepIndex: number) => {
    // Complete previous step
    if (stepIndex > 0) {
      updateStepStatus(stepIndex - 1, 'complete')
    }
    
    // Start new step
    setCurrentStep(stepIndex)
    if (stepIndex < processingSteps.length) {
      updateStepStatus(stepIndex, 'processing')
    }
    
    // Add a small delay for animation
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  const resetProcessing = () => {
    setProcessingSteps([])
    setCurrentStep(-1)
    setShowProcessingContainer(false)
    setRequestType(null)
  }

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Handle keyboard shortcuts for confirmation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showConfirmation && parsedCommand?.isValid) {
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault()
          handleConfirmTrade()
        } else if (e.key === 'n' || e.key === 'N' || e.key === 'Escape') {
          e.preventDefault()
          handleCancelTrade()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showConfirmation, parsedCommand])

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
      setShowConfirmation(false)
      resetProcessing()
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
      setShowConfirmation(false)
      if (currentStep >= 0) {
        updateStepStatus(currentStep, 'error', error.message || 'Trade execution failed')
      }
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || isLoading) return
    
    setIsLoading(true)
    setLoadingMessage('Understanding your request...')
    setParsedCommand(null)
    setHedgeRecommendation(null)
    setMarketAnalysis(null)
    setTradeRecommendations(null)
    setShowConfirmation(false)
    resetProcessing()
    
    try {
      // First try to parse as advanced intent
      const { intent, type } = await apiService.parseAdvancedIntent(command)
      
      setRequestType(type as any)
      initializeProcessingSteps(type)
      
      if (type === 'trade') {
        await advanceToStep(0) // Understanding request
        
        // Handle as regular trade
        const tradeIntent = intent as any
        
        await advanceToStep(1) // Validating parameters
        await new Promise(resolve => setTimeout(resolve, 800))
        
        setParsedCommand({
          action: tradeIntent.action,
          symbol: tradeIntent.symbol,
          quantity: tradeIntent.amountType === 'shares' ? tradeIntent.amount : undefined,
          amount: tradeIntent.amountType === 'dollars' ? tradeIntent.amount : undefined,
          orderType: tradeIntent.orderType,
          limitPrice: tradeIntent.limitPrice,
          isValid: true
        })
        
        await advanceToStep(2) // Ready for confirmation
        updateStepStatus(2, 'complete', 'Trade ready for execution')
        setShowConfirmation(true)
        
      } else if (type === 'hedge') {
        await advanceToStep(0) // Analyzing request
        
        // Get hedge recommendations
        await advanceToStep(1) // Reviewing portfolio
        await new Promise(resolve => setTimeout(resolve, 600))
        
        await advanceToStep(2) // Calculating strategy
        const { recommendation } = await apiService.getHedgeRecommendation(intent as any)
        
        await advanceToStep(3) // Preparing recommendations
        setHedgeRecommendation(recommendation)
        updateStepStatus(3, 'complete', 'Hedge strategy ready')
        
      } else if (type === 'analysis') {
        await advanceToStep(0) // Processing request
        
        await advanceToStep(1) // Gathering market data
        await new Promise(resolve => setTimeout(resolve, 500))
        
        await advanceToStep(2) // Performing analysis
        const { analyses } = await apiService.analyzeMarket(intent as any)
        
        await advanceToStep(3) // Generating insights
        setMarketAnalysis(analyses)
        updateStepStatus(3, 'complete', 'Analysis complete')
        
      } else if (type === 'recommendation') {
        await advanceToStep(0) // Understanding criteria
        
        await advanceToStep(1) // Scanning market
        await new Promise(resolve => setTimeout(resolve, 700))
        
        await advanceToStep(2) // Evaluating opportunities
        const { recommendations } = await apiService.getTradeRecommendations(intent as any)
        
        await advanceToStep(3) // Finalizing recommendations
        setTradeRecommendations(recommendations)
        updateStepStatus(3, 'complete', 'Recommendations ready')
      }
      
      setIsLoading(false)
      setLoadingMessage('')
    } catch (error: any) {
      console.error('Advanced parse error:', error)
      
      // Mark current step as error
      if (currentStep >= 0 && currentStep < processingSteps.length) {
        updateStepStatus(currentStep, 'error', error.message || 'An error occurred')
      }
      
      // Check if this looks like a hedging, analysis, or recommendation query
      const lowerCommand = command.toLowerCase()
      const isAdvancedQuery = lowerCommand.includes('hedge') || 
                             lowerCommand.includes('analyze') || 
                             lowerCommand.includes('analysis') || 
                             lowerCommand.includes('recommend') ||
                             lowerCommand.includes('what should i buy') ||
                             lowerCommand.includes('what should i sell')
      
      if (isAdvancedQuery) {
        // Show error for advanced queries that failed
        setParsedCommand({
          action: 'buy',
          symbol: '',
          orderType: 'market',
          isValid: false,
          errors: [`Advanced query failed: ${error.message || 'Unable to process this request'}. Please try rephrasing your question.`]
        })
      } else {
        // Fallback to simple command parsing for trade-like queries
        try {
          // Initialize simple trade processing
          setRequestType('trade')
          initializeProcessingSteps('trade')
          
          await advanceToStep(0) // Understanding request
          const parsed = await apiService.parseCommand(command)
          
          await advanceToStep(1) // Validating parameters
          setParsedCommand(parsed)
          
          if (parsed.isValid) {
            await advanceToStep(2) // Ready for confirmation
            updateStepStatus(2, 'complete', 'Trade ready for execution')
            setShowConfirmation(true)
          } else {
            updateStepStatus(1, 'error', 'Invalid trade parameters')
          }
        } catch (parseError: any) {
          if (currentStep >= 0) {
            updateStepStatus(currentStep, 'error', parseError.message || 'Failed to parse command')
          }
          setParsedCommand({
            action: 'buy',
            symbol: '',
            orderType: 'market',
            isValid: false,
            errors: [parseError.message || 'Failed to parse command']
          })
        }
      }
      setIsLoading(false)
      setLoadingMessage('')
    }
  }

  const handleConfirmTrade = () => {
    setIsLoading(true)
    executeCommandMutation.mutate(command, {
      onSettled: () => setIsLoading(false)
    })
  }

  const handleCancelTrade = () => {
    setShowConfirmation(false)
    setParsedCommand(null)
    setCommand('')
    resetProcessing()
    inputRef.current?.focus()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="space-y-6">
      {/* Main Input Card */}
      <div className="bg-white rounded-xl p-8 border border-gray-200 shadow-sm">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-2 flex items-center">
            <SparklesIcon className="w-5 h-5 mr-3 text-gray-400" />
            <span>Natural Language Trading</span>
          </h2>
          <p className="text-gray-600 text-sm">
            Type your trading commands, hedging questions, or market analysis requests in plain English.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <Input
              ref={inputRef}
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder='e.g., "Buy $1000 of AAPL" or "How to hedge my LULU position for earnings?"'
              className="w-full px-6 py-4 border border-gray-200 rounded-xl bg-white focus:border-gray-900 focus:ring-1 focus:ring-gray-900 focus:outline-none transition-all duration-200 placeholder:text-gray-500 text-base pr-14"
              disabled={isLoading}
            />
            
            {/* Loading indicator */}
            {isLoading && !showProcessingContainer && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                <LoaderIcon className="w-5 h-5 text-gray-400 animate-spin" />
                {loadingMessage && (
                  <span className="text-sm text-gray-500 animate-pulse">{loadingMessage}</span>
                )}
              </div>
            )}
            
            {/* Send button when not loading */}
            {!isLoading && command.trim() && (
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110"
              >
                <ArrowRightIcon className="w-4 h-4 text-white" />
              </button>
            )}
          </div>

          {/* Processing Container */}
          {showProcessingContainer && (
            <div className="processing-container result-container-enter">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0 mt-1">
                  {requestType === 'trade' && <RocketIcon className="w-6 h-6 text-gray-600" />}
                  {requestType === 'hedge' && <ShieldCheckIcon className="w-6 h-6 text-blue-600" />}
                  {requestType === 'analysis' && <BrainCircuitIcon className="w-6 h-6 text-purple-600" />}
                  {requestType === 'recommendation' && <LightbulbIcon className="w-6 h-6 text-amber-600" />}
                </div>
                
                <div className="flex-1 space-y-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {requestType === 'trade' && 'Processing Trade Request'}
                      {requestType === 'hedge' && 'Analyzing Hedge Strategy'}
                      {requestType === 'analysis' && 'Performing Market Analysis'}
                      {requestType === 'recommendation' && 'Generating Recommendations'}
                    </h3>
                    <p className="text-sm text-gray-600">"{command}"</p>
                  </div>
                  
                  <ProcessingSteps steps={processingSteps} currentStep={currentStep} />
                </div>
              </div>
            </div>
          )}

          {/* Command Preview - Now integrated with processing container */}
          {parsedCommand && showProcessingContainer && (
            <div className={`mt-4 p-4 rounded-xl border transition-all duration-200 slide-up-fade-in ${
              parsedCommand.isValid 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start space-x-3">
                <div className="mt-0.5">
                  {parsedCommand.isValid ? (
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  ) : (
                    <XCircleIcon className="w-5 h-5 text-red-600" />
                  )}
                </div>
                
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
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

                  {/* Confirmation UI */}
                  {showConfirmation && parsedCommand.isValid && (
                    <div className="mt-4 pt-4 border-t border-green-200 confirmation-slide-in">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-medium text-gray-900">
                          Are you sure you want to execute this trade?
                        </p>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">Y</kbd>
                          <span>/</span>
                          <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">N</kbd>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleConfirmTrade}
                          disabled={isLoading}
                          className="group relative inline-flex items-center justify-center px-6 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                        >
                          <div className="absolute inset-0 bg-green-400 rounded-lg opacity-0 group-hover:opacity-20 transition-opacity duration-200"></div>
                          {isLoading ? (
                            <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <CheckIcon className="w-4 h-4 mr-2" />
                          )}
                          <span>{isLoading ? 'Executing...' : 'Yes, Execute Trade'}</span>
                        </button>
                        
                        <button
                          onClick={handleCancelTrade}
                          disabled={isLoading}
                          className="group relative inline-flex items-center justify-center px-6 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                        >
                          <div className="absolute inset-0 bg-gray-400 rounded-lg opacity-0 group-hover:opacity-10 transition-opacity duration-200"></div>
                          <XIcon className="w-4 h-4 mr-2" />
                          <span>No, Cancel</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Hedge Recommendation Display - Integrated */}
          {hedgeRecommendation && showProcessingContainer && (
            <div className="mt-4 p-4 rounded-xl border bg-blue-50 border-blue-200 slide-up-fade-in">
              <div className="flex items-start space-x-3">
                <ShieldIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <h3 className="font-medium text-blue-900">Hedge Strategy Recommendation</h3>
                  <p className="text-sm text-blue-800">{hedgeRecommendation.strategy}</p>
                  
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-blue-900">Recommended Instruments:</h4>
                    {hedgeRecommendation.instruments.map((instrument, idx) => (
                      <div key={idx} className="bg-white/60 p-3 rounded-lg text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">
                            {instrument.action.toUpperCase()} {instrument.quantity} {instrument.symbol}
                          </span>
                        </div>
                        <p className="text-blue-700 text-xs">{instrument.reasoning}</p>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-white/60 p-3 rounded-lg text-sm space-y-1">
                    <div className="flex justify-between">
                      <span>Estimated Cost:</span>
                      <span className="font-medium">{formatCurrency(hedgeRecommendation.costEstimate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Risk Reduction:</span>
                      <span className="font-medium">{hedgeRecommendation.riskReduction}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Timeline:</span>
                      <span className="font-medium">{hedgeRecommendation.timeline}</span>
                    </div>
                  </div>
                  
                  <div className="bg-white/60 p-3 rounded-lg">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">Exit Conditions:</h4>
                    <ul className="space-y-1">
                      {hedgeRecommendation.exitConditions.map((condition, idx) => (
                        <li key={idx} className="text-sm text-blue-800 flex items-start">
                          <span className="text-blue-500 mr-2">•</span>
                          {condition}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Market Analysis Display - Integrated */}
          {marketAnalysis && marketAnalysis.length > 0 && showProcessingContainer && (
            <div className="mt-4 p-4 rounded-xl border bg-purple-50 border-purple-200 slide-up-fade-in">
              <div className="flex items-start space-x-3">
                <BarChart3Icon className="w-5 h-5 text-purple-600 mt-0.5" />
                <div className="flex-1 space-y-4">
                  <h3 className="font-medium text-purple-900">Market Analysis</h3>
                  
                  {marketAnalysis.map((analysis, idx) => (
                    <div key={idx} className="bg-white/60 p-4 rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <h4 className="font-medium text-purple-900">{analysis.symbol}</h4>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          analysis.sentiment === 'bullish' ? 'bg-green-100 text-green-800' :
                          analysis.sentiment === 'bearish' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {analysis.sentiment.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-purple-700">Confidence:</span>
                          <span className="font-medium ml-1">{analysis.confidence}%</span>
                        </div>
                        <div>
                          <span className="text-purple-700">Price Target:</span>
                          <span className="font-medium ml-1">{formatCurrency(analysis.priceTarget)}</span>
                        </div>
                      </div>
                      
                      {analysis.riskFactors.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-red-700 mb-1">Risk Factors:</h5>
                          <ul className="space-y-1">
                            {analysis.riskFactors.map((risk: string, rIdx: number) => (
                              <li key={rIdx} className="text-sm text-purple-800 flex items-start">
                                <span className="text-red-500 mr-2">•</span>
                                {risk}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {analysis.opportunities.length > 0 && (
                        <div>
                          <h5 className="text-sm font-medium text-green-700 mb-1">Opportunities:</h5>
                          <ul className="space-y-1">
                            {analysis.opportunities.map((opp: string, oIdx: number) => (
                              <li key={oIdx} className="text-sm text-purple-800 flex items-start">
                                <span className="text-green-500 mr-2">•</span>
                                {opp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <div className="pt-2 border-t border-purple-200">
                        <p className="text-sm text-purple-900">
                          <span className="font-medium">Recommendation:</span> {analysis.recommendation.toUpperCase()}
                        </p>
                        <p className="text-sm text-purple-800 mt-1">{analysis.reasoning}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Trade Recommendations Display - Integrated */}
          {tradeRecommendations && showProcessingContainer && (
            <div className="mt-4 p-4 rounded-xl border bg-amber-50 border-amber-200 slide-up-fade-in">
              <div className="flex items-start space-x-3">
                <LightbulbIcon className="w-5 h-5 text-amber-600 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <h3 className="font-medium text-amber-900">Trade Recommendations</h3>
                  
                  {tradeRecommendations.recommendations && (
                    <div className="space-y-3">
                      {tradeRecommendations.recommendations.map((rec: any, idx: number) => (
                        <div key={idx} className="bg-white/60 p-3 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-amber-900">
                              {rec.action.toUpperCase()} {rec.symbol}
                            </span>
                            <span className="text-sm text-amber-800">{rec.allocation}</span>
                          </div>
                          <p className="text-sm text-amber-800">{rec.rationale}</p>
                          {rec.targetPrice && (
                            <div className="text-xs text-amber-700">
                              Target: {formatCurrency(rec.targetPrice)} | Stop Loss: {formatCurrency(rec.stopLoss || 0)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {tradeRecommendations.strategy && (
                    <div className="bg-white/60 p-3 rounded-lg">
                      <h4 className="text-sm font-medium text-amber-900 mb-1">Strategy:</h4>
                      <p className="text-sm text-amber-800">{tradeRecommendations.strategy}</p>
                    </div>
                  )}
                  
                  {tradeRecommendations.risks && (
                    <div>
                      <h4 className="text-sm font-medium text-red-700 mb-1">Key Risks:</h4>
                      <ul className="space-y-1">
                        {tradeRecommendations.risks.map((risk: string, idx: number) => (
                          <li key={idx} className="text-sm text-amber-800 flex items-start">
                            <span className="text-red-500 mr-2">•</span>
                            {risk}
                          </li>
                        ))}
                      </ul>
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
        <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span>Recent Activity</span>
            <div className="ml-2 w-2 h-2 bg-green-500 rounded-full"></div>
          </h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
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
                    <div>
                      {trade.result.success ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-600 flex-shrink-0" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0" />
                      )}
                    </div>
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