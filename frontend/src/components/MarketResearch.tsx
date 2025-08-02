import { useState, useEffect, useRef, memo, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { 
  SendIcon, 
  TrendingUpIcon,
  SearchIcon,
  BarChart3Icon,
  FileTextIcon,
  BrainIcon,
  MaximizeIcon,
  MinimizeIcon,
  LoaderIcon,
  TableIcon,
  Target,
  Lightbulb,
  ArrowUpIcon,
  ArrowDownIcon
} from 'lucide-react'
import { Card } from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'

interface ChatMessage {
  id: string
  type: 'user' | 'assistant'
  content: string
  timestamp: Date
  isTyping?: boolean
  research?: ResearchResult
}

interface ResearchResult {
  type: 'analysis' | 'trade_plan' | 'market_insight' | 'stock_research'
  data: {
    summary: string
    keyFindings: string[]
    recommendations?: TradeRecommendation[]
    marketData?: MarketDataPoint[]
    tables?: TableData[]
    charts?: ChartData[]
    fullAnalysis?: string
    metadata?: {
      sources: string[]
      processingTime: number
      confidence: number
      methodology: string
    }
  }
}

interface TradeRecommendation {
  action: 'buy' | 'sell' | 'hold'
  symbol: string
  confidence: number
  reasoning: string
  targetPrice?: number
  timeframe: string
}

interface MarketDataPoint {
  symbol: string
  price: number
  change: number
  changePercent: number
  volume: number
}

interface TableData {
  title: string
  headers: string[]
  rows: (string | number)[][]
}

interface ChartData {
  title: string
  type: 'line' | 'bar' | 'pie'
  data: any[]
}

interface ResearchMode {
  id: string
  title: string
  description: string
  icon: any
  prompt: string
}

const RESEARCH_MODES: ResearchMode[] = [
  {
    id: 'stock-analysis',
    title: 'Deep Stock Analysis',
    description: 'Comprehensive fundamental and technical analysis',
    icon: SearchIcon,
    prompt: 'Provide a comprehensive stock analysis including fundamentals, technicals, and market sentiment'
  },
  {
    id: 'trade-plan',
    title: 'Trade Plan Generator',
    description: 'Create detailed trading strategies with entry/exit points',
    icon: Target,
    prompt: 'Create a detailed trading plan with specific entry points, stop losses, and profit targets'
  },
  {
    id: 'market-insight',
    title: 'Market Intelligence',
    description: 'Real-time market trends and sector analysis',
    icon: TrendingUpIcon,
    prompt: 'Analyze current market trends, sector performance, and provide actionable insights'
  },
  {
    id: 'news-analysis',
    title: 'News & Events Impact',
    description: 'Analyze how news affects stock prices and market movement',
    icon: FileTextIcon,
    prompt: 'Analyze recent news and events and their potential impact on specific stocks or sectors'
  }
]

export const MarketResearch = memo(() => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'I\'m your AI research assistant . I can conduct deep market research, create trading plans, and provide real-time insights. Choose a research mode or ask me anything!',
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [selectedMode, setSelectedMode] = useState<string | null>(null)
  const [isFullScreen, setIsFullScreen] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input when not typing
  useEffect(() => {
    if (!messages.some(m => m.isTyping)) {
      inputRef.current?.focus()
    }
  }, [messages])

  // Research mutation using real APIs
  const researchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await fetch('http://localhost:3001/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          mode: selectedMode,
          includeVisuals: true 
        })
      })
      if (!response.ok) throw new Error('Research failed')
      return response.json()
    },
    onSuccess: (data: ResearchResult) => {
      setMessages(prev => prev.filter(msg => msg.id !== 'typing'))
      
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: data.data.summary,
        timestamp: new Date(),
        research: data
      }
      setMessages(prev => [...prev, assistantMessage])
    },
    onError: (error) => {
      setMessages(prev => prev.filter(msg => msg.id !== 'typing'))
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: `I encountered an error conducting research: ${error.message}. Please try again with a different query.`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    }
  })

  const handleSendMessage = useCallback(async (query?: string) => {
    const messageText = query || inputValue.trim()
    if (!messageText || researchMutation.isPending) return

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: messageText,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')

    // Add typing indicator
    const typingMessage: ChatMessage = {
      id: 'typing',
      type: 'assistant',
      content: 'Conducting research using GPT-4 and Perplexity...',
      timestamp: new Date(),
      isTyping: true
    }
    setMessages(prev => [...prev, typingMessage])

    // Execute research
    researchMutation.mutate(messageText)
  }, [inputValue, researchMutation])

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }, [handleSendMessage])

  const handleModeSelect = useCallback((mode: ResearchMode) => {
    setSelectedMode(selectedMode === mode.id ? null : mode.id)
    setInputValue(mode.prompt)
  }, [selectedMode])

  const formatTimestamp = useCallback((date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }, [])

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen(prev => !prev)
  }, [])

  const renderResearchResult = useCallback((research: ResearchResult) => {
    return (
      <div className="mt-4 space-y-4">
        {/* Key Findings */}
        {research.data.keyFindings && research.data.keyFindings.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2 flex items-center">
              <Lightbulb className="w-4 h-4 mr-2" />
              Key Findings
            </h4>
            <ul className="space-y-1">
              {research.data.keyFindings.map((finding, index) => (
                <li key={index} className="text-sm text-blue-800 flex items-start">
                  <span className="w-2 h-2 bg-blue-400 rounded-full mt-2 mr-2 flex-shrink-0" />
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Trade Recommendations */}
        {research.data.recommendations && research.data.recommendations.length > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-semibold text-green-900 mb-3 flex items-center">
              <Target className="w-4 h-4 mr-2" />
              Trade Recommendations
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {research.data.recommendations.map((rec, index) => (
                <div key={index} className="bg-white border border-green-200 rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900">{rec.symbol}</span>
                    <Badge variant={rec.action === 'buy' ? 'default' : rec.action === 'sell' ? 'destructive' : 'secondary'}>
                      {rec.action.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>Confidence: {(rec.confidence * 100).toFixed(0)}%</div>
                    {rec.targetPrice && <div>Target: ${rec.targetPrice}</div>}
                    <div>Timeframe: {rec.timeframe}</div>
                    <div className="text-xs mt-2">{rec.reasoning}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Market Data */}
        {research.data.marketData && research.data.marketData.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3 flex items-center">
              <BarChart3Icon className="w-4 h-4 mr-2" />
              Market Data
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {research.data.marketData.map((data, index) => (
                <div key={index} className="bg-white border border-gray-200 rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">{data.symbol}</span>
                    <span className="text-lg font-bold">${data.price.toFixed(2)}</span>
                  </div>
                  <div className={`flex items-center text-sm ${
                    data.change >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {data.change >= 0 ? <ArrowUpIcon className="w-3 h-3 mr-1" /> : <ArrowDownIcon className="w-3 h-3 mr-1" />}
                    {data.change >= 0 ? '+' : ''}{data.change.toFixed(2)} ({data.changePercent.toFixed(2)}%)
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Vol: {data.volume.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tables */}
        {research.data.tables && research.data.tables.length > 0 && (
          <div className="space-y-4">
            {research.data.tables.map((table, index) => (
              <div key={index} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <h4 className="font-semibold text-gray-900 flex items-center">
                    <TableIcon className="w-4 h-4 mr-2" />
                    {table.title}
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {table.headers.map((header, hIndex) => (
                          <th key={hIndex} className="px-4 py-2 text-left font-medium text-gray-700">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, rIndex) => (
                        <tr key={rIndex} className="border-t border-gray-100 hover:bg-gray-50">
                          {row.map((cell, cIndex) => (
                            <td key={cIndex} className="px-4 py-2 text-gray-900">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }, [])

  const chatContainerClass = isFullScreen 
    ? "fixed inset-0 z-50 bg-white" 
    : "h-[600px]"

  return (
    <div className={isFullScreen ? "fixed inset-0 z-50 bg-gray-50 flex flex-col" : "space-y-6"}>
      {!isFullScreen && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Market Research</h1>
              <p className="text-gray-600 mt-1">AI-powered research with GPT-4 and Perplexity</p>
            </div>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Live APIs
              </Badge>
              <Button onClick={toggleFullScreen} variant="outline" size="sm">
                <MaximizeIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Research Modes */}
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Research Modes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {RESEARCH_MODES.map((mode) => {
                const Icon = mode.icon
                return (
                  <Card 
                    key={mode.id} 
                    className={`p-4 cursor-pointer transition-all hover:shadow-md ${
                      selectedMode === mode.id ? 'ring-2 ring-blue-500 bg-blue-50' : ''
                    }`}
                    onClick={() => handleModeSelect(mode)}
                  >
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Icon className="w-5 h-5 text-blue-600" />
                      </div>
                      <h3 className="font-medium text-gray-900">{mode.title}</h3>
                    </div>
                    <p className="text-sm text-gray-600">{mode.description}</p>
                  </Card>
                )
              })}
            </div>
          </div>
        </>
      )}

      {/* Chat Interface */}
      <Card className={`${chatContainerClass} flex flex-col ${isFullScreen ? 'm-4' : 'p-6'}`}>
        {isFullScreen && (
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 flex items-center">
              <BrainIcon className="w-6 h-6 mr-2" />
              AI Research Assistant
            </h2>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                
              </Badge>
              <Button onClick={toggleFullScreen} variant="outline" size="sm">
                <MinimizeIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {!isFullScreen && (
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <BrainIcon className="w-5 h-5 mr-2" />
              AI Research Assistant
            </h2>
            <div className="flex items-center space-x-2">
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
               
              </Badge>
              <Button onClick={toggleFullScreen} variant="outline" size="sm">
                <MaximizeIcon className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  message.type === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                {message.isTyping ? (
                  <div className="flex items-center space-x-2">
                    <LoaderIcon className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Conducting research...</span>
                  </div>
                ) : (
                  <>
                    <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                    {message.research && renderResearchResult(message.research)}
                    {message.research?.data.fullAnalysis && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                        <h4 className="font-semibold text-gray-900 mb-2">Full Analysis</h4>
                        <div className="text-sm text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                          {message.research.data.fullAnalysis}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div className={`text-xs mt-2 ${
                  message.type === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Enhanced Input */}
        <div className="space-y-3">
          {selectedMode && (
            <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2">
                <Badge variant="secondary" className="text-xs">
                  {RESEARCH_MODES.find(m => m.id === selectedMode)?.title}
                </Badge>
                <span className="text-sm text-blue-700">Mode Active</span>
              </div>
              <Button
                onClick={() => setSelectedMode(null)}
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-800"
              >
                Clear
              </Button>
            </div>
          )}
          
          <div className="flex space-x-3">
            <div className="flex-1 relative">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask for stock analysis, trade plans, market insights..."
                disabled={researchMutation.isPending}
                className="pr-12 py-3 text-sm placeholder:text-gray-400"
              />
              {inputValue && (
                <Button
                  onClick={() => setInputValue('')}
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
                >
                  ×
                </Button>
              )}
            </div>
            <Button 
              onClick={() => handleSendMessage()} 
              disabled={!inputValue.trim() || researchMutation.isPending}
              className="px-6 py-3"
            >
              {researchMutation.isPending ? (
                <LoaderIcon className="w-4 h-4 animate-spin" />
              ) : (
                <SendIcon className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
})

MarketResearch.displayName = 'MarketResearch'