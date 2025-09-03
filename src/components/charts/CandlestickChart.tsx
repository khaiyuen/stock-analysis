'use client';

import React, { useMemo } from 'react';
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  Line
} from 'recharts';
import { format } from 'date-fns';
import { MarketData, IndicatorSeries, PivotPoint, TrendLine, ConvergenceZone, Timeframe } from '@/types';

interface CandlestickChartProps {
  data: MarketData[];
  indicators?: IndicatorSeries[];
  pivotPoints?: PivotPoint[];
  trendLines?: TrendLine[];
  convergenceZones?: ConvergenceZone[];
  timeframe?: Timeframe;
  height?: number;
  showVolume?: boolean;
  showPivots?: boolean;
  showTrendlines?: boolean;
  showConvergence?: boolean;
}

interface CandlestickDataPoint {
  timestamp: string;
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  color: string;
  [key: string]: any;
}

// Custom Candlestick component
const Candlestick: React.FC<any> = ({ payload, x, y, width, height }) => {
  if (!payload) return null;
  
  const { open, high, low, close, color } = payload;
  const candleWidth = Math.max(width * 0.6, 2);
  const wickWidth = 1;
  
  const centerX = x + width / 2;
  const candleX = centerX - candleWidth / 2;
  
  const openY = y + height - ((open - low) / (high - low)) * height;
  const closeY = y + height - ((close - low) / (high - low)) * height;
  const highY = y;
  const lowY = y + height;
  
  const candleTop = Math.min(openY, closeY);
  const candleBottom = Math.max(openY, closeY);
  const candleHeight = Math.abs(candleBottom - candleTop) || 1;

  return (
    <g>
      {/* High-Low Wick */}
      <line
        x1={centerX}
        y1={highY}
        x2={centerX}
        y2={lowY}
        stroke={color}
        strokeWidth={wickWidth}
      />
      
      {/* Open-Close Body */}
      <rect
        x={candleX}
        y={candleTop}
        width={candleWidth}
        height={candleHeight}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  );
};

// Trendline component
const TrendlineOverlay: React.FC<{
  trendLines: TrendLine[];
  data: CandlestickDataPoint[];
  chartWidth: number;
  chartHeight: number;
  margin: { top: number; right: number; left: number; bottom: number };
  yScale: any;
  xScale: any;
}> = ({ trendLines, data, chartWidth, chartHeight, margin, yScale, xScale }) => {
  const getLineColor = (line: TrendLine) => {
    if (line.type === 'SUPPORT') return '#22c55e'; // Green
    if (line.type === 'RESISTANCE') return '#ef4444'; // Red
    return '#6b7280'; // Gray default
  };
  
  const getLineOpacity = (line: TrendLine) => {
    return Math.min(0.4 + (line.strength * 0.6), 1);
  };
  
  const getStrokeWidth = (line: TrendLine) => {
    return Math.max(1, line.strength * 3);
  };

  return (
    <g>
      {trendLines.map((line) => {
        const startTime = line.startPoint.timestamp.getTime();
        const endTime = line.endPoint.timestamp.getTime();
        
        const x1 = xScale(startTime);
        const y1 = yScale(line.startPoint.price);
        const x2 = xScale(endTime);
        const y2 = yScale(line.endPoint.price);
        
        return (
          <g key={line.id}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={getLineColor(line)}
              strokeWidth={getStrokeWidth(line)}
              strokeOpacity={getLineOpacity(line)}
              strokeDasharray={line.type === 'RESISTANCE' ? '4 2' : undefined}
            />
            {/* Touch points */}
            {line.touchPoints?.map((point, idx) => (
              <circle
                key={`${line.id}-touch-${idx}`}
                cx={xScale(point.timestamp.getTime())}
                cy={yScale(point.price)}
                r={2}
                fill={getLineColor(line)}
                fillOpacity={0.8}
              />
            ))}
          </g>
        );
      })}
    </g>
  );
};

// Pivot points component
const PivotPointsOverlay: React.FC<{
  pivotPoints: PivotPoint[];
  data: CandlestickDataPoint[];
  chartWidth: number;
  chartHeight: number;
  margin: { top: number; right: number; left: number; bottom: number };
  yScale: any;
  xScale: any;
}> = ({ pivotPoints, data, chartWidth, chartHeight, margin, yScale, xScale }) => {
  const getPivotColor = (pivot: PivotPoint) => {
    return pivot.type === 'HIGH' ? '#ef4444' : '#22c55e';
  };
  
  const getPivotSize = (pivot: PivotPoint) => {
    return Math.max(3, pivot.strength * 6);
  };

  return (
    <g>
      {pivotPoints.map((pivot) => {
        const x = xScale(pivot.timestamp.getTime());
        const y = yScale(pivot.price);
        const size = getPivotSize(pivot);
        
        return (
          <g key={pivot.id}>
            {pivot.type === 'HIGH' ? (
              // Downward triangle for highs
              <polygon
                points={`${x},${y-size} ${x-size},${y+size} ${x+size},${y+size}`}
                fill={getPivotColor(pivot)}
                fillOpacity={0.8}
                stroke="#fff"
                strokeWidth={1}
              />
            ) : (
              // Upward triangle for lows
              <polygon
                points={`${x},${y+size} ${x-size},${y-size} ${x+size},${y-size}`}
                fill={getPivotColor(pivot)}
                fillOpacity={0.8}
                stroke="#fff"
                strokeWidth={1}
              />
            )}
          </g>
        );
      })}
    </g>
  );
};

// Convergence zones component
const ConvergenceZonesOverlay: React.FC<{
  convergenceZones: ConvergenceZone[];
  data: CandlestickDataPoint[];
  chartWidth: number;
  chartHeight: number;
  margin: { top: number; right: number; left: number; bottom: number };
  yScale: any;
  xScale: any;
}> = ({ convergenceZones, data, chartWidth, chartHeight, margin, yScale, xScale }) => {
  const getZoneColor = (zone: ConvergenceZone) => {
    if (zone.strength > 0.8) return '#fbbf24'; // High strength - amber
    if (zone.strength > 0.6) return '#60a5fa'; // Medium strength - blue
    return '#9ca3af'; // Low strength - gray
  };

  return (
    <g>
      {convergenceZones.map((zone) => {
        const x = xScale(zone.priceLevel);
        const yMin = yScale(zone.priceLevel - zone.tolerance);
        const yMax = yScale(zone.priceLevel + zone.tolerance);
        const zoneHeight = Math.abs(yMax - yMin);
        
        return (
          <g key={zone.id}>
            <rect
              x={margin.left}
              y={Math.min(yMin, yMax)}
              width={chartWidth - margin.left - margin.right}
              height={Math.max(zoneHeight, 2)}
              fill={getZoneColor(zone)}
              fillOpacity={0.2}
            />
            <line
              x1={margin.left}
              y1={yScale(zone.priceLevel)}
              x2={chartWidth - margin.right}
              y2={yScale(zone.priceLevel)}
              stroke={getZoneColor(zone)}
              strokeWidth={2}
              strokeOpacity={0.6}
              strokeDasharray="6 4"
            />
          </g>
        );
      })}
    </g>
  );
};

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  data,
  indicators = [],
  pivotPoints = [],
  trendLines = [],
  convergenceZones = [],
  timeframe,
  height = 500,
  showVolume = true,
  showPivots = true,
  showTrendlines = true,
  showConvergence = true
}) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const chartPoints: CandlestickDataPoint[] = data.map(point => {
      const isGreen = point.close >= point.open;
      const basePoint: CandlestickDataPoint = {
        timestamp: format(point.timestamp, 'MMM dd'),
        date: point.timestamp,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: showVolume ? point.volume : undefined,
        color: isGreen ? '#22c55e' : '#ef4444' // Green for up, red for down
      };

      // Add indicator values
      indicators.forEach(indicator => {
        const indicatorPoint = indicator.values.find(
          v => v.timestamp.getTime() === point.timestamp.getTime()
        );
        if (indicatorPoint && indicatorPoint.value !== null) {
          basePoint[indicator.name] = indicatorPoint.value;
        }
      });

      return basePoint;
    });

    return chartPoints;
  }, [data, indicators, showVolume]);

  const formatTooltipValue = (value: any, name: string) => {
    if (name === 'volume') {
      return [new Intl.NumberFormat().format(value), 'Volume'];
    }
    if (['open', 'high', 'low', 'close'].includes(name)) {
      return [`$${value.toFixed(2)}`, name.toUpperCase()];
    }
    if (typeof value === 'number') {
      return [value.toFixed(2), name];
    }
    return [value, name];
  };

  const formatTooltipLabel = (label: string, payload: any[]) => {
    if (payload && payload[0]) {
      const date = payload[0].payload?.date;
      if (date) {
        return format(new Date(date), 'PPP');
      }
    }
    return label;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    if (!data) return null;

    return (
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3">
        <p className="font-medium text-gray-900 mb-2">
          {format(new Date(data.date), 'PPP')}
        </p>
        <div className="space-y-1">
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Open:</span>
            <span className="font-medium">${data.open.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">High:</span>
            <span className="font-medium">${data.high.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Low:</span>
            <span className="font-medium">${data.low.toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-600">Close:</span>
            <span className="font-medium">${data.close.toFixed(2)}</span>
          </div>
          {data.volume && (
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">Volume:</span>
              <span className="font-medium">{new Intl.NumberFormat().format(data.volume)}</span>
            </div>
          )}
          {indicators.map(indicator => {
            const value = data[indicator.name];
            if (value !== undefined && value !== null) {
              return (
                <div key={indicator.name} className="flex justify-between gap-4">
                  <span className="text-gray-600">{indicator.name}:</span>
                  <span className="font-medium">{value.toFixed(2)}</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  };

  const getIndicatorColor = (index: number): string => {
    const colors = [
      '#8884d8', // Blue
      '#82ca9d', // Green  
      '#ffc658', // Orange
      '#ff7300', // Dark Orange
      '#00ff00', // Bright Green
      '#ff00ff', // Magenta
      '#00ffff', // Cyan
      '#ffff00'  // Yellow
    ];
    return colors[index % colors.length];
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-lg bg-gray-50">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="timestamp"
            stroke="#666"
            fontSize={12}
            tick={{ fontSize: 12 }}
            interval="preserveStartEnd"
          />
          <YAxis 
            stroke="#666"
            fontSize={12}
            tick={{ fontSize: 12 }}
            tickFormatter={(value) => `$${value.toFixed(2)}`}
            domain={['dataMin - 5', 'dataMax + 5']}
          />
          
          {/* Volume bars (if enabled) */}
          {showVolume && (
            <YAxis 
              yAxisId="volume"
              orientation="right"
              stroke="#666"
              fontSize={12}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
            />
          )}
          
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          
          {/* Volume bars */}
          {showVolume && (
            <Bar
              yAxisId="volume"
              dataKey="volume"
              fill="#64748b"
              opacity={0.3}
              name="Volume"
            />
          )}
          
          {/* Indicator lines */}
          {indicators.map((indicator, index) => (
            <Line
              key={indicator.name}
              type="monotone"
              dataKey={indicator.name}
              stroke={getIndicatorColor(index)}
              strokeWidth={2}
              dot={false}
              name={indicator.name}
              connectNulls={false}
              strokeDasharray={indicator.type === 'support_resistance' ? '5 5' : undefined}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      
      {/* Custom candlestick overlay */}
      <div className="relative -mt-[400px] pointer-events-none">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={chartData}
            margin={{
              top: 20,
              right: 30,
              left: 20,
              bottom: 20,
            }}
          >
            <XAxis 
              dataKey="timestamp"
              axisLine={false}
              tickLine={false}
              tick={false}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={false}
              domain={['dataMin - 5', 'dataMax + 5']}
            />
            <Bar
              dataKey="high"
              shape={Candlestick}
              fill="transparent"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default CandlestickChart;