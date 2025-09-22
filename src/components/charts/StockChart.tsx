'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RechartsFunction
} from 'recharts';
import { format } from 'date-fns';
import { MarketData, IndicatorSeries } from '@/types';

interface StockChartProps {
  data: MarketData[];
  indicators?: IndicatorSeries[];
  height?: number;
  showVolume?: boolean;
  timeframe?: string;
}

interface ChartDataPoint {
  timestamp: string;
  date: Date;
  price: number;
  volume?: number;
  [key: string]: any;
}

export const StockChart: React.FC<StockChartProps> = ({
  data,
  indicators = [],
  height = 400,
  showVolume = false,
  timeframe = '1d'
}) => {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    const chartPoints: ChartDataPoint[] = data.map(point => {
      const basePoint: ChartDataPoint = {
        timestamp: format(point.timestamp, 'MMM dd, yyyy'),
        date: point.timestamp,
        price: point.close,
        volume: showVolume ? point.volume : undefined
      };

      // Add indicator values for this timestamp
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
    if (name === 'price') {
      return [`$${value.toFixed(2)}`, 'Price'];
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
        return format(new Date(date), 'PPP p');
      }
    }
    return label;
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
        <LineChart
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
            scale="log"
            domain={['dataMin', 'dataMax']}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #ccc',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
            formatter={formatTooltipValue}
            labelFormatter={formatTooltipLabel}
          />
          <Legend />
          
          {/* Main price line */}
          <Line
            type="monotone"
            dataKey="price"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            name="Price"
            connectNulls={false}
          />
          
          {/* Volume line (if enabled) */}
          {showVolume && (
            <Line
              type="monotone"
              dataKey="volume"
              stroke="#64748b"
              strokeWidth={1}
              dot={false}
              name="Volume"
              yAxisId="volume"
              opacity={0.6}
            />
          )}
          
          {/* Indicator lines */}
          {indicators.map((indicator, index) => (
            <Line
              key={indicator.name}
              type="monotone"
              dataKey={indicator.name}
              stroke={getIndicatorColor(index)}
              strokeWidth={1.5}
              dot={false}
              name={indicator.name}
              connectNulls={false}
              strokeDasharray={indicator.type === 'support_resistance' ? '5 5' : undefined}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;