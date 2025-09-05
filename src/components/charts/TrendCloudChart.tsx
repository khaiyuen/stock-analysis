'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { format, addDays } from 'date-fns';
import { TrendCloudData } from '@/lib/trendCloud';

// New data format from full rolling analysis API
interface FullAnalysisWindow {
  window_id: string;
  date: string;
  current_price: number;
  data_points: number;
  pivots: number;
  trendlines: number;
  total_clusters: number;
  resistance_levels: number;
  support_levels: number;
  strongest_cluster_weight: number;
  strongest_cluster_price: number;
  strongest_cluster_type: 'Resistance' | 'Support';
}

interface TrendCloudChartProps {
  clouds?: TrendCloudData[];
  fullAnalysisData?: FullAnalysisWindow[];
  currentPrice?: number;
  className?: string;
  width?: number;
  height?: number;
  symbol?: string;
}

interface ChartPoint {
  date: Date;
  price: number;
  weight: number;
  normalizedWeight: number;
  density: number;
  confidence: number;
  trendlineCount: number;
}

export const TrendCloudChart: React.FC<TrendCloudChartProps> = ({
  clouds,
  fullAnalysisData,
  currentPrice = 400,
  className = '',
  width = 800,
  height = 500,
  symbol = 'Stock'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Process clouds or full analysis data into chart data
  const chartData = useMemo(() => {
    // Handle new full analysis data format
    if (fullAnalysisData && fullAnalysisData.length > 0) {
      const points: ChartPoint[] = [];
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      let minDate = new Date(fullAnalysisData[0].date);
      let maxDate = new Date(fullAnalysisData[fullAnalysisData.length - 1].date);
      let maxWeight = 0;
      let maxDensity = 0;
      
      // Transform full analysis windows into chart points
      fullAnalysisData.forEach(window => {
        const windowDate = new Date(window.date);
        const predictionDate = addDays(windowDate, 5); // 5-day prediction
        
        if (window.strongest_cluster_price > 0) {
          const weight = window.strongest_cluster_weight;
          const density = Math.min(1, Math.max(0.1, weight * 2)); // Scale for visibility
          
          const chartPoint: ChartPoint = {
            date: predictionDate,
            price: window.strongest_cluster_price,
            weight: weight,
            normalizedWeight: weight,
            density: density,
            confidence: Math.min(1, weight * 3),
            trendlineCount: window.trendlines
          };
          
          points.push(chartPoint);
          
          minPrice = Math.min(minPrice, window.strongest_cluster_price);
          maxPrice = Math.max(maxPrice, window.strongest_cluster_price);
          maxWeight = Math.max(maxWeight, weight);
          maxDensity = Math.max(maxDensity, density);
          
          if (predictionDate > maxDate) maxDate = predictionDate;
        }
      });
      
      // Add padding to price range
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * 0.1 || 10;
      minPrice -= padding;
      maxPrice += padding;
      
      // Add time padding
      minDate = addDays(minDate, -7);
      maxDate = addDays(maxDate, 7);
      
      return {
        points,
        bounds: {
          minPrice,
          maxPrice,
          minDate,
          maxDate,
          maxWeight,
          maxDensity
        }
      };
    }
    
    // Handle legacy cloud data format
    if (clouds && clouds.length > 0) {
      const points: ChartPoint[] = [];
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      let minDate = new Date(clouds[0].targetDate);
      let maxDate = new Date(clouds[clouds.length - 1].targetDate);
      let maxWeight = 0;
      let maxDensity = 0;
      
      clouds.forEach(cloud => {
        cloud.cloudPoints.forEach(point => {
          const chartPoint: ChartPoint = {
            date: new Date(cloud.targetDate),
            price: point.priceLevel,
            weight: point.weight,
            normalizedWeight: point.normalizedWeight,
            density: point.density,
            confidence: point.confidence,
            trendlineCount: point.trendlineCount
          };
          
          points.push(chartPoint);
          
          minPrice = Math.min(minPrice, point.priceLevel);
          maxPrice = Math.max(maxPrice, point.priceLevel);
          maxWeight = Math.max(maxWeight, point.weight);
          maxDensity = Math.max(maxDensity, point.density);
        });
      });
      
      // Add padding to price range
      const priceRange = maxPrice - minPrice;
      const padding = priceRange * 0.1;
      minPrice -= padding;
      maxPrice += padding;
      
      return {
        points,
        bounds: {
          minPrice,
          maxPrice,
          minDate,
          maxDate,
          maxWeight,
          maxDensity
        }
      };
    }
    
    // No data
    return { points: [], bounds: null };
  }, [clouds, fullAnalysisData]);

  // Draw the chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !chartData.bounds) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size
    canvas.width = width;
    canvas.height = height;
    
    const { bounds, points } = chartData;
    const margin = { top: 40, right: 80, bottom: 60, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Helper functions for coordinate conversion
    const getX = (date: Date) => {
      const timeDiff = date.getTime() - bounds.minDate.getTime();
      const totalTime = bounds.maxDate.getTime() - bounds.minDate.getTime();
      return margin.left + (timeDiff / totalTime) * chartWidth;
    };
    
    const getY = (price: number) => {
      const priceDiff = price - bounds.minPrice;
      const totalPrice = bounds.maxPrice - bounds.minPrice;
      return margin.top + chartHeight - (priceDiff / totalPrice) * chartHeight;
    };
    
    // Draw grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines (price levels)
    const priceStep = (bounds.maxPrice - bounds.minPrice) / 8;
    for (let i = 0; i <= 8; i++) {
      const price = bounds.minPrice + i * priceStep;
      const y = getY(price);
      
      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();
      
      // Price labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`$${price.toFixed(2)}`, margin.left - 10, y + 4);
    }
    
    // Vertical grid lines (dates)
    const timeStep = (bounds.maxDate.getTime() - bounds.minDate.getTime()) / 6;
    for (let i = 0; i <= 6; i++) {
      const date = new Date(bounds.minDate.getTime() + i * timeStep);
      const x = getX(date);
      
      ctx.beginPath();
      ctx.moveTo(x, margin.top);
      ctx.lineTo(x, height - margin.bottom);
      ctx.stroke();
      
      // Date labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(format(date, 'MMM dd'), x, height - margin.bottom + 20);
    }
    
    // Draw current price line
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    const currentPriceY = getY(currentPrice);
    ctx.beginPath();
    ctx.moveTo(margin.left, currentPriceY);
    ctx.lineTo(width - margin.right, currentPriceY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Current price label
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Current: $${currentPrice.toFixed(2)}`, width - margin.right + 10, currentPriceY + 5);
    
    // Draw trend cloud points with density-based shading
    points.forEach(point => {
      const x = getX(point.date);
      const y = getY(point.price);
      
      // Use density for visual intensity - high density = concentrated = dark/intense
      const densityRatio = bounds.maxDensity > 0 ? point.density / bounds.maxDensity : 0;
      const normalizedWeight = point.normalizedWeight;
      
      // Opacity: concentrated predictions (high density) should be MORE opaque
      const minOpacity = 0.1;
      const maxOpacity = 0.9;
      const densityOpacity = minOpacity + (densityRatio * (maxOpacity - minOpacity));
      const weightBoost = normalizedWeight * 0.15; // Small weight boost
      const opacity = Math.min(maxOpacity, densityOpacity + weightBoost);
      
      // Radius: concentrated predictions should be smaller but more intense
      const baseRadius = 3;
      const densityRadius = baseRadius + (densityRatio * 4); // Concentrated = slightly larger
      const weightRadius = normalizedWeight * 8; // Weight contributes to size
      const radius = Math.max(2, Math.max(densityRadius, weightRadius));
      
      // Color: concentrated predictions should be more saturated and darker
      const hue = point.confidence * 120; // 0 = red, 120 = green
      const baseSaturation = 40;
      const maxSaturation = 80;
      const saturation = baseSaturation + (densityRatio * (maxSaturation - baseSaturation));
      
      const baseLightness = 60;
      const minLightness = 25;
      const lightness = baseLightness - (densityRatio * (baseLightness - minLightness));
      
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${opacity})`;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add border for concentrated points (high density)
      if (densityRatio > 0.4) {
        const borderSaturation = Math.min(100, saturation + 25);
        const borderLightness = Math.max(15, lightness - 15);
        ctx.strokeStyle = `hsla(${hue}, ${borderSaturation}%, ${borderLightness}%, ${Math.min(1, opacity + 0.2)})`;
        ctx.lineWidth = densityRatio > 0.7 ? 2 : 1;
        ctx.stroke();
      }
      
      // Add strong glow for very concentrated predictions
      if (densityRatio > 0.6) {
        const glowRadius = radius * 2;
        const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, glowRadius);
        const glowOpacity = (densityRatio - 0.6) * 0.4; // Scale glow with concentration
        gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${glowOpacity})`);
        gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 20}%, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    
    // Draw peak prices for each cloud
    clouds.forEach(cloud => {
      const x = getX(new Date(cloud.targetDate));
      const y = getY(cloud.summary.peakPrice);
      
      // Peak marker
      ctx.fillStyle = '#7c3aed';
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 2 * Math.PI);
      ctx.fill();
      
      // Peak border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    // Chart title and labels
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const title = fullAnalysisData 
      ? `${symbol} Full Analysis - 5-Day Predictions`
      : 'Trend Cloud Prediction (5-Day Rolling)';
    ctx.fillText(title, width / 2, 25);
    
    // Y-axis label
    ctx.save();
    ctx.translate(20, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Price ($)', 0, 0);
    ctx.restore();
    
    // X-axis label
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Target Date', width / 2, height - 10);
    
    // Legend
    const legendX = width - margin.right + 10;
    let legendY = margin.top + 60;
    
    // Density legend
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Density', legendX, legendY);
    legendY += 20;
    
    // Density circles showing concentration levels
    [
      { density: 0.2, label: 'Low' },
      { density: 0.5, label: 'Med' },
      { density: 0.8, label: 'High' },
      { density: 1.0, label: 'Peak' }
    ].forEach((item, index) => {
      const opacity = Math.max(0.15, item.density * 0.8);
      const saturation = 50 + (item.density * 30);
      const lightness = 50 - (item.density * 10);
      
      ctx.fillStyle = `hsla(240, ${saturation}%, ${lightness}%, ${opacity})`;
      const radius = 2 + item.density * 4;
      ctx.beginPath();
      ctx.arc(legendX + 10, legendY, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add border for high density
      if (item.density > 0.6) {
        ctx.strokeStyle = `hsla(240, ${saturation + 20}%, ${lightness - 10}%, ${opacity + 0.2})`;
        ctx.lineWidth = item.density > 0.8 ? 2 : 1;
        ctx.stroke();
      }
      
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(item.label, legendX + 25, legendY + 3);
      legendY += 18;
    });
    
    legendY += 10;
    
    // Confidence legend
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText('Confidence', legendX, legendY);
    legendY += 20;
    
    // Confidence colors
    [
      { confidence: 0.3, color: 'hsla(0, 70%, 50%, 0.8)', label: 'Low' },
      { confidence: 0.6, color: 'hsla(60, 70%, 50%, 0.8)', label: 'Med' },
      { confidence: 0.9, color: 'hsla(120, 70%, 50%, 0.8)', label: 'High' }
    ].forEach(item => {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(legendX + 10, legendY, 4, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#6b7280';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(item.label, legendX + 25, legendY + 3);
      legendY += 16;
    });
    
    // Peak markers legend
    legendY += 10;
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.arc(legendX + 10, legendY, 6, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.fillStyle = '#374151';
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText('Peak Price', legendX + 25, legendY + 3);
    
  }, [chartData, currentPrice, width, height]);

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-auto"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      
      {/* Info Panel */}
      {(clouds && clouds.length > 0) || (fullAnalysisData && fullAnalysisData.length > 0) && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            {fullAnalysisData ? (
              <>
                <div>
                  <span className="font-medium">Total Windows:</span> {fullAnalysisData.length}
                </div>
                <div>
                  <span className="font-medium">Five-Cluster Windows:</span> {fullAnalysisData.filter(w => w.total_clusters === 5).length}
                </div>
              </>
            ) : clouds ? (
              <>
                <div>
                  <span className="font-medium">Convergence Zones:</span> {clouds.reduce((sum, c) => sum + (c.summary.convergenceZoneCount || 0), 0)}
                </div>
                <div>
                  <span className="font-medium">Lookback:</span> {clouds[0]?.lookbackDays || 365} days
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
      
      {/* Chart Stats */}
      {chartData.bounds && (
        <div className="px-4 py-3 bg-gray-50 border-t">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Price Range:</span>
              <div className="font-medium">
                ${chartData.bounds.minPrice.toFixed(2)} - ${chartData.bounds.maxPrice.toFixed(2)}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Date Range:</span>
              <div className="font-medium">
                {format(chartData.bounds.minDate, 'MMM dd')} - {format(chartData.bounds.maxDate, 'MMM dd')}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Total Points:</span>
              <div className="font-medium">{chartData.points.length}</div>
            </div>
            <div>
              <span className="text-gray-600">Max Density:</span>
              <div className="font-medium">{(chartData.bounds.maxDensity * 100).toFixed(0)}%</div>
            </div>
            <div>
              <span className="text-gray-600">
                {fullAnalysisData ? 'Success Rate:' : 'Total Weight:'}
              </span>
              <div className="font-medium">
                {fullAnalysisData ? (
                  fullAnalysisData.length > 0 
                    ? ((fullAnalysisData.filter(w => w.total_clusters === 5).length / fullAnalysisData.length) * 100).toFixed(1) + '%'
                    : '0%'
                ) : (
                  clouds && clouds.length > 0 ? clouds[0].summary.totalWeight.toFixed(0) : 'N/A'
                )}
              </div>
            </div>
            <div>
              <span className="text-gray-600">
                {fullAnalysisData ? 'Avg Clusters:' : 'Zones/Day:'}
              </span>
              <div className="font-medium">
                {fullAnalysisData ? (
                  fullAnalysisData.length > 0 
                    ? (fullAnalysisData.reduce((sum, w) => sum + w.total_clusters, 0) / fullAnalysisData.length).toFixed(1)
                    : 'N/A'
                ) : (
                  clouds && clouds.length > 0 
                    ? (clouds.reduce((sum, c) => sum + c.summary.convergenceZoneCount, 0) / clouds.length).toFixed(1)
                    : 'N/A'
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendCloudChart;