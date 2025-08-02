import { Card } from './card'
import type { LoadingCardProps } from '../../types/portfolio'

export function LoadingCard({ height = 'h-24', className = '' }: LoadingCardProps) {
  return (
    <Card className={`p-4 ${height} ${className}`}>
      <div className="animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/4"></div>
          </div>
          <div className="w-8 h-8 bg-gray-200 rounded"></div>
        </div>
      </div>
    </Card>
  )
}