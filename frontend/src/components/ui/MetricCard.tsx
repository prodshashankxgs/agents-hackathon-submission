import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react'
import { Card } from './card'
import type { MetricCardProps } from '../../types/portfolio'

export function MetricCard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  trendValue, 
  className = '' 
}: MetricCardProps) {
  const getTrendIcon = () => {
    if (trend === 'up') {
      return <TrendingUpIcon className="h-4 w-4 text-green-500" />
    } else if (trend === 'down') {
      return <TrendingDownIcon className="h-4 w-4 text-red-500" />
    }
    return null
  }

  const getTrendColor = () => {
    if (trend === 'up') return 'text-green-500'
    if (trend === 'down') return 'text-red-500'
    return 'text-gray-500'
  }

  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
        {(trend || trendValue) && (
          <div className={`flex items-center gap-1 ${getTrendColor()}`}>
            {getTrendIcon()}
            {trendValue && (
              <span className="text-sm font-medium">{trendValue}</span>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}