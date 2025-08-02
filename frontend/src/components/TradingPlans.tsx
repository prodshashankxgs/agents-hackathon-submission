import React, { useState} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderIcon,
  StarIcon,
  TrendingUpIcon,
  TrashIcon,
  EyeIcon,
  BarChart3Icon,
  Target,
  FileTextIcon,
  SearchIcon,
  LoaderIcon,
  CalendarIcon,
  TagIcon,
  PlayIcon,
  PauseIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  RotateCcwIcon
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

interface ExecutionStep {
  id: string;
  description: string;
  action: 'buy' | 'sell' | 'hold' | 'wait';
  symbol?: string;
  quantity?: number;
  price?: number;
  condition?: string;
  timing?: string;
  completed: boolean;
  executedAt?: string;
  result?: any;
}

interface TradingPlan {
  id: string;
  title: string;
  data: any;
  type: string;
  query: string;
  createdAt: string;
  savedAt: number;
  tags: string[];
  isTrending: boolean;
  executionSteps: ExecutionStep[];
  status: 'draft' | 'ready' | 'executing' | 'completed' | 'paused' | 'failed';
  totalSteps: number;
  completedSteps: number;
  lastExecuted?: string;
  scheduledAt?: string;
  autoExecute: boolean;
}

interface PlansResponse {
  plans: TradingPlan[];
  total: number;
}

export const TradingPlans: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [showTrending, setShowTrending] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<TradingPlan | null>(null);
  const [executingSteps, setExecutingSteps] = useState<Set<string>>(new Set());
  const [executingPlans, setExecutingPlans] = useState<Set<string>>(new Set());
  
  const queryClient = useQueryClient();

  // Fetch plans
  const { data: plansData, isLoading } = useQuery<PlansResponse>({
    queryKey: ['plans', selectedType, showTrending],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedType !== 'all') params.append('type', selectedType);
      if (showTrending) params.append('trending', 'true');
      params.append('limit', '50');

      const response = await fetch(`http://localhost:3001/api/plans?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }
      return response.json();
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Delete plan mutation
  const deletePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const response = await fetch(`http://localhost:3001/api/plans/${planId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete plan');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setSelectedPlan(null);
    },
  });

  // Execute single step mutation
  const executeStepMutation = useMutation({
    mutationFn: async ({ planId, stepId }: { planId: string; stepId: string }) => {
      // Add step to executing set
      setExecutingSteps(prev => new Set(prev).add(`${planId}-${stepId}`));
      
      const response = await fetch(`http://localhost:3001/api/plans/${planId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepId }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute step');
      }
      return response.json();
    },
    onSuccess: (_data, variables) => {
      // Remove step from executing set
      setExecutingSteps(prev => {
        const newSet = new Set(prev);
        newSet.delete(`${variables.planId}-${variables.stepId}`);
        return newSet;
      });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (_error, variables) => {
      // Remove step from executing set on error
      setExecutingSteps(prev => {
        const newSet = new Set(prev);
        newSet.delete(`${variables.planId}-${variables.stepId}`);
        return newSet;
      });
    },
  });

  // Execute full plan mutation
  const executeFullPlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      // Add plan to executing set
      setExecutingPlans(prev => new Set(prev).add(planId));
      
      const response = await fetch(`http://localhost:3001/api/plans/${planId}/execute-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to execute plan');
      }
      return response.json();
    },
    onSuccess: (_data, planId) => {
      // Remove plan from executing set
      setExecutingPlans(prev => {
        const newSet = new Set(prev);
        newSet.delete(planId);
        return newSet;
      });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
    onError: (_error, planId) => {
      // Remove plan from executing set on error
      setExecutingPlans(prev => {
        const newSet = new Set(prev);
        newSet.delete(planId);
        return newSet;
      });
    },
  });

  // Filter plans based on search term
  const filteredPlans = plansData?.plans.filter(plan =>
    plan.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.query.toLowerCase().includes(searchTerm.toLowerCase()) ||
    plan.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'trade-plan':
        return Target;
      case 'stock-analysis':
        return BarChart3Icon;
      case 'market-insight':
        return TrendingUpIcon;
      case 'news-analysis':
        return FileTextIcon;
      default:
        return FolderIcon;
    }
  };

  const getDisplayStatus = (plan: TradingPlan) => {
    // If status is failed but there are pending requirements, show as running
    if (plan.status === 'failed') {
      // Check if any step has unmet requirements (waiting for conditions)
      const hasWaitingSteps = plan.executionSteps?.some(step => 
        step.action === 'wait' || 
        (step.condition && !step.completed) ||
        (step.result && step.result.error && step.result.error.includes('requirement'))
      );
      
      if (hasWaitingSteps) {
        return 'running';
      }
    }
    return plan.status;
  };

  const getStepDisplayStatus = (step: ExecutionStep) => {
    // If step failed but it's waiting for requirements, show as running
    if (step.result?.success === false) {
      const isWaitingForRequirement = 
        step.action === 'wait' ||
        (step.condition && !step.completed) ||
        (step.result.error && (
          step.result.error.includes('requirement') ||
          step.result.error.includes('condition') ||
          step.result.error.includes('waiting') ||
          step.result.error.includes('pending')
        ));
      
      if (isWaitingForRequirement) {
        return 'running';
      }
    }
    
    if (step.completed) return 'completed';
    if (step.result?.success === false) return 'failed';
    return 'pending';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready':
        return 'text-green-600 bg-green-100';
      case 'executing':
      case 'running':
        return 'text-blue-600 bg-blue-100';
      case 'completed':
        return 'text-emerald-600 bg-emerald-100';
      case 'failed':
        return 'text-red-600 bg-red-100';
      case 'paused':
        return 'text-yellow-600 bg-yellow-100';
      case 'draft':
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready':
        return ClockIcon;
      case 'executing':
      case 'running':
        return LoaderIcon;
      case 'completed':
        return CheckCircleIcon;
      case 'failed':
        return XCircleIcon;
      case 'paused':
        return PauseIcon;
      case 'draft':
      default:
        return FileTextIcon;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'buy':
        return TrendingUpIcon;
      case 'sell':
        return TrendingUpIcon; // Would be better with a down arrow
      case 'hold':
        return PauseIcon;
      case 'wait':
        return ClockIcon;
      default:
        return Target;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'buy':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'sell':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'hold':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'wait':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const renderPlanPreview = (plan: TradingPlan) => {
    const data = plan.data?.data || plan.data;
    const displayStatus = getDisplayStatus(plan);
    const StatusIcon = getStatusIcon(displayStatus);
    
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{plan.title}</h3>
            <p className="text-sm text-gray-600">Query: {plan.query}</p>
          </div>
          <div className="flex items-center gap-2">
            {plan.isTrending && (
              <Badge variant="secondary" className="text-orange-600">
                <StarIcon className="w-3 h-3 mr-1" />
                Trending
              </Badge>
            )}
            <Badge variant="outline">{plan.type}</Badge>
          </div>
        </div>

        {/* Plan Status & Progress */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <StatusIcon className={`w-5 h-5 ${(displayStatus === 'executing' || displayStatus === 'running') ? 'animate-spin' : ''}`} />
              <Badge className={getStatusColor(displayStatus)}>
                {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
              </Badge>
            </div>
            <div className="text-sm text-gray-600">
              {plan.completedSteps} / {plan.totalSteps} steps completed
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                displayStatus === 'completed' ? 'bg-green-500' : 
                displayStatus === 'failed' ? 'bg-red-500' : 'bg-blue-500'
              }`}
              style={{ width: `${(plan.completedSteps / plan.totalSteps) * 100}%` }}
            />
          </div>
          
          {plan.lastExecuted && (
            <p className="text-xs text-gray-500 mt-2">
              Last executed: {formatDate(plan.lastExecuted)}
            </p>
          )}
        </div>

        {/* Plan Execution Controls */}
        {plan.status !== 'draft' && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => executeFullPlanMutation.mutate(plan.id)}
              disabled={executingPlans.has(plan.id) || displayStatus === 'executing' || displayStatus === 'completed'}
              className="flex items-center gap-2"
            >
              <PlayIcon className="w-4 h-4" />
              {executingPlans.has(plan.id) ? 'Executing...' : 'Execute All Steps'}
            </Button>
            
            {displayStatus === 'failed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => executeFullPlanMutation.mutate(plan.id)}
                disabled={executingPlans.has(plan.id)}
                className="flex items-center gap-2"
              >
                <RotateCcwIcon className="w-4 h-4" />
                {executingPlans.has(plan.id) ? 'Executing...' : 'Retry'}
              </Button>
            )}
          </div>
        )}

        {/* Execution Steps */}
        {plan.executionSteps && plan.executionSteps.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <Target className="w-4 h-4" />
              Execution Steps
            </h4>
            
            <div className="space-y-2">
              {plan.executionSteps.map((step, idx) => {
                const ActionIcon = getActionIcon(step.action);
                const stepStatus = getStepDisplayStatus(step);
                return (
                  <div 
                    key={step.id} 
                    className={`border rounded-lg p-3 transition-all ${
                      stepStatus === 'completed' ? 'bg-green-50 border-green-200' : 
                      stepStatus === 'failed' ? 'bg-red-50 border-red-200' :
                      stepStatus === 'running' ? 'bg-blue-50 border-blue-200' :
                      'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-sm font-medium text-gray-500">
                            Step {idx + 1}
                          </span>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getActionColor(step.action)}`}
                          >
                            <ActionIcon className="w-3 h-3 mr-1" />
                            {step.action.toUpperCase()}
                          </Badge>
                          {stepStatus === 'completed' && (
                            <CheckCircleIcon className="w-4 h-4 text-green-500" />
                          )}
                          {stepStatus === 'failed' && (
                            <XCircleIcon className="w-4 h-4 text-red-500" />
                          )}
                          {stepStatus === 'running' && (
                            <LoaderIcon className="w-4 h-4 text-blue-500 animate-spin" />
                          )}
                        </div>
                        
                        <p className="text-sm text-gray-900 mb-2">
                          {step.description}
                        </p>
                        
                        {/* Step Details */}
                        <div className="text-xs text-gray-600 space-y-1">
                          {step.symbol && (
                            <div>Symbol: <span className="font-mono">{step.symbol}</span></div>
                          )}
                          {step.quantity && (
                            <div>Quantity: <span className="font-mono">{step.quantity} shares</span></div>
                          )}
                          {step.price && (
                            <div>Amount: <span className="font-mono">${step.price}</span></div>
                          )}
                          {step.condition && (
                            <div>Condition: <span className="italic">{step.condition}</span></div>
                          )}
                          {step.timing && (
                            <div>Timing: <span className="italic">{step.timing}</span></div>
                          )}
                        </div>
                        
                        {/* Execution Result */}
                        {step.result && (
                          <div className={`mt-2 p-2 rounded text-xs ${
                            stepStatus === 'completed' ? 'bg-green-100 text-green-800' : 
                            stepStatus === 'failed' ? 'bg-red-100 text-red-800' :
                            stepStatus === 'running' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {stepStatus === 'completed' ? (
                              <div>
                                ✅ {step.result.message || 'Step completed successfully'}
                                {step.executedAt && (
                                  <div className="text-green-600 mt-1">
                                    Executed: {formatDate(step.executedAt)}
                                  </div>
                                )}
                              </div>
                            ) : stepStatus === 'running' ? (
                              <div>
                                ⏳ {step.result.error || 'Waiting for requirements to be met...'}
                              </div>
                            ) : (
                              <div>
                                ❌ {step.result.error || 'Step failed'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Individual Step Execution */}
                      {stepStatus !== 'completed' && step.action !== 'wait' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => executeStepMutation.mutate({ planId: plan.id, stepId: step.id })}
                          disabled={executingSteps.has(`${plan.id}-${step.id}`) || plan.status === 'executing' || stepStatus === 'running'}
                          className="ml-3 flex items-center gap-1"
                        >
                          {executingSteps.has(`${plan.id}-${step.id}`) ? (
                            <>
                              <LoaderIcon className="w-3 h-3 animate-spin" />
                              Executing...
                            </>
                          ) : (
                            <>
                              <PlayIcon className="w-3 h-3" />
                              Execute
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary */}
        {data?.summary && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Strategy Summary</h4>
            <p className="text-blue-800 text-sm">{data.summary}</p>
            
            {/* Strategy Metrics */}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {data.confidence && (
                <div className="text-xs">
                  <span className="text-blue-700 font-medium">Confidence:</span> 
                  <span className="ml-1">{(data.confidence * 100).toFixed(0)}%</span>
                </div>
              )}
              {data.expectedReturn && (
                <div className="text-xs">
                  <span className="text-blue-700 font-medium">Expected Return:</span> 
                  <span className="ml-1">{data.expectedReturn}</span>
                </div>
              )}
              {data.riskLevel && (
                <div className="text-xs">
                  <span className="text-blue-700 font-medium">Risk Level:</span> 
                  <span className="ml-1">{data.riskLevel}</span>
                </div>
              )}
              {data.timeframe && (
                <div className="text-xs">
                  <span className="text-blue-700 font-medium">Timeframe:</span> 
                  <span className="ml-1">{data.timeframe}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Key Findings */}
        {data?.keyFindings && data.keyFindings.length > 0 && (
          <div className="bg-green-50 p-3 rounded-lg">
            <h4 className="font-medium text-green-900 mb-2">Key Findings</h4>
            <ul className="text-green-800 text-sm space-y-1">
              {data.keyFindings.slice(0, 5).map((finding: string, idx: number) => (
                <li key={idx} className="flex items-start">
                  <span className="text-green-600 mr-2">•</span>
                  {finding}
                </li>
              ))}
            </ul>
            {data.keyFindings.length > 5 && (
              <p className="text-green-700 text-xs mt-2">
                +{data.keyFindings.length - 5} more findings...
              </p>
            )}
          </div>
        )}

        {/* Tags */}
        {plan.tags && plan.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {plan.tags.map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                <TagIcon className="w-3 h-3 mr-1" />
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t">
          <span className="flex items-center">
            <CalendarIcon className="w-3 h-3 mr-1" />
            Created: {formatDate(plan.createdAt)}
          </span>
          <div className="flex items-center gap-4">
            {plan.autoExecute && (
              <span className="flex items-center text-blue-600">
                <ClockIcon className="w-3 h-3 mr-1" />
                Auto-execute
              </span>
            )}
            <span>
              ID: {plan.id}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoaderIcon className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading plans...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trading Plans</h1>
          <p className="text-gray-600">
            Manage your saved trading plans and discover trending strategies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-blue-600">
            {filteredPlans.length} Plans
          </Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Search plans, queries, or tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Type Filter */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md bg-white text-sm"
        >
          <option value="all">All Types</option>
          <option value="trade-plan">Trade Plans</option>
          <option value="stock-analysis">Stock Analysis</option>
          <option value="market-insight">Market Insights</option>
          <option value="news-analysis">News Analysis</option>
        </select>

        {/* Trending Toggle */}
        <Button
          variant={showTrending ? "default" : "outline"}
          onClick={() => setShowTrending(!showTrending)}
          className="flex items-center gap-2"
        >
          <StarIcon className="w-4 h-4" />
          Trending
        </Button>
      </div>

      {/* Plans Grid/List */}
      <div className="flex-1 overflow-hidden">
        {filteredPlans.length === 0 ? (
          <div className="text-center py-12">
            <FolderIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No plans found</h3>
            <p className="text-gray-600">
              {searchTerm ? 'Try adjusting your search criteria' : 'Start by creating some trading plans in the Market Research tab'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto">
            {filteredPlans.map((plan) => {
              const IconComponent = getTypeIcon(plan.type);
              const displayStatus = getDisplayStatus(plan);
              const StatusIcon = getStatusIcon(displayStatus);
              
              return (
                <Card key={plan.id} className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <IconComponent className="w-5 h-5 text-blue-600" />
                        <h3 className="font-medium text-gray-900 truncate">
                          {plan.title.length > 30 ? `${plan.title.substring(0, 30)}...` : plan.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge className={`text-xs ${getStatusColor(displayStatus)}`}>
                          <StatusIcon className={`w-3 h-3 mr-1 ${(displayStatus === 'executing' || displayStatus === 'running') ? 'animate-spin' : ''}`} />
                          {displayStatus}
                        </Badge>
                        {plan.isTrending && (
                          <StarIcon className="w-4 h-4 text-orange-500" />
                        )}
                      </div>
                    </div>

                    {/* Progress Indicator */}
                    {plan.totalSteps > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-600">Progress</span>
                          <span className="text-xs text-gray-600">
                            {plan.completedSteps}/{plan.totalSteps}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div 
                            className={`h-1.5 rounded-full transition-all duration-300 ${
                              displayStatus === 'completed' ? 'bg-green-500' : 
                              displayStatus === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${(plan.completedSteps / plan.totalSteps) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      Query: {plan.query}
                    </p>

                    {/* Quick Strategy Info */}
                    <div className="space-y-2 mb-4">
                      {plan.data?.summary && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {plan.data.summary.substring(0, 100)}...
                        </p>
                      )}
                      
                      {/* Key Metrics */}
                      <div className="flex items-center gap-3 text-xs text-gray-600">
                        {plan.data?.confidence && (
                          <span>Confidence: {(plan.data.confidence * 100).toFixed(0)}%</span>
                        )}
                        {plan.data?.riskLevel && (
                          <span>Risk: {plan.data.riskLevel}</span>
                        )}
                      </div>
                    </div>

                    {/* Tags */}
                    {plan.tags && plan.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {plan.tags.slice(0, 3).map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {plan.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{plan.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Quick Execute Button */}
                    {plan.status === 'ready' && (
                      <div className="mb-3">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            executeFullPlanMutation.mutate(plan.id);
                          }}
                          disabled={executingPlans.has(plan.id)}
                          className="w-full flex items-center gap-2"
                        >
                          <PlayIcon className="w-3 h-3" />
                          {executingPlans.has(plan.id) ? 'Executing...' : 'Execute Plan'}
                        </Button>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-gray-500">
                        {formatDate(plan.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPlan(plan);
                          }}
                        >
                          <EyeIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePlanMutation.mutate(plan.id);
                          }}
                          disabled={deletePlanMutation.isPending}
                        >
                          <TrashIcon className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Plan Detail Modal */}
      {selectedPlan && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Plan Details</h2>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedPlan(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </Button>
              </div>
              
              {renderPlanPreview(selectedPlan)}
              
              <div className="flex items-center justify-between mt-6 pt-4 border-t">
                <div className="flex items-center gap-3">
                  {selectedPlan.status !== 'draft' && getDisplayStatus(selectedPlan) !== 'completed' && (
                    <Button
                      onClick={() => executeFullPlanMutation.mutate(selectedPlan.id)}
                      disabled={executingPlans.has(selectedPlan.id) || getDisplayStatus(selectedPlan) === 'executing'}
                      className="flex items-center gap-2"
                    >
                      <PlayIcon className="w-4 h-4" />
                      {executingPlans.has(selectedPlan.id) ? 'Executing...' : 'Execute All Steps'}
                    </Button>
                  )}
                  
                  {getDisplayStatus(selectedPlan) === 'failed' && (
                    <Button
                      variant="outline"
                      onClick={() => executeFullPlanMutation.mutate(selectedPlan.id)}
                      disabled={executingPlans.has(selectedPlan.id)}
                      className="flex items-center gap-2"
                    >
                      <RotateCcwIcon className="w-4 h-4" />
                      {executingPlans.has(selectedPlan.id) ? 'Executing...' : 'Retry Plan'}
                    </Button>
                  )}
                </div>
                
                <div className="flex items-center gap-3">
                  <Button
                    variant="destructive"
                    onClick={() => deletePlanMutation.mutate(selectedPlan.id)}
                    disabled={deletePlanMutation.isPending}
                  >
                    <TrashIcon className="w-4 h-4 mr-2" />
                    Delete Plan
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedPlan(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};