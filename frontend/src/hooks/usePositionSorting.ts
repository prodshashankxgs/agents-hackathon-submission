import { useMemo, useState } from 'react'
import type { Position, SortConfig } from '../types/portfolio'

export function usePositionSorting(positions: Position[]) {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    field: 'marketValue',
    direction: 'desc'
  })

  const sortedPositions = useMemo(() => {
    if (!positions || positions.length === 0) return []

    return [...positions].sort((a, b) => {
      const { field, direction } = sortConfig
      
      let aValue: number | string = a[field]
      let bValue: number | string = b[field]
      
      // Handle string comparison for symbol
      if (field === 'symbol') {
        aValue = aValue.toString().toLowerCase()
        bValue = bValue.toString().toLowerCase()
      }
      
      let comparison = 0
      if (aValue > bValue) {
        comparison = 1
      } else if (aValue < bValue) {
        comparison = -1
      }
      
      return direction === 'desc' ? comparison * -1 : comparison
    })
  }, [positions, sortConfig])

  const handleSort = (field: SortConfig['field']) => {
    setSortConfig(prevConfig => ({
      field,
      direction: 
        prevConfig.field === field && prevConfig.direction === 'desc'
          ? 'asc'
          : 'desc'
    }))
  }

  return {
    sortedPositions,
    sortConfig,
    handleSort
  }
}