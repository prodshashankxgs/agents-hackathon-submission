import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { 
  Shield,
  TrendingUp, 
  BarChart3,
  Target,
  Zap,
  Activity,
  DollarSign,
  RefreshCw,
  Plus,
  Eye
} from 'lucide-react';

// Import our Phase 4 components
import { OptionsChain } from './OptionsChain';
import { StrategyWizard } from './StrategyWizard';
// import { RiskDashboard } from './RiskDashboard';
import { PerformanceAnalytics } from './PerformanceAnalytics';

/**
 * Comprehensive Options Portfolio Dashboard
 * 
 * Integrates all Phase 4 components into a unified options trading interface:
 * - Real-time options chain with market sentiment
 * - Advanced strategy builder and visualizer
 * - Risk management dashboard with Greeks monitoring
 * - Performance analytics with P&L attribution
 * - Portfolio overview with position management
 */

interface OptionsPortfolioDashboardProps {
  accountInfo?: any;
  className?: string;
  initialSymbol?: string;
}

interface PortfolioSummary {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  dayPnL: number;
  dayPnLPercent: number;
  positionsCount: number;
  strategiesCount: number;
  portfolioGreeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
  };
  riskScore: number;
  marketExposure: number;
}

interface OptionsPosition {
  id: string;
  symbol: string;
  strategy: string;
  legs: any[];
  currentValue: number;
  unrealizedPnL: number;
  dayPnL: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  expirationDate: string;
  daysToExpiration: number;
  status: 'active' | 'expired' | 'assigned' | 'closed';
}

export const OptionsPortfolioDashboard: React.FC<OptionsPortfolioDashboardProps> = ({
  accountInfo,
  className = '',
  initialSymbol
}) => {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'chain' | 'strategies' | 'risk' | 'analytics'>(
    initialSymbol ? 'chain' : 'overview'
  );
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [positions, setPositions] = useState<OptionsPosition[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol || 'AAPL');
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch portfolio data
  const fetchPortfolioData = async () => {
    if (!accountInfo) return;

    setIsLoading(true);
    
    try {
      // Fetch portfolio summary
      const summaryResponse = await fetch('/api/advanced/portfolio/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountInfo.accountId })
      });

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        if (summaryData.success) {
          setPortfolioSummary(summaryData.data);
        }
      }

      // Fetch positions
      const positionsResponse = await fetch('/api/advanced/portfolio/positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: accountInfo.accountId })
      });

      if (positionsResponse.ok) {
        const positionsData = await positionsResponse.json();
        if (positionsData.success) {
          setPositions(positionsData.data.positions || []);
        }
      }

      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to fetch portfolio data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh effect
  useEffect(() => {
    fetchPortfolioData();
    
    if (autoRefresh) {
      const interval = setInterval(fetchPortfolioData, 30000); // 30 seconds
      return () => clearInterval(interval);
    }
  }, [accountInfo, autoRefresh]);

  // Handle strategy creation from wizard
  const handleStrategyCreated = (strategy: any) => {
    console.log('New strategy created:', strategy);
    // Refresh portfolio data
    fetchPortfolioData();
  };

  // Handle option selection from chain
  const handleOptionSelected = (option: any, type: 'call' | 'put', expiration: string) => {
    console.log('Option selected:', { option, type, expiration });
    // Switch to strategy builder tab
    setSelectedTab('strategies');
  };

  const getRiskLevelColor = (score: number) => {
    if (score < 25) return 'text-green-600 bg-green-50 border-green-200';
    if (score < 50) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (score < 75) return 'text-orange-600 bg-orange-50 border-orange-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Options Portfolio</h1>
          <p className="text-gray-600">
            {initialSymbol ? 
              `Advanced options trading for ${initialSymbol} with real-time analytics` :
              `Advanced options trading dashboard with real-time analytics`
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={autoRefresh ? 'bg-green-50 border-green-200' : ''}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchPortfolioData}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      {portfolioSummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Portfolio Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className="text-2xl font-bold">${portfolioSummary.totalValue.toLocaleString()}</span>
                <p className={`text-xs ${portfolioSummary.totalPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {portfolioSummary.totalPnLPercent > 0 ? '+' : ''}{portfolioSummary.totalPnLPercent.toFixed(2)}% total
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Daily P&L
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${portfolioSummary.dayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${portfolioSummary.dayPnL.toLocaleString()}
                </span>
                <p className={`text-xs ${portfolioSummary.dayPnLPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {portfolioSummary.dayPnLPercent > 0 ? '+' : ''}{portfolioSummary.dayPnLPercent.toFixed(2)}% today
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Portfolio Delta
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${portfolioSummary.portfolioGreeks.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {portfolioSummary.portfolioGreeks.delta > 0 ? '+' : ''}{portfolioSummary.portfolioGreeks.delta.toFixed(2)}
                </span>
                <p className="text-xs text-gray-500">Market exposure</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Theta Decay
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className={`text-2xl font-bold ${portfolioSummary.portfolioGreeks.theta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${portfolioSummary.portfolioGreeks.theta.toFixed(0)}
                </span>
                <p className="text-xs text-gray-500">Daily theta</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Risk Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">{portfolioSummary.riskScore}</span>
                  <Badge className={getRiskLevelColor(portfolioSummary.riskScore)}>
                    {portfolioSummary.riskScore < 25 ? 'Low' : 
                     portfolioSummary.riskScore < 50 ? 'Medium' : 
                     portfolioSummary.riskScore < 75 ? 'High' : 'Critical'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Positions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <span className="text-2xl font-bold">{portfolioSummary.positionsCount}</span>
                <p className="text-xs text-gray-500">{portfolioSummary.strategiesCount} strategies</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Dashboard Tabs */}
      <Tabs value={selectedTab} onValueChange={(value) => setSelectedTab(value as any)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="chain">Options Chain</TabsTrigger>
          <TabsTrigger value="strategies">Strategy Builder</TabsTrigger>
          <TabsTrigger value="risk">Risk Management</TabsTrigger>
          <TabsTrigger value="analytics">Performance</TabsTrigger>
        </TabsList>

        {/* Portfolio Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Current Positions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Current Positions ({positions.length})
                </span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setSelectedTab('strategies')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Strategy
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {positions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">Symbol</th>
                        <th className="text-left p-3">Strategy</th>
                        <th className="text-right p-3">Value</th>
                        <th className="text-right p-3">P&L</th>
                        <th className="text-right p-3">Day P&L</th>
                        <th className="text-right p-3">Delta</th>
                        <th className="text-right p-3">Theta</th>
                        <th className="text-right p-3">DTE</th>
                        <th className="text-center p-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((position) => (
                        <tr key={position.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 font-medium">{position.symbol}</td>
                          <td className="p-3">{position.strategy}</td>
                          <td className="text-right p-3">${position.currentValue.toLocaleString()}</td>
                          <td className={`text-right p-3 ${position.unrealizedPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${position.unrealizedPnL.toLocaleString()}
                          </td>
                          <td className={`text-right p-3 ${position.dayPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${position.dayPnL.toLocaleString()}
                          </td>
                          <td className="text-right p-3">{position.delta.toFixed(2)}</td>
                          <td className="text-right p-3">${position.theta.toFixed(0)}</td>
                          <td className="text-right p-3">{position.daysToExpiration}</td>
                          <td className="text-center p-3">
                            <Badge variant={
                              position.status === 'active' ? 'default' :
                              position.status === 'expired' ? 'destructive' :
                              position.status === 'assigned' ? 'secondary' : 'outline'
                            }>
                              {position.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Target className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium mb-2">No positions yet</h3>
                  <p className="mb-4">Start building your options portfolio with our strategy wizard</p>
                  <Button onClick={() => setSelectedTab('strategies')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Strategy
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Options Chain Tab */}
        <TabsContent value="chain" className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Symbol:</label>
              <select 
                value={selectedSymbol} 
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="border rounded px-3 py-1"
              >
                <option value="AAPL">AAPL</option>
                <option value="MSFT">MSFT</option>
                <option value="GOOGL">GOOGL</option>
                <option value="TSLA">TSLA</option>
                <option value="NVDA">NVDA</option>
                <option value="SPY">SPY</option>
                <option value="QQQ">QQQ</option>
              </select>
            </div>
          </div>
          <OptionsChain 
            symbol={selectedSymbol} 
            onOptionSelect={handleOptionSelected}
            onStrategyBuilder={(strikes, expiration) => {
              console.log('Strategy builder requested:', { strikes, expiration });
              setSelectedTab('strategies');
            }}
          />
        </TabsContent>

        {/* Strategy Builder Tab */}
        <TabsContent value="strategies" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <StrategyWizard onStrategySelected={handleStrategyCreated} />
            </div>
            <div>
              {/* Strategy Visualizer would be shown here when a strategy is selected */}
              <Card>
                <CardHeader>
                  <CardTitle>Strategy Visualizer</CardTitle>
                </CardHeader>
                <CardContent className="text-center py-12 text-gray-500">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Select a strategy to see P&L visualization</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Risk Management Tab */}
        <TabsContent value="risk">
          <Card>
            <CardContent className="p-6">
              <div className="text-center text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium mb-2">Risk Dashboard</h3>
                <p>Risk management dashboard will be available soon</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Analytics Tab */}
        <TabsContent value="analytics">
          <PerformanceAnalytics 
            positions={positions}
            accountInfo={accountInfo}
            timeRange="1M"
            autoRefresh={autoRefresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}; 