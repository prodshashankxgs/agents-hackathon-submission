import { useState, useEffect, lazy, Suspense, memo, useCallback, Component } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { tradingWS } from './lib/api'

// Lazy load the main dashboard for better initial load time
const TradingDashboard = lazy(() => import('./components/TradingDashboard').then(module => ({ 
  default: module.TradingDashboard 
})))

// Optimized QueryClient with better performance settings
const queryClient = new QueryClient({
  defaultOptions: {
          queries: {
        retry: 2,
        staleTime: 5 * 60 * 1000, // 5 minutes (increased from 30 seconds)
        gcTime: 10 * 60 * 1000, // 10 minutes cache (renamed from cacheTime in newer versions)
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false, // Don't refetch when component mounts
      },
    mutations: {
      retry: 1,
    },
  },
})

// Error Boundary Component
class ErrorBoundary extends Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: {children: React.ReactNode}) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Something went wrong</h1>
            <p className="text-gray-600 mb-4">Please refresh the page to try again.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Refresh Page
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// Loading component for better UX
const DashboardLoader = memo(() => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="text-center">
      <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading Trading Platform</h2>
      <p className="text-gray-600">Initializing your trading interface...</p>
    </div>
  </div>
))

DashboardLoader.displayName = 'DashboardLoader'

const App = memo(() => {
  const [wsConnected, setWsConnected] = useState(false)

  // Memoize WebSocket handlers to prevent unnecessary re-renders
  const handleWsConnect = useCallback(() => {
    setWsConnected(true)
  }, [])

  const handleWsError = useCallback((error: Error) => {
    console.error('Failed to connect to WebSocket:', error)
    setWsConnected(false)
  }, [])

  useEffect(() => {
    let mounted = true

    // Initialize WebSocket connection with better error handling
    const initializeWebSocket = async () => {
      try {
        await tradingWS.connect()
        if (mounted) {
          handleWsConnect()
        }
      } catch (error) {
        if (mounted) {
          handleWsError(error as Error)
        }
      }
    }

    initializeWebSocket()

    // Cleanup on unmount
    return () => {
      mounted = false
      tradingWS.disconnect()
    }
  }, [handleWsConnect, handleWsError])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-background">
          <div className="relative">
            <Suspense fallback={<DashboardLoader />}>
              <TradingDashboard wsConnected={wsConnected} />
            </Suspense>
          </div>
        </div>
      </QueryClientProvider>
    </ErrorBoundary>
  )
})

App.displayName = 'App'

export default App
