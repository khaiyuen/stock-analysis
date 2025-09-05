'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import { format, addDays } from 'date-fns';

interface FullAnalysisCluster {
  level: number;
  type: 'Resistance' | 'Support';
  confidence: number;
  strength: number;
  first_touch_date: string;
  last_touch_date: string;
}

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
  clusters?: FullAnalysisCluster[];
}

interface FullAnalysisChartProps {
  windows: FullAnalysisWindow[];
  currentPrice?: number;
  className?: string;
  width?: number;
  height?: number;
  symbol: string;
}

interface ChartPoint {
  date: Date;
  price: number;
  weight: number;
  normalizedWeight: number;
  density: number;
  confidence: number;
  clusterType: 'Resistance' | 'Support';
  predictionStart: Date;
  predictionEnd: Date;
}

export const FullAnalysisChart: React.FC<FullAnalysisChartProps> = ({
  windows,
  currentPrice = 400,
  className = '',
  width = 800,
  height = 500,
  symbol
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Process windows into chart data with 5-day prediction visualization
  const chartData = useMemo(() => {
    if (windows.length === 0) return { points: [], bounds: null };
    
    const points: ChartPoint[] = [];
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let minDate = new Date(windows[0].date);
    let maxDate = new Date(windows[windows.length - 1].date);
    let maxWeight = 0;
    let maxDensity = 0;
    
    // Process each window
    windows.forEach(window => {
      const windowDate = new Date(window.date);
      
      // Prediction covers 3-7 days ahead as requested
      const predictionStart = addDays(windowDate, 3);
      const predictionEnd = addDays(windowDate, 7);
      
      // Use strongest cluster as the main prediction point
      if (window.strongest_cluster_price > 0) {
        const weight = window.strongest_cluster_weight;
        // Normalize weight to create density (0-1 scale)
        const density = Math.min(1, Math.max(0.1, weight * 2)); // Scale up for visibility
        
        const chartPoint: ChartPoint = {
          date: addDays(windowDate, 5), // Center of prediction window
          price: window.strongest_cluster_price,
          weight: weight,
          normalizedWeight: weight,
          density: density,
          confidence: Math.min(1, weight * 3), // Scale confidence based on weight
          clusterType: window.strongest_cluster_type,
          predictionStart,
          predictionEnd
        };
        
        points.push(chartPoint);
        
        minPrice = Math.min(minPrice, window.strongest_cluster_price);
        maxPrice = Math.max(maxPrice, window.strongest_cluster_price);
        maxWeight = Math.max(maxWeight, weight);
        maxDensity = Math.max(maxDensity, density);
        
        // Extend date range to include prediction window
        if (predictionEnd > maxDate) maxDate = predictionEnd;
      }
    });
    
    // Add padding to price range
    const priceRange = maxPrice - minPrice;
    const padding = priceRange * 0.1 || 10; // Fallback padding
    minPrice -= padding;
    maxPrice += padding;
    
    // Add some time padding
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
  }, [windows]);

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
    const margin = { top: 40, right: 100, bottom: 60, left: 80 };
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
    
    // Draw current price line if provided
    if (currentPrice > bounds.minPrice && currentPrice < bounds.maxPrice) {
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
    }
    
    // Draw prediction ranges and cluster points
    points.forEach(point => {
      const x = getX(point.date);
      const y = getY(point.price);
      
      // Draw prediction time range as a subtle vertical band
      const startX = getX(point.predictionStart);
      const endX = getX(point.predictionEnd);
      
      ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
      ctx.fillRect(startX, margin.top, endX - startX, chartHeight);
      
      // Use density for visual intensity
      const densityRatio = bounds.maxDensity > 0 ? point.density / bounds.maxDensity : 0;
      const normalizedWeight = point.normalizedWeight;
      
      // Opacity: high weight predictions should be more opaque
      const minOpacity = 0.2;
      const maxOpacity = 0.9;
      const densityOpacity = minOpacity + (densityRatio * (maxOpacity - minOpacity));
      const weightBoost = normalizedWeight * 0.2;
      const opacity = Math.min(maxOpacity, densityOpacity + weightBoost);
      
      // Radius: stronger predictions should be larger
      const baseRadius = 4;
      const densityRadius = baseRadius + (densityRatio * 6);
      const weightRadius = normalizedWeight * 10;
      const radius = Math.max(3, Math.max(densityRadius, weightRadius));
      
      // Color: resistance = red tones, support = green tones
      let hue: number;
      if (point.clusterType === 'Resistance') {
        hue = 0; // Red
      } else {
        hue = 120; // Green
      }
      
      const baseSaturation = 50;
      const maxSaturation = 80;
      const saturation = baseSaturation + (densityRatio * (maxSaturation - baseSaturation));
      
      const baseLightness = 60;
      const minLightness = 30;
      const lightness = baseLightness - (densityRatio * (baseLightness - minLightness));
      
      ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${opacity})`;
      
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 2 * Math.PI);
      ctx.fill();
      
      // Add border for strong predictions
      if (densityRatio > 0.4) {
        const borderSaturation = Math.min(100, saturation + 20);
        const borderLightness = Math.max(20, lightness - 15);
        ctx.strokeStyle = `hsla(${hue}, ${borderSaturation}%, ${borderLightness}%, ${Math.min(1, opacity + 0.2)})`;
        ctx.lineWidth = densityRatio > 0.7 ? 2 : 1;
        ctx.stroke();
      }
      
      // Add glow for very strong predictions
      if (densityRatio > 0.6) {
        const glowRadius = radius * 1.8;
        const gradient = ctx.createRadialGradient(x, y, radius * 0.3, x, y, glowRadius);
        const glowOpacity = (densityRatio - 0.6) * 0.3;
        gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness + 25}%, ${glowOpacity})`);
        gradient.addColorStop(1, `hsla(${hue}, ${saturation}%, ${lightness + 25}%, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, glowRadius, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    
    // Chart title
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${symbol} Full Rolling Analysis - 5-Day Predictions`, width / 2, 25);
    
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
    ctx.fillText('Prediction Date', width / 2, height - 10);
    
    // Legend
    const legendX = width - margin.right + 10;
    let legendY = margin.top + 40;
    
    ctx.fillStyle = '#374151';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Cluster Type', legendX, legendY);
    legendY += 20;
    
    // Cluster type legend
    [
      { type: 'Resistance', color: 'hsla(0, 70%, 50%, 0.8)', label: 'Resistance' },
      { type: 'Support', color: 'hsla(120, 70%, 50%, 0.8)', label: 'Support' }
    ].forEach(item => {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(legendX + 8, legendY, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(item.label, legendX + 20, legendY + 4);
      legendY += 18;
    });
    
    // Prediction window legend
    legendY += 10;
    ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
    ctx.fillRect(legendX, legendY - 6, 15, 12);
    
    ctx.fillStyle = '#374151';
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText('Prediction Window', legendX + 20, legendY);
    legendY += 15;
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('(Days 3-7)', legendX + 20, legendY);
    
  }, [chartData, currentPrice, width, height, symbol]);

  return (
    <div className={`bg-white rounded-lg shadow-sm border ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-auto"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      
      {/* Analysis Info */}
      {windows.length > 0 && (
        <div className="px-4 py-2 text-xs text-gray-500 border-t bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-medium">Total Windows:</span> {windows.length}
            </div>
            <div>
              <span className="font-medium">Five-Cluster Windows:</span> {windows.filter(w => w.total_clusters === 5).length}
            </div>
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
              <span className="text-gray-600">Predictions:</span>
              <div className="font-medium">{chartData.points.length}</div>
            </div>
            <div>
              <span className="text-gray-600">Success Rate:</span>
              <div className="font-medium">
                {windows.length > 0 
                  ? ((windows.filter(w => w.total_clusters === 5).length / windows.length) * 100).toFixed(1)
                  : '0'}%
              </div>
            </div>
            <div>
              <span className="text-gray-600">Avg Clusters:</span>
              <div className="font-medium">
                {windows.length > 0 
                  ? (windows.reduce((sum, w) => sum + w.total_clusters, 0) / windows.length).toFixed(1)
                  : 'N/A'}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Max Weight:</span>
              <div className="font-medium">
                {windows.length > 0 
                  ? Math.max(...windows.map(w => w.strongest_cluster_weight)).toFixed(3)
                  : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FullAnalysisChart;