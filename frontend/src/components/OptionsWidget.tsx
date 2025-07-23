import React, { useState, useEffect, memo, useCallback, lazy, Suspense } from 'react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  X,
  TrendingUp, 
  BarChart3,
  Target,
  Zap,
  Activity,
  Eye,
  RefreshCw,
  Maximize2,
  Minimize2
} from 'lucide-react';

// Lazy load heavy options components
const OptionsChain = lazy(() => import('./OptionsChain').then(module => ({ default: module.OptionsChain })));
const StrategyWizard = lazy(() => import('./StrategyWizard').then(module => ({ default: module.StrategyWizard })));
const PerformanceAnalytics = lazy(() => import('./PerformanceAnalytics').then(module => ({ default: module.PerformanceAnalytics })));

/**
 * Compact Options Trading Widget
 * 
 * A mini version of the options trading dashboard that appears as an overlay
 * within the main trading interface when options commands are detected.
 */

interface OptionsWidgetProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
  accountInfo?: any;
  className?: string;
}

export const OptionsWidget: React.FC<OptionsWidgetProps> = memo(({
  symbol,
  isOpen,
  onClose,
  accountInfo,
  className = ''
}) => {
  const [selectedTab, setSelectedTab] = useState<'chain' | 'strategies' | 'analytics'>('chain');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Memoize handlers to prevent re-renders
  const handleTabChange = useCallback((tab: typeof selectedTab) => {
    setSelectedTab(tab);
  }, []);

  const handleToggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleToggleLoading = useCallback(() => {
    setIsLoading(prev => !prev);
  }, []);

  const handleStrategyCreated = useCallback((strategy: any) => {
    console.log('New strategy created:', strategy);
    // Could refresh data or show confirmation
  }, []);

  const handleOptionSelected = useCallback((option: any, type: 'call' | 'put', expiration: string) => {
    console.log('Option selected:', { option, type, expiration });
    // Switch to strategy builder
    setSelectedTab('strategies');
  }, []);

  const handleStrategyBuilder = useCallback((strikes: any, expiration: string) => {
    console.log('Strategy builder requested:', { strikes, expiration });
    setSelectedTab('strategies');
  }, []);

  // Reset to chain tab when symbol changes
  useEffect(() => {
    if (symbol) {
      setSelectedTab('chain');
    }
  }, [symbol]);

  if (!isOpen) return null;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 shadow-lg mb-6 transition-all duration-300 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">Options Trading</h2>
          </div>
          <Badge variant="outline" className="text-blue-600 border-blue-200">
            {symbol}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleToggleExpanded}
            className="text-gray-600 hover:text-gray-900"
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className={`${isExpanded ? 'h-[80vh]' : 'h-96'} overflow-hidden`}>
        <Tabs value={selectedTab} onValueChange={(value) => handleTabChange(value as any)} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 mx-4 mt-4">
            <TabsTrigger value="chain" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Options Chain
            </TabsTrigger>
            <TabsTrigger value="strategies" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Strategy Builder
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto p-4">
            {/* Options Chain Tab */}
            <TabsContent value="chain" className="h-full">
              <div className="h-full">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Loading options chain...</p>
                    </div>
                  </div>
                }>
                  <OptionsChain 
                    symbol={symbol} 
                    onOptionSelect={handleOptionSelected}
                    onStrategyBuilder={handleStrategyBuilder}
                    className="h-full"
                  />
                </Suspense>
              </div>
            </TabsContent>

            {/* Strategy Builder Tab */}
            <TabsContent value="strategies" className="h-full">
              <div className="h-full">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Target className="h-8 w-8 animate-pulse text-blue-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Loading strategy builder...</p>
                    </div>
                  </div>
                }>
                  <StrategyWizard 
                    onExecuteStrategy={handleStrategyCreated}
                    className="h-full"
                  />
                </Suspense>
              </div>
            </TabsContent>

            {/* Analytics Tab */}
            <TabsContent value="analytics" className="h-full">
              <div className="h-full">
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <BarChart3 className="h-8 w-8 animate-pulse text-blue-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">Loading analytics...</p>
                    </div>
                  </div>
                }>
                  <PerformanceAnalytics 
                    positions={[]}
                    accountInfo={accountInfo}
                    timeRange="1M"
                    autoRefresh={false}
                    className="h-full"
                  />
                </Suspense>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Footer with quick actions */}
      <div className="flex items-center justify-between p-4 border-t bg-gray-50">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Activity className="h-4 w-4" />
            <span>Live Market Data</span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-4 w-4" />
            <span>Real-time Greeks</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
                      <Button
              variant="outline"
              size="sm"
              onClick={handleToggleLoading}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => handleTabChange('strategies')}
            >
              <Target className="h-4 w-4 mr-2" />
              Build Strategy
            </Button>
        </div>
      </div>
    </div>
  );
});

OptionsWidget.displayName = 'OptionsWidget'; 