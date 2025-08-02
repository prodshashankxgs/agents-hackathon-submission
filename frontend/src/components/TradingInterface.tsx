import { Suspense } from 'react'
import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { 
  SparklesIcon, 
  AlertTriangleIcon, 
  CheckCircleIcon, 
  XCircleIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  DollarSignIcon,
  CheckIcon,
  XIcon,
  ShieldIcon,
  BarChart3Icon,
  LightbulbIcon,
  RocketIcon,
  ZapIcon,
  ArrowUpIcon
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { AnimatedSelect, type SelectOption } from '@/components/ui/animated-select'
import { apiService, type HedgeRecommendation, type MarketAnalysis, type ThirteenFPortfolio, type PortfolioBasket, type MarketData, tradingWS, type LLMProvider } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { type ProcessingStep } from './ProcessingSteps'
import { ResponsiveContainer as RechartsContainer, PieChart, Pie, Tooltip as PieTooltip, Cell } from 'recharts'
import { OptionsWidget } from './OptionsWidget'
import StockWidget from './StockPage'

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

interface TradingInterfaceProps {
  accountInfo?: any;
}

export function TradingInterface({ accountInfo }: TradingInterfaceProps = {}) {
  const [command, setCommand] = useState('')
  const [parsedCommand, setParsedCommand] = useState<ParsedCommand | null>(null)
  const [hedgeRecommendation, setHedgeRecommendation] = useState<HedgeRecommendation | null>(null)
  const [marketAnalysis, setMarketAnalysis] = useState<MarketAnalysis[] | null>(null)
  const [tradeRecommendations, setTradeRecommendations] = useState<any>(null)
  const [thirteenFPortfolio, setThirteenFPortfolio] = useState<ThirteenFPortfolio | null>(null)
  const [livePrice, setLivePrice] = useState<MarketData | null>(null)
  const [thirteenFInvestment, setThirteenFInvestment] = useState<{
    basket: PortfolioBasket
    allocation: any[]
    tradeResults: any[]
  } | null>(null)

  const [showInvestmentInput, setShowInvestmentInput] = useState(false)
  const [investmentAmount, setInvestmentAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [isConfirmationAnimatingOut, setIsConfirmationAnimatingOut] = useState(false)
  const [tradeHistory, setTradeHistory] = useState<Array<{
    command: string
    result: TradeResult
    timestamp: Date
  }>>([])
  
  // New state for processing steps
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([])
  const [currentStep, setCurrentStep] = useState(-1)
  const [showProcessingContainer, setShowProcessingContainer] = useState(false)
  const [requestType, setRequestType] = useState<'trade' | 'hedge' | 'analysis' | 'recommendation' | 'info' | '13f' | 'politicians' | null>(null)
  
  // Options widget state
  const [showOptionsWidget, setShowOptionsWidget] = useState(false)
  const [optionsSymbol, setOptionsSymbol] = useState<string>('')
  
  // Stock search state
  const [selectedStock, setSelectedStock] = useState<string | null>(null)
  const [showStockPage, setShowStockPage] = useState(false)
  
  // LLM Provider state
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('openai')
  const [isChangingProvider, setIsChangingProvider] = useState(false)
  
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Fetch live price data when parsed command changes
  useEffect(() => {
    const fetchLivePrice = async () => {
      if (parsedCommand?.symbol && parsedCommand.isValid) {
        try {
          const tickerInfo = await apiService.getTickerInfo(parsedCommand.symbol)
          if (tickerInfo.marketData) {
            setLivePrice(tickerInfo.marketData)
          }
        } catch (error) {
          console.error('Failed to fetch live price:', error)
          setLivePrice(null)
        }
      } else {
        setLivePrice(null)
      }
    }

    fetchLivePrice()

    // Set up interval to refresh price every 10 seconds when confirmation is shown
    let interval: NodeJS.Timeout | null = null
    if (parsedCommand?.symbol && parsedCommand.isValid && showConfirmation) {
      interval = setInterval(fetchLivePrice, 10000)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [parsedCommand?.symbol, parsedCommand?.isValid, showConfirmation])

  // Function to detect if input is a stock symbol
  const isStockSymbol = (input: string): boolean => {
    const trimmed = input.trim().toUpperCase()
    return /^[A-Z]{1,5}(\.[A-Z])?$/.test(trimmed) && !trimmed.includes(' ')
  }

  // Function to handle stock search
  const handleStockSearch = (symbol: string) => {
    const upperSymbol = symbol.toUpperCase()
    setSelectedStock(upperSymbol)
    setShowStockPage(true)
    
    // Subscribe to real-time updates
    if (tradingWS) {
      tradingWS.subscribe(upperSymbol, (_data: MarketData) => {
        // This part of the logic is now handled by the StockPage component
        // setRealtimeData(prev => ({ ...prev, [upperSymbol]: data }))
      })
    }
  }

  // Handle 13F commands
  const handle13FCommand = async (command: string) => {
    console.log('Processing 13F command:', command)
    
    // Extract institution name from command
    let institution = ''
    const lowerCommand = command.toLowerCase()
    
    if (lowerCommand.includes('bridgewater')) {
      institution = 'Bridgewater Associates'
    } else if (lowerCommand.includes('berkshire')) {
      institution = 'Berkshire Hathaway'
    } else {
      // Try to extract institution from patterns like "show me X's 13f"
      const institutionMatch = command.match(/(?:show me|pull up)\s+([^'s]+)(?:'s)?\s+(?:13f|filing|portfolio)/i)
      if (institutionMatch) {
        institution = institutionMatch[1].trim()
      }
    }

    if (!institution) {
      // Show error message
      console.error('Could not extract institution name from command')
      setLoadingMessage('Could not identify institution. Try "show me bridgewater\'s 13f" or "pull up berkshire\'s portfolio"')
      setTimeout(() => setLoadingMessage(''), 3000)
      return
    }

    // Extract investment amount if specified
    let amount = 10000 // Default
    const amountMatch = command.match(/\$([0-9,]+(?:\.[0-9]{2})?)/);
    if (amountMatch) {
      amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    }

    console.log(`Creating 13F basket for ${institution} with $${amount}`)

    try {
      setIsLoading(true)
      setLoadingMessage(`Fetching ${institution}'s latest 13F filing...`)
      
      const result = await apiService.create13FBasket(institution, amount)
      
      if (result.success) {
        console.log('13F basket created successfully:', result.basket)
        setLoadingMessage('✅ 13F basket created successfully! Check the Baskets tab to view and execute.')
        
        // Clear loading state after a moment
        setTimeout(() => {
          setIsLoading(false)
          setLoadingMessage('')
        }, 4000)
      } else {
        console.error('Failed to create 13F basket')
        setLoadingMessage('❌ Failed to create 13F basket. Please try again.')
        setTimeout(() => {
          setIsLoading(false)
          setLoadingMessage('')
        }, 3000)
      }
    } catch (error) {
      console.error('Error creating 13F basket:', error)
      setLoadingMessage('❌ Error creating 13F basket. Please check your Perplexity API key is configured.')
      setTimeout(() => {
        setIsLoading(false)
        setLoadingMessage('')
      }, 5000)
    }
  }



  // Helper functions for processing steps
  const initializeProcessingSteps = (type: string) => {
    let steps: ProcessingStep[] = []
    
          if (type === 'trade') {
        steps = [
          { id: 'parse', label: 'Understanding your request', status: 'pending' },
          { id: 'validate', label: 'Validating trade parameters', status: 'pending' },
          { id: 'confirm', label: 'Ready for execution', status: 'pending' }
        ]
      } else if (type === '13f') {
        steps = [
          { id: 'parse', label: 'Analyzing 13F request', status: 'pending' },
          { id: 'fetch', label: 'Fetching institutional holdings', status: 'pending' },
          { id: 'calculate', label: 'Calculating portfolio allocation', status: 'pending' },
          { id: 'present', label: 'Preparing investment options', status: 'pending' }
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
    } else if (type === 'info') {
      steps = [
        { id: 'parse', label: 'Processing information request', status: 'pending' },
        { id: 'fetch', label: 'Fetching stock data', status: 'pending' },
        { id: 'display', label: 'Opening stock information', status: 'pending' }
      ]
    } else if (type === 'politicians') {
      steps = [
        { id: 'parse', label: 'Analyzing politician request', status: 'pending' },
        { id: 'fetch', label: 'Fetching congressional trades', status: 'pending' },
        { id: 'calculate', label: 'Calculating portfolio allocation', status: 'pending' },
        { id: 'present', label: 'Preparing investment options', status: 'pending' }
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
      // Wait for completion animation
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Start new step
    setCurrentStep(stepIndex)
    if (stepIndex < processingSteps.length) {
      updateStepStatus(stepIndex, 'processing')
    }
    
    // Add a delay for each step to show one by one
    await new Promise(resolve => setTimeout(resolve, 800))
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

  // Fetch current LLM provider on mount
  useEffect(() => {
    const fetchProvider = async () => {
      try {
        console.log('Fetching current LLM provider...')
        const response = await apiService.getLLMProvider()
        console.log('LLM provider response:', response)
        if (response.success && response.provider) {
          setLlmProvider(response.provider as LLMProvider)
          console.log('Set LLM provider to:', response.provider)
        }
      } catch (error) {
        console.error('Failed to fetch LLM provider:', error)
        // Fallback to default provider
        setLlmProvider('openai')
      }
    }
    fetchProvider()
  }, [])

  // LLM Provider options
  const providerOptions: SelectOption[] = [
    { 
      value: 'openai', 
      label: 'OpenAI'
    },
    { 
      value: 'claude', 
      label: 'Claude'
    }
  ]

  // Handle provider change
  const handleProviderChange = async (newProvider: string) => {
    console.log('🔄 handleProviderChange called with:', newProvider)
    console.log('🔄 Current provider:', llmProvider)
    console.log('🔄 Is changing provider:', isChangingProvider)
    
    const provider = newProvider as LLMProvider
    if (provider === llmProvider) {
      console.log('⏭️ Same provider selected, skipping')
      return
    }
    
    if (isChangingProvider) {
      console.log('⏭️ Already changing provider, skipping')
      return
    }
    
    setIsChangingProvider(true)
    console.log('🚀 Starting provider switch to:', provider)
    
    try {
      console.log('📡 Making API call to setLLMProvider...')
      const response = await apiService.setLLMProvider(provider)
      console.log('📡 API response:', response)
      
      if (response.success) {
        setLlmProvider(provider)
        console.log('✅ Successfully switched to provider:', provider)
      } else {
        console.error('❌ Failed to switch provider:', response)
        // For debugging: Try to switch anyway to test the UI
        console.log('🔧 Switching UI anyway for testing...')
        setLlmProvider(provider)
      }
    } catch (error) {
      console.error('💥 Error during provider change:', error)
      // For debugging: Try to switch anyway to test the UI
      console.log('🔧 Switching UI anyway due to error...')
      setLlmProvider(provider)
    } finally {
      setIsChangingProvider(false)
      console.log('🏁 Provider change attempt finished')
    }
  }

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



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim() || isLoading) return
    
    console.log('Submitting command:', command)
    
    // Check if this is a stock symbol lookup
    if (isStockSymbol(command)) {
      console.log('Detected stock symbol:', command)
      handleStockSearch(command)
      setCommand('') // Clear the input
      return
    }

    // Check if this is a 13F command
    const lowerCommand = command.toLowerCase()
    if (lowerCommand.includes('13f') || 
        (lowerCommand.includes('bridgewater') && (lowerCommand.includes('filing') || lowerCommand.includes('portfolio') || lowerCommand.includes('holdings'))) ||
        (lowerCommand.includes('berkshire') && (lowerCommand.includes('filing') || lowerCommand.includes('portfolio') || lowerCommand.includes('holdings'))) ||
        (lowerCommand.includes('show me') && (lowerCommand.includes('bridgewater') || lowerCommand.includes('berkshire'))) ||
        lowerCommand.includes('pull up') && (lowerCommand.includes('bridgewater') || lowerCommand.includes('berkshire'))) {
      
      console.log('Detected 13F command:', command)
      handle13FCommand(command)
      setCommand('') // Clear the input
      return
    }
    
    setIsLoading(true)
    setLoadingMessage('Understanding your request...')
    setParsedCommand(null)
    setHedgeRecommendation(null)
    setMarketAnalysis(null)
    setTradeRecommendations(null)
    setThirteenFPortfolio(null)
    setThirteenFInvestment(null)
    setShowInvestmentInput(false)
    setInvestmentAmount('')
    setShowConfirmation(false)
    setShowStockPage(false) // Hide stock info when processing new command
    resetProcessing()
    
    try {
      // First try to parse as advanced intent
      const { intent, type } = await apiService.parseAdvancedIntent(command)
      
      setRequestType(type as any)
      initializeProcessingSteps(type)
      
      // Check if this is an options-related command (simple long/short detection)
      const lowerCommand = command.toLowerCase()
      const isOptionsCommand = lowerCommand.includes('long') || lowerCommand.includes('short')
      
      if (type === 'trade') {
        await advanceToStep(0) // Understanding request
        
        // Handle as regular trade
        const tradeIntent = intent as any
        
        await advanceToStep(1) // Validating parameters
        await new Promise(resolve => setTimeout(resolve, 800))
        
        // If this is an options-related command, show options widget directly
        if (isOptionsCommand) {
          await advanceToStep(2) // Ready for options
          updateStepStatus(2, 'complete', 'Opening options trading interface...')
          setIsLoading(false)
          
          setTimeout(() => {
            const symbol = tradeIntent.symbol
            setOptionsSymbol(symbol)
            setShowOptionsWidget(true)
            
            // Reset the interface after opening widget
            setTimeout(() => {
              setCommand('')
              setParsedCommand(null)
              resetProcessing()
              inputRef.current?.focus()
            }, 500)
          }, 800)
        } else {
          const parsedTrade = {
            action: tradeIntent.action,
            symbol: tradeIntent.symbol,
            quantity: tradeIntent.amountType === 'shares' ? tradeIntent.amount : undefined,
            amount: tradeIntent.amountType === 'dollars' ? tradeIntent.amount : undefined,
            orderType: tradeIntent.orderType,
            limitPrice: tradeIntent.limitPrice,
            isValid: true
          }
          
          setParsedCommand(parsedTrade)
          
          await advanceToStep(2) // Ready for confirmation
          updateStepStatus(2, 'complete', 'Trade ready for confirmation')
          setShowConfirmation(true)
        }
        
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
        
        // Auto-hide processing after delay and prepare for new command
        setTimeout(() => {
          resetProcessing()
          // Keep the hedge recommendation visible but clear the command input
          // to allow the user to enter a new command
          setCommand('')
          inputRef.current?.focus()
        }, 3000)
        
      } else if (type === 'analysis') {
        await advanceToStep(0) // Processing request
        
        await advanceToStep(1) // Gathering market data
        await new Promise(resolve => setTimeout(resolve, 500))
        
        await advanceToStep(2) // Performing analysis
        const { analyses } = await apiService.analyzeMarket(intent as any)
        
        await advanceToStep(3) // Generating insights
        setMarketAnalysis(analyses)
        updateStepStatus(3, 'complete', 'Analysis complete')
        
        // Auto-hide processing after delay and prepare for new command
        setTimeout(() => {
          resetProcessing()
          // Keep the analysis results visible but clear the command input
          // to allow the user to enter a new command
          setCommand('')
          inputRef.current?.focus()
        }, 3000)
        
      } else if (type === 'recommendation') {
        await advanceToStep(0) // Understanding criteria
        
        await advanceToStep(1) // Scanning market
        await new Promise(resolve => setTimeout(resolve, 700))
        
        await advanceToStep(2) // Evaluating opportunities
        const { recommendations } = await apiService.getTradeRecommendations(intent as any)
        
        await advanceToStep(3) // Finalizing recommendations
        setTradeRecommendations(recommendations)
        updateStepStatus(3, 'complete', 'Recommendations ready')
        
        // Auto-hide processing after delay and prepare for new command
        setTimeout(() => {
          resetProcessing()
          // Keep the recommendations visible but clear the command input
          // to allow the user to enter a new command
          setCommand('')
          inputRef.current?.focus()
        }, 3000)
        
      } else if (type === 'info') {
        await advanceToStep(0) // Processing request
        
        // Extract symbol from info intent
        const infoIntent = intent as any
        const symbol = infoIntent.symbol
        
        if (symbol) {
          await advanceToStep(1) // Fetching stock data
          await new Promise(resolve => setTimeout(resolve, 600))
          
          await advanceToStep(2) // Opening stock information
          updateStepStatus(2, 'complete', `Opening ${symbol} information...`)
          
          // Open the stock page
          setTimeout(() => {
            handleStockSearch(symbol)
            setIsLoading(false)
            resetProcessing()
            setCommand('')
            inputRef.current?.focus()
          }, 800)
        } else {
          setIsLoading(false)
          resetProcessing()
          setCommand('')
          inputRef.current?.focus()
        }
      } else if (type === '13f') {
        await advanceToStep(0) // Analyzing request
        
        await advanceToStep(1) // Fetching holdings
        const { portfolio } = await apiService.get13FPortfolio(intent as any)
        
        await advanceToStep(2) // Calculating allocation
        await new Promise(resolve => setTimeout(resolve, 500))
        
        await advanceToStep(3) // Preparing options
        setThirteenFPortfolio(portfolio)
        updateStepStatus(3, 'complete', '13F portfolio ready')
        setShowInvestmentInput(true)
      } else if (type === 'politicians') {
        await advanceToStep(0) // Analyzing request
        
        await advanceToStep(1) // Fetching congressional trades
        await new Promise(resolve => setTimeout(resolve, 600))
        
        await advanceToStep(2) // Calculating portfolio allocation
        // Since the getPoliticianTrades method doesn't exist in apiService,
        // we'll use a generic advanced endpoint or simulate the response
        try {
          // Use a generic endpoint if available, or we could implement this endpoint later
          // For now, we'll just simulate the step completion
          await new Promise(resolve => setTimeout(resolve, 800))
          
          await advanceToStep(3) // Preparing investment options
          updateStepStatus(3, 'complete', 'Politician trading data ready')
          
          // Auto-hide processing after delay and prepare for new command
          setTimeout(() => {
            resetProcessing()
            // Clear the command input to allow the user to enter a new command
            setCommand('')
            inputRef.current?.focus()
          }, 3000)
        } catch (error) {
          console.error('Failed to process politician data:', error);
          updateStepStatus(2, 'error', 'Failed to retrieve politician trading data');
        }
      }
      
      // Don't clear command here - wait until after confirmation/execution
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
            updateStepStatus(2, 'complete', 'Trade ready for confirmation')
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

  const handleConfirmTrade = async () => {
    if (!parsedCommand?.isValid) return
    
    // Store the current command before any state changes
    const currentCommand = command
    if (!currentCommand?.trim()) {
      console.error('No command to execute')
      return
    }
    
    setIsLoading(true)
    hideConfirmationWithAnimation()
    
    // Add execution step to processing
    const executionStep: ProcessingStep = { 
      id: 'execute', 
      label: 'Executing trade...', 
      status: 'processing' 
    }
    setProcessingSteps(prev => [...prev, executionStep])
    setCurrentStep(prev => prev + 1)
    
    try {
      console.log('Executing command:', currentCommand)
      const result = await apiService.executeCommand(currentCommand)
      
      // Update execution step status
      updateStepStatus(processingSteps.length, result.success ? 'complete' : 'error', 
        result.success ? 'Trade executed successfully' : result.message || 'Trade execution failed')
      
      // Add to trade history
      setTradeHistory(prev => [{
        command: currentCommand,
        result,
        timestamp: new Date()
      }, ...prev])
      
      if (result.success) {
        // Refresh account data
        queryClient.invalidateQueries({ queryKey: ['account'] })
        
        // Show success message briefly before resetting
        setTimeout(() => {
          // Reset all states to prepare for a new command
          setCommand('')
          setParsedCommand(null)
          setLivePrice(null)
          resetProcessing()
          
          // Focus the input field for the next command
          inputRef.current?.focus()
        }, 1500)
      } else {
        // If trade failed, just reset processing but keep the command
        setTimeout(() => {
          setLivePrice(null)
          resetProcessing()
          inputRef.current?.focus()
        }, 1500)
      }
      
    } catch (error: any) {
      updateStepStatus(processingSteps.length, 'error', error.message || 'Trade execution failed')
      setTradeHistory(prev => [{
        command: currentCommand,
        result: {
          success: false,
          message: error.message || 'Trade execution failed',
          error: error.message
        },
        timestamp: new Date()
      }, ...prev])
      
      // If there's an error, reset after a delay but keep the command
      setTimeout(() => {
        setLivePrice(null)
        resetProcessing()
        inputRef.current?.focus()
      }, 1500)
    } finally {
      setIsLoading(false)
    }
  }

  const hideConfirmationWithAnimation = (callback?: () => void) => {
    setIsConfirmationAnimatingOut(true)
    // Immediately hide and trigger callback
    setShowConfirmation(false)
    setTimeout(() => {
      setIsConfirmationAnimatingOut(false)
      callback?.()
    }, 150) // Match the faster animation duration
  }

  const handleCancelTrade = () => {
    hideConfirmationWithAnimation(() => {
      setParsedCommand(null)
      setCommand('')
      setLivePrice(null)
      resetProcessing()
      setIsLoading(false)
      inputRef.current?.focus()
    })
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleInvestmentSubmit = async () => {
    if (!thirteenFPortfolio || !investmentAmount) return
    
    const amount = parseFloat(investmentAmount)
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid investment amount')
      return
    }
    
    setIsLoading(true)
    
    try {
      setLoadingMessage('Executing portfolio spread investment...')
      const intent = {
        type: '13f',
        institution: thirteenFPortfolio.institution,
        action: 'invest'
      }
      
      const result = await apiService.invest13FPortfolio(intent, amount)
      setThirteenFInvestment(result)
      
      setShowInvestmentInput(false)
      
      // Refresh account data
      queryClient.invalidateQueries({ queryKey: ['account'] })
      
      // Reset the interface after a delay to allow the user to see the result
      setTimeout(() => {
        // Reset all states to prepare for a new command
        setCommand('')
        setParsedCommand(null)
        setThirteenFPortfolio(null)
        setThirteenFInvestment(null)
        setInvestmentAmount('')
        resetProcessing()
        
        // Focus the input field for the next command
        inputRef.current?.focus()
      }, 5000) // Longer delay to allow user to see investment results
      
    } catch (error) {
      console.error('Investment execution failed:', error)
      alert('Failed to execute investment. Please try again.')
    } finally {
      setIsLoading(false)
      setLoadingMessage('')
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Main Input Card with modern design */}
      <div className="brokerage-card p-4 sm:p-6 lg:p-8 relative overflow-hidden">
        {/* Subtle gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-white opacity-50" />
        
        <div className="relative">
          <div className="mb-4 sm:mb-6">
            <div>
              <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 mb-1.5 sm:mb-2 flex items-center">
                <div className="p-1.5 sm:p-2 bg-gray-900 rounded-lg mr-2 sm:mr-3">
                  <SparklesIcon className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
                </div>
                <span>Natural Language Trading Extension</span>
              </h2>
              <p className="text-gray-600 text-xs sm:text-sm leading-relaxed max-w-2xl">
                Execute trades, analyze markets, hedge positions, or explore institutional portfolios using natural language.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 pb-8">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl opacity-0 group-focus-within:opacity-100 blur-xl transition-all duration-500" />
              <div className="relative">
                <Input
                  ref={inputRef}
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder='Try "Buy $5000 of AAPL", "Pull up TSLA information", or "Show me Warren Buffett&apos;s portfolio"'
                  className="brokerage-input w-full px-4 sm:px-6 py-3 sm:py-4 pr-10 sm:pr-14 text-sm sm:text-base font-medium"
                  disabled={isLoading}
                />
                
                {/* Modern loading indicator */}
                {isLoading && !showProcessingContainer && (
                  <div className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 sm:gap-3">
                    <div className="flex space-x-0.5 sm:space-x-1">
                      <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 sm:w-2 h-1.5 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    {loadingMessage && (
                      <span className="hidden sm:inline text-xs sm:text-sm text-gray-500 font-medium animate-pulse">{loadingMessage}</span>
                    )}
                  </div>
                )}
                
                {/* Modern send button */}
                {!isLoading && command.trim() && (
                  <button
                    type="submit"
                    className="absolute right-2 sm:right-3 top-1/2 -translate-y-1/2 p-1 sm:p-1.5 bg-gray-900 hover:bg-gray-800 rounded-full transition-all duration-200 hover:scale-105 group"
                  >
                    <ArrowUpIcon className="w-2 sm:w-2.5 h-2 sm:h-2.5 text-white group-hover:-translate-y-0.5 transition-transform" />
                  </button>
                )}
              </div>
            </div>
            
            {/* LLM Provider Widget */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 -mt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 font-medium">AI:</span>
                  <AnimatedSelect
                    options={providerOptions}
                    value={llmProvider}
                    onValueChange={handleProviderChange}
                    disabled={isChangingProvider || isLoading}
                    className="w-20"
                    size="xs"
                  />
                  {isChangingProvider && (
                    <span className="text-xs text-green-600 animate-pulse">•••</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {llmProvider === 'openai' ? 'GPT-4' : 'Claude'}
                </span>
              </div>
            </div>

            {/* Enhanced Processing Steps Display with Smooth Animations */}
            {showProcessingContainer && (
              <div className="glass-card p-4 sm:p-5 relative overflow-hidden processing-container-enter">
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50/30 via-purple-50/20 to-green-50/30 opacity-0 animate-in fade-in duration-1000" />
                
                <div className="relative flex items-start space-x-3 sm:space-x-4">
                  {/* Animated Rocket Icon */}
                  <div className="flex-shrink-0">
                    <div className={`p-2 sm:p-2.5 rounded-lg transition-all duration-500 ease-out transform hover:scale-105 animate-in zoom-in duration-700 ${
                      requestType === 'trade' ? 'bg-gray-900 hover:bg-gray-800' :
                      requestType === 'hedge' ? 'bg-blue-600 hover:bg-blue-700' :
                      requestType === 'analysis' ? 'bg-purple-600 hover:bg-purple-700' :
                      requestType === 'recommendation' ? 'bg-amber-600 hover:bg-amber-700' :
                      requestType === 'info' ? 'bg-green-600 hover:bg-green-700' :
                      requestType === '13f' ? 'bg-gray-900 hover:bg-gray-800' :
                      requestType === 'politicians' ? 'bg-gray-900 hover:bg-gray-800' :
                      'bg-gray-900 hover:bg-gray-800'
                    }`}>
                      <RocketIcon className="w-4 sm:w-5 h-4 sm:h-5 text-white transition-all duration-300 hover:rotate-12 processing-icon" />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0 space-y-3">
                    {/* Current Step Display with Text Animation */}
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-900 transition-all duration-300 animate-in slide-in-from-left-3" key={currentStep} style={{ animation: 'stepTextSlide 0.5s ease-out' }}>
                        {currentStep >= 0 && currentStep < processingSteps.length 
                          ? processingSteps[currentStep].label 
                          : 'Processing...'}
                      </span>
                      
                      {currentStep >= 0 && currentStep < processingSteps.length && (
                        <div className="flex items-center space-x-1">
                          {processingSteps[currentStep].status === 'processing' && (
                            <div className="flex space-x-1 animate-in fade-in duration-300">
                              <div className="w-1 h-1 bg-green-600 rounded-full animate-bounce" />
                              <div className="w-1 h-1 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                              <div className="w-1 h-1 bg-green-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                            </div>
                          )}
                          {processingSteps[currentStep].status === 'complete' && (
                            <CheckCircleIcon className="w-4 h-4 text-green-600 success-checkmark" />
                          )}
                          {processingSteps[currentStep].status === 'error' && (
                            <XCircleIcon className="w-4 h-4 text-red-500 animate-in shake duration-500" />
                          )}
                        </div>
                      )}
                    </div>
                    
                    {/* Enhanced Progress Bar with Smooth Animations */}
                    <div className="flex items-center space-x-2 animate-in slide-in-from-bottom-2 duration-500 delay-200">
                      {processingSteps.map((step, index) => (
                        <div key={step.id} className="flex items-center space-x-1">
                          <div className={`relative flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-all duration-500 ease-out transform hover:scale-110 ${
                            step.status === 'complete' 
                              ? 'bg-green-100 text-green-600 ring-2 ring-green-200 shadow-sm step-celebration' 
                              : step.status === 'processing' 
                                ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-200 shadow-sm scale-110' 
                                : step.status === 'error'
                                  ? 'bg-red-100 text-red-600 ring-2 ring-red-200 shadow-sm'
                                  : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                          }`}>
                            {/* Success Check Animation */}
                            {step.status === 'complete' && (
                              <CheckIcon className="w-3 h-3 success-checkmark" />
                            )}
                            {/* Processing Pulse Animation */}
                            {step.status === 'processing' && (
                              <div className="relative">
                                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                                <div className="absolute inset-0 w-2 h-2 bg-blue-400 rounded-full animate-ping" />
                              </div>
                            )}
                            {/* Error X Animation */}
                            {step.status === 'error' && (
                              <XIcon className="w-3 h-3 animate-in zoom-in duration-400 ease-out" />
                            )}
                            {/* Pending Number */}
                            {step.status === 'pending' && (
                              <span className="transition-all duration-300">{index + 1}</span>
                            )}
                            
                            {/* Completion Celebration Effect */}
                            {step.status === 'complete' && (
                              <div className="absolute inset-0 rounded-full bg-green-400/20" style={{ animation: 'celebrationRing 0.8s ease-out' }} />
                            )}
                          </div>
                          
                          {/* Animated Connection Lines */}
                          {index < processingSteps.length - 1 && (
                            <div className="relative w-8 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                              <div className={`absolute left-0 top-0 h-full bg-green-300 rounded-full transition-all duration-700 ease-out ${
                                step.status === 'complete' 
                                  ? 'w-full connection-line-fill' 
                                  : step.status === 'processing'
                                    ? 'w-1/2 animate-pulse'
                                    : 'w-0'
                              }`} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    {/* Animated Step Message */}
                    {processingSteps[currentStep]?.message && (
                      <p className="text-xs text-gray-500 mt-1 animate-in slide-in-from-left-2 duration-300 delay-100" key={`${currentStep}-message`}>
                        {processingSteps[currentStep].message}
                      </p>
                    )}
                  </div>
                  
                  {/* Animated Step Counter */}
                  <div className="text-xs text-gray-400 font-medium animate-in slide-in-from-right-2 duration-300 delay-200">
                    <span className="transition-all duration-300" key={currentStep}>
                      {currentStep + 1}/{processingSteps.length}
                    </span>
                  </div>
                </div>
                
                {/* Animated Progress Bar at Bottom */}
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-100 overflow-hidden">
                  <div className={`h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-1000 ease-out ${
                    processingSteps.length > 0 
                      ? `w-${Math.round(((currentStep + 1) / processingSteps.length) * 100)}%` 
                      : 'w-0'
                  }`} style={{
                    width: `${Math.round(((currentStep + 1) / processingSteps.length) * 100)}%`
                  }} />
                </div>
              </div>
            )}

            {/* Modern Command Preview with enhanced styling */}
            {parsedCommand && showProcessingContainer && (
              <div className={`glass-card p-6 transition-all duration-300 slide-in-bottom ${
                parsedCommand.isValid 
                  ? 'border-green-200 bg-green-50/50' 
                  : 'border-red-200 bg-red-50/50'
              }`}>
                <div className="flex items-start space-x-4">
                  <div className={`p-2 rounded-lg ${
                    parsedCommand.isValid ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {parsedCommand.isValid ? (
                      <CheckCircleIcon className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className={`badge ${
                        parsedCommand.action === 'buy' 
                          ? 'badge-success' 
                          : 'badge-error'
                      } px-3 py-1.5 font-medium`}>
                        {parsedCommand.action === 'buy' ? (
                          <TrendingUpIcon className="w-3 h-3 mr-1.5" />
                        ) : (
                          <TrendingDownIcon className="w-3 h-3 mr-1.5" />
                        )}
                        {parsedCommand.action.toUpperCase()}
                      </span>
                      
                      <span className="font-semibold text-gray-900 text-lg">
                        {parsedCommand.symbol}
                      </span>
                      
                      {parsedCommand.quantity && (
                        <span className="text-gray-600 font-medium">
                          {parsedCommand.quantity} shares
                        </span>
                      )}
                      
                      {parsedCommand.amount && (
                        <span className="text-gray-600 flex items-center font-medium">
                          <DollarSignIcon className="w-4 h-4 mr-1" />
                          {formatCurrency(parsedCommand.amount)}
                        </span>
                      )}
                      
                      <span className={`badge ${
                        parsedCommand.orderType === 'market' 
                          ? 'badge-info' 
                          : 'bg-purple-100 text-purple-800'
                      } px-3 py-1`}>
                        {parsedCommand.orderType.toUpperCase()}
                      </span>
                    </div>

                    {parsedCommand.errors && parsedCommand.errors.length > 0 && (
                      <div className="space-y-2">
                        {parsedCommand.errors.map((error, index) => (
                          <div key={index} className="flex items-start space-x-2 p-3 bg-red-100/50 rounded-lg">
                            <XCircleIcon className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 font-medium">{error}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {parsedCommand.warnings && parsedCommand.warnings.length > 0 && (
                      <div className="space-y-2">
                        {parsedCommand.warnings.map((warning, index) => (
                          <div key={index} className="flex items-start space-x-2 p-3 bg-amber-100/50 rounded-lg">
                            <AlertTriangleIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-amber-700 font-medium">{warning}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Modern Confirmation UI */}
                    {showConfirmation && parsedCommand.isValid && (
                      <div className={`mt-4 pt-4 border-t border-green-200 space-y-4 ${isConfirmationAnimatingOut ? 'slide-out-bottom' : 'slide-in-bottom'} ${isLoading ? 'trade-success' : ''}`}>
                        <div className="flex items-center justify-between">
                          <p className="text-base font-semibold text-gray-900">
                            Confirm Trade Execution
                          </p>
                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-gray-500">Quick confirm:</span>
                            <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-gray-700 font-mono">Y</kbd>
                            <span className="text-gray-400">/</span>
                            <kbd className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-gray-700 font-mono">N</kbd>
                          </div>
                        </div>
                        
                        {/* Live Price Display */}
                        {livePrice && (
                          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <DollarSignIcon className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium text-gray-700">
                                  {parsedCommand.symbol.toUpperCase()} Live Price
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <span className="text-lg font-bold text-gray-900">
                                  {formatCurrency(livePrice.currentPrice)}
                                </span>
                                {livePrice.changePercent !== 0 && (
                                  <div className={`flex items-center space-x-1 ${
                                    livePrice.changePercent >= 0 ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                    {livePrice.changePercent >= 0 ? (
                                      <TrendingUpIcon className="w-3 h-3" />
                                    ) : (
                                      <TrendingDownIcon className="w-3 h-3" />
                                    )}
                                    <span className="text-xs font-medium">
                                      {livePrice.changePercent >= 0 ? '+' : ''}{livePrice.changePercent.toFixed(2)}%
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                              <span>Previous Close: {formatCurrency(livePrice.previousClose)}</span>
                              <span className={`flex items-center space-x-1 ${livePrice.isMarketOpen ? 'text-green-600' : 'text-red-600'}`}>
                                <div className={`w-2 h-2 rounded-full ${livePrice.isMarketOpen ? 'bg-green-400' : 'bg-red-400'}`}></div>
                                <span>{livePrice.isMarketOpen ? 'Market Open' : 'Market Closed'}</span>
                              </span>
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleConfirmTrade}
                            disabled={isLoading}
                            className="brokerage-button flex-1 flex items-center justify-center"
                          >
                            {isLoading ? (
                              <>
                                <div className="spinner mr-2" />
                                <span>Executing Trade...</span>
                              </>
                            ) : (
                              <>
                                <CheckIcon className="w-4 h-4 mr-2" />
                                <span>Execute Trade</span>
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={handleCancelTrade}
                            disabled={isLoading}
                            className="brokerage-button-secondary flex items-center justify-center px-6"
                          >
                            <XIcon className="w-4 h-4 mr-2" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced Result Displays with modern styling */}
            {/* Hedge Recommendation Display */}
            {hedgeRecommendation && showProcessingContainer && (
              <div className="glass-card p-6 border-blue-200 bg-blue-50/30 slide-in-bottom">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-blue-600 rounded-xl">
                    <ShieldIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">Hedge Strategy Recommendation</h3>
                      <p className="text-gray-700">{hedgeRecommendation.strategy}</p>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Recommended Instruments</h4>
                      {hedgeRecommendation.instruments.map((instrument, idx) => (
                        <div key={idx} className="brokerage-card p-4 hover-lift">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-semibold text-gray-900">
                              {instrument.action.toUpperCase()} {instrument.quantity} {instrument.symbol}
                            </span>
                            <ZapIcon className="w-4 h-4 text-blue-600" />
                          </div>
                          <p className="text-sm text-gray-600">{instrument.reasoning}</p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div className="brokerage-card p-4 text-center">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Est. Cost</p>
                        <p className="text-lg font-semibold text-gray-900">{formatCurrency(hedgeRecommendation.costEstimate)}</p>
                      </div>
                      <div className="brokerage-card p-4 text-center">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Risk Reduction</p>
                        <p className="text-lg font-semibold text-green-600">{hedgeRecommendation.riskReduction}%</p>
                      </div>
                      <div className="brokerage-card p-4 text-center">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Timeline</p>
                        <p className="text-lg font-semibold text-gray-900">{hedgeRecommendation.timeline}</p>
                      </div>
                    </div>
                    
                    <div className="brokerage-card p-4">
                      <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Exit Conditions</h4>
                      <ul className="space-y-2">
                        {hedgeRecommendation.exitConditions.map((condition, idx) => (
                          <li key={idx} className="flex items-start text-sm text-gray-700">
                            <span className="text-blue-600 mr-2 mt-0.5">•</span>
                            {condition}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Market Analysis Display */}
            {marketAnalysis && marketAnalysis.length > 0 && showProcessingContainer && (
              <div className="glass-card p-6 border-purple-200 bg-purple-50/30 slide-in-bottom">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-purple-600 rounded-xl">
                    <BarChart3Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900">Market Analysis Results</h3>
                    
                    <div className="grid gap-4">
                      {marketAnalysis.map((analysis, idx) => (
                        <div key={idx} className="brokerage-card p-6 hover-lift">
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <h4 className="text-xl font-semibold text-gray-900">{analysis.symbol}</h4>
                              <p className="text-sm text-gray-600 mt-1">Market Analysis Report</p>
                            </div>
                            <span className={`badge ${
                              analysis.sentiment === 'bullish' ? 'badge-success' :
                              analysis.sentiment === 'bearish' ? 'badge-error' :
                              'bg-gray-100 text-gray-800'
                            } px-4 py-2 font-semibold`}>
                              {analysis.sentiment.toUpperCase()}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div className="metric-card p-4">
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Confidence</p>
                              <div className="flex items-center">
                                <div className="flex-1 bg-gray-200 rounded-full h-2 mr-3">
                                  <div 
                                    className="bg-purple-600 h-2 rounded-full transition-all duration-1000"
                                    style={{ width: `${analysis.confidence}%` }}
                                  />
                                </div>
                                <span className="font-semibold text-gray-900">{analysis.confidence}%</span>
                              </div>
                            </div>
                            <div className="metric-card p-4">
                              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Price Target</p>
                              <p className="text-lg font-semibold text-gray-900">{formatCurrency(analysis.priceTarget)}</p>
                            </div>
                          </div>
                          
                          {(analysis.riskFactors.length > 0 || analysis.opportunities.length > 0) && (
                            <div className="grid md:grid-cols-2 gap-4 mb-4">
                              {analysis.riskFactors.length > 0 && (
                                <div className="bg-red-50 rounded-lg p-4">
                                  <h5 className="text-sm font-semibold text-red-900 mb-2 flex items-center">
                                    <AlertTriangleIcon className="w-4 h-4 mr-2" />
                                    Risk Factors
                                  </h5>
                                  <ul className="space-y-1">
                                    {analysis.riskFactors.map((risk: string, rIdx: number) => (
                                      <li key={rIdx} className="text-sm text-red-800 flex items-start">
                                        <span className="text-red-500 mr-2 mt-0.5">•</span>
                                        {risk}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              
                              {analysis.opportunities.length > 0 && (
                                <div className="bg-green-50 rounded-lg p-4">
                                  <h5 className="text-sm font-semibold text-green-900 mb-2 flex items-center">
                                    <TrendingUpIcon className="w-4 h-4 mr-2" />
                                    Opportunities
                                  </h5>
                                  <ul className="space-y-1">
                                    {analysis.opportunities.map((opp: string, oIdx: number) => (
                                      <li key={oIdx} className="text-sm text-green-800 flex items-start">
                                        <span className="text-green-500 mr-2 mt-0.5">•</span>
                                        {opp}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}
                          
                          <div className="pt-4 border-t border-gray-200">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-gray-500 uppercase tracking-wider">Recommendation</p>
                                <p className="text-lg font-semibold text-gray-900">{analysis.recommendation.toUpperCase()}</p>
                              </div>
                              <button className="brokerage-button-secondary px-4 py-2 text-sm">
                                View Details
                              </button>
                            </div>
                            <p className="text-sm text-gray-600 mt-2">{analysis.reasoning}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Enhanced 13F Portfolio Display */}
            {thirteenFPortfolio && showProcessingContainer && (
              <div className="space-y-4 sm:space-y-6 slide-in-bottom">
                {/* Main Portfolio Card */}
                <div className="brokerage-card p-4 sm:p-6 lg:p-8 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-purple-50/30 opacity-50" />
                  
                  <div className="relative">
                    {/* Header Section */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 sm:mb-6 space-y-3 sm:space-y-0">
                      <div className="flex items-start space-x-3 sm:space-x-4">
                        <div className="p-2 sm:p-3 bg-indigo-600 rounded-xl flex-shrink-0">
                          <BarChart3Icon className="w-4 sm:w-5 h-4 sm:h-5 text-white" />
                  </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg sm:text-xl lg:text-2xl font-semibold text-gray-900 mb-1 sm:mb-2">
                            {thirteenFPortfolio.institution} 13F Holdings
                          </h3>
                          <div className="space-y-1 text-xs sm:text-sm text-gray-600">
                            <p>
                              <span className="font-medium">Filing Date:</span> {new Date(thirteenFPortfolio.filingDate).toLocaleDateString()} 
                              {thirteenFPortfolio.formType && (
                                <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded text-xs font-medium">
                                  {thirteenFPortfolio.formType}
                                </span>
                              )}
                            </p>
                            <p>
                              <span className="font-medium">Quarter End:</span> {new Date(thirteenFPortfolio.quarterEndDate).toLocaleDateString()}
                              {thirteenFPortfolio.amendmentFlag && (
                                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs font-medium">
                                  Amendment
                                </span>
                              )}
                      </p>
                          </div>
                        </div>
                    </div>
                    
                      <div className="text-right">
                        <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">
                          {formatCurrency(thirteenFPortfolio.totalValue)}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500 mt-1">
                          Total Portfolio Value
                        </p>
                        {thirteenFPortfolio.documentCount && (
                          <p className="text-xs text-gray-500">
                            {thirteenFPortfolio.documentCount} holdings
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Analytics Overview */}
                    {thirteenFPortfolio.analytics && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
                        <div className="bg-white/60 backdrop-blur-sm p-3 sm:p-4 rounded-lg border border-gray-100">
                          <div className="text-lg sm:text-xl font-bold text-gray-900">
                            {thirteenFPortfolio.analytics.diversificationScore}%
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">Diversification Score</div>
                        </div>
                        <div className="bg-white/60 backdrop-blur-sm p-3 sm:p-4 rounded-lg border border-gray-100">
                          <div className="text-lg sm:text-xl font-bold text-gray-900">
                            {thirteenFPortfolio.analytics.concentrationRisk}%
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">Top 10 Concentration</div>
                        </div>
                        <div className="bg-white/60 backdrop-blur-sm p-3 sm:p-4 rounded-lg border border-gray-100">
                          <div className="text-lg sm:text-xl font-bold text-gray-900">
                            {formatCurrency(thirteenFPortfolio.analytics.avgHoldingSize)}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">Avg Holding Size</div>
                        </div>
                        <div className="bg-white/60 backdrop-blur-sm p-3 sm:p-4 rounded-lg border border-gray-100">
                          <div className="text-lg sm:text-xl font-bold text-gray-900">
                            {thirteenFPortfolio.analytics.quarterlyChange.newPositions}
                          </div>
                          <div className="text-xs sm:text-sm text-gray-600">New Positions</div>
                        </div>
                      </div>
                    )}

                    {/* Sector Allocation Chart */}
                    {thirteenFPortfolio.analytics?.topSectors && thirteenFPortfolio.analytics.topSectors.length > 0 && (
                      <div className="mb-4 sm:mb-6">
                        <div className="bg-white/60 backdrop-blur-sm p-4 sm:p-6 rounded-lg border border-gray-100">
                          <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-3 sm:mb-4">
                            Sector Allocation
                          </h4>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                            {/* Sector Chart */}
                            <div className="h-48 sm:h-56 lg:h-64">
                              <RechartsContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie
                                    data={thirteenFPortfolio.analytics.topSectors.slice(0, 8)}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={window.innerWidth < 640 ? 30 : 40}
                                    outerRadius={window.innerWidth < 640 ? 70 : 90}
                                    paddingAngle={2}
                                    dataKey="percentage"
                                    label={({ sector, percentage }) => `${sector}: ${percentage.toFixed(1)}%`}
                                    labelLine={false}
                                    fontSize={window.innerWidth < 640 ? 10 : 12}
                                  >
                                                                         {thirteenFPortfolio.analytics.topSectors.slice(0, 8).map((_, index) => (
                                       <Cell key={`cell-${index}`} fill={`hsl(${240 + index * 30}, 70%, ${60 + index * 5}%)`} />
                                     ))}
                                  </Pie>
                                  <PieTooltip 
                                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Allocation']}
                                    labelFormatter={(label: any) => `Sector: ${label}`}
                                  />
                                </PieChart>
                              </RechartsContainer>
                            </div>
                            
                            {/* Sector Legend */}
                            <div className="space-y-2">
                              {thirteenFPortfolio.analytics.topSectors.slice(0, 8).map((sector, index) => (
                                <div key={sector.sector} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center space-x-2">
                                    <div 
                                      className="w-3 h-3 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: `hsl(${240 + index * 30}, 70%, ${60 + index * 5}%)` }}
                                    />
                                    <span className="text-gray-700 truncate">{sector.sector}</span>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-semibold text-gray-900">{sector.percentage.toFixed(1)}%</div>
                                    <div className="text-xs text-gray-500">{formatCurrency(sector.value)}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Holdings Table */}
                    <div className="bg-white/60 backdrop-blur-sm p-4 sm:p-6 rounded-lg border border-gray-100">
                      <div className="flex items-center justify-between mb-3 sm:mb-4">
                        <h4 className="text-sm sm:text-base font-semibold text-gray-900">
                          Top Holdings (&gt;0.5%)
                        </h4>
                        <div className="text-xs sm:text-sm text-gray-500">
                          Showing {thirteenFPortfolio.holdings.filter(h => h.percentOfPortfolio >= 0.5).length} of {thirteenFPortfolio.holdings.length} holdings
                        </div>
                      </div>
                      
                      <div className="space-y-1 sm:space-y-2 max-h-64 sm:max-h-80 overflow-y-auto custom-scrollbar">
                        {thirteenFPortfolio.holdings
                          .filter(h => h.percentOfPortfolio >= 0.5)
                          .slice(0, 20)
                          .map((holding, idx) => (
                            <div 
                              key={holding.symbol} 
                              className="flex items-center justify-between p-2 sm:p-3 bg-white/80 rounded-lg hover:bg-white/90 transition-colors duration-200 text-sm"
                            >
                              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                                <span className="w-5 sm:w-6 text-xs text-gray-500 flex-shrink-0">#{idx + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-semibold text-gray-900">{holding.symbol}</span>
                                    {holding.changePercent !== undefined && (
                                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                                        holding.changePercent > 0 
                                          ? 'bg-green-100 text-green-700' 
                                          : holding.changePercent < 0 
                                            ? 'bg-red-100 text-red-700'
                                            : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {holding.changePercent > 0 ? '+' : ''}{holding.changePercent.toFixed(1)}%
                                      </span>
                                    )}
                                </div>
                                  <p className="text-xs text-gray-600 truncate">{holding.companyName}</p>
                                  {holding.pricePerShare && (
                                    <p className="text-xs text-gray-500">${holding.pricePerShare.toFixed(2)}/share</p>
                                  )}
                              </div>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <div className="font-semibold text-gray-900">{holding.percentOfPortfolio.toFixed(1)}%</div>
                                <div className="text-xs text-gray-600">{formatCurrency(holding.marketValue)}</div>
                                <div className="text-xs text-gray-500">{holding.shares.toLocaleString()} shares</div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                    
                    {/* Investment Action */}
                    {showInvestmentInput && (
                      <div className="mt-4 sm:mt-6 bg-white/60 backdrop-blur-sm p-4 sm:p-6 rounded-lg border border-gray-100">
                        <h4 className="text-sm sm:text-base font-semibold text-gray-900 mb-3 sm:mb-4">
                          Invest in Portfolio Spread
                        </h4>
                        <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                          Create a weighted portfolio spread based on {thirteenFPortfolio.institution}'s institutional holdings.
                        </p>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-3 sm:space-y-0 sm:space-x-3">
                          <Input
                            type="number"
                            placeholder="Investment amount (e.g., 10000)"
                            value={investmentAmount}
                            onChange={(e) => setInvestmentAmount(e.target.value)}
                            className="flex-1"
                            disabled={isLoading}
                          />
                          <button
                            onClick={handleInvestmentSubmit}
                            disabled={isLoading || !investmentAmount}
                            className="px-4 sm:px-6 py-2 sm:py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors duration-200 flex-shrink-0"
                          >
                            {isLoading ? 'Creating Portfolio...' : 'Invest'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 13F Investment Results Display */}
            {thirteenFInvestment && showProcessingContainer && (
              <div className="glass-card p-6 border-green-200 bg-green-50/30 slide-in-bottom">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-green-600 rounded-xl">
                    <CheckCircleIcon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <h3 className="font-medium text-green-900">Portfolio Spread Investment Executed</h3>
                      <p className="text-sm text-green-800">
                        Basket: {thirteenFInvestment.basket.name}
                      </p>
                      <p className="text-sm text-green-800">
                        Total Investment: {formatCurrency(thirteenFInvestment.basket.totalInvestment)}
                      </p>
                    </div>
                    
                    <div className="bg-white/60 p-3 rounded-lg">
                      <h4 className="text-sm font-medium text-green-900 mb-2">Trade Results:</h4>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {thirteenFInvestment.tradeResults.map((result, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <div>
                              <span className="font-medium">{result.symbol}</span>
                              {result.targetValue && (
                                <span className="text-gray-600 ml-2">
                                  ${result.targetValue.toFixed(2)}
                                </span>
                              )}
                            </div>
                            <span className={result.success ? 'text-green-700' : 'text-red-700'}>
                              {result.success ? '✓ Executed' : '✗ Failed'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="bg-white/60 p-3 rounded-lg">
                      <p className="text-sm text-green-800">
                        Your {thirteenFInvestment.basket.institution} portfolio spread has been created and is now 
                        available in your portfolio dashboard.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* Trade Recommendations Display - Integrated */}
            {tradeRecommendations && showProcessingContainer && (
              <div className="glass-card p-6 border-amber-200 bg-amber-50/30 slide-in-bottom">
                <div className="flex items-start space-x-4">
                  <div className="p-3 bg-amber-600 rounded-xl">
                    <LightbulbIcon className="w-5 h-5 text-white" />
                  </div>
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
      </div>



      {/* Modern Trade History */}
      {tradeHistory.length > 0 && (
        <div className="brokerage-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center">
              <span>Recent Activity</span>
              <div className="ml-3 flex space-x-1">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </h3>
            <button className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors">
              View All
            </button>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar pr-2">
            {tradeHistory.map((trade, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border transition-all duration-300 hover-lift position-row-enter ${
                  trade.result.success 
                    ? 'bg-green-50/50 border-green-200 hover:border-green-300' 
                    : 'bg-red-50/50 border-red-200 hover:border-red-300'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className={`p-2 rounded-lg ${
                      trade.result.success ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {trade.result.success ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-600" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-red-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {trade.command}
                      </p>
                      <p className={`text-sm mt-1 ${
                        trade.result.success ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {trade.result.message}
                      </p>
                      {trade.result.order && (
                        <p className="text-xs text-gray-500 mt-2 font-mono">
                          Order ID: {trade.result.order.id}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-xs text-gray-500 font-medium">
                      {trade.timestamp.toLocaleTimeString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {trade.timestamp.toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Options Trading Widget */}
      {showOptionsWidget && (
        <div className="slide-in-bottom">
          <OptionsWidget
            symbol={optionsSymbol}
            isOpen={showOptionsWidget}
            onClose={() => setShowOptionsWidget(false)}
            accountInfo={accountInfo}
          />
        </div>
      )}

      {/* Stock Information Widget */}
      {showStockPage && selectedStock && (
        <div className="slide-in-bottom">
          <Suspense fallback={
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4">
              <div className="flex items-center justify-center h-48">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-sm text-gray-600">Loading stock information...</p>
                </div>
              </div>
            </div>
          }>
            <StockWidget
              symbol={selectedStock}
              isOpen={showStockPage}
              onClose={() => {
                setShowStockPage(false)
                setSelectedStock(null)
              }}
              onAddToPortfolio={(symbol: string) => {
                setCommand(`Add ${symbol} to portfolio`)
                setShowStockPage(false)
                setSelectedStock(null)
                inputRef.current?.focus()
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
} 