import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  TrendingUp, 
  BarChart3,
  Target,
  Zap,
  DollarSign,
  Activity,
  Award,
  RefreshCw
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
  ComposedChart,
  Line
} from 'recharts';

/**
 * Advanced Performance Analytics Dashboard
 * 
 * Integrates with Phase 3 performance analytics APIs to provide:
 * - Real-time P&L attribution analysis
 * - Strategy-specific performance metrics
 * - Portfolio optimization recommendations
 * - Risk-adjusted return analysis
 * - Time-series performance tracking
 */

interface PerformanceAnalyticsProps {
  positions?: any[];
  accountInfo?: any;
  timeRange?: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';
  autoRefresh?: boolean;
  className?: string;
}

interface PnLAttribution {
  totalPnL: number;
  deltaContribution: number;
  gammaContribution: number;
  thetaContribution: number;
  vegaContribution: number;
  rhoContribution: number;
  residualContribution: number;
  byPosition: any[];
  byStrategy: Map<string, number>;
  byUnderlying: Map<string, number>;
}

interface StrategyMetrics {
  strategy: string;
  totalTrades: number;
  totalPnL: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  expectancy: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  bestTrade: number;
  worstTrade: number;
  sharpeRatio: number;
  maxDrawdown: number;
}

interface PerformanceMetrics {
  totalReturn: number;
  totalReturnPercent: number;
  annualizedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinioRatio: number;
  maxDrawdown: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export const PerformanceAnalytics: React.FC<PerformanceAnalyticsProps> = ({
  positions = [],
  accountInfo,
  timeRange = '1M',
  autoRefresh = false,
  className = ''
}) => {
  const [pnlAttribution, setPnlAttribution] = useState<PnLAttribution | null>(null);
  const [strategyMetrics, setStrategyMetrics] = useState<Map<string, StrategyMetrics>>(new Map());
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [optimizationData, setOptimizationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'attribution' | 'strategies' | 'optimization'>('attribution');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch performance analytics data
  const fetchPerformanceData = useCallback(async () => {
    if (!positions.length || !accountInfo) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch P&L attribution
      const attributionResponse = await fetch('/api/advanced/analytics/pnl-attribution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions,
          marketConditions: {
            underlyingPriceChange: 5,
            volatilityChange: 0.05,
            timeDecay: -1,
            rateChange: 0
          }
        })
      });

      if (attributionResponse.ok) {
        const attributionData = await attributionResponse.json();
        if (attributionData.success) {
          setPnlAttribution(attributionData.data);
        }
      }

      // Fetch performance report
      const reportResponse = await fetch(`/api/advanced/analytics/performance/${timeRange}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions,
          trades: [], // Would include historical trades
          accountInfo
        })
      });

      if (reportResponse.ok) {
        const reportData = await reportResponse.json();
        if (reportData.success) {
          const report = reportData.data;
          
          // Process strategy metrics
          const strategyMap = new Map<string, StrategyMetrics>();
          if (report.strategyBreakdown?.byStrategy) {
            for (const [strategy, metrics] of report.strategyBreakdown.byStrategy) {
              strategyMap.set(strategy, metrics as StrategyMetrics);
            }
          }
          setStrategyMetrics(strategyMap);
          
          // Set performance metrics
          setPerformanceMetrics({
            totalReturn: report.pnlAnalysis.totalPnL,
            totalReturnPercent: report.pnlAnalysis.returnPercent,
            annualizedReturn: report.pnlAnalysis.returnPercent * (365 / 30), // Simplified
            volatility: report.riskMetrics.volatility,
            sharpeRatio: report.riskMetrics.sharpeRatio,
            sortinioRatio: report.riskMetrics.sortinioRatio,
            maxDrawdown: report.riskMetrics.maxDrawdown,
            winRate: report.pnlAnalysis.totalTrades > 0 ? 
                     report.pnlAnalysis.winningTrades / report.pnlAnalysis.totalTrades : 0,
            avgWin: report.pnlAnalysis.winningTrades > 0 ? 
                    report.pnlAnalysis.totalPnL / report.pnlAnalysis.winningTrades : 0,
            avgLoss: report.pnlAnalysis.losingTrades > 0 ? 
                     Math.abs(report.pnlAnalysis.totalPnL) / report.pnlAnalysis.losingTrades : 0,
            profitFactor: 1.5 // Would calculate from actual data
          });
        }
      }

      // Fetch portfolio optimization
      const optimizationResponse = await fetch('/api/advanced/analytics/optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions,
          accountInfo,
          riskTolerance: 'moderate'
        })
      });

      if (optimizationResponse.ok) {
        const optimizationResult = await optimizationResponse.json();
        if (optimizationResult.success) {
          setOptimizationData(optimizationResult.data);
        }
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Performance analytics fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch performance data');
    } finally {
      setIsLoading(false);
    }
  }, [positions, accountInfo, timeRange]);

  // Auto-refresh effect
  useEffect(() => {
    fetchPerformanceData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchPerformanceData, 60000); // 1 minute
      return () => clearInterval(interval);
    }
  }, [fetchPerformanceData, autoRefresh]);

  // Prepare attribution chart data
  const attributionChartData = useMemo(() => {
    if (!pnlAttribution) return [];
    
    return [
      { name: 'Delta', value: pnlAttribution.deltaContribution, color: '#3b82f6' },
      { name: 'Gamma', value: pnlAttribution.gammaContribution, color: '#10b981' },
      { name: 'Theta', value: pnlAttribution.thetaContribution, color: '#f59e0b' },
      { name: 'Vega', value: pnlAttribution.vegaContribution, color: '#8b5cf6' },
      { name: 'Rho', value: pnlAttribution.rhoContribution, color: '#06b6d4' },
      { name: 'Other', value: pnlAttribution.residualContribution, color: '#6b7280' }
    ].filter(item => Math.abs(item.value) > 0.01);
  }, [pnlAttribution]);

  // Prepare strategy performance data
  const strategyChartData = useMemo(() => {
    return Array.from(strategyMetrics.entries()).map(([strategy, metrics]) => ({
      strategy,
      pnl: metrics.totalPnL,
      winRate: metrics.winRate * 100,
      sharpe: metrics.sharpeRatio,
      trades: metrics.totalTrades
    }));
  }, [strategyMetrics]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4', '#6b7280'];

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-center">
            <span>Failed to load performance data: {error}</span>
            <Button variant="outline" size="sm" onClick={fetchPerformanceData} className="ml-4">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Performance Analytics
        </h2>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPerformanceData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Performance Summary Cards */}
      {performanceMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${performanceMetrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${performanceMetrics.totalReturn.toLocaleString()}
                </span>
                <p className="text-xs text-gray-500">
                  {performanceMetrics.totalReturnPercent > 0 ? '+' : ''}{performanceMetrics.totalReturnPercent.toFixed(2)}%
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Sharpe Ratio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${performanceMetrics.sharpeRatio >= 1 ? 'text-green-600' : 'text-orange-600'}`}>
                  {performanceMetrics.sharpeRatio.toFixed(2)}
                </span>
                <p className="text-xs text-gray-500">Risk-adjusted return</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${performanceMetrics.winRate >= 0.5 ? 'text-green-600' : 'text-red-600'}`}>
                  {(performanceMetrics.winRate * 100).toFixed(1)}%
                </span>
                <p className="text-xs text-gray-500">Winning trades</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Max Drawdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${performanceMetrics.maxDrawdown < 0.1 ? 'text-green-600' : 'text-red-600'}`}>
                  {(performanceMetrics.maxDrawdown * 100).toFixed(1)}%
                </span>
                <p className="text-xs text-gray-500">Maximum loss</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for different analytics views */}
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="attribution">P&L Attribution</TabsTrigger>
          <TabsTrigger value="strategies">Strategy Analysis</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
        </TabsList>

        {/* P&L Attribution Tab */}
        <TabsContent value="attribution" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Attribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Greeks Contribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                {attributionChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPieChart>
                      <Pie
                        data={attributionChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, value }) => `${name}: $${value.toFixed(0)}`}
                      >
                        {attributionChartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`$${value}`, 'Contribution']} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-72 flex items-center justify-center text-gray-400">
                    No attribution data available
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Attribution Details */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Attribution Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pnlAttribution ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Delta:</span>
                          <span className={`font-medium ${pnlAttribution.deltaContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${pnlAttribution.deltaContribution.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Gamma:</span>
                          <span className={`font-medium ${pnlAttribution.gammaContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${pnlAttribution.gammaContribution.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Theta:</span>
                          <span className={`font-medium ${pnlAttribution.thetaContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${pnlAttribution.thetaContribution.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span>Vega:</span>
                          <span className={`font-medium ${pnlAttribution.vegaContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${pnlAttribution.vegaContribution.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rho:</span>
                          <span className={`font-medium ${pnlAttribution.rhoContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${pnlAttribution.rhoContribution.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Other:</span>
                          <span className={`font-medium ${pnlAttribution.residualContribution >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${pnlAttribution.residualContribution.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t pt-2">
                      <div className="flex justify-between font-semibold">
                        <span>Total P&L:</span>
                        <span className={`${pnlAttribution.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${pnlAttribution.totalPnL.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-400 text-center py-8">
                    No attribution data available
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Strategy Analysis Tab */}
        <TabsContent value="strategies" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="h-5 w-5" />
                Strategy Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              {strategyChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={strategyChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="strategy" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="pnl" fill="#3b82f6" name="P&L ($)" />
                    <Line yAxisId="right" type="monotone" dataKey="winRate" stroke="#10b981" name="Win Rate (%)" />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-96 flex items-center justify-center text-gray-400">
                  No strategy data available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Strategy Details Table */}
          {strategyMetrics.size > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Strategy Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-2">Strategy</th>
                        <th className="text-right p-2">Trades</th>
                        <th className="text-right p-2">P&L</th>
                        <th className="text-right p-2">Win Rate</th>
                        <th className="text-right p-2">Sharpe</th>
                        <th className="text-right p-2">Max DD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from(strategyMetrics.entries()).map(([strategy, metrics]) => (
                        <tr key={strategy} className="border-b">
                          <td className="p-2 font-medium">{strategy}</td>
                          <td className="text-right p-2">{metrics.totalTrades}</td>
                          <td className={`text-right p-2 ${metrics.totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${metrics.totalPnL.toLocaleString()}
                          </td>
                          <td className="text-right p-2">{(metrics.winRate * 100).toFixed(1)}%</td>
                          <td className="text-right p-2">{metrics.sharpeRatio.toFixed(2)}</td>
                          <td className="text-right p-2">{(metrics.maxDrawdown * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Portfolio Optimization Tab */}
        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Portfolio Optimization
              </CardTitle>
            </CardHeader>
            <CardContent>
              {optimizationData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">
                        {optimizationData.currentMetrics?.diversificationScore?.toFixed(0) || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">Diversification Score</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">
                        {optimizationData.currentMetrics?.efficiencyScore?.toFixed(0) || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">Efficiency Score</div>
                    </div>
                    <div className="text-center p-4 bg-gray-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">
                        {optimizationData.currentMetrics?.riskScore?.toFixed(0) || 'N/A'}
                      </div>
                      <div className="text-sm text-gray-600">Risk Score</div>
                    </div>
                  </div>

                  {/* Optimization Suggestions */}
                  {optimizationData.suggestions && optimizationData.suggestions.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-semibold">Optimization Suggestions</h4>
                      {optimizationData.suggestions.map((suggestion: any, idx: number) => (
                        <div key={idx} className="p-3 border rounded-lg bg-blue-50">
                          <div className="font-medium">{suggestion.type}</div>
                          <div className="text-sm text-gray-600">{suggestion.description}</div>
                          <div className="text-sm text-blue-600">{suggestion.actionRequired}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-gray-400 text-center py-8">
                  No optimization data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}; 