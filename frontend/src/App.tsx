import { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TradingDashboard } from './components/TradingDashboard'
import { tradingWS } from './lib/api'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30000, // 30 seconds
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  const [wsConnected, setWsConnected] = useState(false)

  useEffect(() => {
    // Initialize WebSocket connection
    tradingWS
      .connect()
      .then(() => {
        setWsConnected(true)
      })
      .catch((error) => {
        console.error('Failed to connect to WebSocket:', error)
        setWsConnected(false)
      })

    // Cleanup on unmount
    return () => {
      tradingWS.disconnect()
    }
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <div className="relative">
          <TradingDashboard wsConnected={wsConnected} />
        </div>
      </div>
    </QueryClientProvider>
  )
}

export default App
