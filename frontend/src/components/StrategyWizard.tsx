import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { 
  TrendingUp, 
  Shield, 
  DollarSign,
  Target,
  AlertTriangle,
  CheckCircle,
  Info,
  BarChart3,
  Brain
} from 'lucide-react';

/**
 * Guided Strategy Wizard - Core component of the OPTIONS-ARCHITECTURE.md workflow
 * 
 * Implements the complete user journey:
 * "I want to long NVDA" → Guided Strategy Designer → Complete Options Strategy
 * 
 * Features:
 * - Natural language command input
 * - AI-powered strategy recommendations
 * - Interactive parameter selection
 * - Real-time risk/reward visualization
 * - Educational tooltips and guidance
 * - Progressive disclosure of complexity
 */

interface StrategyOption {
  name: string;
  type: string;
  riskLevel: 'low' | 'medium' | 'high';
  complexityLevel: 'beginner' | 'intermediate' | 'advanced';
  description: string;
  expectedOutcome: string;
  marketView: string;
  maxProfit: string;
  maxLoss: string;
  breakeven: string;
  pros: string[];
  cons: string[];
  capitalRequirement: 'low' | 'medium' | 'high';
  timeDecayImpact: 'positive' | 'negative' | 'neutral';
  volatilityImpact: 'positive' | 'negative' | 'neutral';
}

interface StrategyRecommendation {
  strategy: StrategyOption;
  reasoning: string;
  marketFit: number;
  riskReward: {
    expectedReturn: number;
    probabilityOfProfit: number;
    maxDrawdown: number;
  };
  implementation: {
    legs: any[];
    totalCost: number;
    marginRequirement: number;
    breakeven: number[];
  };
  warnings: string[];
  alternatives: string[];
}

interface UserProfile {
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  riskTolerance: 'low' | 'medium' | 'high';
  capitalAvailable: number;
  tradingObjective: 'income' | 'growth' | 'speculation' | 'hedging';
  timeHorizon: 'short_term' | 'medium_term' | 'long_term';
}

interface StrategyWizardProps {
  className?: string;
  onStrategySelected?: (strategy: StrategyRecommendation) => void;
  onExecuteStrategy?: (strategy: StrategyRecommendation) => void;
}

export const StrategyWizard: React.FC<StrategyWizardProps> = ({
  className = '',
  onExecuteStrategy
}) => {
  // Wizard state management
  const [currentStep, setCurrentStep] = useState<'command' | 'profile' | 'recommendations' | 'parameters' | 'review'>('command');
  const [command, setCommand] = useState('');
  const [userProfile, setUserProfile] = useState<UserProfile>({
    experienceLevel: 'intermediate',
    riskTolerance: 'medium',
    capitalAvailable: 10000,
    tradingObjective: 'growth',
    timeHorizon: 'medium_term'
  });
  const [recommendations, setRecommendations] = useState<StrategyRecommendation[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyRecommendation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Natural Language Command Input
  const handleCommandSubmit = async () => {
    if (!command.trim()) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // First analyze the intent
      const intentResponse = await fetch('/api/strategies/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      });
      
      if (!intentResponse.ok) {
        throw new Error('Failed to analyze command');
      }
      
      const intentData = await intentResponse.json();
      
      if (intentData.success) {
        setCurrentStep('profile');
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process command');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Get Strategy Recommendations using Phase 3 Advanced APIs
  const getRecommendations = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/advanced/strategies/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          command,
          userProfile,
          marketConditions: {
            volatilityRegime: 'normal',
            marketTrend: 'neutral',
            interestRateEnvironment: 'rising'
          },
          riskAssessment: {
            tolerance: userProfile.riskTolerance,
            capitalAvailable: userProfile.capitalAvailable,
            experience: userProfile.experienceLevel
          }
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to get recommendations');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Enhanced recommendations from Phase 3 strategy engine
        setRecommendations(data.data.recommendations.map((rec: any) => ({
          ...rec,
          riskMetrics: rec.analysis?.riskMetrics || {},
          expectedReturns: rec.analysis?.expectedReturns || {},
          greeksProfile: rec.analysis?.greeksProfile || {}
        })));
        setCurrentStep('recommendations');
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get recommendations');
    } finally {
      setIsLoading(false);
    }
  };

  // Risk level colors and icons
  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case 'low': return <Shield className="h-4 w-4" />;
      case 'medium': return <Target className="h-4 w-4" />;
      case 'high': return <TrendingUp className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getComplexityColor = (level: string) => {
    switch (level) {
      case 'beginner': return 'bg-blue-100 text-blue-800';
      case 'intermediate': return 'bg-purple-100 text-purple-800';
      case 'advanced': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Render Step 1: Command Input
  const renderCommandStep = () => (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          What's your trading idea?
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Describe your market outlook in plain English. For example: "I want to long NVDA", "I'm bearish on TSLA", or "I want income from SPY"
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g., I want to long NVDA..."
            className="text-lg p-6"
            onKeyPress={(e) => e.key === 'Enter' && handleCommandSubmit()}
          />
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCommand("I want to long AAPL")}
            >
              I want to long AAPL
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCommand("I'm bearish on TSLA")}
            >
              I'm bearish on TSLA
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCommand("I want income from SPY")}
            >
              I want income from SPY
            </Button>
          </div>
        </div>
        
        <Button 
          onClick={handleCommandSubmit}
          disabled={!command.trim() || isLoading}
          className="w-full"
        >
          {isLoading ? 'Analyzing...' : 'Analyze My Idea'}
        </Button>
        
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // Render Step 2: User Profile Setup
  const renderProfileStep = () => (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Tell us about yourself</CardTitle>
        <p className="text-sm text-muted-foreground">
          This helps us recommend strategies that match your experience and risk tolerance
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Experience Level</label>
            <select 
              value={userProfile.experienceLevel}
              onChange={(e) => setUserProfile(prev => ({ ...prev, experienceLevel: e.target.value as any }))}
              className="w-full p-2 border rounded-md"
            >
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Risk Tolerance</label>
            <select 
              value={userProfile.riskTolerance}
              onChange={(e) => setUserProfile(prev => ({ ...prev, riskTolerance: e.target.value as any }))}
              className="w-full p-2 border rounded-md"
            >
              <option value="low">Conservative</option>
              <option value="medium">Moderate</option>
              <option value="high">Aggressive</option>
            </select>
          </div>
        </div>
        
        <div className="space-y-2">
          <label className="text-sm font-medium">Available Capital</label>
          <Input
            type="number"
            value={userProfile.capitalAvailable}
            onChange={(e) => setUserProfile(prev => ({ ...prev, capitalAvailable: Number(e.target.value) }))}
            placeholder="e.g., 10000"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Trading Objective</label>
            <select 
              value={userProfile.tradingObjective}
              onChange={(e) => setUserProfile(prev => ({ ...prev, tradingObjective: e.target.value as any }))}
              className="w-full p-2 border rounded-md"
            >
              <option value="income">Generate Income</option>
              <option value="growth">Capital Growth</option>
              <option value="speculation">Speculation</option>
              <option value="hedging">Hedging</option>
            </select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Time Horizon</label>
            <select 
              value={userProfile.timeHorizon}
              onChange={(e) => setUserProfile(prev => ({ ...prev, timeHorizon: e.target.value as any }))}
              className="w-full p-2 border rounded-md"
            >
              <option value="short_term">Short Term (1-4 weeks)</option>
              <option value="medium_term">Medium Term (1-3 months)</option>
              <option value="long_term">Long Term (3+ months)</option>
            </select>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCurrentStep('command')}>
            Back
          </Button>
          <Button onClick={getRecommendations} disabled={isLoading} className="flex-1">
            {isLoading ? 'Getting Recommendations...' : 'Get Strategy Recommendations'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  // Render Step 3: Strategy Recommendations
  const renderRecommendationsStep = () => (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Recommended Strategies</CardTitle>
          <p className="text-sm text-muted-foreground">
            Based on your command "{command}" and profile, here are the best strategies for you:
          </p>
        </CardHeader>
      </Card>
      
      <div className="grid gap-4">
        {recommendations.map((rec, index) => (
          <Card key={index} className={`cursor-pointer transition-all ${
            selectedStrategy === rec ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:shadow-md'
          }`} onClick={() => setSelectedStrategy(rec)}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold">{rec.strategy.name}</h3>
                  <p className="text-sm text-muted-foreground mb-2">{rec.strategy.description}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Badge className={getRiskLevelColor(rec.strategy.riskLevel)}>
                    {getRiskIcon(rec.strategy.riskLevel)}
                    {rec.strategy.riskLevel} risk
                  </Badge>
                  <Badge className={getComplexityColor(rec.strategy.complexityLevel)}>
                    {rec.strategy.complexityLevel}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Max Profit</p>
                    <p className="text-sm font-medium">{rec.strategy.maxProfit}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Max Loss</p>
                    <p className="text-sm font-medium">{rec.strategy.maxLoss}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-blue-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Breakeven</p>
                    <p className="text-sm font-medium">{rec.strategy.breakeven}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-purple-600" />
                  <div>
                    <p className="text-xs text-muted-foreground">Est. Cost</p>
                    <p className="text-sm font-medium">${rec.implementation.totalCost.toFixed(0)}</p>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <p className="text-sm"><strong>Market View:</strong> {rec.strategy.marketView}</p>
                <p className="text-sm"><strong>AI Analysis:</strong> {rec.reasoning}</p>
              </div>
              
              {rec.warnings.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">Important Considerations:</p>
                      <ul className="text-xs text-yellow-700 mt-1 space-y-1">
                        {rec.warnings.map((warning, idx) => (
                          <li key={idx}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setCurrentStep('profile')}>
          Back
        </Button>
        <Button 
          onClick={() => setCurrentStep('review')} 
          disabled={!selectedStrategy}
          className="flex-1"
        >
          Review Selected Strategy
        </Button>
      </div>
    </div>
  );

  // Render Step 4: Strategy Review & Execution
  const renderReviewStep = () => {
    if (!selectedStrategy) return null;
    
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Strategy Review: {selectedStrategy.strategy.name}
              <Badge className={getRiskLevelColor(selectedStrategy.strategy.riskLevel)}>
                {selectedStrategy.strategy.riskLevel} risk
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Final review before execution
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Implementation Details */}
            <div>
              <h4 className="font-semibold mb-3">Implementation</h4>
              <div className="space-y-2">
                {selectedStrategy.implementation.legs.map((leg, index) => (
                  <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
                    <div>
                      <span className="font-medium">{leg.action} {leg.contractType}</span>
                      <span className="text-sm text-muted-foreground ml-2">
                        Strike: ${leg.strike} | Exp: {leg.expiration}
                      </span>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">${leg.price}</p>
                      <p className="text-xs text-muted-foreground">per contract</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Cost Summary */}
            <div className="p-4 bg-blue-50 rounded-md">
              <div className="flex justify-between items-center mb-2">
                <span className="font-medium">Total Strategy Cost:</span>
                <span className="text-xl font-bold text-blue-600">
                  ${Math.abs(selectedStrategy.implementation.totalCost).toFixed(2)}
                </span>
              </div>
              {selectedStrategy.implementation.marginRequirement > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Margin Required:</span>
                  <span className="text-sm font-medium">
                    ${selectedStrategy.implementation.marginRequirement.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
            
            {/* Risk Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 rounded-md">
                <p className="text-xs text-muted-foreground">Probability of Profit</p>
                <p className="text-lg font-bold text-green-600">
                  {(selectedStrategy.riskReward.probabilityOfProfit * 100).toFixed(0)}%
                </p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-md">
                <p className="text-xs text-muted-foreground">Expected Return</p>
                <p className="text-lg font-bold text-blue-600">
                  ${selectedStrategy.riskReward.expectedReturn.toFixed(0)}
                </p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-md">
                <p className="text-xs text-muted-foreground">Max Drawdown</p>
                <p className="text-lg font-bold text-red-600">
                  ${selectedStrategy.riskReward.maxDrawdown.toFixed(0)}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep('recommendations')}>
                Back to Recommendations
              </Button>
              <Button 
                onClick={() => onExecuteStrategy?.(selectedStrategy)}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Execute Strategy
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Progress Indicator */}
      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-center space-x-4">
          {[
            { key: 'command', label: 'Command', icon: Brain },
            { key: 'profile', label: 'Profile', icon: Info },
            { key: 'recommendations', label: 'Strategies', icon: Target },
            { key: 'review', label: 'Review', icon: CheckCircle }
          ].map(({ key, label, icon: Icon }, index) => (
            <div key={key} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                currentStep === key ? 'bg-blue-600 text-white' : 
                ['command', 'profile', 'recommendations', 'review'].indexOf(currentStep) > index ? 
                'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="ml-2 text-sm font-medium hidden sm:block">{label}</span>
              {index < 3 && <div className="w-16 h-0.5 bg-gray-200 mx-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      {currentStep === 'command' && renderCommandStep()}
      {currentStep === 'profile' && renderProfileStep()}
      {currentStep === 'recommendations' && renderRecommendationsStep()}
      {currentStep === 'review' && renderReviewStep()}
    </div>
  );
};

export default StrategyWizard;