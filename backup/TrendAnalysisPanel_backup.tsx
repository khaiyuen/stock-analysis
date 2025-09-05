'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { FinanceCandlestickChart } from '@/components/charts/FinanceCandlestickChart';
import { TrendAnalysis, Timeframe, APIResponse, PivotPoint, MarketData } from '@/types';
import { CheckboxGroup, createDisplayOptionsConfig, createAdvancedOptionsConfig } from '@/components/common/CheckboxGroup';
import { detectClientSidePivots as libDetectPivots, detectPowerfulTrendlines as libDetectTrendlines } from '@/lib/trendCloud';

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
  
  console.log(`🔍 DYNAMIC TRENDLINES: Analyzing visible range with ${visibleMarketData.length} candles (${tolerance * 100}% tolerance)`);
  
  // Step 2: Detect pivots on visible data only using LOG SCALE methods
  const visiblePivots = libDetectPivots(visibleMarketData, activeTimeframe);
  console.log(`🔍 DYNAMIC TRENDLINES: Found ${visiblePivots.length} pivots in visible range`);
  
  if (visiblePivots.length < 2) return [];
  
  // Step 3: Calculate trendlines from visible pivots using LOG SCALE iterative best-fit refinement
  const allTrendlines = libDetectTrendlines(visiblePivots, tolerance);
  
  // Limit to top 20 trendlines for website display (sorted by strength and R²)
  const trendlines = allTrendlines.slice(0, 20);
  console.log(`🔍 DYNAMIC TRENDLINES: Generated ${allTrendlines.length} trendlines, showing top ${trendlines.length} for website display`);
  
  // Debug log first few trendlines to check slope values
  trendlines.slice(0, 3).forEach((line, idx) => {
    console.log(`🔍 DYNAMIC TRENDLINE ${idx + 1}: strength=${line.strength}, slope=${line.slope.toFixed(6)}, intercept=${line.intercept.toFixed(2)}`);
  });
  
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
  const [optimizedAnalysis, setOptimizedAnalysis] = useState<any>(null);
  const [optimizedLoading, setOptimizedLoading] = useState(false);

  // Consolidated display options
  const [displayOptions, setDisplayOptions] = useState({
    showCandles: true,
    showPivots: false,
    showTrendlines: false,
    showDynamicTrendlines: false,
    showLocalTopBottom: false,
    showPivotLevels: false,
    showTrendCloud: false, // This is now the optimized rolling 5-day trend cloud
    showOptimizedLevels: false
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

      console.log('API Response received:', {
        success: data.success,
        hasData: !!data.data,
        pivotPointsBreakdown: data.data ? Object.entries(data.data.pivotPoints).map(([tf, pivots]) => 
          `${tf}: ${pivots?.length || 0} pivots`
        ).join(', ') : 'No data'
      });

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

  // Fetch optimized trend cloud analysis when enabled (replaces old trend cloud)
  const fetchTrendCloudAnalysis = useCallback(async () => {
    if (!displayOptions.showTrendCloud) return;

    setOptimizedLoading(true);
    try {
      console.log('Fetching rolling 5-day trend cloud analysis for', symbol);
      
      // Request all available data for backtesting
      const response = await fetch(`/api/trend-cloud/${symbol}?details=true&limit=0`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch trend cloud analysis');
      }

      console.log(`✅ Loaded 5-day rolling trend cloud: ${data.data.total_windows} windows, ${data.data.current_signals.all_levels.length} levels`);
      setOptimizedAnalysis(data.data);

    } catch (error) {
      console.error('Error fetching trend cloud analysis:', error);
      setError(error instanceof Error ? error.message : 'Failed to load rolling trend cloud analysis');
    } finally {
      setOptimizedLoading(false);
    }
  }, [displayOptions.showTrendCloud, symbol]);

  // Fetch optimized support/resistance levels when enabled
  const fetchOptimizedLevels = useCallback(async () => {
    if (!displayOptions.showOptimizedLevels) return;

    // Reuse the same analysis data if trend cloud is also enabled
    if (displayOptions.showTrendCloud && optimizedAnalysis) {
      return;
    }

    setOptimizedLoading(true);
    try {
      console.log('Fetching optimized support/resistance levels for', symbol);
      
      // Request all data if trend cloud is not enabled, otherwise reuse existing data
      const response = await fetch(`/api/trend-cloud/${symbol}?details=true&limit=0`);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to fetch optimized levels');
      }

      console.log(`✅ Loaded optimized levels: ${data.data.total_windows} windows, ${data.data.current_signals.all_levels.length} levels`);
      setOptimizedAnalysis(data.data);

    } catch (error) {
      console.error('Error fetching optimized levels:', error);
      setError(error instanceof Error ? error.message : 'Failed to load optimized levels');
    } finally {
      setOptimizedLoading(false);
    }
  }, [displayOptions.showOptimizedLevels, displayOptions.showTrendCloud, optimizedAnalysis, symbol]);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  useEffect(() => {
    fetchTrendCloudAnalysis();
  }, [fetchTrendCloudAnalysis]);

  useEffect(() => {
    fetchOptimizedLevels();
  }, [fetchOptimizedLevels]);


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
      console.log(`📊 Filtered market data for pivot detection: ${pivotMarketData.length}/${marketData.length} candles in visible range`);
    }
    
    const clientSidePivots = needsPivots && pivotMarketData.length > 10 ? libDetectPivots(pivotMarketData, activeTimeframe) : [];
    
    // Calculate powerful trendlines only if needed (all historical data) using updated library function
    const powerfulTrendlines = displayOptions.showTrendlines && clientSidePivots.length > 0 ? 
      libDetectTrendlines(clientSidePivots, 0.02) : []; // 2% tolerance, matches notebook approach
    if (displayOptions.showTrendlines) {
      console.log(`📈 POWERFUL TRENDLINES: Generated ${powerfulTrendlines.length} trendlines from ${clientSidePivots.length} pivots`);
    }
    
    // Calculate dynamic trendlines (only visible range) - optimized to work on visible data only
    const dynamicTrendlines = displayOptions.showDynamicTrendlines && visibleRange ? 
      detectDynamicTrendlinesFromVisibleData(marketData, activeTimeframe, 0.02, visibleRange) : [];
    if (displayOptions.showDynamicTrendlines) {
      console.log(`📈 DYNAMIC TRENDLINES: Generated ${dynamicTrendlines.length} dynamic trendlines for visible range`);
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

    // Convert optimized analysis to FAST cluster-segregated trend clouds
    // Fixed: Use per-window cluster data instead of global current_signals
    const trendCloudData = displayOptions.showTrendCloud && optimizedAnalysis ? 
      (() => {
        // Get detailed results for per-window cluster data
        const detailedResults = optimizedAnalysis.detailed_results || [];
        const summaryResults = optimizedAnalysis.summary_results || [];
        
        // With ultra-compact format, we can show more windows based on chart timeframe
        // Filter windows to match visible chart timeframe for better user experience
        const chartStartTime = visibleRange?.startTime;
        const chartEndTime = visibleRange?.endTime;
        
        let visibleWindows = summaryResults.filter((window: any) => window.total_clusters > 0);
        
        // If we have visible range info, filter windows to match chart timeframe
        if (chartStartTime && chartEndTime) {
          visibleWindows = visibleWindows.filter((window: any) => {
            const windowTime = new Date(window.date).getTime();
            return windowTime >= chartStartTime && windowTime <= chartEndTime;
          });
          
          // Increase limit for better cloud coverage across timeframe (100 windows for richer visualization)
          if (visibleWindows.length > 100) {
            visibleWindows = visibleWindows.slice(-100);
          }
          
          console.log(`🎯 CHART TIMEFRAME: Showing ${visibleWindows.length} windows for visible period`);
        } else {
          // Fallback: For ALL timeframe, show distributed sample across entire historical range
          if (visibleWindows.length > 50) {
            // Take samples distributed across the entire time range
            const step = Math.floor(visibleWindows.length / 50);
            const distributedWindows = [];
            
            for (let i = 0; i < visibleWindows.length; i += step) {
              distributedWindows.push(visibleWindows[i]);
            }
            
            // Always include the most recent windows too
            distributedWindows.push(...visibleWindows.slice(-5));
            
            // Remove duplicates and sort by date
            visibleWindows = distributedWindows
              .filter((window, index, arr) => 
                arr.findIndex(w => w.window_id === window.window_id) === index
              )
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
              
            console.log(`🎯 DISTRIBUTED SAMPLE: Showing ${visibleWindows.length} windows distributed across ${summaryResults.length} total (${visibleWindows[0]?.date} to ${visibleWindows[visibleWindows.length-1]?.date})`);
          } else {
            console.log(`🎯 ALL WINDOWS: Showing all ${visibleWindows.length} windows (full range)`);
          }
        }
        
        return visibleWindows.map((window: any, index: number) => {
          // Find corresponding detailed window data
          const detailedWindow = detailedResults.find((d: any) => d.window_id === window.window_id);
          const windowClusters = detailedWindow?.consolidated_clusters || [];
          
          // Create MINIMAL cloud points for performance
          const clusterPoints: any[] = [];
          const baseDate = new Date(window.date);
          
          if (windowClusters.length > 0) {
            // Process top 6 clusters to show comprehensive cluster analysis
            const topClusters = windowClusters
              .sort((a: any, b: any) => b.softmax_weight - a.softmax_weight)
              .slice(0, 6);
            
            console.log(`🎯 WINDOW ${window.window_id} (${window.date}): Processing ${topClusters.length} clusters:`, 
              topClusters.map(c => `${c.cluster_type}:${c.softmax_weight.toFixed(3)}`));
            
            topClusters.forEach((cluster: any, clusterIndex: number) => {
              const clusterType = cluster.cluster_type;
              const exponentialWeight = Math.pow(cluster.softmax_weight, 1.5); // Increased exponent for prominence
              
              // Include clusters with reasonable weight (lowered threshold for more clusters)
              if (cluster.softmax_weight < 0.02) {
                console.log(`   ❌ SKIPPED ${clusterType} cluster ${clusterIndex} (weight: ${cluster.softmax_weight.toFixed(3)} < 0.02)`);
                return;
              }
              console.log(`   ✅ PROCESSING ${clusterType} cluster ${clusterIndex} (weight: ${cluster.softmax_weight.toFixed(3)})`);
              
              
              // FORWARD-ONLY PROJECTIONS: Project 5 days forward only (no bidirectional spread)
              const projectionDays = [5]; // Always project exactly 5 days forward
              
              projectionDays.forEach(dayOffset => {
                const projectionDate = new Date(baseDate);
                projectionDate.setDate(projectionDate.getDate() + dayOffset);
                
                // Generate more points for high-weight clusters (5-15 points)
                const numPoints = Math.floor(5 + exponentialWeight * 10);
                
                for (let p = 0; p < numPoints; p++) {
                  const priceJitter = (Math.random() - 0.5) * cluster.center_price * 0.02; // 2% jitter
                  const cloudPrice = cluster.center_price + priceJitter;
                  
                  clusterPoints.push({
                    price: cloudPrice,
                    weight: exponentialWeight * 100,
                    timestamp: projectionDate,
                    source: `cluster_${clusterIndex}`,
                    strength: cluster.softmax_weight,
                    projectionDay: dayOffset,
                    clusterInfo: {
                      clusterId: `C${clusterIndex + 1}`,
                      clusterType,
                      originalWeight: cluster.softmax_weight,
                      exponentialWeight,
                      centerPrice: cluster.center_price
                    },
                    metadata: {
                      windowId: window.window_id,
                      clusterType,
                      currentPrice: window.current_price
                    }
                  });
                }
              });
            });
          } else {
            // Fallback: single point from strongest cluster
            if (window.strongest_cluster_weight > 0.1) {
              const projectionDate = new Date(baseDate);
              projectionDate.setDate(projectionDate.getDate() + 5);
              
              clusterPoints.push({
                price: window.strongest_cluster_price,
                weight: window.strongest_cluster_weight * 100,
                timestamp: projectionDate,
                source: 'fallback',
                strength: window.strongest_cluster_weight,
                projectionDay: 5,
                metadata: {
                  windowId: window.window_id,
                  clusterType: window.strongest_cluster_type,
                  currentPrice: window.current_price
                }
              });
            }
          }
          
          return {
            symbol,
            calculationDate: new Date(),
            targetDate: baseDate,
            timeframe: activeTimeframe,
            lookbackDays: 250,
            convergenceZones: [],
            cloudPoints: clusterPoints, // Minimal cluster points for performance
            summary: {
              totalWeight: Math.max(100, clusterPoints.reduce((sum, p) => sum + p.weight, 0)),
              totalTrendlines: window.trendlines,
              totalConvergence: clusterPoints.length,
              peakPrice: window.strongest_cluster_price,
              confidenceScore: window.strongest_cluster_weight,
              clusterSegregated: true,
              boundaryConstrained: false, // Disabled for performance
              windowSpecific: true, // Flag indicating per-window data
              clusterCount: windowClusters.length
            },
            metadata: {
              analysisDate: new Date(),
              sourceMethod: 'per_window_clusters_performance_optimized',
              window_id: window.window_id,
              data_points: window.data_points,
              total_clusters: window.total_clusters
            }
          };
        });
      })() : [];

    // Add optimized support/resistance levels
    const optimizedLevels = displayOptions.showOptimizedLevels && optimizedAnalysis ? 
      optimizedAnalysis.current_signals.all_levels.map((level: any, index: number) => ({
        id: `opt_${level.cluster_type.toLowerCase()}_${index}`,
        price: level.center_price,
        type: level.cluster_type, // 'Support' or 'Resistance'
        weight: level.softmax_weight,
        strength: level.total_strength,
        color: level.cluster_type === 'Support' ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)',
        width: Math.max(1, Math.min(4, level.softmax_weight * 8)), // Line width based on confidence
        source: 'optimized'
      })) : [];

    const data = {
      marketData,
      pivotPoints: clientSidePivots, // Swing highs/lows
      trendLines: chartTrendlines, // Powerful trendlines connecting multiple pivots
      traditionalPivots, // Traditional daily pivot levels
      trendClouds: trendCloudData, // Rolling 5-day trend cloud predictions
      optimizedLevels // Optimized support/resistance levels with weights
    };


    return data;
  }, [analysis, activeTimeframe, visibleRange, displayOptions.showTrendlines, displayOptions.showDynamicTrendlines, displayOptions.showTrendCloud, displayOptions.showOptimizedLevels, displayOptions.showPivots, displayOptions.showLocalTopBottom, displayOptions.showPivotLevels, optimizedAnalysis, symbol]);

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

            {/* Rolling Trend Cloud Status */}
            {displayOptions.showTrendCloud && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${optimizedLoading ? 'bg-yellow-500 animate-pulse' : optimizedAnalysis ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium text-purple-800">
                    Rolling 5-Day Trend Cloud
                  </span>
                </div>
                <div className="text-xs text-purple-700">
                  {optimizedLoading ? 'Loading predictions...' : 
                   optimizedAnalysis ? `${optimizedAnalysis.summary_results?.length || 0} 5-day windows` : 
                   'Run trend cloud analyzer first'}
                </div>
                {optimizedAnalysis && (
                  <div className="text-xs text-purple-600 mt-1">
                    Period: {optimizedAnalysis.analysis_period.start_date} to {optimizedAnalysis.analysis_period.end_date}
                  </div>
                )}
              </div>
            )}

            {/* Optimized Analysis Status */}
            {displayOptions.showOptimizedLevels && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-2 h-2 rounded-full ${optimizedLoading ? 'bg-yellow-500 animate-pulse' : optimizedAnalysis ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="text-sm font-medium text-blue-800">
                    Optimized Levels
                  </span>
                </div>
                <div className="text-xs text-blue-700">
                  {optimizedLoading ? 'Loading analysis...' : 
                   optimizedAnalysis ? 
                   `${optimizedAnalysis.current_signals.all_levels.length} levels (${optimizedAnalysis.total_windows} windows)` : 
                   'Run trend cloud analyzer first'}
                </div>
                {optimizedAnalysis && (
                  <div className="text-xs text-blue-600 mt-1">
                    Confidence: {(optimizedAnalysis.current_signals.confidence_score * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )}
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
      <div className="px-6 py-4">
        {loading && !analysis ? (
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Analyzing market trends...</p>
              <p className="text-sm text-gray-500 mt-1">This may take a few seconds</p>
            </div>
          </div>
        ) : currentTimeframeData ? (
          <div className="h-[600px] w-full">
            <FinanceCandlestickChart
              data={currentTimeframeData.marketData}
              pivotPoints={currentTimeframeData.pivotPoints}
              trendLines={currentTimeframeData.trendLines}
              traditionalPivots={currentTimeframeData.traditionalPivots}
              trendClouds={currentTimeframeData.trendClouds}
              optimizedLevels={currentTimeframeData.optimizedLevels}
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
              onViewportChange={handleViewportChange}
            />
          </div>
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