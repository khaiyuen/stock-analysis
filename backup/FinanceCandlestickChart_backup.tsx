'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { MarketData, PivotPoint, TrendLine, ConvergenceZone, Timeframe } from '@/types';
import { TrendCloudData } from '@/lib/trendCloud';

interface OptimizedLevel {
  id: string;
  price: number;
  type: 'Support' | 'Resistance';
  weight: number;
  strength: number;
  color: string;
  width: number;
  source: string;
}

interface FinanceCandlestickChartProps {
  data: MarketData[];
  pivotPoints?: PivotPoint[];
  trendLines?: TrendLine[];
  convergenceZones?: ConvergenceZone[];
  traditionalPivots?: {
    pivot: number;
    resistance: { R1: number; R2: number; R3: number };
    support: { S1: number; S2: number; S3: number };
  } | null;
  trendClouds?: TrendCloudData[];
  optimizedLevels?: OptimizedLevel[];
  timeframe?: Timeframe;
  className?: string;
  showPivots?: boolean;
  showTrendlines?: boolean;
  showDynamicTrendlines?: boolean;
  showConvergence?: boolean;
  showLocalTopBottom?: boolean;
  showPivotLevels?: boolean;
  showCandles?: boolean;
  showTrendCloud?: boolean;
  showOptimizedLevels?: boolean;
  onViewportChange?: (viewport: { startTime: number; endTime: number }) => void;
}

export const FinanceCandlestickChart: React.FC<FinanceCandlestickChartProps> = ({
  data,
  pivotPoints = [],
  trendLines = [],
  convergenceZones = [],
  traditionalPivots = null,
  trendClouds = [],
  optimizedLevels = [],
  timeframe,
  className = '',
  showPivots = true,
  showTrendlines = true,
  showDynamicTrendlines = false,
  showConvergence = true,
  showLocalTopBottom = false,
  showPivotLevels = false,
  showCandles = true,
  showTrendCloud = false,
  showOptimizedLevels = false,
  onViewportChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 600 });
  // Helper function to handle both Date objects and string timestamps
  const getTimestamp = (timestamp: Date | string) => {
    return timestamp instanceof Date ? timestamp.getTime() : new Date(timestamp).getTime();
  };

  // Interactive viewport state
  const [viewport, setViewport] = useState({ startIndex: Math.max(0, (data?.length || 100) - 100), endIndex: data?.length || 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, startIndex: 0, endIndex: 0 });
  const [crosshair, setCrosshair] = useState({ x: -1, y: -1, visible: false });
  const [tooltip, setTooltip] = useState({ x: -1, y: -1, visible: false, candle: null as MarketData | null, price: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Auto-fit viewport when data changes
  useEffect(() => {
    if (data && data.length > 0) {
      const defaultView = Math.min(100, data.length); // Show last 100 candles by default
      setViewport({ 
        startIndex: Math.max(0, data.length - defaultView), 
        endIndex: data.length 
      });
    }
  }, [data?.length]);

  // Notify parent when viewport changes (for dynamic trendlines)
  useEffect(() => {
    if (onViewportChange && data && data.length > 0 && viewport.startIndex < data.length && viewport.endIndex <= data.length) {
      const startCandle = data[viewport.startIndex];
      const endCandle = data[viewport.endIndex - 1];
      
      if (startCandle && endCandle) {
        const startTime = getTimestamp(startCandle.timestamp);
        const endTime = getTimestamp(endCandle.timestamp);
        
        onViewportChange({ startTime, endTime });
      }
    }
  }, [viewport, data]); // Removed onViewportChange from dependencies

  // Responsive sizing
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: rect.width || 1200,
          height: rect.height || 600
        });
      }
    };

    handleResize(); // Initial size
    window.addEventListener('resize', handleResize);
    
    // Use ResizeObserver for more accurate container size tracking
    if (containerRef.current && window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
      return () => {
        resizeObserver.disconnect();
        window.removeEventListener('resize', handleResize);
      };
    }

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return { candles: [], priceRange: { min: 0, max: 100 }, timeRange: { min: 0, max: 1 } };

    // Get visible data slice based on viewport
    const visibleData = data.slice(viewport.startIndex, viewport.endIndex);
    if (visibleData.length === 0) return { candles: [], priceRange: { min: 0, max: 100 }, timeRange: { min: 0, max: 1 } };

    // Calculate price range with padding (only for visible data)
    const prices = visibleData.flatMap(d => [d.open, d.high, d.low, d.close]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padding = (maxPrice - minPrice) * 0.05;
    
    const priceRange = {
      min: minPrice - padding,
      max: maxPrice + padding
    };

    // Calculate time range (only for visible data)
    const timeRange = {
      min: getTimestamp(visibleData[0].timestamp),
      max: getTimestamp(visibleData[visibleData.length - 1].timestamp)
    };

    // Process visible candles
    const candles = visibleData.map((point, index) => ({
      ...point,
      index,
      isGreen: point.close >= point.open,
      bodyTop: Math.max(point.open, point.close),
      bodyBottom: Math.min(point.open, point.close),
      bodyHeight: Math.abs(point.close - point.open)
    }));

    return { candles, priceRange, timeRange };
  }, [data, viewport.startIndex, viewport.endIndex, dimensions]);

  const chartWidth = dimensions.width;
  // Account for title, period buttons, and padding in container
  const availableHeight = dimensions.height - 120; // Reserve space for title (60px) + period buttons (40px) + padding (20px)
  const chartHeight = Math.max(300, availableHeight); // Minimum 300px for chart
  const margin = { top: 20, right: 60, left: 60, bottom: 40 };
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;

  // Calculate candle width
  const candleCount = chartData.candles.length;
  const candleWidth = candleCount > 0 ? Math.max(2, (plotWidth * 0.8) / candleCount) : 4;
  const candleSpacing = candleCount > 0 ? plotWidth / candleCount : 1;

  // Price scale function - always use logarithmic scale
  const priceToY = (price: number) => {
    const { min, max } = chartData.priceRange;
    if (min > 0) {
      // Logarithmic scale
      const logMin = Math.log(min);
      const logMax = Math.log(max);
      const logPrice = Math.log(price);
      return margin.top + ((logMax - logPrice) / (logMax - logMin)) * plotHeight;
    } else {
      // Fallback to linear scale if min is 0 or negative
      return margin.top + ((max - price) / (max - min)) * plotHeight;
    }
  };

  const timeToX = (timestamp: number) => {
    const { min, max } = chartData.timeRange;
    if (max === min) return margin.left;
    return margin.left + ((timestamp - min) / (max - min)) * plotWidth;
  };

  const indexToX = (index: number) => {
    return margin.left + (index + 0.5) * candleSpacing;
  };

  // Interactive event handlers
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    setViewport(currentViewport => {
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
      const currentSize = currentViewport.endIndex - currentViewport.startIndex;
      const newSize = Math.max(10, Math.min(data?.length || 100, Math.round(currentSize * zoomFactor)));
      const center = (currentViewport.startIndex + currentViewport.endIndex) / 2;
      const newStart = Math.max(0, Math.round(center - newSize / 2));
      const newEnd = Math.min(data?.length || 100, newStart + newSize);
      
      return { startIndex: newStart, endIndex: newEnd };
    });
  }, [data?.length]);

  // Add wheel event listener manually to avoid passive event listener issues
  useEffect(() => {
    const svgElement = svgRef.current;
    if (svgElement) {
      svgElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        svgElement.removeEventListener('wheel', handleWheel);
      };
    }
  }, [handleWheel]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      startIndex: viewport.startIndex,
      endIndex: viewport.endIndex
    });
  }, [viewport]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - dragStart.x;
      const pixelsPerCandle = plotWidth / (viewport.endIndex - viewport.startIndex);
      const candleShift = Math.round(-deltaX / pixelsPerCandle);
      
      const newStart = Math.max(0, Math.min(data?.length || 100, dragStart.startIndex + candleShift));
      const size = dragStart.endIndex - dragStart.startIndex;
      const newEnd = Math.min(data?.length || 100, newStart + size);
      
      if (newEnd - newStart === size) {
        setViewport({ startIndex: newStart, endIndex: newEnd });
      }
    }
    
    // Update crosshair and tooltip
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      setCrosshair({
        x: mouseX,
        y: mouseY,
        visible: true
      });

      // Calculate current cursor price from Y position
      const priceRange = chartData.priceRange.max - chartData.priceRange.min;
      const plotHeight = dimensions.height - margin.top - margin.bottom;
      const yInPlot = mouseY - margin.top;
      const currentPrice = chartData.priceRange.max - (yInPlot / plotHeight) * priceRange;

      // Find the candle under the mouse cursor
      const pixelsPerCandle = plotWidth / chartData.candles.length;
      const candleIndex = Math.floor((mouseX - margin.left) / pixelsPerCandle);
      
      if (candleIndex >= 0 && candleIndex < chartData.candles.length) {
        const candle = chartData.candles[candleIndex];
        setTooltip({
          x: mouseX,
          y: mouseY - 10, // Offset above cursor
          visible: true,
          candle: candle,
          price: currentPrice
        });
      } else {
        // Show cursor price when not over a candle
        setTooltip({ 
          x: mouseX, 
          y: mouseY - 10, 
          visible: true, 
          candle: null, 
          price: currentPrice 
        });
      }
    }
  }, [isDragging, dragStart, viewport, data?.length, plotWidth, chartData.candles, chartData.priceRange, margin.left, margin.top, dimensions.height]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCrosshair({ x: -1, y: -1, visible: false });
    setTooltip({ x: -1, y: -1, visible: false, candle: null, price: 0 });
    setIsDragging(false);
  }, []);

  // Generate Y-axis ticks with simplified labels (2 significant digits)
  const yTicks = useMemo(() => {
    const { min, max } = chartData.priceRange;
    const tickCount = 8;
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      const value = min + (max - min) * (i / tickCount);
      
      // Format to first 2 significant digits with zeros
      const formatValue = (num: number): string => {
        if (num >= 100) {
          // For numbers >= 100, round to nearest 10 (543.67 -> 540, 532.12 -> 530)
          return Math.round(num / 10) * 10;
        } else if (num >= 10) {
          // For numbers 10-99, round to nearest whole number (12.345 -> 12)
          return Math.round(num);
        } else if (num >= 1) {
          // For numbers 1-9, round to 1 decimal (1.234 -> 1.2)
          return Math.round(num * 10) / 10;
        } else {
          // For numbers < 1, round to 2 decimals (0.1234 -> 0.12)
          return Math.round(num * 100) / 100;
        }
      };
      
      ticks.push({
        value,
        y: priceToY(value),
        label: `$${formatValue(value)}`
      });
    }
    return ticks;
  }, [chartData.priceRange]);

  // Generate X-axis ticks based on month boundaries in the current viewport
  const xTicks = useMemo(() => {
    if (!chartData.candles || chartData.candles.length === 0) return [];
    
    const ticks = [];
    const seenMonths = new Set<string>();
    
    // Look through the visible candles for the first day of each month
    for (let i = 0; i < chartData.candles.length; i++) {
      const candle = chartData.candles[i];
      if (candle) {
        const date = new Date(candle.timestamp);
        const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
        
        // If this is the first time we see this month, check if it's the first day or close to it
        if (!seenMonths.has(monthKey)) {
          const dayOfMonth = date.getDate();
          
          // Consider it a month boundary if it's within the first 3 days of the month
          // or if it's the first occurrence of this month in our dataset
          if (dayOfMonth <= 3) {
            seenMonths.add(monthKey);
            const viewportDays = viewport.endIndex - viewport.startIndex;
            
            ticks.push({
              x: indexToX(i),
              label: (() => {
                // Smart date formatting based on viewport size
                if (viewportDays <= 30) {
                  return format(date, 'MMM dd'); // Show month and day for short periods
                } else if (viewportDays <= 365) {
                  return format(date, 'MMM yyyy'); // Show month/year for medium periods  
                } else {
                  return format(date, 'MM/yy'); // Show MM/YY for long periods
                }
              })()
            });
          }
        }
      }
    }
    
    // If we don't have enough month-based ticks, add some evenly spaced ones
    if (ticks.length < 3) {
      const tickCount = Math.min(6, chartData.candles.length);
      for (let i = 0; i < tickCount; i++) {
        const index = Math.floor((i / (tickCount - 1)) * (chartData.candles.length - 1));
        const candle = chartData.candles[index];
        if (candle) {
          const date = new Date(candle.timestamp);
          const viewportDays = viewport.endIndex - viewport.startIndex;
          
          // Avoid duplicates
          const x = indexToX(index);
          const isDuplicate = ticks.some(tick => Math.abs(tick.x - x) < 20);
          
          if (!isDuplicate) {
            ticks.push({
              x: x,
              label: (() => {
                if (viewportDays <= 30) {
                  return format(date, 'MMM dd');
                } else if (viewportDays <= 365) {
                  return format(date, 'MMM yyyy');
                } else {
                  return format(date, 'MM/yy');
                }
              })()
            });
          }
        }
      }
    }
    
    // Sort ticks by x position
    return ticks.sort((a, b) => a.x - b.x);
  }, [chartData.candles, viewport, indexToX]);

  // Helper functions for trend analysis elements
  const getLineColorAndThickness = (line: TrendLine, allLines: TrendLine[]) => {
    if (!line.pivotPoints || line.pivotPoints.length === 0) {
      return { color: '#666666', thickness: 0.5 };
    }
    
    const highCount = line.pivotPoints.filter(p => p.type === 'HIGH').length;
    const lowCount = line.pivotPoints.filter(p => p.type === 'LOW').length;
    const totalPoints = line.pivotPoints.length;
    
    // Calculate ratio: 0 = all lows (pure support), 1 = all highs (pure resistance)
    const resistanceRatio = highCount / totalPoints;
    
    // Generate gradient color from green (support) to red (resistance)
    const red = Math.round(34 + (239 - 34) * resistanceRatio);   // 34 to 239
    const green = Math.round(197 - (197 - 68) * resistanceRatio); // 197 to 68  
    const blue = Math.round(94 - (94 - 68) * resistanceRatio);   // 94 to 68
    
    const color = `rgb(${red}, ${green}, ${blue})`;
    
    // Calculate relative thickness based on point counts across all lines
    const allPointCounts = allLines.map(l => l.pivotPoints?.length || 0).filter(count => count > 0);
    const minPoints = Math.min(...allPointCounts);
    const maxPoints = Math.max(...allPointCounts);
    
    // Avoid division by zero if all lines have same point count
    const pointRange = maxPoints - minPoints;
    let thickness;
    
    if (pointRange === 0) {
      thickness = 1.5; // Default thickness when all lines have same point count
    } else {
      // Scale from 0.5px (weakest) to 4px (strongest) based on relative position
      const relativeStrength = (totalPoints - minPoints) / pointRange;
      thickness = 0.5 + relativeStrength * 3.5; // 0.5 to 4px range
    }
    
    return { color, thickness };
  };

  // Backward compatibility wrapper
  const getLineColor = (line: TrendLine) => {
    return getLineColorAndThickness(line, trendLines).color;
  };

  const getPivotColor = (pivot: PivotPoint) => {
    return pivot.type === 'HIGH' ? '#ef4444' : '#22c55e';
  };

  const getZoneColor = (zone: ConvergenceZone) => {
    if (zone.strength > 0.8) return '#fbbf24';
    if (zone.strength > 0.6) return '#60a5fa';
    return '#9ca3af';
  };

  if (chartData.candles.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`w-full h-full bg-white ${className}`}>
      {/* Chart Title */}
      {timeframe && (
        <div className="px-4 py-2 bg-gray-50">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-800">
              {timeframe} Chart
            </h3>
            <div className="text-xs text-gray-600">
              {chartData.candles.length} candles
            </div>
          </div>
        </div>
      )}

      {/* Time Period Selection */}
      <div className="px-4 py-2">
        <div className="flex gap-2 justify-between items-center">
          {/* Go to Start button */}
          <button
            onClick={() => {
              const defaultView = Math.min(100, data?.length || 100);
              setViewport({ 
                startIndex: 0, 
                endIndex: defaultView 
              });
            }}
            className="px-4 py-1 text-sm rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors font-medium mr-4"
          >
            Go to Start
          </button>
          
          {/* Main timeframe buttons */}
          <div className="flex gap-2 justify-center flex-1">
            {[
              { label: '1D', days: 1 },
              { label: '1W', days: 7 },
              { label: '1M', days: 30 },
              { label: '3M', days: 90 },
              { label: '6M', days: 180 },
              { label: '1Y', days: 252 },
              { label: '3Y', days: 252 * 3 },
              { label: '5Y', days: 252 * 5 },
              { label: '10Y', days: 252 * 10 },
              { label: 'ALL', days: -1 }
            ].map(period => {
              const handlePeriodClick = () => {
                if (period.days === -1) {
                  // Show all data
                  setViewport({ startIndex: 0, endIndex: data?.length || 100 });
                } else {
                  // PRESERVE CURRENT VIEW POSITION: Calculate timeframe relative to current center
                  const currentCenter = (viewport.startIndex + viewport.endIndex) / 2;
                  const currentCenterTime = data && data[Math.floor(currentCenter)] ? 
                    getTimestamp(data[Math.floor(currentCenter)].timestamp) : Date.now();
                  
                  // Find the index closest to current center time
                  let centerIndex = Math.floor(currentCenter);
                  if (data && data.length > 0) {
                    let closestDistance = Infinity;
                    for (let i = 0; i < data.length; i++) {
                      const distance = Math.abs(getTimestamp(data[i].timestamp) - currentCenterTime);
                      if (distance < closestDistance) {
                        closestDistance = distance;
                        centerIndex = i;
                      }
                    }
                  }
                  
                  // Calculate new viewport centered on current position
                  const halfPeriod = Math.floor(period.days / 2);
                  const startIndex = Math.max(0, centerIndex - halfPeriod);
                  const endIndex = Math.min(data?.length || 100, centerIndex + halfPeriod);
                  
                  setViewport({ startIndex, endIndex });
                }
              };
            
            // Calculate which period is closest to current viewport size
            const currentViewportSize = viewport.endIndex - viewport.startIndex;
            const periods = [
              { label: '1D', days: 1 },
              { label: '1W', days: 7 },
              { label: '1M', days: 30 },
              { label: '3M', days: 90 },
              { label: '6M', days: 180 },
              { label: '1Y', days: 252 },
              { label: '3Y', days: 252 * 3 },
              { label: '5Y', days: 252 * 5 },
              { label: '10Y', days: 252 * 10 },
              { label: 'ALL', days: -1 }
            ];
            
            // Determine if this period should be highlighted (only closest match)
            let isActive = false;
            
            if (period.days === -1) {
              // Special case for ALL - active when showing all data
              isActive = viewport.startIndex === 0 && viewport.endIndex === (data?.length || 100);
            } else {
              // Find the closest matching period
              let closestPeriod = periods[0];
              let smallestDifference = Math.abs(currentViewportSize - periods[0].days);
              
              for (const p of periods) {
                if (p.days === -1) continue; // Skip ALL period
                const difference = Math.abs(currentViewportSize - p.days);
                if (difference < smallestDifference) {
                  smallestDifference = difference;
                  closestPeriod = p;
                }
              }
              
              isActive = period.label === closestPeriod.label;
            }
            
              return (
                <button
                  key={period.label}
                  onClick={handlePeriodClick}
                  className={`px-3 py-1 text-sm rounded transition-colors ${
                    isActive 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
          
          {/* Go to Latest button */}
          <button
            onClick={() => {
              const defaultView = Math.min(100, data?.length || 100);
              setViewport({ 
                startIndex: Math.max(0, (data?.length || 100) - defaultView), 
                endIndex: data?.length || 100 
              });
            }}
            className="px-4 py-1 text-sm rounded bg-green-600 text-white hover:bg-green-700 transition-colors font-medium ml-4"
          >
            Go to Latest
          </button>
        </div>
      </div>

      {/* Main Chart */}
      <div className="px-4 flex-1">
        <svg 
          ref={svgRef}
          width={chartWidth} 
          height={chartHeight} 
          className="cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ userSelect: 'none' }}
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="40" height="30" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 30" fill="none" stroke="#f1f5f9" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width={plotWidth} height={plotHeight} x={margin.left} y={margin.top} fill="url(#grid)" />

          {/* Convergence zones */}
          {showConvergence && convergenceZones.map((zone, idx) => {
            const y = priceToY(zone.priceLevel);
            const toleranceHeight = Math.abs(priceToY(zone.priceLevel + zone.tolerance) - priceToY(zone.priceLevel - zone.tolerance));
            
            return (
              <g key={`zone-${idx}`}>
                <rect
                  x={margin.left}
                  y={y - toleranceHeight / 2}
                  width={plotWidth}
                  height={toleranceHeight}
                  fill={getZoneColor(zone)}
                  fillOpacity={0.1}
                />
                <line
                  x1={margin.left}
                  y1={y}
                  x2={margin.left + plotWidth}
                  y2={y}
                  stroke={getZoneColor(zone)}
                  strokeWidth={2}
                  strokeOpacity={0.6}
                  strokeDasharray="6 4"
                />
              </g>
            );
          })}

          {/* Traditional Pivot Points */}
          {showPivotLevels && traditionalPivots && (
            <>
              {/* Main Pivot Line */}
              <g key="pivot-main">
                <line
                  x1={margin.left}
                  y1={priceToY(traditionalPivots.pivot)}
                  x2={margin.left + plotWidth}
                  y2={priceToY(traditionalPivots.pivot)}
                  stroke="#fbbf24"
                  strokeWidth={2}
                  strokeOpacity={0.8}
                  strokeDasharray="8,4"
                />
                <text
                  x={indexToX(chartData.candles.length - 1)}
                  y={priceToY(traditionalPivots.pivot) - 5}
                  fontSize={12}
                  fill="#fbbf24"
                  fontWeight="bold"
                >
                  PP: ${traditionalPivots.pivot.toFixed(2)}
                </text>
              </g>

              {/* Resistance Lines */}
              {Object.entries(traditionalPivots.resistance).map(([level, price]) => (
                <g key={`resistance-${level}`}>
                  <line
                    x1={margin.left}
                    y1={priceToY(price)}
                    x2={margin.left + plotWidth}
                    y2={priceToY(price)}
                    stroke="#ef4444"
                    strokeWidth={1}
                    strokeOpacity={0.6}
                    strokeDasharray="4,2"
                  />
                  <text
                    x={indexToX(chartData.candles.length - 1)}
                    y={priceToY(price) - 5}
                    fontSize={10}
                    fill="#ef4444"
                  >
                    {level}: ${price.toFixed(2)}
                  </text>
                </g>
              ))}

              {/* Support Lines */}
              {Object.entries(traditionalPivots.support).map(([level, price]) => (
                <g key={`support-${level}`}>
                  <line
                    x1={margin.left}
                    y1={priceToY(price)}
                    x2={margin.left + plotWidth}
                    y2={priceToY(price)}
                    stroke="#16a34a"
                    strokeWidth={1}
                    strokeOpacity={0.6}
                    strokeDasharray="4,2"
                  />
                  <text
                    x={indexToX(chartData.candles.length - 1)}
                    y={priceToY(price) - 5}
                    fontSize={10}
                    fill="#16a34a"
                  >
                    {level}: ${price.toFixed(2)}
                  </text>
                </g>
              ))}
            </>
          )}

          {/* Optimized Support/Resistance Levels */}
          {showOptimizedLevels && optimizedLevels.map((level) => (
            <g key={level.id}>
              <line
                x1={margin.left}
                y1={priceToY(level.price)}
                x2={margin.left + plotWidth}
                y2={priceToY(level.price)}
                stroke={level.color}
                strokeWidth={level.width}
                strokeOpacity={0.8}
                strokeDasharray="2 2"
              />
              <text
                x={indexToX(chartData.candles.length - 1) - 10}
                y={priceToY(level.price) - 5}
                fontSize={11}
                fill={level.color}
                fontWeight="bold"
                textAnchor="end"
              >
                {level.type}: ${level.price.toFixed(2)} ({(level.weight * 100).toFixed(0)}%)
              </text>
            </g>
          ))}

          {/* Trend Clouds - Each cloud shows 5-day projections from its calculation date */}
          {showTrendCloud && (() => {
            // VISIBLE CLOUDS: Show all clouds that appear within the visible chart area
            // Each cloud represents 5-day projections from its calculation date
            const visibleClouds = trendClouds.filter(cloud => {
              const targetTime = getTimestamp(cloud.targetDate);
              const targetX = timeToX(targetTime);
              
              // Only basic visibility check - show all clouds in visible timeframe
              return targetX >= margin.left && targetX <= chartWidth - margin.right;
            });
            
            console.log(`🎯 MULTI-PERIOD RENDERING: ${visibleClouds.length} trend clouds across visible timeframe`);

            if (visibleClouds.length === 0) return null;

            // Process each cloud to create CLUSTER-SEGREGATED boundary-constrained cloud formations
            // Implementation based on notebook "@1.1 trend_cloud_analysis.ipynb"
            const clusterCloudShapes: Array<{
              x: number,
              y: number,
              weight: number,
              confidence: number,
              radius: number,
              opacity: number,
              gradientId: string,
              clusterId: string,
              clusterType: 'Support' | 'Resistance' | 'Mixed',
              boundaryConstrained: boolean,
              projectionDay: number
            }> = [];

            // Define unified cluster color mappings (no red/green segregation)
            const clusterGradients = {
              'Support1': 'cluster1Gradient',
              'Support2': 'cluster2Gradient', 
              'Support3': 'cluster3Gradient',
              'Resistance1': 'cluster1Gradient', // Same as Support1
              'Resistance2': 'cluster2Gradient', // Same as Support2
              'Mixed': 'mixedClusterGradient'
            };

            visibleClouds.forEach(cloud => {
              const targetTime = getTimestamp(cloud.targetDate);
              const targetX = timeToX(targetTime);

              // Check if this cloud has cluster-segregated data
              const hasClusterData = cloud.summary?.clusterSegregated && cloud.cloudPoints.some(p => p.clusterInfo);
              
              if (hasClusterData) {
                // CLUSTER-SEGREGATED RENDERING: Group points by cluster
                const pointsByCluster = new Map();
                
                cloud.cloudPoints.forEach(point => {
                  if (!point.clusterInfo) return;
                  
                  const clusterId = point.clusterInfo.clusterId || 'Mixed';
                  if (!pointsByCluster.has(clusterId)) {
                    pointsByCluster.set(clusterId, []);
                  }
                  pointsByCluster.get(clusterId).push(point);
                });

                console.log(`🎨 CLUSTER-SEGREGATED: ${cloud.targetDate.toISOString().split('T')[0]} has ${pointsByCluster.size} clusters:`, 
                  Array.from(pointsByCluster.keys()));

                // Render each cluster with its own color and boundaries
                pointsByCluster.forEach((clusterPoints, clusterId) => {
                  if (clusterPoints.length === 0) return;
                  
                  const samplePoint = clusterPoints[0];
                  const clusterType = samplePoint.clusterInfo?.clusterType || 'Mixed';
                  const exponentialWeight = samplePoint.clusterInfo?.exponentialWeight || 0.1;
                  const boundaryConstrained = samplePoint.clusterInfo?.boundaryConstrained || false;
                  
                  // Select gradient based on cluster ID (unified coloring)
                  let gradientId = clusterGradients[clusterId as keyof typeof clusterGradients] || 'cluster1Gradient';
                  
                  console.log(`   🎯 Cluster ${clusterId}: ${clusterPoints.length} points, type=${clusterType}, weight=${exponentialWeight.toFixed(3)}, boundary=${boundaryConstrained}`);
                  
                  // Process points within this cluster
                  clusterPoints.forEach(point => {
                    const pointY = priceToY(point.price);
                    const projectionDate = new Date(point.timestamp);
                    const projectionX = timeToX(getTimestamp(projectionDate));
                    
                    // Size based on exponential softmax weighting (from notebook)
                    const baseRadius = Math.max(8, exponentialWeight * 50); // Dramatic size differences
                    const baseOpacity = Math.max(0.05, exponentialWeight * 0.8); // Sharp opacity differences
                    
                    // Skip nearly invisible points to improve performance
                    if (baseOpacity < 0.08) return;
                    
                    // PERFORMANCE OPTIMIZED: Create minimal cloud puffs (only 1-2 per point)
                    const isMainCluster = exponentialWeight > 0.3;
                    const puffCount = isMainCluster ? 2 : 1; // Dramatically reduced for performance
                    
                    for (let i = 0; i < puffCount; i++) {
                      const offsetX = i === 0 ? 0 : (Math.random() - 0.5) * baseRadius * 0.4;
                      const offsetY = i === 0 ? 0 : (Math.random() - 0.5) * baseRadius * 0.3;
                      const sizeMultiplier = i === 0 ? 1.0 : 0.7;
                      const opacityMultiplier = i === 0 ? 1.0 : 0.6;
                      
                      clusterCloudShapes.push({
                        x: projectionX + offsetX,
                        y: pointY + offsetY,
                        weight: point.weight,
                        confidence: point.strength || exponentialWeight,
                        radius: baseRadius * sizeMultiplier,
                        opacity: baseOpacity * opacityMultiplier,
                        gradientId,
                        clusterId,
                        clusterType: clusterType as 'Support' | 'Resistance' | 'Mixed',
                        boundaryConstrained,
                        projectionDay: point.projectionDay || 1
                      });
                    }
                  });
                });
              } else {
                // FALLBACK: Legacy single-cloud rendering for non-segregated data
                const peakY = priceToY(cloud.summary.peakPrice);
                const normalizedWeight = Math.min(cloud.summary.totalWeight / 100, 1);
                const baseRadius = Math.max(15, normalizedWeight * 40);
                const baseOpacity = Math.max(0.3, normalizedWeight * 0.8);
                const gradientId = 'mixedClusterGradient';

                const syntheticPuffs = [
                  { offsetX: 0, offsetY: 0, sizeMultiplier: 1.5, opacityMultiplier: 0.8 },
                  { offsetX: 25, offsetY: -12, sizeMultiplier: 1.0, opacityMultiplier: 0.6 },
                  { offsetX: -20, offsetY: 15, sizeMultiplier: 0.9, opacityMultiplier: 0.5 }
                ];

                syntheticPuffs.forEach(puff => {
                  clusterCloudShapes.push({
                    x: targetX + puff.offsetX,
                    y: peakY + puff.offsetY,
                    weight: cloud.summary.totalWeight,
                    confidence: cloud.summary.confidenceScore,
                    radius: baseRadius * puff.sizeMultiplier,
                    opacity: baseOpacity * puff.opacityMultiplier,
                    gradientId,
                    clusterId: 'Legacy',
                    clusterType: 'Mixed',
                    boundaryConstrained: false,
                    projectionDay: 1
                  });
                });
              }
            });

            return (
              <g className="trend-cloud-container">
                <defs>
                  {/* Unified cluster gradients (no support/resistance segregation) */}
                  
                  {/* Primary Cluster Gradient - Blue tone */}
                  <radialGradient id="cluster1Gradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#1e40af" stopOpacity="0.9" />
                    <stop offset="70%" stopColor="#3b82f6" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.1" />
                  </radialGradient>
                  
                  {/* Secondary Cluster Gradient - Indigo tone */}
                  <radialGradient id="cluster2Gradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#4338ca" stopOpacity="0.8" />
                    <stop offset="70%" stopColor="#6366f1" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0.1" />
                  </radialGradient>
                  
                  {/* Tertiary Cluster Gradient - Cyan tone */}
                  <radialGradient id="cluster3Gradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#0891b2" stopOpacity="0.7" />
                    <stop offset="70%" stopColor="#0ea5e9" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.1" />
                  </radialGradient>
                  
                  {/* Mixed/Legacy Cluster Gradient - Purple tone */}
                  <radialGradient id="mixedClusterGradient" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.8" />
                    <stop offset="70%" stopColor="#8b5cf6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.1" />
                  </radialGradient>
                </defs>

                {/* Render cluster-segregated cloud shapes with boundary constraints */}
                {clusterCloudShapes.map((shape, idx) => {
                  // Determine visual emphasis based on cluster characteristics
                  const isMainPuff = shape.opacity > 0.5 && shape.radius > 15;
                  const isDominantCluster = shape.clusterType !== 'Mixed' && shape.opacity > 0.3;
                  const isBoundaryConstrained = shape.boundaryConstrained;
                  
                  // Dynamic stroke based on cluster importance (unified coloring)
                  let strokeColor = 'none';
                  let strokeWidth = 0;
                  
                  if (isMainPuff) {
                    // Use unified blue-based stroke colors
                    strokeColor = shape.gradientId.includes('cluster1') ? '#1e40af' :
                                 shape.gradientId.includes('cluster2') ? '#4338ca' :
                                 shape.gradientId.includes('cluster3') ? '#0891b2' : '#7c3aed';
                    strokeWidth = isDominantCluster ? 1.5 : 1;
                  }
                  
                  return (
                    <g key={idx}>
                      <ellipse
                        cx={shape.x}
                        cy={shape.y}
                        rx={shape.radius}
                        ry={shape.radius * 0.6} // Flattened for cloud appearance
                        fill={`url(#${shape.gradientId})`}
                        opacity={shape.opacity} // Exponential softmax-weighted opacity
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        strokeOpacity={0.6}
                        className={`cluster-${shape.clusterType.toLowerCase()} ${isBoundaryConstrained ? 'boundary-constrained' : ''}`}
                      />
                      
                      {/* Add subtle cluster boundary indicators for main puffs */}
                      {isMainPuff && isBoundaryConstrained && (
                        <circle
                          cx={shape.x}
                          cy={shape.y}
                          r={shape.radius + 2}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={0.5}
                          strokeOpacity={0.3}
                          strokeDasharray="2,2"
                        />
                      )}
                    </g>
                  );
                })}

                {/* Peak prediction markers - now with connecting lines */}
                {visibleClouds.map((cloud, cloudIdx) => {
                  const targetTime = getTimestamp(cloud.targetDate);
                  const targetX = timeToX(targetTime);
                  const peakY = priceToY(cloud.summary.peakPrice);
                  
                  console.log(`🎯 CHART RENDERING: Cloud ${cloudIdx} peak price: ${cloud.summary.peakPrice.toFixed(2)}, date: ${cloud.targetDate.toISOString()}, weight: ${cloud.summary.totalWeight.toFixed(1)}`);

                  return (
                    <g key={`peak-${cloudIdx}`} className="peak-prediction">
                      <circle
                        cx={targetX}
                        cy={peakY}
                        r={5}
                        fill="#7c3aed"
                        fillOpacity={0.9}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />
                      
                      {/* Peak price label - only show every few points to avoid clutter */}
                      {cloudIdx % 3 === 0 && (
                        <text
                          x={targetX}
                          y={peakY - 12}
                          textAnchor="middle"
                          fontSize={9}
                          fill="#7c3aed"
                          fontWeight="bold"
                        >
                          ${cloud.summary.peakPrice.toFixed(2)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Removed confusing purple peak prediction lines - replaced by prominent weighted clusters */}
              </g>
            );
          })()}

          {/* Trendlines (both powerful and dynamic) */}
          {trendLines.map((line, idx) => {
            // Skip if this is a dynamic line but dynamic trendlines are disabled
            if (line.isDynamic && !showDynamicTrendlines) return null;
            
            // Skip if this is a powerful line but powerful trendlines are disabled
            if (!line.isDynamic && !showTrendlines) return null;
            if (!line.pivotPoints || line.pivotPoints.length < 2) {
              return null;
            }
            
            
            // Calculate line endpoints using visible chart boundaries instead of extending
            const firstCandle = chartData.candles[0];
            const lastCandle = chartData.candles[chartData.candles.length - 1];
            
            if (!firstCandle || !lastCandle) return null;
            
            const chartStartTime = getTimestamp(firstCandle.timestamp);
            const chartEndTime = getTimestamp(lastCandle.timestamp);
            
            // Use the line equation to calculate prices at chart boundaries
            const timeBase = new Date(line.pivotPoints[0].timestamp).getTime();
            const startDays = (chartStartTime - timeBase) / (1000 * 60 * 60 * 24);
            const endDays = (chartEndTime - timeBase) / (1000 * 60 * 60 * 24);
            
            const startPrice = line.equation.slope * startDays + line.equation.intercept;
            const endPrice = line.equation.slope * endDays + line.equation.intercept;
            
            // Convert to screen coordinates using chart boundaries
            const x1 = margin.left; // Start at left edge of chart
            const y1 = priceToY(startPrice);
            const x2 = margin.left + plotWidth; // End at right edge of chart  
            const y2 = priceToY(endPrice);
            
            
            // Skip lines with invalid coordinates
            if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
              return null;
            }
            
            // Get dynamic color and thickness based on pivot point analysis
            const { color, thickness } = getLineColorAndThickness(line, trendLines);
            const baseOpacity = Math.max(0.5, Math.min(1.0, 0.4 + (line.pivotPoints.length / 15)));
            
            // Make dynamic trendlines more transparent to differentiate them
            const opacity = line.isDynamic ? baseOpacity * 0.7 : baseOpacity;
            
            // Get high/low counts for label
            const highCount = line.pivotPoints.filter(p => p.type === 'HIGH').length;
            const lowCount = line.pivotPoints.filter(p => p.type === 'LOW').length;
            
            return (
              <g key={`powerful-line-${idx}`}>
                {/* Main trendline with gradient color and dynamic thickness */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={color}
                  strokeWidth={thickness}
                  strokeOpacity={opacity}
                  strokeDasharray={undefined}
                />
                
                {/* Connected pivot points - show which points this line connects */}
                {line.pivotPoints.map((point, touchIdx) => {
                  // Find the corresponding candle index for proper positioning
                  let candleIndex = -1;
                  const pivotTime = getTimestamp(point.timestamp);
                  
                  let closestTimeDiff = Infinity;
                  for (let i = 0; i < chartData.candles.length; i++) {
                    const candleTime = getTimestamp(chartData.candles[i].timestamp);
                    const timeDiff = Math.abs(candleTime - pivotTime);
                    if (timeDiff < closestTimeDiff) {
                      closestTimeDiff = timeDiff;
                      candleIndex = i;
                    }
                  }
                  
                  if (candleIndex === -1) return null;
                  
                  return (
                    <circle
                      key={`powerful-touch-${idx}-${touchIdx}`}
                      cx={indexToX(candleIndex)}
                      cy={priceToY(point.price)}
                      r={Math.max(2, Math.min(6, line.pivotPoints.length / 2))}
                      fill={color}
                      fillOpacity={0.8}
                      stroke="white"
                      strokeWidth={1}
                    />
                  );
                })}
                
              </g>
            );
          })}

          {/* Candlesticks */}
          {showCandles && chartData.candles.map((candle, index) => {
            const x = indexToX(index);
            const wickX = x;
            const bodyX = x - candleWidth / 2;
            
            const bodyTopY = priceToY(candle.bodyTop);
            const bodyBottomY = priceToY(candle.bodyBottom);
            const highY = priceToY(candle.high);
            const lowY = priceToY(candle.low);
            
            const bodyHeight = bodyBottomY - bodyTopY;
            const color = candle.isGreen ? '#22c55e' : '#ef4444';
            
            return (
              <g key={`candle-${index}`}>
                {/* Wick */}
                <line
                  x1={wickX}
                  y1={highY}
                  x2={wickX}
                  y2={lowY}
                  stroke={color}
                  strokeWidth={1}
                />
                
                {/* Body */}
                <rect
                  x={bodyX}
                  y={bodyTopY}
                  width={candleWidth}
                  height={Math.max(1, bodyHeight)}
                  fill={candle.isGreen ? color : '#ffffff'}
                  stroke={color}
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* Pivot points */}
          {showPivots && pivotPoints.map((pivot, idx) => {
            // Find the corresponding candle index in the visible data
            const pivotTime = getTimestamp(pivot.timestamp);
            let candleIndex = -1;
            
            // Find the closest matching candle by timestamp
            let closestTimeDiff = Infinity;
            for (let i = 0; i < chartData.candles.length; i++) {
              const candleTime = getTimestamp(chartData.candles[i].timestamp);
              const timeDiff = Math.abs(candleTime - pivotTime);
              if (timeDiff < closestTimeDiff) {
                closestTimeDiff = timeDiff;
                candleIndex = i;
              }
            }
            
            // Skip if not found in current viewport
            if (candleIndex === -1) return null;
            
            // Use the same positioning as candlesticks
            const x = indexToX(candleIndex);
            const y = priceToY(pivot.price);
            const size = Math.max(3, Math.min(8, pivot.strength * 0.8)); // Much smaller with max cap
            
            return (
              <g key={`pivot-${idx}`}>
                {pivot.type === 'HIGH' ? (
                  <polygon
                    points={`${x},${y-size} ${x-size},${y+size} ${x+size},${y+size}`}
                    fill={getPivotColor(pivot)}
                    fillOpacity={0.8}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                ) : (
                  <polygon
                    points={`${x},${y+size} ${x-size},${y-size} ${x+size},${y-size}`}
                    fill={getPivotColor(pivot)}
                    fillOpacity={0.8}
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                )}
              </g>
            );
          })}

          {/* Local Top/Bottom circles */}
          {showLocalTopBottom && pivotPoints.map((pivot, idx) => {
            // Find the corresponding candle index in the visible data
            const pivotTime = getTimestamp(pivot.timestamp);
            let candleIndex = -1;
            
            // Find the closest matching candle by timestamp
            let closestTimeDiff = Infinity;
            for (let i = 0; i < chartData.candles.length; i++) {
              const candleTime = getTimestamp(chartData.candles[i].timestamp);
              const timeDiff = Math.abs(candleTime - pivotTime);
              if (timeDiff < closestTimeDiff) {
                closestTimeDiff = timeDiff;
                candleIndex = i;
              }
            }
            
            // Skip if not found in current viewport
            if (candleIndex === -1) return null;
            
            // Use the same positioning as candlesticks
            const x = indexToX(candleIndex);
            const y = priceToY(pivot.price);
            const circleRadius = 15;
            
            return (
              <g key={`local-topbottom-${idx}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={circleRadius}
                  fill="none"
                  stroke={pivot.type === 'HIGH' ? '#16a34a' : '#dc2626'}
                  strokeWidth={3}
                  strokeOpacity={0.9}
                  strokeDasharray="4,3"
                />
                {/* Add small label */}
                <text
                  x={x}
                  y={y - circleRadius - 8}
                  textAnchor="middle"
                  fontSize={12}
                  fill={pivot.type === 'HIGH' ? '#16a34a' : '#dc2626'}
                  fontWeight="bold"
                >
                  {pivot.type === 'HIGH' ? 'TOP' : 'BOT'}
                </text>
              </g>
            );
          })}

          {/* Y-axis */}
          <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotHeight} stroke="#d1d5db" strokeWidth={1} />
          {yTicks.map((tick, idx) => (
            <g key={`y-tick-${idx}`}>
              <line x1={margin.left - 5} y1={tick.y} x2={margin.left} y2={tick.y} stroke="#6b7280" strokeWidth={1} />
              <text x={margin.left - 8} y={tick.y + 4} textAnchor="end" fontSize={12} fill="#6b7280">
                {tick.label}
              </text>
            </g>
          ))}

          {/* X-axis */}
          <line x1={margin.left} y1={margin.top + plotHeight} x2={margin.left + plotWidth} y2={margin.top + plotHeight} stroke="#d1d5db" strokeWidth={1} />
          {xTicks.map((tick, idx) => (
            <g key={`x-tick-${idx}`}>
              <line x1={tick.x} y1={margin.top + plotHeight} x2={tick.x} y2={margin.top + plotHeight + 5} stroke="#6b7280" strokeWidth={1} />
              <text x={tick.x} y={margin.top + plotHeight + 18} textAnchor="middle" fontSize={11} fill="#6b7280">
                {tick.label}
              </text>
            </g>
          ))}

          {/* Crosshair */}
          {crosshair.visible && (
            <g className="crosshair">
              <line
                x1={margin.left}
                y1={crosshair.y}
                x2={chartWidth - margin.right}
                y2={crosshair.y}
                stroke="#666"
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.7}
              />
              <line
                x1={crosshair.x}
                y1={margin.top}
                x2={crosshair.x}
                y2={chartHeight - margin.bottom}
                stroke="#666"
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.7}
              />
            </g>
          )}

          {/* Tooltip */}
          {tooltip.visible && (() => {
            // Smart positioning to keep tooltip within bounds
            const tooltipWidth = tooltip.candle ? 160 : 110;
            const tooltipHeight = tooltip.candle ? 90 : 30;
            const padding = 10;
            
            // Calculate if cursor is near right edge
            const nearRightEdge = tooltip.x + tooltipWidth + padding > plotWidth + margin.left;
            const nearBottomEdge = tooltip.y - tooltipHeight < margin.top;
            
            // Position tooltip on opposite side if needed
            const tooltipX = nearRightEdge ? tooltip.x - tooltipWidth - padding : tooltip.x + padding;
            const tooltipY = nearBottomEdge ? tooltip.y + padding : tooltip.y - tooltipHeight;
            
            return (
              <g className="tooltip">
                {tooltip.candle ? (
                  /* Candle OHLC Data */
                  <>
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={160}
                      height={90}
                      fill="#333333"
                      fillOpacity={0.95}
                      rx={6}
                      ry={6}
                      stroke="#666666"
                      strokeWidth={1}
                    />
                    <text
                      x={tooltipX + 5}
                      y={tooltipY + 20}
                      fill="white"
                      fontSize={13}
                      fontWeight="bold"
                    >
                      {format(getTimestamp(tooltip.candle.timestamp), 'MMM dd, yyyy')}
                    </text>
                    <text
                      x={tooltipX + 5}
                      y={tooltipY + 40}
                      fill="#10b981"
                      fontSize={11}
                    >
                      O: ${tooltip.candle.open.toFixed(2)}  H: ${tooltip.candle.high.toFixed(2)}
                    </text>
                    <text
                      x={tooltipX + 5}
                      y={tooltipY + 55}
                      fill="#ef4444"
                      fontSize={11}
                    >
                      L: ${tooltip.candle.low.toFixed(2)}   C: ${tooltip.candle.close.toFixed(2)}
                    </text>
                    <line
                      x1={tooltipX + 5}
                      y1={tooltipY + 62}
                      x2={tooltipX + 150}
                      y2={tooltipY + 62}
                      stroke="#666666"
                      strokeWidth={1}
                    />
                    <text
                      x={tooltipX + 5}
                      y={tooltipY + 75}
                      fill="#60a5fa"
                      fontSize={11}
                      fontWeight="bold"
                    >
                      Price: ${tooltip.price.toFixed(2)}
                    </text>
                  </>
                ) : (
                  /* Cursor Price Only */
                  <>
                    <rect
                      x={tooltipX}
                      y={tooltipY}
                      width={110}
                      height={30}
                      fill="#333333"
                      fillOpacity={0.9}
                      rx={4}
                      ry={4}
                      stroke="#666666"
                      strokeWidth={1}
                    />
                    <text
                      x={tooltipX + 5}
                      y={tooltipY + 20}
                      fill="#60a5fa"
                      fontSize={12}
                      fontWeight="bold"
                    >
                      Price: ${tooltip.price.toFixed(2)}
                    </text>
                  </>
                )}
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
};

export default FinanceCandlestickChart;