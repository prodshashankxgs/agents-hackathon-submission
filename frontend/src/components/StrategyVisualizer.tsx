import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine
} from 'recharts';
import { 
  TrendingUp, 
  Target,
  Clock,
  BarChart3
} from 'lucide-react';

/**
 * Advanced Strategy Visualizer Component
 * 
 * Creates interactive P&L charts, Greeks visualization, and risk analysis
 * for options strategies as specified in OPTIONS-ARCHITECTURE.md
 */

interface StrategyLeg {
  action: 'buy' | 'sell';
  contractType: 'call' | 'put';
  strike: number;
  expiration: string;
  quantity: number;
  price: number;
  delta: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
}

interface StrategyData {
  name: string;
  type: string;
  underlying: string;
  currentPrice: number;
  legs: StrategyLeg[];
  totalCost: number;
  maxProfit: number | string;
  maxLoss: number;
  breakeven: number[];
  daysToExpiration: number;
  impliedVolatility: number;
}

interface PnLPoint {
  price: number;
  pnl: number;
  pnlPercent: number;
  probability: number;
}

interface GreeksData {
  name: string;
  value: number;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  color: string;
}

interface StrategyVisualizerProps {
  strategy: StrategyData;
  className?: string;
}

export const StrategyVisualizer: React.FC<StrategyVisualizerProps> = ({
  strategy,
  className = ''
}) => {
  const [selectedView, setSelectedView] = useState<'pnl' | 'greeks' | 'probability' | 'time'>('pnl');
  // const [timeHorizon] = useState<'now' | '30days' | 'expiration'>('expiration');

  // Calculate P&L chart data
  const pnlData = useMemo(() => {
    const currentPrice = strategy.currentPrice;
    const range = currentPrice * 0.4; // ±40% range
    const minPrice = Math.max(0.01, currentPrice - range);
    const maxPrice = currentPrice + range;
    
    const points: PnLPoint[] = [];
    const stepSize = (maxPrice - minPrice) / 100; // 100 data points
    
    for (let price = minPrice; price <= maxPrice; price += stepSize) {
      const pnl = calculatePnLAtPrice(price, strategy.legs, strategy.totalCost);
      const pnlPercent = strategy.totalCost > 0 ? (pnl / Math.abs(strategy.totalCost)) * 100 : 0;
      const probability = calculateProbability(price, currentPrice, strategy.impliedVolatility, strategy.daysToExpiration);
      
      points.push({
        price: Math.round(price * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 10) / 10,
        probability: Math.round(probability * 1000) / 1000
      });
    }
    
    return points;
  }, [strategy]);

  // Calculate Greeks data
  const greeksData = useMemo(() => {
    const totalDelta = strategy.legs.reduce((sum, leg) => {
      const multiplier = leg.action === 'buy' ? 1 : -1;
      return sum + (leg.delta * leg.quantity * multiplier);
    }, 0);

    const totalGamma = strategy.legs.reduce((sum, leg) => {
      const multiplier = leg.action === 'buy' ? 1 : -1;
      return sum + ((leg.gamma || 0) * leg.quantity * multiplier);
    }, 0);

    const totalTheta = strategy.legs.reduce((sum, leg) => {
      const multiplier = leg.action === 'buy' ? 1 : -1;
      return sum + ((leg.theta || 0) * leg.quantity * multiplier);
    }, 0);

    const totalVega = strategy.legs.reduce((sum, leg) => {
      const multiplier = leg.action === 'buy' ? 1 : -1;
      return sum + ((leg.vega || 0) * leg.quantity * multiplier);
    }, 0);

    const totalRho = strategy.legs.reduce((sum, leg) => {
      const multiplier = leg.action === 'buy' ? 1 : -1;
      return sum + ((leg.rho || 0) * leg.quantity * multiplier);
    }, 0);

    return [
      {
        name: 'Delta',
        value: totalDelta,
        description: 'Price sensitivity - how much P&L changes per $1 move in underlying',
        impact: totalDelta > 0 ? 'positive' : totalDelta < 0 ? 'negative' : 'neutral',
        color: totalDelta > 0 ? '#10b981' : totalDelta < 0 ? '#ef4444' : '#6b7280'
      },
      {
        name: 'Gamma',
        value: totalGamma,
        description: 'Acceleration - how much delta changes as price moves',
        impact: totalGamma > 0 ? 'positive' : totalGamma < 0 ? 'negative' : 'neutral',
        color: totalGamma > 0 ? '#8b5cf6' : totalGamma < 0 ? '#f59e0b' : '#6b7280'
      },
      {
        name: 'Theta',
        value: totalTheta,
        description: 'Time decay - how much value lost per day',
        impact: totalTheta > 0 ? 'positive' : totalTheta < 0 ? 'negative' : 'neutral',
        color: totalTheta > 0 ? '#10b981' : totalTheta < 0 ? '#ef4444' : '#6b7280'
      },
      {
        name: 'Vega',
        value: totalVega,
        description: 'Volatility sensitivity - P&L change per 1% IV move',
        impact: totalVega > 0 ? 'positive' : totalVega < 0 ? 'negative' : 'neutral',
        color: totalVega > 0 ? '#3b82f6' : totalVega < 0 ? '#ec4899' : '#6b7280'
      },
      {
        name: 'Rho',
        value: totalRho,
        description: 'Interest rate sensitivity - P&L change per 1% rate move',
        impact: totalRho > 0 ? 'positive' : totalRho < 0 ? 'negative' : 'neutral',
        color: totalRho > 0 ? '#06b6d4' : totalRho < 0 ? '#f97316' : '#6b7280'
      }
    ] as GreeksData[];
  }, [strategy]);

  // Find key levels - commented out for now
  /* const _keyLevels = useMemo(() => {
    const breakevens = strategy.breakeven;
    const maxProfitPrice = findMaxProfitPrice(pnlData);
    const maxLossPrice = findMaxLossPrice(pnlData);
    
    return {
      current: strategy.currentPrice,
      breakevens,
      maxProfitPrice,
      maxLossPrice
    };
  }, [strategy.breakeven, strategy.currentPrice, pnlData]); */

  // Custom tooltip for P&L chart
  const PnLTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border rounded-lg shadow-lg">
          <p className="font-semibold">{`Price: $${label}`}</p>
          <p className={`${data.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {`P&L: $${data.pnl} (${data.pnlPercent >= 0 ? '+' : ''}${data.pnlPercent}%)`}
          </p>
          <p className="text-sm text-gray-600">{`Probability: ${(data.probability * 100).toFixed(1)}%`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Strategy Summary Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{strategy.name} Analysis</span>
            <div className="flex gap-2">
              <Badge variant="outline">{strategy.underlying}</Badge>
              <Badge variant="outline">${strategy.currentPrice}</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-lg font-semibold text-blue-600">
                ${Math.abs(strategy.totalCost).toFixed(2)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Max Profit</p>
              <p className="text-lg font-semibold text-green-600">
                {typeof strategy.maxProfit === 'number' 
                  ? `$${strategy.maxProfit.toFixed(2)}` 
                  : strategy.maxProfit}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Max Loss</p>
              <p className="text-lg font-semibold text-red-600">
                ${Math.abs(strategy.maxLoss).toFixed(2)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Days to Exp</p>
              <p className="text-lg font-semibold">
                {strategy.daysToExpiration}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visualization Tabs */}
      <Tabs value={selectedView} onValueChange={(value) => setSelectedView(value as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pnl" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            P&L Chart
          </TabsTrigger>
          <TabsTrigger value="greeks" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Greeks
          </TabsTrigger>
          <TabsTrigger value="probability" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            Probability
          </TabsTrigger>
          <TabsTrigger value="time" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Decay
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pnl" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss at Expiration</CardTitle>
              <div className="flex flex-wrap gap-2">
                {strategy.breakeven.map((be, idx) => (
                  <Badge key={idx} variant="outline">
                    Breakeven: ${be.toFixed(2)}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pnlData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="price" 
                      type="number"
                      scale="linear"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis 
                      tickFormatter={(value) => `$${value}`}
                      domain={['dataMin - 100', 'dataMax + 100']}
                    />
                    <Tooltip content={<PnLTooltip />} />
                    <ReferenceLine y={0} stroke="#666" strokeDasharray="2 2" />
                    <ReferenceLine 
                      x={strategy.currentPrice} 
                      stroke="#3b82f6" 
                      strokeDasharray="4 4"
                      label="Current"
                    />
                    {strategy.breakeven.map((be, idx) => (
                      <ReferenceLine 
                        key={idx}
                        x={be} 
                        stroke="#f59e0b" 
                        strokeDasharray="4 4"
                        label={`BE${idx + 1}`}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="pnl"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="greeks" className="space-y-4">
          <div className="grid gap-4">
            {greeksData.map((greek) => (
              <Card key={greek.name}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: greek.color }}
                      />
                      <div>
                        <h3 className="font-semibold">{greek.name}</h3>
                        <p className="text-sm text-muted-foreground">{greek.description}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold" style={{ color: greek.color }}>
                        {greek.value.toFixed(3)}
                      </p>
                      <Badge 
                        variant={greek.impact === 'positive' ? 'default' : 
                               greek.impact === 'negative' ? 'destructive' : 'secondary'}
                      >
                        {greek.impact}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="probability" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Probability Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pnlData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="price" 
                      type="number"
                      scale="linear"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value) => `$${value}`}
                    />
                    <YAxis 
                      tickFormatter={(value) => `${(value * 100).toFixed(1)}%`}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Probability']}
                      labelFormatter={(value) => `Price: $${value}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="probability"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.3}
                    />
                    <ReferenceLine 
                      x={strategy.currentPrice} 
                      stroke="#3b82f6" 
                      strokeDasharray="4 4"
                      label="Current"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Time Decay Analysis</CardTitle>
              <p className="text-sm text-muted-foreground">
                How strategy value changes over time (assuming no price movement)
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Today</p>
                    <p className="text-xl font-bold text-blue-600">
                      ${strategy.totalCost.toFixed(2)}
                    </p>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">In 30 Days</p>
                    <p className="text-xl font-bold text-yellow-600">
                      ${(strategy.totalCost + (greeksData[2].value * 30)).toFixed(2)}
                    </p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">At Expiration</p>
                    <p className="text-xl font-bold text-red-600">
                      ${calculateIntrinsicValue(strategy).toFixed(2)}
                    </p>
                  </div>
                </div>
                
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-4 w-4" />
                    <span className="font-medium">Daily Theta Impact</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This strategy {greeksData[2].value > 0 ? 'gains' : 'loses'} approximately 
                    <span className="font-semibold"> ${Math.abs(greeksData[2].value).toFixed(2)}</span> per day 
                    due to time decay, assuming no other changes.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Strategy Legs Details */}
      <Card>
        <CardHeader>
          <CardTitle>Strategy Components</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {strategy.legs.map((leg, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-4">
                  <Badge variant={leg.action === 'buy' ? 'default' : 'destructive'}>
                    {leg.action}
                  </Badge>
                  <div>
                    <p className="font-medium">
                      {leg.contractType.toUpperCase()} ${leg.strike}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Exp: {leg.expiration} | Qty: {leg.quantity}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-medium">${leg.price.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground">
                    Δ: {leg.delta.toFixed(3)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Helper functions for calculations
function calculatePnLAtPrice(price: number, legs: StrategyLeg[], totalCost: number): number {
  let totalPnL = -totalCost; // Start with the cost of the strategy
  
  legs.forEach(leg => {
    const intrinsicValue = leg.contractType === 'call' 
      ? Math.max(0, price - leg.strike)
      : Math.max(0, leg.strike - price);
    
    const legValue = intrinsicValue * leg.quantity * 100; // 100 shares per contract
    
    if (leg.action === 'buy') {
      totalPnL += legValue;
    } else {
      totalPnL -= legValue;
    }
  });
  
  return totalPnL;
}

function calculateProbability(price: number, currentPrice: number, iv: number, days: number): number {
  // Simplified probability calculation using log-normal distribution
  const timeToExpiry = days / 365;
  const d = Math.log(price / currentPrice) / (iv * Math.sqrt(timeToExpiry));
  
  // Normal distribution approximation
  return Math.exp(-0.5 * d * d) / Math.sqrt(2 * Math.PI * iv * Math.sqrt(timeToExpiry));
}

// Helper functions commented out for now
// function findMaxProfitPrice(pnlData: PnLPoint[]): number {
//   return pnlData.reduce((max, point) => point.pnl > max.pnl ? point : max).price;
// }

// function findMaxLossPrice(pnlData: PnLPoint[]): number {
//   return pnlData.reduce((min, point) => point.pnl < min.pnl ? point : min).price;
// }

function calculateIntrinsicValue(strategy: StrategyData): number {
  let intrinsicValue = 0;
  
  strategy.legs.forEach(leg => {
    const contractIntrinsic = leg.contractType === 'call'
      ? Math.max(0, strategy.currentPrice - leg.strike)
      : Math.max(0, leg.strike - strategy.currentPrice);
    
    const legValue = contractIntrinsic * leg.quantity * 100;
    
    if (leg.action === 'buy') {
      intrinsicValue += legValue;
    } else {
      intrinsicValue -= legValue;
    }
  });
  
  return intrinsicValue;
}

export default StrategyVisualizer;