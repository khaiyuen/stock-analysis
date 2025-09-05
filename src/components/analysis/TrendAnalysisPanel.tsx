'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { FinanceCandlestickChart } from '@/components/charts/FinanceCandlestickChart';
import { TrendAnalysis, Timeframe, APIResponse, PivotPoint, MarketData } from '@/types';
import { CheckboxGroup, createDisplayOptionsConfig, createAdvancedOptionsConfig } from '@/components/common/CheckboxGroup';
import { detectClientSidePivots as libDetectPivots, detectPowerfulTrendlines as libDetectTrendlines } from '@/lib/trendCloud';
import { calculateAllMovingAverages, calculateMovingAveragesForRange, MovingAverageData, MA_PERIODS } from '@/lib/movingAverages';
import SimpleTrendCloud from '@/components/analysis/SimpleTrendCloud';

interface TrendAnalysisPanelProps {
  symbol?: string;
  className?: string;
}

interface TimeframeData {
  timeframe: Timeframe;
  label: string;
  enabled: boolean;
}

const AVAILABLE_TIMEFRAMES: TimeframeData[] = [
  { timeframe: '1M', label: '1 Month', enabled: true },
  { timeframe: '1W', label: '1 Week', enabled: true },
  { timeframe: '1D', label: '1 Day', enabled: true },
  { timeframe: '4H', label: '4 Hours (Unsupported)', enabled: false },
  { timeframe: '1H', label: '1 Hour (Unsupported)', enabled: false },
];

// Using library functions instead of local duplicates

// Traditional pivot points calculation
function calculateTraditionalPivots(marketData: MarketData[]) {
  if (marketData.length < 2) return null;
  
  // Use the most recent completed candle (not the current one)
  const yesterdayCandle = marketData[marketData.length - 2];
  const { high, low, close } = yesterdayCandle;
  
  // Traditional pivot point formula
  const pivot = (high + low + close) / 3;
  const R1 = (2 * pivot) - low;
  const S1 = (2 * pivot) - high;
  const R2 = pivot + (high - low);
  const S2 = pivot - (high - low);
  const R3 = high + 2 * (pivot - low);
  const S3 = low - 2 * (high - pivot);
  
  return {
    pivot,
    resistance: { R1, R2, R3 },
    support: { S1, S2, S3 }
  };
}

// Powerful trendline detection algorithm
interface PowerfulTrendline {
  id: string;
  points: PivotPoint[];
  slope: number;
  intercept: number;
  strength: number; // Number of pivot points connected
  type: 'SUPPORT' | 'RESISTANCE';
  rSquared: number;
  avgDeviation: number;
  startTime: Date;
  endTime: Date;
}

// Using library functions for pivot and trendline detection

// Dynamic trendlines implementation following @"1.0 trend_cloud_get_trendline.ipynb" approach:
// 1. Filter market data to visible range (viewport optimization)
// 2. Detect pivots on visible data using LOG SCALE multi-method detection (6 methods)
// 3. Calculate trendlines using LOG SCALE iterative best-fit refinement with 2% tolerance
// 4. Each trendline connects multiple pivot points and represents constant percentage growth rates
// 5. Uses smart pair removal to allow pivot reuse across different trendlines
function detectDynamicTrendlinesFromVisibleData(
  marketData: MarketData[],
  activeTimeframe: Timeframe,
  tolerance: number = 0.02, // 2% tolerance matching notebook approach
  visibleRange?: { startTime: number; endTime: number }
): PowerfulTrendline[] {
  if (!visibleRange || marketData.length === 0) return [];
  
  // Step 1: Filter market data to visible range first
  const visibleMarketData = marketData.filter(item => {
    const itemTime = new Date(item.timestamp).getTime();
    return itemTime >= visibleRange.startTime && itemTime <= visibleRange.endTime;
  });
  
  if (visibleMarketData.length < 10) return []; // Need minimum data for meaningful analysis
  
  // Step 2: Detect pivots on visible data only using LOG SCALE methods
  const visiblePivots = libDetectPivots(visibleMarketData, activeTimeframe);
  
  if (visiblePivots.length < 2) return [];
  
  // Step 3: Calculate trendlines from visible pivots using LOG SCALE iterative best-fit refinement
  const allTrendlines = libDetectTrendlines(visiblePivots, tolerance);
  
  // Limit to top 20 trendlines for website display (sorted by strength and R²)
  const trendlines = allTrendlines.slice(0, 20);
  
  return trendlines;
}


export const TrendAnalysisPanel: React.FC<TrendAnalysisPanelProps> = ({
  symbol = 'QQQ',
  className = ''
}) => {
  const [analysis, setAnalysis] = useState<TrendAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTimeframes, setSelectedTimeframes] = useState<Timeframe[]>(['1D', '1W', '1M']);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1D');
  const [visibleRange, setVisibleRange] = useState<{ startTime: number; endTime: number } | null>(null);
  // Removed optimized analysis state (not used in continuous trend clouds)
  
  // Trend cloud data state
  const [rawTrendCloudData, setRawTrendCloudData] = useState<any>(null);
  const [trendCloudLoading, setTrendCloudLoading] = useState(false);

  // Consolidated display options
  const [displayOptions, setDisplayOptions] = useState({
    showCandles: true,
    showPivots: false,
    showTrendlines: false,
    showDynamicTrendlines: false,
    showLocalTopBottom: false,
    showPivotLevels: false,
    showTrendCloud: true, // ENABLED - Now using clean trend cloud visualization
    showOptimizedLevels: false,
    showMovingAverages: false
  });

  // Advanced options
  const [advancedOptions, setAdvancedOptions] = useState({
    useCache: true,
    enableRealtime: false,
    showDebugInfo: false
  });


  // No longer need auto-refresh since we're using client-side pivot detection

  const fetchAnalysis = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);

    try {
      const timeframesParam = selectedTimeframes.join(',');
      const url = `/api/trend/${symbol}?timeframes=${timeframesParam}&useCache=${advancedOptions.useCache}&forceRefresh=${forceRefresh}`;
      
      const response = await fetch(url);
      const data: APIResponse<TrendAnalysis> = await response.json();

      // API Response received - success

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch trend analysis');
      }

      setAnalysis(data.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      console.error('Trend analysis error:', err);
    } finally {
      setLoading(false);
    }
  }, [symbol, selectedTimeframes, advancedOptions.useCache]);

  // Fetch continuous trend cloud data
  const fetchTrendCloudData = useCallback(async () => {
    if (!displayOptions.showTrendCloud) return;

    setTrendCloudLoading(true);
    try {
      // Call the updated API route
      const response = await fetch(`/api/trend-cloud/${symbol}`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch trend cloud data');
      }

      // Set raw trend cloud data from the new format
      setRawTrendCloudData(data.data);
      
      console.log('Loaded continuous trend cloud data:', {
        symbol: data.data.symbol,
        totalClouds: data.data.trend_clouds?.length || 0,
        supportClouds: data.data.summary?.support_clouds || 0,
        resistanceClouds: data.data.summary?.resistance_clouds || 0
      });

    } catch (error) {
      console.error('Error fetching trend cloud data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load trend cloud data');
    } finally {
      setTrendCloudLoading(false);
    }
  }, [symbol, displayOptions.showTrendCloud]);

  // No longer needed - consolidated into fetchTrendCloudData

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  useEffect(() => {
    fetchTrendCloudData();
  }, [fetchTrendCloudData]);


  // Calculate moving averages data (memoized to avoid recalculation)
  const movingAveragesData = useMemo(() => {
    if (!analysis || !displayOptions.showMovingAverages) return [];
    
    const rawMarketData = analysis.marketData[activeTimeframe] || [];
    const marketData = rawMarketData.filter(item => {
      const itemDate = new Date(item.timestamp);
      const hour = itemDate.getUTCHours();
      const minute = itemDate.getUTCMinutes();
      // Skip 4:00 AM UTC entries (12:00 SGT pre-market)
      return !(hour === 4 && minute === 0);
    });
    
    return calculateAllMovingAverages(marketData, MA_PERIODS);
  }, [analysis, activeTimeframe, displayOptions.showMovingAverages]);

  const currentTimeframeData = useMemo(() => {
    if (!analysis) return null;

    // Filter out 4:00 AM entries (pre-market data) to prevent duplicate dates and incorrect highs
    const rawMarketData = analysis.marketData[activeTimeframe] || [];
    
    // Filter out pre-market data (12:00 SGT / 4:00 AM UTC entries)
    const marketData = rawMarketData.filter(item => {
      const timestamp = new Date(item.timestamp);
      const hour = timestamp.getHours();
      // Keep only regular market hours data (filter out 12:00 which is 4:00 AM UTC pre-market)
      return hour !== 12;
    });
    
    // Only calculate pivots if needed for any analysis
    const needsPivots = displayOptions.showPivots || displayOptions.showTrendlines || displayOptions.showDynamicTrendlines || displayOptions.showLocalTopBottom || displayOptions.showPivotLevels;
    
    // Filter market data to visible range for better performance
    let pivotMarketData = marketData;
    if (needsPivots && visibleRange) {
      pivotMarketData = marketData.filter(item => {
        const itemTime = new Date(item.timestamp).getTime();
        return itemTime >= visibleRange.startTime && itemTime <= visibleRange.endTime;
      });
    }
    
    const clientSidePivots = needsPivots && pivotMarketData.length > 10 ? libDetectPivots(pivotMarketData, activeTimeframe) : [];
    
    // Calculate powerful trendlines only if needed (all historical data) using updated library function
    const powerfulTrendlines = displayOptions.showTrendlines && clientSidePivots.length > 0 ? 
      libDetectTrendlines(clientSidePivots, 0.02) : []; // 2% tolerance, matches notebook approach
    if (displayOptions.showTrendlines) {
    }
    
    // Calculate dynamic trendlines (only visible range) - optimized to work on visible data only
    const dynamicTrendlines = displayOptions.showDynamicTrendlines && visibleRange ? 
      detectDynamicTrendlinesFromVisibleData(marketData, activeTimeframe, 0.02, visibleRange) : [];
    if (displayOptions.showDynamicTrendlines) {
    }
    
    // Convert PowerfulTrendline to TrendLine format for chart compatibility
    const convertToTrendLine = (pt: PowerfulTrendline, isDynamic: boolean = false) => ({
      id: pt.id,
      timeframe: activeTimeframe,
      type: pt.type,
      pivotPoints: pt.points,
      equation: {
        slope: pt.slope,
        intercept: pt.intercept,
        rSquared: pt.rSquared
      },
      strength: pt.strength,
      touchCount: pt.points.length,
      avgDeviation: pt.avgDeviation,
      createdAt: new Date(),
      lastTouched: pt.endTime,
      isActive: true,
      isDynamic: isDynamic, // Add flag to distinguish dynamic lines
      projectedLevels: {
        current: 0, // Will be calculated by chart
        oneDay: 0,
        oneWeek: 0,
        oneMonth: 0
      },
      metadata: {
        ageInDays: Math.floor((Date.now() - pt.startTime.getTime()) / (1000 * 60 * 60 * 24)),
        recentTouches: pt.points.length,
        maxStreak: pt.points.length,
        lastBreak: undefined
      }
    });

    // Create chart trendlines from powerful lines
    const powerfulChartTrendlines = displayOptions.showTrendlines ? powerfulTrendlines.map(pt => convertToTrendLine(pt, false)) : [];
    
    // Create chart trendlines from dynamic lines  
    const dynamicChartTrendlines = displayOptions.showDynamicTrendlines ? dynamicTrendlines.map(pt => convertToTrendLine(pt, true)) : [];
    
    // Combine both sets
    const chartTrendlines = [...powerfulChartTrendlines, ...dynamicChartTrendlines];
    
    // Calculate traditional pivot points only if needed
    const traditionalPivots = displayOptions.showPivots ? calculateTraditionalPivots(marketData) : [];

    // Process trend cloud data for visualization
    const trendCloudData = displayOptions.showTrendCloud && rawTrendCloudData ? 
      rawTrendCloudData.trend_clouds?.map((cloud: any) => ({
        id: cloud.cloud_id,
        center_price: cloud.center_price,
        price_range: cloud.price_range,
        cloud_type: cloud.cloud_type,
        softmax_weight: cloud.softmax_weight,
        total_weighted_strength: cloud.total_weighted_strength,
        unique_trendlines: cloud.unique_trendlines,
        projection_start: cloud.projection_start,
        projection_end: cloud.projection_end,
        calculation_date: cloud.calculation_date,
        current_price: cloud.current_price,
        color: cloud.cloud_type === 'Support' 
          ? `rgba(34, 197, 94, ${0.3 + cloud.softmax_weight * 0.5})` 
          : `rgba(239, 68, 68, ${0.3 + cloud.softmax_weight * 0.5})`,
        opacity: 0.3 + cloud.softmax_weight * 0.5 // Opacity based on confidence
      })) : [];

    // Remove optimized levels (not supported in new format)
    const optimizedLevels: any[] = [];


    
    const data = {
      marketData,
      pivotPoints: clientSidePivots, // Swing highs/lows
      trendLines: chartTrendlines, // Powerful trendlines connecting multiple pivots
      traditionalPivots, // Traditional daily pivot levels
      trendClouds: trendCloudData, // Use processed cloud points, not raw API response
      optimizedLevels, // Optimized support/resistance levels with weights
      movingAveragesData // Moving averages data
    };


    return data;
  }, [analysis, activeTimeframe, visibleRange, displayOptions.showTrendlines, displayOptions.showDynamicTrendlines, displayOptions.showTrendCloud, displayOptions.showPivots, displayOptions.showLocalTopBottom, displayOptions.showPivotLevels, rawTrendCloudData, symbol, movingAveragesData]); // Updated dependencies for continuous trend clouds

  const handleTimeframeToggle = (timeframe: Timeframe) => {
    setSelectedTimeframes(prev => 
      prev.includes(timeframe) 
        ? prev.filter(tf => tf !== timeframe)
        : [...prev, timeframe]
    );
  };

  const handleViewportChange = useCallback((viewport: { startTime: number; endTime: number }) => {
    setVisibleRange(prevRange => {
      // Only update if the viewport has actually changed
      if (prevRange?.startTime !== viewport.startTime || prevRange?.endTime !== viewport.endTime) {
        return viewport;
      }
      return prevRange;
    });
  }, []);

  const handleRefresh = () => {
    fetchAnalysis(true);
  };

  const getTimeframeColor = (timeframe: Timeframe) => {
    const colors: Record<Timeframe, string> = {
      '1M': 'bg-purple-100 text-purple-800',
      '1W': 'bg-blue-100 text-blue-800',
      '1D': 'bg-green-100 text-green-800',
      '4H': 'bg-yellow-100 text-yellow-800',
      '1H': 'bg-red-100 text-red-800'
    };
    return colors[timeframe] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className={`bg-white rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Multi-Timeframe Trend Analysis
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Symbol: {symbol.toUpperCase()} | Analysis across {selectedTimeframes.length} timeframes
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Analyzing...
                </>
              ) : (
                'Refresh Analysis'
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-1 xl:grid-cols-4 lg:grid-cols-3 gap-6">
          {/* Timeframe Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selected Timeframes
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TIMEFRAMES.map(({ timeframe, label }) => (
                <button
                  key={timeframe}
                  onClick={() => handleTimeframeToggle(timeframe)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    selectedTimeframes.includes(timeframe)
                      ? getTimeframeColor(timeframe) + ' ring-2 ring-offset-1 ring-current'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Display Options */}
          <div className="lg:col-span-2">
            <CheckboxGroup
              title="Display Options"
              options={createDisplayOptionsConfig()}
              values={displayOptions}
              onChange={(id, checked) => setDisplayOptions(prev => ({ ...prev, [id]: checked }))}
              layout="grid"
              disabled={loading}
            />
          </div>

          {/* Chart Settings */}
          <div className="space-y-4">
            {/* Active Timeframe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chart Timeframe
              </label>
              <select
                value={activeTimeframe}
                onChange={(e) => setActiveTimeframe(e.target.value as Timeframe)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {selectedTimeframes.map(timeframe => {
                  const tf = AVAILABLE_TIMEFRAMES.find(t => t.timeframe === timeframe);
                  return (
                    <option key={timeframe} value={timeframe}>
                      {tf?.label || timeframe}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Advanced Options */}
            <CheckboxGroup
              title="Advanced Options"
              options={createAdvancedOptionsConfig()}
              values={advancedOptions}
              onChange={(id, checked) => setAdvancedOptions(prev => ({ ...prev, [id]: checked }))}
              layout="vertical"
              disabled={loading}
            />


          </div>
        </div>
      </div>


      {/* Error Display */}
      {error && (
        <div className="px-6 py-4 bg-red-50 border-b border-red-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Analysis Error</h3>
              <div className="mt-1 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Chart */}
      <div className="px-6 py-4 space-y-6">
        {loading && !analysis ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Analyzing market trends...</p>
              <p className="text-sm text-gray-500 mt-1">This may take a few seconds</p>
            </div>
          </div>
        ) : currentTimeframeData ? (
          <>
            <div className="h-[600px] w-full">
              <FinanceCandlestickChart
                data={currentTimeframeData.marketData}
                pivotPoints={currentTimeframeData.pivotPoints}
                trendLines={currentTimeframeData.trendLines}
                traditionalPivots={currentTimeframeData.traditionalPivots}
                trendClouds={currentTimeframeData.trendClouds}
                optimizedLevels={currentTimeframeData.optimizedLevels}
                movingAveragesData={currentTimeframeData.movingAveragesData}
                timeframe={activeTimeframe}
                className="rounded-lg"
                showPivots={displayOptions.showPivots}
                showTrendlines={displayOptions.showTrendlines}
                showDynamicTrendlines={displayOptions.showDynamicTrendlines}
                showLocalTopBottom={displayOptions.showLocalTopBottom}
                showPivotLevels={displayOptions.showPivotLevels}
                showCandles={displayOptions.showCandles}
                showTrendCloud={displayOptions.showTrendCloud}
                showOptimizedLevels={displayOptions.showOptimizedLevels}
                showMovingAverages={displayOptions.showMovingAverages}
                onViewportChange={handleViewportChange}
              />
            </div>
            
            {/* Simple Trend Cloud Analysis */}
            <div className="border-t border-gray-200 pt-6">
              <SimpleTrendCloud symbol={symbol} data={rawTrendCloudData} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-96 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No analysis data</h3>
              <p className="mt-1 text-sm text-gray-500">Click &quot;Refresh Analysis&quot; to load trend data</p>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Summary */}
      {analysis && (
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedTimeframes.map(timeframe => {
              const pivots = analysis.pivotPoints[timeframe] || [];
              const lines = analysis.trendLines[timeframe] || [];
              const dataPoints = analysis.metadata.dataPoints[timeframe] || 0;
              const lastUpdated = analysis.metadata.lastUpdated[timeframe];

              return (
                <div
                  key={timeframe}
                  className={`p-4 rounded-lg border-2 transition-all cursor-pointer ${
                    activeTimeframe === timeframe 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => setActiveTimeframe(timeframe)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">
                      {AVAILABLE_TIMEFRAMES.find(tf => tf.timeframe === timeframe)?.label}
                    </h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getTimeframeColor(timeframe)}`}>
                      {timeframe}
                    </span>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pivots:</span>
                      <span className="font-medium">{pivots.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Trendlines:</span>
                      <span className="font-medium">{lines.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Data Points:</span>
                      <span className="font-medium">{dataPoints}</span>
                    </div>
                    {lastUpdated && (
                      <div className="text-xs text-gray-500 mt-2">
                        Updated: {format(new Date(lastUpdated), 'MMM dd, HH:mm')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendAnalysisPanel;