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
  TagIcon
} from 'lucide-react';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';

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

  const renderPlanPreview = (plan: TradingPlan) => {
    const data = plan.data?.data || plan.data;
    
    return (
      <div className="space-y-4">
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

        {/* Summary */}
        {data?.summary && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Summary</h4>
            <p className="text-blue-800 text-sm">{data.summary}</p>
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

        {/* Trading Levels (for trade plans) */}
        {data?.tradingLevels && (data.tradingLevels.prices?.length > 0 || data.tradingLevels.percentages?.length > 0) && (
          <div className="bg-indigo-50 p-3 rounded-lg">
            <h4 className="font-medium text-indigo-900 mb-2">Key Trading Levels</h4>
            <div className="flex flex-wrap gap-2">
              {data.tradingLevels.prices?.slice(0, 4).map((price: string, idx: number) => (
                <span key={idx} className="bg-indigo-200 text-indigo-900 px-2 py-1 rounded text-xs font-mono">
                  {price}
                </span>
              ))}
              {data.tradingLevels.percentages?.slice(0, 3).map((pct: string, idx: number) => (
                <span key={idx} className="bg-indigo-200 text-indigo-900 px-2 py-1 rounded text-xs font-mono">
                  {pct}
                </span>
              ))}
            </div>
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
        <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
          <span className="flex items-center">
            <CalendarIcon className="w-3 h-3 mr-1" />
            {formatDate(plan.createdAt)}
          </span>
          {data?.metadata?.confidence && (
            <span>Confidence: {(data.metadata.confidence * 100).toFixed(0)}%</span>
          )}
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
                      {plan.isTrending && (
                        <StarIcon className="w-4 h-4 text-orange-500" />
                      )}
                    </div>

                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      Query: {plan.query}
                    </p>

                    {/* Quick preview */}
                    <div className="space-y-2 mb-4">
                      {plan.data?.data?.summary && (
                        <p className="text-xs text-gray-500 line-clamp-2">
                          {plan.data.data.summary.substring(0, 100)}...
                        </p>
                      )}
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

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-3 border-t">
                      <span className="text-xs text-gray-500">
                        {formatDate(plan.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPlan(plan)}
                        >
                          <EyeIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePlanMutation.mutate(plan.id)}
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
              
              <div className="flex items-center gap-3 mt-6 pt-4 border-t">
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
      )}
    </div>
  );
};