// Shared types for portfolio components to prevent duplication

export interface Position {
  symbol: string
  quantity: number
  marketValue: number
  costBasis: number
  unrealizedPnL: number
  side: 'long' | 'short'
}

export interface PositionBreakdown {
  symbol: string
  percentage: number
  value: number
  pnl: number
  pnlPercent: number
}

export interface SortConfig {
  field: 'symbol' | 'quantity' | 'marketValue' | 'unrealizedPnL' | 'costBasis'
  direction: 'asc' | 'desc'
}

export interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  className?: string
}

export interface LoadingCardProps {
  height?: string
  className?: string
}