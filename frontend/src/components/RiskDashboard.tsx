import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Progress } from './ui/progress';
import { 
  Shield, 
  AlertTriangle, 
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  BarChart3,
  Activity,
  DollarSign,
  Target,
  Zap
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';

/**
 * Real-time Risk Management Dashboard
 * 
 * Integrates with Phase 3 risk management APIs to provide:
 * - Portfolio-wide risk assessment
 * - Real-time Greeks monitoring
 * - Risk alerts and notifications
 * - Concentration risk analysis
 * - Performance vs risk metrics
 */

interface RiskDashboardProps {
  positions?: any[];
  accountInfo?: any;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

interface RiskMetrics {
  riskScore: number;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  portfolioGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  valueAtRisk: number;
  maxDrawdown: number;
  sharpeRatio: number;
  currentLeverage: number;
}

interface RiskAlert {
  type: 'info' | 'warning' | 'error';
  category: 'exposure' | 'concentration' | 'leverage' | 'theta' | 'assignment';
  message: string;
  severity: 'low' | 'medium' | 'high';
  timestamp: Date;
  position?: string;
}

interface ConcentrationData {
  topExposures: Array<{
    underlying: string;
    exposure: number;
    percentage: number;
  }>;
  maxConcentration: number;
  isOverConcentrated: boolean;
}

export const RiskDashboard: React.FC<RiskDashboardProps> = ({
  positions = [],
  accountInfo,
  autoRefresh = true,
  refreshInterval = 30000,
  className = ''
}) => {
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [concentrationData, setConcentrationData] = useState<ConcentrationData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch portfolio risk metrics
  const fetchRiskMetrics = useCallback(async () => {
    if (!positions.length || !accountInfo) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch risk assessment from Phase 3 API
      const riskResponse = await fetch('/api/advanced/risk/assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positions,
          accountInfo,
          marketConditions: {
            underlyingPrice: 155, // Would get from current market data
            impliedVolatility: 0.25,
            riskFreeRate: 0.05
          }
        })
      });

      if (!riskResponse.ok) {
        throw new Error('Failed to fetch risk assessment');
      }

      const riskData = await riskResponse.json();
      
      if (riskData.success) {
        const assessment = riskData.data;
        setRiskMetrics({
          riskScore: assessment.riskScore,
          riskLevel: assessment.riskScore < 25 ? 'Low' : 
                    assessment.riskScore < 50 ? 'Medium' : 
                    assessment.riskScore < 75 ? 'High' : 'Critical',
          portfolioGreeks: assessment.portfolioGreeks,
          valueAtRisk: assessment.riskMetrics.valueAtRisk,
          maxDrawdown: assessment.riskMetrics.maxDrawdown,
          sharpeRatio: assessment.riskMetrics.sharpeRatio,
          currentLeverage: assessment.riskMetrics.currentLeverage
        });
        setAlerts(assessment.alerts || []);
      }

      // Fetch portfolio exposure data
      const exposureResponse = await fetch('/api/advanced/portfolio/exposure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions })
      });

      if (exposureResponse.ok) {
        const exposureData = await exposureResponse.json();
        if (exposureData.success) {
          setConcentrationData({
            topExposures: exposureData.data.topExposures.map((exp: any) => ({
              underlying: exp[0],
              exposure: exp[1],
              percentage: (exp[1] / exposureData.data.totalExposure) * 100
            })),
            maxConcentration: Math.max(...exposureData.data.topExposures.map((exp: any) => exp[1])) / exposureData.data.totalExposure,
            isOverConcentrated: Math.max(...exposureData.data.topExposures.map((exp: any) => exp[1])) / exposureData.data.totalExposure > 0.3
          });
        }
      }

      setLastUpdate(new Date());
    } catch (err) {
      console.error('Risk metrics fetch error:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch risk data');
    } finally {
      setIsLoading(false);
    }
  }, [positions, accountInfo]);

  // Auto-refresh effect
  useEffect(() => {
    fetchRiskMetrics();
    
    if (autoRefresh) {
      const interval = setInterval(fetchRiskMetrics, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchRiskMetrics, autoRefresh, refreshInterval]);

  // Get risk color based on level
  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return 'text-green-600 bg-green-50 border-green-200';
      case 'Medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'High': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'Critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  // Format Greeks display data
  const greeksChartData = riskMetrics ? [
    { name: 'Delta', value: Math.abs(riskMetrics.portfolioGreeks.delta), fullValue: riskMetrics.portfolioGreeks.delta },
    { name: 'Gamma', value: Math.abs(riskMetrics.portfolioGreeks.gamma) * 100, fullValue: riskMetrics.portfolioGreeks.gamma },
    { name: 'Theta', value: Math.abs(riskMetrics.portfolioGreeks.theta), fullValue: riskMetrics.portfolioGreeks.theta },
    { name: 'Vega', value: Math.abs(riskMetrics.portfolioGreeks.vega) / 10, fullValue: riskMetrics.portfolioGreeks.vega },
  ] : [];

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-center">
            <AlertCircle className="h-6 w-6 text-red-500 mr-2" />
            <span>Failed to load risk data: {error}</span>
            <Button variant="outline" size="sm" onClick={fetchRiskMetrics} className="ml-4">
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
          <Shield className="h-6 w-6" />
          Risk Dashboard
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
            onClick={fetchRiskMetrics}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {alerts.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You have {alerts.length} active risk alert{alerts.length !== 1 ? 's' : ''}
          </AlertDescription>
        </Alert>
      )}

      {/* Risk Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Overall Risk Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Target className="h-4 w-4" />
              Risk Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskMetrics ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{riskMetrics.riskScore}</span>
                  <Badge className={getRiskColor(riskMetrics.riskLevel)}>
                    {riskMetrics.riskLevel}
                  </Badge>
                </div>
                <Progress value={riskMetrics.riskScore} className="h-2" />
              </div>
            ) : (
              <div className="text-gray-400">Loading...</div>
            )}
          </CardContent>
        </Card>

        {/* Value at Risk */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Value at Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskMetrics ? (
              <div className="space-y-1">
                <span className="text-2xl font-bold">${riskMetrics.valueAtRisk.toLocaleString()}</span>
                <p className="text-xs text-gray-500">95% confidence, 1-day</p>
              </div>
            ) : (
              <div className="text-gray-400">Loading...</div>
            )}
          </CardContent>
        </Card>

        {/* Portfolio Delta */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Portfolio Delta
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskMetrics ? (
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${riskMetrics.portfolioGreeks.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {riskMetrics.portfolioGreeks.delta > 0 ? '+' : ''}{riskMetrics.portfolioGreeks.delta.toFixed(2)}
                </span>
                <p className="text-xs text-gray-500">Market exposure</p>
              </div>
            ) : (
              <div className="text-gray-400">Loading...</div>
            )}
          </CardContent>
        </Card>

        {/* Current Leverage */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Leverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            {riskMetrics ? (
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${riskMetrics.currentLeverage > 2 ? 'text-red-600' : 'text-green-600'}`}>
                  {riskMetrics.currentLeverage.toFixed(2)}x
                </span>
                <p className="text-xs text-gray-500">Current leverage</p>
              </div>
            ) : (
              <div className="text-gray-400">Loading...</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Portfolio Greeks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Portfolio Greeks
            </CardTitle>
          </CardHeader>
          <CardContent>
            {greeksChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={greeksChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: any) => [`${value.toFixed(3)}`, 'Value']}
                  />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-gray-400">
                No Greeks data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Concentration Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Concentration Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            {concentrationData ? (
              <div className="space-y-4">
                {concentrationData.isOverConcentrated && (
                  <Alert className="border-orange-200 bg-orange-50">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      Portfolio is over-concentrated ({(concentrationData.maxConcentration * 100).toFixed(1)}% in single position)
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  {concentrationData.topExposures.slice(0, 5).map((exposure) => (
                    <div key={exposure.underlying} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{exposure.underlying}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${exposure.percentage > 30 ? 'bg-red-500' : exposure.percentage > 20 ? 'bg-orange-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(exposure.percentage, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">
                          {exposure.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400">
                No concentration data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Active Risk Alerts ({alerts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {alerts.map((alert, idx) => (
                <Alert 
                  key={idx} 
                  className={`${
                    alert.type === 'error' ? 'border-red-200 bg-red-50' : 
                    alert.type === 'warning' ? 'border-orange-200 bg-orange-50' : 
                    'border-blue-200 bg-blue-50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2">
                      {alert.type === 'error' ? <XCircle className="h-4 w-4 text-red-500 mt-0.5" /> :
                       alert.type === 'warning' ? <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5" /> :
                       <CheckCircle className="h-4 w-4 text-blue-500 mt-0.5" />}
                      <div>
                        <AlertDescription className="text-sm">
                          {alert.message}
                        </AlertDescription>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {alert.category}
                          </Badge>
                          <Badge 
                            variant={alert.severity === 'high' ? 'destructive' : alert.severity === 'medium' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {alert.severity}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {alert.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}; 