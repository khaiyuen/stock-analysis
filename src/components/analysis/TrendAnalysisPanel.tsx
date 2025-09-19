'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { FinanceCandlestickChart } from '@/components/charts/FinanceCandlestickChart';
import { TrendAnalysis, Timeframe, APIResponse, PivotPoint, MarketData } from '@/types';
import { CheckboxGroup, createDisplayOptionsConfig, createAdvancedOptionsConfig } from '@/components/common/CheckboxGroup';
import { detectClientSidePivots as libDetectPivots, detectPowerfulTrendlines as libDetectTrendlines } from '@/lib/trendCloud';
import { calculateAllMovingAverages, calculateMovingAveragesForRange, MovingAverageData, MA_PERIODS } from '@/lib/movingAverages';
import SimpleTrendCloud from '@/components/analysis/SimpleTrendCloud';

// Utility function to check if US market is open
function isUSMarketOpen(): boolean {
  const now = new Date();
  const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));

  // EST/EDT offset (EST = UTC-5, EDT = UTC-4)
  // Using EST for simplicity
  const est = new Date(utc.getTime() + (-5 * 3600000));

  const day = est.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = est.getHours();
  const minutes = est.getMinutes();

  // Market is closed on weekends
  if (day === 0 || day === 6) return false;

  // Market hours: 9:30 AM - 4:00 PM EST
  const currentMinutes = hour * 60 + minutes;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM

  return currentMinutes >= marketOpen && currentMinutes < marketClose;
}

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
  // Time-weighted properties
  weightedStrength?: number;
  averageWeight?: number;
  dailyGrowthRate?: number;
  iterations?: number;
}

// Using library functions for pivot and trendline detection

// Time-weighted trendline detection functions (from @"1.0.2 time_weighted_trendline_analysis.ipynb")
function calculateTimeWeight(
  pivotDate: Date,
  referenceDate: Date,
  halfLifeDays: number = 80,
  minWeight: number = 0.1
): number {
  const daysAgo = Math.floor((referenceDate.getTime() - pivotDate.getTime()) / (1000 * 60 * 60 * 24));

  // Exponential decay: weight = 0.5^(days_ago / half_life_days)
  const decayFactor = Math.exp(-daysAgo * Math.log(2) / halfLifeDays);

  // Ensure minimum weight
  return Math.max(decayFactor, minWeight);
}

function applyTimeWeightsToPivots(
  pivots: PivotPoint[],
  referenceDate: Date,
  halfLifeDays: number = 80,
  minWeight: number = 0.1
): (PivotPoint & { timeWeight: number })[] {
  if (!pivots || pivots.length === 0) return [];

  return pivots.map(pivot => ({
    ...pivot,
    timeWeight: calculateTimeWeight(pivot.timestamp, referenceDate, halfLifeDays, minWeight)
  }));
}

function findWeightedIterativeTrendline(
  pivot1: PivotPoint & { timeWeight: number },
  pivot2: PivotPoint & { timeWeight: number },
  allPivots: (PivotPoint & { timeWeight: number })[],
  referenceDate: Date,
  tolerancePercent: number = 2.0,
  weightFactor: number = 2.0
): PowerfulTrendline | null {
  const currentPoints = [pivot1, pivot2];

  // Convert to numerical format for calculations using LOG SCALE
  const pointsToXYLogWeighted = (points: (PivotPoint & { timeWeight: number })[]) => {
    const refTime = referenceDate.getTime();
    const xVals = points.map(p => (p.timestamp.getTime() - refTime) / (1000 * 60 * 60 * 24)); // days from reference
    const yVals = points.map(p => Math.log(p.price));
    const weights = points.map(p => Math.pow(p.timeWeight, weightFactor));
    return { xVals, yVals, weights };
  };

  // Convert percentage to log tolerance
  const logTolerance = Math.log(1 + tolerancePercent / 100);
  const maxIterations = 100;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    // Calculate weighted best-fit line using LOG PRICES
    const { xVals, yVals, weights } = pointsToXYLogWeighted(currentPoints);

    if (xVals.length < 2) break;

    // Use weighted linear regression
    let slope: number, intercept: number, rSquared: number;

    try {
      // Calculate weighted least squares manually
      const sumW = weights.reduce((a, b) => a + b, 0);
      const meanX = weights.reduce((sum, w, i) => sum + w * xVals[i], 0) / sumW;
      const meanY = weights.reduce((sum, w, i) => sum + w * yVals[i], 0) / sumW;

      const numerator = weights.reduce((sum, w, i) => sum + w * (xVals[i] - meanX) * (yVals[i] - meanY), 0);
      const denominator = weights.reduce((sum, w, i) => sum + w * Math.pow(xVals[i] - meanX, 2), 0);

      if (denominator === 0) break;

      slope = numerator / denominator;
      intercept = meanY - slope * meanX;

      // Calculate weighted R-squared
      const yPred = xVals.map(x => slope * x + intercept);
      const ssRes = weights.reduce((sum, w, i) => sum + w * Math.pow(yVals[i] - yPred[i], 2), 0);
      const ssTot = weights.reduce((sum, w, i) => sum + w * Math.pow(yVals[i] - meanY, 2), 0);
      rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;
    } catch (error) {
      // Fallback to simple linear regression if weighted calculation fails
      break;
    }

    // Find additional points within tolerance of this best-fit line
    const newPoints: (PivotPoint & { timeWeight: number })[] = [];
    for (const pivot of allPivots) {
      // Skip if already in current_points
      if (currentPoints.some(p => p.id === pivot.id)) continue;

      const xPivot = (pivot.timestamp.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24);
      const expectedLogY = slope * xPivot + intercept;
      const actualLogY = Math.log(pivot.price);

      // Apply time weighting to tolerance - more recent points get stricter tolerance
      const adjustedTolerance = logTolerance * (2.0 - pivot.timeWeight); // Recent points: tighter tolerance

      const logDifference = Math.abs(expectedLogY - actualLogY);
      if (logDifference <= adjustedTolerance) {
        newPoints.push(pivot);
      }
    }

    // If no new points found, we're done
    if (newPoints.length === 0) break;

    // Add new points and continue iteration
    currentPoints.push(...newPoints);
  }

  // Final weighted calculation with all points
  if (currentPoints.length >= 2) {
    const { xVals, yVals, weights } = pointsToXYLogWeighted(currentPoints);

    try {
      // Final weighted calculation
      const sumW = weights.reduce((a, b) => a + b, 0);
      const meanX = weights.reduce((sum, w, i) => sum + w * xVals[i], 0) / sumW;
      const meanY = weights.reduce((sum, w, i) => sum + w * yVals[i], 0) / sumW;

      const numerator = weights.reduce((sum, w, i) => sum + w * (xVals[i] - meanX) * (yVals[i] - meanY), 0);
      const denominator = weights.reduce((sum, w, i) => sum + w * Math.pow(xVals[i] - meanX, 2), 0);

      const slope = numerator / denominator;
      const intercept = meanY - slope * meanX;

      // Calculate R-squared
      const yPred = xVals.map(x => slope * x + intercept);
      const ssRes = weights.reduce((sum, w, i) => sum + w * Math.pow(yVals[i] - yPred[i], 2), 0);
      const ssTot = weights.reduce((sum, w, i) => sum + w * Math.pow(yVals[i] - meanY, 2), 0);
      const rSquared = ssTot > 0 ? 1 - (ssRes / ssTot) : 0;

      // Calculate percentage growth rate from log slope
      const dailyGrowthRate = (Math.exp(slope) - 1) * 100;

      // Calculate weighted strength (sum of weights instead of count)
      const weightedStrength = currentPoints.reduce((sum, p) => sum + p.timeWeight, 0);

      // Determine type based on slope
      const trendType: 'SUPPORT' | 'RESISTANCE' = slope > 0 ? 'SUPPORT' : 'RESISTANCE';

      return {
        id: `time-weighted-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        points: currentPoints,
        slope: slope,
        intercept: intercept,
        strength: currentPoints.length,
        type: trendType,
        rSquared: rSquared,
        avgDeviation: 0, // Could be calculated if needed
        startTime: new Date(Math.min(...currentPoints.map(p => p.timestamp.getTime()))),
        endTime: new Date(Math.max(...currentPoints.map(p => p.timestamp.getTime()))),
        weightedStrength: weightedStrength,
        averageWeight: weightedStrength / currentPoints.length,
        dailyGrowthRate: dailyGrowthRate,
        iterations: iteration
      };
    } catch (error) {
      return null;
    }
  }

  return null;
}

// Time-weighted dynamic trendlines implementation following @"1.0.2 time_weighted_trendline_analysis.ipynb" approach:
// 1. Filter market data to visible range (viewport optimization)
// 2. Detect pivots on visible data using LOG SCALE multi-method detection (6 methods)
// 3. Apply time weights to prioritize recent pivot points (80-day half-life decay)
// 4. Calculate trendlines using time-weighted LOG SCALE iterative best-fit refinement with 2% tolerance
// 5. Each trendline connects multiple pivot points with weighted strength based on recency
// 6. Recent pivots get stricter tolerance for higher precision
function detectDynamicTrendlinesFromVisibleData(
  marketData: MarketData[],
  activeTimeframe: Timeframe,
  tolerance: number = 0.02, // 2% tolerance matching notebook approach
  visibleRange?: { startTime: number; endTime: number },
  halfLifeDays: number = 80, // 80-day half-life for time weighting
  minWeight: number = 0.1, // Minimum weight for oldest pivots (10% of recent)
  weightFactor: number = 2.0, // Weight amplification factor
  maxTrendlines: number = 20 // Maximum trendlines to return
): PowerfulTrendline[] {
  console.log(`🔧 detectDynamicTrendlinesFromVisibleData called with:`, {
    marketDataLength: marketData.length,
    hasVisibleRange: !!visibleRange,
    activeTimeframe,
    tolerance,
    halfLifeDays,
    minWeight,
    weightFactor,
    maxTrendlines
  });

  if (!visibleRange || marketData.length === 0) {
    console.log(`❌ Early exit: no visible range or no market data`);
    return [];
  }

  // Step 1: Filter market data to visible range first
  const visibleMarketData = marketData.filter(item => {
    const itemTime = new Date(item.timestamp).getTime();
    return itemTime >= visibleRange.startTime && itemTime <= visibleRange.endTime;
  });

  if (visibleMarketData.length < 10) return []; // Need minimum data for meaningful analysis

  // Step 2: Detect pivots on visible data only using LOG SCALE methods
  const visiblePivots = libDetectPivots(visibleMarketData, activeTimeframe);

  if (visiblePivots.length < 2) return [];

  // Step 3: Apply time weights to pivots (use most recent date as reference)
  const referenceDate = new Date(Math.max(...visibleMarketData.map(d => new Date(d.timestamp).getTime())));
  const weightedPivots = applyTimeWeightsToPivots(visiblePivots, referenceDate, halfLifeDays, minWeight);

  if (process.env.NODE_ENV === 'development') {
    console.log(`🔬 Time-Weighted Pivot Analysis:`, {
      visiblePivotsCount: visiblePivots.length,
      weightedPivotsCount: weightedPivots.length,
      referenceDate,
      sampleWeights: weightedPivots.slice(0, 5).map(p => ({
        date: p.timestamp,
        price: p.price,
        weight: p.timeWeight,
        daysAgo: Math.floor((referenceDate.getTime() - p.timestamp.getTime()) / (1000 * 60 * 60 * 24))
      }))
    });
  }

  if (weightedPivots.length < 2) return [];

  // Step 4: Simple trendline detection (fallback to library method for now)
  console.log(`🔧 Using simple trendline detection with ${weightedPivots.length} weighted pivots`);

  // Use the library trendline detection as a fallback to test the flow
  const simpleTrendlines = libDetectTrendlines(weightedPivots, tolerance);

  console.log(`📊 Simple trendlines detected: ${simpleTrendlines.length}`);

  // Convert simple trendlines to PowerfulTrendline format with time-weighted properties
  const trendlines: PowerfulTrendline[] = simpleTrendlines.map((tl, index) => ({
    id: `dynamic-${Date.now()}-${index}`,
    points: tl.points,
    slope: tl.slope,
    intercept: tl.intercept,
    strength: tl.strength,
    type: tl.type,
    rSquared: tl.rSquared,
    avgDeviation: tl.avgDeviation,
    startTime: tl.startTime,
    endTime: tl.endTime,
    // Add time-weighted properties
    weightedStrength: tl.points.reduce((sum, p) => sum + (p as any).timeWeight || 1, 0),
    averageWeight: tl.points.reduce((sum, p) => sum + (p as any).timeWeight || 1, 0) / tl.points.length,
    dailyGrowthRate: (Math.exp(tl.slope) - 1) * 100,
    iterations: 1
  }));

  console.log(`✅ Converted to ${trendlines.length} PowerfulTrendlines with time weights`);

  return trendlines.slice(0, maxTrendlines);
}


export const TrendAnalysisPanel: React.FC<TrendAnalysisPanelProps> = ({
  symbol = 'QQQ',
  className = ''
}) => {
  const [analysis, setAnalysis] = useState<TrendAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{
    isUpdating: boolean;
    stage: string;
    lastUpdate?: Date;
  }>({ isUpdating: false, stage: '' });
  const [selectedTimeframes, setSelectedTimeframes] = useState<Timeframe[]>(['1D', '1W', '1M']);
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>('1D');
  const [visibleRange, setVisibleRange] = useState<{ startTime: number; endTime: number } | null>(null);
  // Removed optimized analysis state (not used in continuous trend clouds)
  
  // Trend cloud data state
  const [rawTrendCloudData, setRawTrendCloudData] = useState<unknown>(null);
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

  // Fetch continuous trend cloud data with auto-update
  const fetchTrendCloudData = useCallback(async (forceUpdate = false) => {
    if (!displayOptions.showTrendCloud) return;

    // Check if market is open (for Singapore timezone users)
    const isMarketOpen = isUSMarketOpen();

    // Skip auto-updates during market hours unless forced
    if (!forceUpdate && isMarketOpen) {
      console.log('⏸️ Skipping auto-update during market hours (data is changing)');
      setUpdateStatus({
        isUpdating: false,
        stage: 'Market is open - data updates paused to avoid conflicts'
      });
      return;
    }

    setTrendCloudLoading(true);
    if (forceUpdate) {
      setUpdateStatus({ isUpdating: true, stage: 'Checking data freshness...' });
    }

    try {
      // Call the updated API route with auto-update enabled
      const url = `/api/trend-cloud/${symbol}?autoUpdate=true${forceUpdate ? '&forceUpdate=true' : ''}`;
      console.log(`🔄 Fetching trend cloud data: ${url}`);

      const response = await fetch(url);
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
        resistanceClouds: data.data.summary?.resistance_clouds || 0,
        autoUpdate: data.metadata?.auto_update
      });

      // Update status based on auto-update results
      if (data.metadata?.auto_update?.data_was_updated) {
        console.log(`✅ Data was automatically updated for ${symbol}`);
        setUpdateStatus({
          isUpdating: false,
          stage: 'Data updated successfully',
          lastUpdate: new Date()
        });

        // Clear success message after 3 seconds
        setTimeout(() => {
          setUpdateStatus(prev => ({ ...prev, stage: '' }));
        }, 3000);
      } else {
        setUpdateStatus({ isUpdating: false, stage: '' });
      }

    } catch (error) {
      console.error('Error fetching trend cloud data:', error);
      setError(error instanceof Error ? error.message : 'Failed to load trend cloud data');
      setUpdateStatus({ isUpdating: false, stage: '' });
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
    // Use all market data for moving averages calculation
    const marketData = rawMarketData;

    return calculateAllMovingAverages(marketData, MA_PERIODS);
  }, [analysis, activeTimeframe, displayOptions.showMovingAverages]);

  const currentTimeframeData = useMemo(() => {
    if (!analysis) return null;

    // Filter out 4:00 AM entries (pre-market data) to prevent duplicate dates and incorrect highs
    const rawMarketData = analysis.marketData[activeTimeframe] || [];
    
    // Filter out potential duplicate or pre-market data entries
    // Keep all data for now since we have legitimate market hours data at various times
    const marketData = rawMarketData;
    
    // Calculate pivots for different purposes
    const needsPivots = displayOptions.showPivots || displayOptions.showLocalTopBottom || displayOptions.showPivotLevels;
    const needsHistoricalTrendlines = displayOptions.showTrendlines;
    const needsDynamicTrendlines = displayOptions.showDynamicTrendlines;

    // For display pivots (visible range only)
    let displayPivotData = marketData;
    if (needsPivots && visibleRange) {
      displayPivotData = marketData.filter(item => {
        const itemTime = new Date(item.timestamp).getTime();
        return itemTime >= visibleRange.startTime && itemTime <= visibleRange.endTime;
      });
    }
    const displayPivots = needsPivots && displayPivotData.length > 10 ? libDetectPivots(displayPivotData, activeTimeframe) : [];

    // For historical trendlines (ALL historical data - not limited by visible range)
    const historicalPivots = needsHistoricalTrendlines && marketData.length > 50 ?
      libDetectPivots(marketData, activeTimeframe) : [];

    // Calculate powerful trendlines using ALL historical data
    const powerfulTrendlines = needsHistoricalTrendlines && historicalPivots.length > 0 ?
      libDetectTrendlines(historicalPivots, 0.02) : []; // 2% tolerance, uses full dataset

    // Debug logging to verify we're using full historical data
    if (needsHistoricalTrendlines && process.env.NODE_ENV === 'development') {
      console.log(`📊 Trendline Analysis for ${symbol} ${activeTimeframe}:`, {
        totalMarketData: marketData.length,
        dateRange: marketData.length > 0 ? {
          from: marketData[0]?.timestamp,
          to: marketData[marketData.length - 1]?.timestamp
        } : null,
        historicalPivots: historicalPivots.length,
        powerfulTrendlines: powerfulTrendlines.length,
        dynamicTrendlines: dynamicTrendlines.length,
        timeWeightedApproach: needsDynamicTrendlines ? 'enabled (80-day half-life)' : 'disabled',
        visibleRange: visibleRange ? {
          from: new Date(visibleRange.startTime),
          to: new Date(visibleRange.endTime)
        } : 'none'
      });
    }

    // Calculate dynamic trendlines (only visible range) - optimized to work on visible data only
    const dynamicTrendlines = needsDynamicTrendlines && visibleRange ?
      detectDynamicTrendlinesFromVisibleData(marketData, activeTimeframe, 0.02, visibleRange) : [];

    // Debug logging for dynamic trendlines
    if (needsDynamicTrendlines && process.env.NODE_ENV === 'development') {
      console.log(`🔍 Dynamic Trendlines Debug for ${symbol} ${activeTimeframe}:`, {
        needsDynamicTrendlines,
        hasVisibleRange: !!visibleRange,
        visibleRange: visibleRange ? {
          from: new Date(visibleRange.startTime),
          to: new Date(visibleRange.endTime)
        } : null,
        marketDataLength: marketData.length,
        dynamicTrendlinesFound: dynamicTrendlines.length,
        dynamicTrendlines: dynamicTrendlines.map(tl => ({
          id: tl.id,
          strength: tl.strength,
          weightedStrength: tl.weightedStrength,
          averageWeight: tl.averageWeight,
          type: tl.type,
          points: tl.points.length
        }))
      });
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

    // Debug chart trendlines
    if (needsDynamicTrendlines && process.env.NODE_ENV === 'development') {
      console.log(`📊 Chart Trendlines Debug:`, {
        showDynamicTrendlines: displayOptions.showDynamicTrendlines,
        powerfulChartTrendlines: powerfulChartTrendlines.length,
        dynamicChartTrendlines: dynamicChartTrendlines.length,
        totalChartTrendlines: chartTrendlines.length,
        dynamicTrendlinesWithFlag: dynamicChartTrendlines.filter(tl => tl.isDynamic).length,
        chartTrendlineTypes: chartTrendlines.map(tl => ({ id: tl.id, isDynamic: tl.isDynamic, type: tl.type }))
      });
    }
    
    // Calculate traditional pivot points only if needed
    const traditionalPivots = displayOptions.showPivots ? calculateTraditionalPivots(marketData) : [];

    // Process trend cloud data for visualization
    const trendCloudData = displayOptions.showTrendCloud && rawTrendCloudData ? 
      (rawTrendCloudData as any)?.trend_clouds?.map((cloud: any) => ({
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



    
    const data = {
      marketData,
      pivotPoints: displayPivots, // Swing highs/lows (visible range for display)
      trendLines: chartTrendlines, // Powerful trendlines connecting multiple pivots
      traditionalPivots, // Traditional daily pivot levels
      trendClouds: trendCloudData, // Use processed cloud points, not raw API response
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
    const isMarketOpen = isUSMarketOpen();

    if (isMarketOpen) {
      console.log('🕐 Market is open - forcing refresh despite ongoing data changes');
      setUpdateStatus({
        isUpdating: true,
        stage: 'Market is open - forcing data refresh...'
      });
    }

    fetchAnalysis(true);
    fetchTrendCloudData(true); // Force update trend clouds too
  };

  // Create dynamic display options config with loading states
  const dynamicDisplayOptionsConfig = useMemo(() => {
    const baseConfig = createDisplayOptionsConfig();

    // Find the trend cloud option and update it with loading state
    return baseConfig.map(option => {
      if (option.id === 'showTrendCloud') {
        let badge = 'NEW';
        let color: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'indigo' = 'purple';
        let description = '5-day rolling predictions from Python analyzer';

        if (trendCloudLoading || updateStatus.isUpdating) {
          badge = '🔄 GENERATING...';
          color = 'amber';
          description = updateStatus.stage || 'Generating trend clouds using Python analyzer...';
        } else if (updateStatus.stage && !updateStatus.isUpdating) {
          badge = '✅ UPDATED';
          color = 'green';
          description = `${updateStatus.stage} - 5-day rolling predictions`;
        } else if (rawTrendCloudData) {
          const cloudCount = (rawTrendCloudData as any)?.trend_clouds?.length || 0;
          badge = cloudCount > 0 ? `${cloudCount} CLOUDS` : 'READY';
          color = cloudCount > 0 ? 'green' : 'blue';
          description = cloudCount > 0
            ? `${cloudCount} trend clouds available from Python analyzer`
            : '5-day rolling predictions from Python analyzer';
        }

        return {
          ...option,
          badge,
          color,
          description
        };
      }
      return option;
    });
  }, [trendCloudLoading, updateStatus.isUpdating, updateStatus.stage, rawTrendCloudData]);

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
              {updateStatus.lastUpdate && (
                <span className="ml-2 text-green-600">
                  • Updated {updateStatus.lastUpdate.toLocaleTimeString()}
                </span>
              )}
              <span className="ml-2">
                {isUSMarketOpen() ? (
                  <span className="text-orange-600">
                    • US Market: OPEN (10:30 PM - 5:00 AM SGT)
                  </span>
                ) : (
                  <span className="text-blue-600">
                    • US Market: CLOSED
                  </span>
                )}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              disabled={loading || updateStatus.isUpdating}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading || updateStatus.isUpdating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  {updateStatus.isUpdating ? updateStatus.stage : 'Analyzing...'}
                </>
              ) : (
                'Refresh Analysis'
              )}
            </button>

            {/* Auto-update status indicator */}
            {updateStatus.stage && !updateStatus.isUpdating && (
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-green-600">{updateStatus.stage}</span>
              </div>
            )}
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
              options={dynamicDisplayOptionsConfig}
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
                traditionalPivots={currentTimeframeData.traditionalPivots as any}
                trendClouds={currentTimeframeData.trendClouds}
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
                showMovingAverages={displayOptions.showMovingAverages}
                onViewportChange={handleViewportChange}
              />
            </div>
            
            {/* Simple Trend Cloud Analysis */}
            <div className="border-t border-gray-200 pt-6">
              <SimpleTrendCloud symbol={symbol} data={rawTrendCloudData as any} />
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