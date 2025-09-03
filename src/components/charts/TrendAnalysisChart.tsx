'use client';

import React, { useMemo, useRef, useEffect, useState } from 'react';
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Bar,
  Line,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import { format } from 'date-fns';
import { MarketData, IndicatorSeries, PivotPoint, TrendLine, ConvergenceZone, Timeframe } from '@/types';

interface TrendAnalysisChartProps {
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
  timestampMs: number;
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

export const TrendAnalysisChart: React.FC<TrendAnalysisChartProps> = ({
  data,
  indicators = [],
  pivotPoints = [],
  trendLines = [],
  convergenceZones = [],
  timeframe,
  height = 600,
  showVolume = true,
  showPivots = true,
  showTrendlines = true,
  showConvergence = true
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chartDimensions, setChartDimensions] = useState({ width: 800, height: height });

  useEffect(() => {
    if (chartRef.current) {
      setChartDimensions({
        width: chartRef.current.offsetWidth,
        height: height
      });
    }
  }, [height, data]);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const chartPoints: CandlestickDataPoint[] = data.map(point => {
      const isGreen = point.close >= point.open;
      const basePoint: CandlestickDataPoint = {
        timestamp: format(point.timestamp, 'MMM dd HH:mm'),
        timestampMs: point.timestamp.getTime(),
        date: point.timestamp,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: showVolume ? point.volume : undefined,
        color: isGreen ? '#22c55e' : '#ef4444'
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

  const priceRange = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 100 };
    
    const prices = chartData.flatMap(d => [d.open, d.high, d.low, d.close]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.05;
    
    return { min: min - padding, max: max + padding };
  }, [chartData]);

  const timeRange = useMemo(() => {
    if (!chartData.length) return { min: 0, max: 1 };
    
    return {
      min: chartData[0].timestampMs,
      max: chartData[chartData.length - 1].timestampMs
    };
  }, [chartData]);

  const getLineColor = (line: TrendLine) => {
    if (line.type === 'SUPPORT') return '#22c55e';
    if (line.type === 'RESISTANCE') return '#ef4444';
    return '#6b7280';
  };

  const getPivotColor = (pivot: PivotPoint) => {
    return pivot.type === 'HIGH' ? '#ef4444' : '#22c55e';
  };

  const getZoneColor = (zone: ConvergenceZone) => {
    if (zone.strength > 0.8) return '#fbbf24';
    if (zone.strength > 0.6) return '#60a5fa';
    return '#9ca3af';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;

    const data = payload[0].payload;
    if (!data) return null;

    // Find pivot at this timestamp
    const pivot = pivotPoints.find(p => 
      Math.abs(p.timestamp.getTime() - data.timestampMs) < 60000
    );

    // Find trendlines that touch this point
    const touchingLines = trendLines.filter(line => 
      line.touchPoints?.some(tp => 
        Math.abs(tp.timestamp.getTime() - data.timestampMs) < 60000
      )
    );

    return (
      <div className="bg-white border border-gray-300 rounded-lg shadow-lg p-3 max-w-sm">
        <p className="font-medium text-gray-900 mb-2">
          {format(new Date(data.date), 'PPp')}
        </p>
        <div className="space-y-1">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">O:</span>
              <span className="font-medium ml-1">${data.open.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">H:</span>
              <span className="font-medium ml-1">${data.high.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">L:</span>
              <span className="font-medium ml-1">${data.low.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-gray-600">C:</span>
              <span className="font-medium ml-1">${data.close.toFixed(2)}</span>
            </div>
          </div>
          
          {data.volume && (
            <div className="text-sm">
              <span className="text-gray-600">Volume:</span>
              <span className="font-medium ml-1">{new Intl.NumberFormat().format(data.volume)}</span>
            </div>
          )}

          {pivot && (
            <div className="border-t pt-2 mt-2">
              <div className="text-sm font-medium text-blue-600">
                {pivot.type} Pivot (Strength: {pivot.strength.toFixed(2)})
              </div>
            </div>
          )}

          {touchingLines.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <div className="text-sm font-medium text-purple-600">
                Trendlines: {touchingLines.length}
              </div>
              {touchingLines.slice(0, 2).map((line, idx) => (
                <div key={idx} className="text-xs text-gray-600">
                  {line.type} (Strength: {line.strength.toFixed(2)})
                </div>
              ))}
            </div>
          )}

          {indicators.map(indicator => {
            const value = data[indicator.name];
            if (value !== undefined && value !== null) {
              return (
                <div key={indicator.name} className="text-sm">
                  <span className="text-gray-600">{indicator.name}:</span>
                  <span className="font-medium ml-1">{value.toFixed(2)}</span>
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>
    );
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border rounded-lg bg-gray-50">
        <p className="text-gray-500">No data available</p>
      </div>
    );
  }

  const margin = { top: 20, right: 30, left: 60, bottom: 40 };

  return (
    <div className="w-full">
      {/* Chart Title */}
      {timeframe && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800">
            Trend Analysis - {timeframe} Timeframe
          </h3>
          <div className="flex gap-4 text-sm text-gray-600 mt-1">
            <span>Pivots: {pivotPoints.length}</span>
            <span>Trendlines: {trendLines.length}</span>
            <span>Convergence Zones: {convergenceZones.length}</span>
          </div>
        </div>
      )}

      <div ref={chartRef} className="w-full">
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart
            data={chartData}
            margin={margin}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            
            {/* Convergence zones as reference areas */}
            {showConvergence && convergenceZones.map((zone) => (
              <ReferenceArea
                key={zone.id}
                y1={zone.priceLevel - zone.tolerance}
                y2={zone.priceLevel + zone.tolerance}
                fill={getZoneColor(zone)}
                fillOpacity={0.1}
              />
            ))}

            {/* Main price level lines for convergence zones */}
            {showConvergence && convergenceZones.map((zone) => (
              <ReferenceLine
                key={`${zone.id}-line`}
                y={zone.priceLevel}
                stroke={getZoneColor(zone)}
                strokeWidth={2}
                strokeOpacity={0.6}
                strokeDasharray="6 4"
              />
            ))}

            <XAxis 
              dataKey="timestampMs"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={(timestamp) => format(new Date(timestamp), 'MMM dd')}
              stroke="#666"
              fontSize={12}
            />
            
            <YAxis 
              domain={[priceRange.min, priceRange.max]}
              stroke="#666"
              fontSize={12}
              tick={{ fontSize: 12 }}
              tickFormatter={(value) => `$${value.toFixed(2)}`}
            />
            
            {/* Volume axis */}
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
                opacity={0.2}
                name="Volume"
              />
            )}
            
            {/* Indicator lines */}
            {indicators.map((indicator, index) => {
              const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300'];
              return (
                <Line
                  key={indicator.name}
                  type="monotone"
                  dataKey={indicator.name}
                  stroke={colors[index % colors.length]}
                  strokeWidth={2}
                  dot={false}
                  name={indicator.name}
                  connectNulls={false}
                />
              );
            })}

            {/* Candlestick overlay - handled by separate overlay */}
            <Bar
              dataKey="high"
              shape={Candlestick}
              fill="transparent"
            />
          </ComposedChart>
        </ResponsiveContainer>

        {/* Custom overlays for trendlines and pivots */}
        {(showTrendlines || showPivots) && (
          <div className="relative -mt-[20px] pointer-events-none">
            <svg
              width="100%"
              height={height - 40}
              style={{ position: 'absolute', top: 0, left: 0 }}
              viewBox={`0 0 ${chartDimensions.width} ${height - 40}`}
            >
              {/* Trendlines */}
              {showTrendlines && trendLines.map((line) => {
                const startTime = line.startPoint.timestamp.getTime();
                const endTime = line.endPoint.timestamp.getTime();
                
                // Calculate positions
                const x1 = margin.left + ((startTime - timeRange.min) / (timeRange.max - timeRange.min)) * (chartDimensions.width - margin.left - margin.right);
                const y1 = margin.top + ((priceRange.max - line.startPoint.price) / (priceRange.max - priceRange.min)) * (height - 60 - margin.top - margin.bottom);
                const x2 = margin.left + ((endTime - timeRange.min) / (timeRange.max - timeRange.min)) * (chartDimensions.width - margin.left - margin.right);
                const y2 = margin.top + ((priceRange.max - line.endPoint.price) / (priceRange.max - priceRange.min)) * (height - 60 - margin.top - margin.bottom);
                
                return (
                  <g key={line.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={getLineColor(line)}
                      strokeWidth={Math.max(1, line.strength * 3)}
                      strokeOpacity={Math.min(0.4 + (line.strength * 0.6), 1)}
                      strokeDasharray={line.type === 'RESISTANCE' ? '4 2' : undefined}
                    />
                    
                    {/* Touch points */}
                    {line.touchPoints?.map((point, idx) => {
                      const px = margin.left + ((point.timestamp.getTime() - timeRange.min) / (timeRange.max - timeRange.min)) * (chartDimensions.width - margin.left - margin.right);
                      const py = margin.top + ((priceRange.max - point.price) / (priceRange.max - priceRange.min)) * (height - 60 - margin.top - margin.bottom);
                      
                      return (
                        <circle
                          key={`${line.id}-touch-${idx}`}
                          cx={px}
                          cy={py}
                          r={2}
                          fill={getLineColor(line)}
                          fillOpacity={0.8}
                        />
                      );
                    })}
                  </g>
                );
              })}

              {/* Pivot points */}
              {showPivots && pivotPoints.map((pivot) => {
                const px = margin.left + ((pivot.timestamp.getTime() - timeRange.min) / (timeRange.max - timeRange.min)) * (chartDimensions.width - margin.left - margin.right);
                const py = margin.top + ((priceRange.max - pivot.price) / (priceRange.max - priceRange.min)) * (height - 60 - margin.top - margin.bottom);
                const size = Math.max(3, pivot.strength * 6);
                
                return (
                  <g key={pivot.id}>
                    {pivot.type === 'HIGH' ? (
                      <polygon
                        points={`${px},${py-size} ${px-size},${py+size} ${px+size},${py+size}`}
                        fill={getPivotColor(pivot)}
                        fillOpacity={0.8}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    ) : (
                      <polygon
                        points={`${px},${py+size} ${px-size},${py-size} ${px+size},${py-size}`}
                        fill={getPivotColor(pivot)}
                        fillOpacity={0.8}
                        stroke="#fff"
                        strokeWidth={1}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Legend for trend analysis elements */}
      {(showPivots || showTrendlines || showConvergence) && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="flex flex-wrap gap-4 text-sm">
            {showPivots && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-500 transform rotate-45" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
                  <span>High Pivots</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-500" style={{ clipPath: 'polygon(50% 100%, 0% 0%, 100% 0%)' }}></div>
                  <span>Low Pivots</span>
                </div>
              </>
            )}
            {showTrendlines && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-green-500"></div>
                  <span>Support Lines</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-0.5 bg-red-500" style={{ borderStyle: 'dashed' }}></div>
                  <span>Resistance Lines</span>
                </div>
              </>
            )}
            {showConvergence && (
              <>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2 bg-amber-400 opacity-30"></div>
                  <span>Strong Convergence</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2 bg-blue-400 opacity-30"></div>
                  <span>Medium Convergence</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendAnalysisChart;