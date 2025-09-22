'use client';

import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { MarketData, PivotPoint, TrendLine, ConvergenceZone, Timeframe } from '@/types';
import { TrendCloudData } from '@/lib/trendCloud';
import { MovingAverageData, MA_PERIODS, getMAColor } from '@/lib/movingAverages';


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
  movingAveragesData?: MovingAverageData[];
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
  showMovingAverages?: boolean;
  showHighVolumeVWAP?: boolean;
  highVolumeVWAPLines?: Array<{
    anchor_date: string;
    anchor_price: number;
    vwap_data: Array<{
      date: string;
      vwap: number;
      price_deviation: number;
      current_price: number;
    }>;
  }>;
  onViewportChange?: (viewport: { startTime: number; endTime: number }) => void;
}

export const FinanceCandlestickChart: React.FC<FinanceCandlestickChartProps> = ({
  data,
  pivotPoints = [],
  trendLines = [],
  convergenceZones = [],
  traditionalPivots = null,
  trendClouds = [],
  movingAveragesData = [],
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
  showMovingAverages = false,
  showHighVolumeVWAP = false,
  highVolumeVWAPLines = [],
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

    // Calculate time range - extend to include trend cloud projections if they exist
    let timeRangeMax = getTimestamp(visibleData[visibleData.length - 1].timestamp);

    // Extend time range to include trend cloud projections
    if (trendClouds && trendClouds.length > 0) {
      const maxProjectionTime = Math.max(
        ...trendClouds.map((cloud: any) => new Date(cloud.projection_end).getTime())
      );
      timeRangeMax = Math.max(timeRangeMax, maxProjectionTime);
    }

    const timeRange = {
      min: getTimestamp(visibleData[0].timestamp),
      max: timeRangeMax
    };

    // Process visible candles
    let candles = visibleData.map((point, index) => ({
      ...point,
      index,
      isGreen: point.close >= point.open,
      bodyTop: Math.max(point.open, point.close),
      bodyBottom: Math.min(point.open, point.close),
      bodyHeight: Math.abs(point.close - point.open)
    }));

    return { candles, priceRange, timeRange };
  }, [data, viewport.startIndex, viewport.endIndex, dimensions, trendClouds]);

  // Extend chart width when trend clouds are visible to accommodate future projections
  const extraWidth = (trendClouds && trendClouds.length > 0) ? 150 : 0;
  const chartWidth = dimensions.width + extraWidth;

  // Account for title, period buttons, and padding in container
  const availableHeight = dimensions.height - 120; // Reserve space for title (60px) + period buttons (40px) + padding (20px)
  const chartHeight = Math.max(300, availableHeight); // Minimum 300px for chart
  const margin = { top: 20, right: 60 + extraWidth, left: 60, bottom: 40 };
  const plotWidth = chartWidth - margin.left - margin.right;
  const plotHeight = chartHeight - margin.top - margin.bottom;

  // Calculate candle width
  const candleCount = chartData.candles.length;
  const candleWidth = candleCount > 0 ? Math.max(2, (plotWidth * 0.8) / candleCount) : 4;
  const candleSpacing = candleCount > 0 ? plotWidth / candleCount : 1;

  // Price scale function - logarithmic scale for financial data
  const priceToY = (price: number) => {
    const { min, max } = chartData.priceRange;
    if (min > 0 && max > 0 && price > 0) {
      // Logarithmic scale for percentage-based visualization
      const logMin = Math.log(min);
      const logMax = Math.log(max);
      const logPrice = Math.log(price);
      return margin.top + ((logMax - logPrice) / (logMax - logMin)) * plotHeight;
    } else {
      // Fallback to linear scale if any value is <= 0
      return margin.top + ((max - price) / (max - min)) * plotHeight;
    }
  };

  // Inverse function to convert Y position back to price (logarithmic)
  const yToPrice = (y: number) => {
    const { min, max } = chartData.priceRange;
    const normalizedY = (y - margin.top) / plotHeight;

    if (min > 0 && max > 0) {
      // Inverse of logarithmic scale
      const logMin = Math.log(min);
      const logMax = Math.log(max);
      const logPrice = logMax - normalizedY * (logMax - logMin);
      return Math.exp(logPrice);
    } else {
      // Fallback to linear scale
      return max - normalizedY * (max - min);
    }
  };

  const timeToX = (timestamp: number) => {
    const { min, max } = chartData.timeRange;
    if (max === min) return margin.left;

    // Extend effective plot width slightly when trend clouds are present
    const effectivePlotWidth = (trendClouds && trendClouds.length > 0) ? plotWidth + 50 : plotWidth;
    return margin.left + ((timestamp - min) / (max - min)) * effectivePlotWidth;
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

      // Calculate current cursor price from Y position using yToPrice function
      const clampedMouseY = Math.max(margin.top, Math.min(margin.top + plotHeight, mouseY));
      const currentPrice = yToPrice(clampedMouseY);

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
          price: candle.close // Use actual candle close price instead of cursor position
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
  }, [isDragging, dragStart, viewport, data?.length, plotWidth, chartData.candles, chartData.priceRange, margin.left, margin.top, plotHeight, yToPrice]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setCrosshair({ x: -1, y: -1, visible: false });
    setTooltip({ x: -1, y: -1, visible: false, candle: null, price: 0 });
    setIsDragging(false);
  }, []);

  // Helper function to format numbers to exactly 2 significant digits
  const formatTo2SigFigs = useCallback((num: number): string => {
    if (num === 0) return '0.0';

    // Get the order of magnitude
    const magnitude = Math.floor(Math.log10(Math.abs(num)));

    // Calculate the factor to get 2 significant digits
    const factor = Math.pow(10, 1 - magnitude);

    // Round to 2 significant digits
    const rounded = Math.round(num * factor) / factor;

    // Format based on magnitude
    if (magnitude >= 3) {
      // For thousands and above, show as K
      return (rounded / 1000).toFixed(magnitude >= 4 ? 0 : 1) + 'K';
    } else if (magnitude >= 1) {
      // For 10-999, show as whole numbers or 1 decimal
      return magnitude >= 2 ? rounded.toFixed(0) : rounded.toFixed(1);
    } else if (magnitude >= 0) {
      // For 1-9.9, show 1 decimal place
      return rounded.toFixed(1);
    } else {
      // For < 1, show appropriate decimal places to get 2 sig figs
      const decimals = Math.max(0, 1 - magnitude);
      return rounded.toFixed(decimals);
    }
  }, []);

  // Helper function to generate nice round numbers for ticks
  const generateNiceNumbers = useCallback((min: number, max: number, targetCount: number = 8) => {
    const range = max - min;
    const roughStep = range / targetCount;

    // Calculate nice step size
    const magnitude = Math.floor(Math.log10(roughStep));
    const normalizedStep = roughStep / Math.pow(10, magnitude);

    let niceStep;
    if (normalizedStep <= 1) niceStep = 1;
    else if (normalizedStep <= 2) niceStep = 2;
    else if (normalizedStep <= 5) niceStep = 5;
    else niceStep = 10;

    const step = niceStep * Math.pow(10, magnitude);

    // Generate ticks starting from a nice round number
    const startTick = Math.ceil(min / step) * step;
    const numbers = [];

    for (let value = startTick; value <= max + step * 0.001; value += step) {
      if (value >= min && value <= max) {
        numbers.push(value);
      }
    }

    return numbers;
  }, []);

  // Generate Y-axis ticks aligned with logarithmic price scale
  const yTicks = useMemo(() => {
    const { min, max } = chartData.priceRange;
    const ticks = [];

    if (min > 0 && max > 0) {
      // For small price ranges, use nice linear numbers
      if (max / min < 2) {
        const niceNumbers = generateNiceNumbers(min, max, 8);
        niceNumbers.forEach(value => {
          ticks.push({
            value,
            y: priceToY(value),
            label: `$${formatTo2SigFigs(value)}`
          });
        });
      } else {
        // For larger ranges, use logarithmic spacing but round to nice numbers
        const logMin = Math.log(min);
        const logMax = Math.log(max);
        const logRange = logMax - logMin;
        const targetTickCount = 8;

        for (let i = 0; i <= targetTickCount; i++) {
          const logValue = logMin + (logRange * i) / targetTickCount;
          let value = Math.exp(logValue);

          // Round to a "nice" number based on magnitude
          const magnitude = Math.floor(Math.log10(value));
          const factor = Math.pow(10, magnitude - 1); // Keep 2 significant digits
          value = Math.round(value / factor) * factor;

          // Avoid duplicates and ensure within range
          if (value >= min && value <= max && !ticks.some(t => Math.abs(t.value - value) < value * 0.01)) {
            ticks.push({
              value,
              y: priceToY(value),
              label: `$${formatTo2SigFigs(value)}`
            });
          }
        }
      }
    } else {
      // Fallback to nice linear numbers for edge cases
      const niceNumbers = generateNiceNumbers(min, max, 8);
      niceNumbers.forEach(value => {
        ticks.push({
          value,
          y: priceToY(value),
          label: `$${formatTo2SigFigs(value)}`
        });
      });
    }

    // Verify tick alignment by checking if priceToY/yToPrice are consistent
    if (ticks.length > 0) {
      const testTick = ticks[Math.floor(ticks.length / 2)];
      const roundTripPrice = yToPrice(testTick.y);
      const alignment = Math.abs(roundTripPrice - testTick.value) / testTick.value;

      if (alignment > 0.001) { // 0.1% tolerance
        console.warn('🚨 Y-axis alignment issue detected:', {
          originalPrice: testTick.value,
          roundTripPrice,
          alignmentError: `${(alignment * 100).toFixed(3)}%`,
          yPosition: testTick.y
        });
      }
    }

    return ticks;
  }, [chartData.priceRange, priceToY, yToPrice, formatTo2SigFigs, generateNiceNumbers]);

  // Generate X-axis ticks based on month boundaries in the current viewport + extended range
  const xTicks = useMemo(() => {
    if (!chartData.candles || chartData.candles.length === 0) return [];

    const ticks = [];
    const seenMonths = new Set<string>();
    const viewportDays = viewport.endIndex - viewport.startIndex;

    // Look through the visible candles for month/year boundaries
    for (let i = 0; i < chartData.candles.length; i++) {
      const candle = chartData.candles[i];
      if (candle) {
        const date = new Date(candle.timestamp);
        const month = date.getMonth();
        const year = date.getFullYear();

        // For different viewport sizes, show different granularities
        let shouldAddTick = false;
        let tickKey = '';

        if (viewportDays <= 90) {
          // For periods <= 3 months: show every month
          tickKey = `${year}-${month}`;
          shouldAddTick = !seenMonths.has(tickKey);
        } else if (viewportDays <= 730) {
          // For periods <= 2 years: show every 3 months (quarters)
          const quarter = Math.floor(month / 3) * 3; // 0, 3, 6, 9
          tickKey = `${year}-Q${Math.floor(quarter / 3)}`;
          shouldAddTick = !seenMonths.has(tickKey) && month === quarter;
        } else {
          // For periods > 2 years: show only January of each year
          tickKey = `${year}`;
          shouldAddTick = !seenMonths.has(tickKey) && month === 0; // January
        }

        if (shouldAddTick) {
          seenMonths.add(tickKey);

          ticks.push({
            x: indexToX(i),
            label: (() => {
              // Smart date formatting based on viewport size
              if (viewportDays <= 30) {
                return format(date, 'MMM dd'); // Show month and day for short periods
              } else if (viewportDays <= 365) {
                return format(date, 'MMM yyyy'); // Show month/year for medium periods
              } else if (viewportDays <= 730) {
                return format(date, 'MMM yyyy'); // Show month/year for 2 year periods
              } else {
                return format(date, 'yyyy'); // Show only year for long periods
              }
            })()
          });
        }
      }
    }


    // If we don't have enough ticks, add some evenly spaced ones
    if (ticks.length < 3) {
      const { min, max } = chartData.timeRange;
      const tickCount = Math.min(6, chartData.candles.length);

      for (let i = 0; i < tickCount; i++) {
        const timestamp = min + (i / (tickCount - 1)) * (max - min);
        const date = new Date(timestamp);
        const x = timeToX(timestamp);

        // Avoid duplicates
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

    // Sort ticks by x position and remove duplicates
    const uniqueTicks = ticks.filter((tick, index, arr) =>
      index === 0 || Math.abs(tick.x - arr[index - 1].x) > 20
    );


    return uniqueTicks.sort((a, b) => a.x - b.x);
  }, [chartData.candles, chartData.timeRange, viewport, indexToX, timeToX]);

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
          style={{ overflow: 'visible' }}
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


          {/* Continuous Trend Cloud Visualization */}
          {showTrendCloud && trendClouds && Array.isArray(trendClouds) && trendClouds.length > 0 && (() => {
            // Get the chart time boundaries for filtering
            const firstCandle = chartData.candles[viewport.startIndex];
            const lastCandle = chartData.candles[viewport.endIndex - 1];
            const chartStartTime = firstCandle?.timestamp ? getTimestamp(firstCandle.timestamp) : 0;

            // Extend chart end time to include future projection dates when showing trend clouds
            const latestDataTime = lastCandle?.timestamp ? getTimestamp(lastCandle.timestamp) : Date.now();
            const maxProjectionTime = Math.max(
              ...trendClouds.map((cloud: any) => new Date(cloud.projection_end).getTime())
            );
            const chartEndTime = Math.max(latestDataTime, maxProjectionTime);

            // Use the chart's existing coordinate transformation functions
            // timeToX() and priceToY() are already defined above and handle viewport/scaling correctly

            // Filter clouds that have time overlap with the current chart viewport
            const visibleClouds = trendClouds.filter((cloud: any) => {
              const projectionStartTime = new Date(cloud.projection_start).getTime();
              const projectionEndTime = new Date(cloud.projection_end).getTime();

              // Show clouds whose projection period overlaps with the chart viewport
              return projectionEndTime >= chartStartTime &&
                     projectionStartTime <= chartEndTime &&
                     cloud.softmax_weight > 0.05; // Only show significant clouds
            });


            if (visibleClouds.length === 0) return null;

            return (
              <g className="continuous-trend-clouds">
                {visibleClouds.map((cloud: any, index: number) => {
                  // Calculate time boundaries using projection_start and projection_end
                  const projectionStartTime = new Date(cloud.projection_start).getTime();
                  const projectionEndTime = new Date(cloud.projection_end).getTime();

                  // Calculate X positions using the chart's timeToX function
                  const startX = timeToX(projectionStartTime);
                  const endX = timeToX(projectionEndTime);


                  // Skip if cloud has invalid dimensions or is outside visible area
                  const effectivePlotWidth = (trendClouds && trendClouds.length > 0) ? plotWidth + 50 : plotWidth;
                  if (startX >= endX || endX <= margin.left || startX >= margin.left + effectivePlotWidth) {
                    return null;
                  }

                  // Calculate Y positions using the chart's priceToY function (logarithmic scale for financial data)
                  const topPrice = cloud.price_range[1]; // Higher price (top boundary)
                  const bottomPrice = cloud.price_range[0]; // Lower price (bottom boundary)
                  const centerPrice = cloud.center_price; // Center price

                  const topY = priceToY(topPrice);
                  const bottomY = priceToY(bottomPrice);
                  const centerY = priceToY(centerPrice);

                  // Skip clouds outside the visible price range
                  if (bottomY < margin.top || topY > margin.top + plotHeight) {
                    return null;
                  }

                  // Styling based on cloud type and softmax_weight for emphasis
                  const isSupport = cloud.cloud_type === 'Support';
                  const baseOpacity = Math.max(0.15, Math.min(0.6, cloud.softmax_weight));
                  const strokeWidth = Math.max(1, Math.min(3, cloud.softmax_weight * 4));
                  const borderOpacity = Math.max(0.4, Math.min(0.9, cloud.softmax_weight * 1.2));

                  return (
                    <g key={`continuous-cloud-${cloud.cloud_id || cloud.id || index}-${index}`} className="trend-cloud">
                      {/* Cloud zone rectangle - bounded by projection_start/end (X) and price_range (Y) */}
                      <rect
                        x={startX}
                        y={topY}
                        width={endX - startX}
                        height={Math.max(2, bottomY - topY)}
                        fill={isSupport ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}
                        fillOpacity={baseOpacity}
                        stroke={isSupport ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
                        strokeWidth={0.8}
                        strokeOpacity={borderOpacity}
                        strokeDasharray="2,2"
                      />

                      {/* Center price line - emphasized based on softmax_weight */}
                      <line
                        x1={startX}
                        y1={centerY}
                        x2={endX}
                        y2={centerY}
                        stroke={isSupport ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'}
                        strokeWidth={strokeWidth}
                        strokeOpacity={borderOpacity}
                        strokeDasharray={isSupport ? '0' : '6,3'}
                      />

                      {/* Cloud label with weight information */}
                      {cloud.softmax_weight > 0.1 && (endX - startX) > 80 && (
                        <>
                          <text
                            x={startX + 5}
                            y={centerY - 3}
                            fontSize="10"
                            fill={isSupport ? 'rgb(21, 128, 61)' : 'rgb(153, 27, 27)'}
                            fontWeight="600"
                            opacity={0.9}
                          >
                            {cloud.cloud_id} ${cloud.center_price.toFixed(2)}
                          </text>
                          <text
                            x={startX + 5}
                            y={centerY + 12}
                            fontSize="8"
                            fill={isSupport ? 'rgb(21, 128, 61)' : 'rgb(153, 27, 27)'}
                            opacity={0.7}
                          >
                            Weight: {(cloud.softmax_weight * 100).toFixed(1)}% | Lines: {cloud.unique_trendlines}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })()}

          {/* Moving Averages - Optimized Rendering */}
          {showMovingAverages && movingAveragesData.length > 0 && (() => {
            // Pre-calculate visible MA data to avoid nested loops
            const visibleMALines: Record<number, Array<{x: number, y: number}>> = {};

            // Initialize arrays for each period
            MA_PERIODS.forEach(period => {
              visibleMALines[period] = [];
            });

            // Build coordinate arrays for each MA period
            movingAveragesData.forEach((maData, idx) => {
              // Simple index-based positioning (much faster than timestamp matching)
              if (idx >= viewport.startIndex && idx < viewport.endIndex) {
                const visibleIndex = idx - viewport.startIndex;
                const x = indexToX(visibleIndex);

                maData.movingAverages.forEach(ma => {
                  const y = priceToY(ma.value);
                  visibleMALines[ma.period].push({ x, y });
                });
              }
            });

            // Render polylines for each MA (much more efficient than individual line segments)
            return (
              <g key="ma-lines">
                {MA_PERIODS.map(period => {
                  const points = visibleMALines[period];
                  if (points.length < 2) return null;

                  const pathData = points
                    .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                    .join(' ');

                  return (
                    <path
                      key={`ma-path-${period}`}
                      d={pathData}
                      fill="none"
                      stroke={getMAColor(period)}
                      strokeWidth={1.5}
                      strokeOpacity={0.8}
                    />
                  );
                })}
              </g>
            );
          })()}

          {/* High Volume VWAP Lines - Optimized */}
          {showHighVolumeVWAP && highVolumeVWAPLines && highVolumeVWAPLines.length > 0 && (() => {
            // Generate distinct colors for VWAP lines
            const vwapColors = [
              '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
              '#06b6d4', '#84cc16', '#f97316', '#ef4444', '#3b82f6'
            ];

            // Pre-build timestamp map for O(1) lookups
            const timestampMap = new Map<number, number>();
            chartData.candles.forEach((candle, index) => {
              const dayStart = new Date(getTimestamp(candle.timestamp));
              dayStart.setHours(0, 0, 0, 0);
              timestampMap.set(dayStart.getTime(), index);
            });

            // Show all 30 VWAP lines for complete institutional activity view
            const topVWAPLines = highVolumeVWAPLines;

            return (
              <g key="high-volume-vwap-lines">
                {topVWAPLines.map((vwapLine, lineIndex) => {
                  const lineColor = vwapColors[lineIndex % vwapColors.length];
                  const vwapPoints: Array<{x: number, y: number}> = [];
                  let anchorPoint: {x: number, y: number} | null = null;

                  // Build optimized coordinate array with viewport filtering
                  vwapLine.vwap_data.forEach((vwapPoint, pointIndex) => {
                    const pointDate = new Date(vwapPoint.date);
                    pointDate.setHours(0, 0, 0, 0);
                    const dayKey = pointDate.getTime();

                    const candleIndex = timestampMap.get(dayKey);
                    if (candleIndex !== undefined) {
                      const x = indexToX(candleIndex);
                      const y = priceToY(vwapPoint.vwap);

                      // Viewport filtering - only include points within visible area + small buffer
                      if (x >= margin.left - 50 && x <= margin.left + plotWidth + 50) {
                        vwapPoints.push({ x, y });

                        // Store first point as anchor
                        if (pointIndex === 0) {
                          anchorPoint = { x, y };
                        }
                      }
                    }
                  });

                  // Skip if insufficient visible points
                  if (vwapPoints.length < 2) return null;

                  // Optimize path generation - reduce points for long lines
                  let optimizedPoints = vwapPoints;
                  if (vwapPoints.length > 50) {
                    // Douglas-Peucker-like simplification for long lines
                    optimizedPoints = vwapPoints.filter((_, index) =>
                      index === 0 || index === vwapPoints.length - 1 || index % 2 === 0
                    );
                  }

                  const pathData = optimizedPoints
                    .map((point, idx) => `${idx === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
                    .join(' ');

                  // Calculate opacity and stroke width based on line importance
                  const opacity = lineIndex < 5 ? 0.8 : lineIndex < 10 ? 0.6 : 0.4;
                  const strokeWidth = lineIndex < 5 ? 2 : lineIndex < 10 ? 1.5 : 1;

                  return (
                    <g key={`hvwap-${lineIndex}`}>
                      {/* VWAP Line */}
                      <path
                        d={pathData}
                        fill="none"
                        stroke={lineColor}
                        strokeWidth={strokeWidth}
                        strokeOpacity={opacity}
                        strokeDasharray="3,3"
                      />

                      {/* Anchor point - only for top 10 lines to maintain clarity */}
                      {anchorPoint && lineIndex < 10 && (
                        <circle
                          cx={anchorPoint.x}
                          cy={anchorPoint.y}
                          r={2}
                          fill={lineColor}
                          fillOpacity={0.8}
                          stroke="white"
                          strokeWidth={0.5}
                        />
                      )}
                    </g>
                  );
                })}
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


            // Calculate line endpoints using the extended chart boundaries (including 10-day extension)
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
            // Use index-based positioning for even distribution of candles
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

            // Use index-based positioning to match candlesticks
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

            // Use index-based positioning to match candlesticks
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

          {/* Crosshair with price label */}
          {crosshair.visible && (() => {
            const clampedMouseY = Math.max(margin.top, Math.min(margin.top + plotHeight, crosshair.y));
            const currentPrice = yToPrice(clampedMouseY);

            return (
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

                {/* Price label on Y-axis */}
                <g className="price-label">
                  <rect
                    x={margin.left - 50}
                    y={clampedMouseY - 12}
                    width={48}
                    height={24}
                    fill="#333"
                    fillOpacity={0.9}
                    rx={3}
                    ry={3}
                    stroke="#666"
                    strokeWidth={1}
                  />
                  <text
                    x={margin.left - 26}
                    y={clampedMouseY + 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill="white"
                    fontWeight="bold"
                  >
                    ${currentPrice.toFixed(2)}
                  </text>
                </g>
              </g>
            );
          })()}

          {/* Tooltip */}
          {tooltip.visible && (() => {
            // Smart positioning to keep tooltip within bounds
            const tooltipWidth = tooltip.candle ? 160 : 110;
            const tooltipHeight = tooltip.candle ? 65 : 30;
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
                      height={65}
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
                      fill="#ffffff"
                      fontSize={11}
                    >
                      O: ${tooltip.candle.open.toFixed(2)}  H: ${tooltip.candle.high.toFixed(2)}
                    </text>
                    <text
                      x={tooltipX + 5}
                      y={tooltipY + 55}
                      fill="#ffffff"
                      fontSize={11}
                    >
                      L: ${tooltip.candle.low.toFixed(2)}   C: ${tooltip.candle.close.toFixed(2)}
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
