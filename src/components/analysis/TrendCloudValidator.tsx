'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { format, addDays, differenceInDays } from 'date-fns';
import { MarketData } from '@/types';
import { 
  generateRollingTrendClouds, 
  TrendCloudData, 
  calculateTrendCloud 
} from '@/lib/trendCloud';
import TrendCloudChart from '@/components/charts/TrendCloudChart';

interface TrendCloudValidatorProps {
  symbol?: string;
  className?: string;
}

// Mock market data generator for validation (replace with real API)
function generateMockMarketData(startDate: Date, endDate: Date, startPrice: number = 400): MarketData[] {
  const data: MarketData[] = [];
  const days = differenceInDays(endDate, startDate);
  let currentPrice = startPrice;
  
  for (let i = 0; i <= days; i++) {
    const date = addDays(startDate, i);
    
    // Add some trend and noise
    const trendFactor = Math.sin(i * 0.02) * 10; // Long-term trend
    const noise = (Math.random() - 0.5) * 20; // Daily volatility
    const cyclical = Math.sin(i * 0.1) * 5; // Short-term cycles
    
    currentPrice += trendFactor * 0.1 + noise * 0.5 + cyclical * 0.3;
    currentPrice = Math.max(currentPrice, startPrice * 0.5); // Floor
    currentPrice = Math.min(currentPrice, startPrice * 2); // Ceiling
    
    const dayRange = currentPrice * 0.05; // 5% daily range
    const open = currentPrice + (Math.random() - 0.5) * dayRange;
    const close = currentPrice + (Math.random() - 0.5) * dayRange;
    const high = Math.max(open, close) + Math.random() * dayRange * 0.5;
    const low = Math.min(open, close) - Math.random() * dayRange * 0.5;
    
    data.push({
      symbol: 'MOCK',
      timestamp: date,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000 + 500000)
    });
  }
  
  return data;
}

export const TrendCloudValidator: React.FC<TrendCloudValidatorProps> = ({
  symbol = 'QQQ',
  className = ''
}) => {
  const [loading, setLoading] = useState(false);
  const [clouds, setClouds] = useState<TrendCloudData[]>([]);
  const [selectedCloud, setSelectedCloud] = useState<TrendCloudData | null>(null);
  const [validationPeriod, setValidationPeriod] = useState({
    start: new Date('2024-07-01'),
    end: new Date('2025-07-31')
  });

  // Generate mock market data for the extended period
  const marketData = useMemo(() => {
    const extendedStart = new Date('2023-07-01'); // Need extra data for 1-year lookback
    const extendedEnd = new Date('2025-08-31');
    return generateMockMarketData(extendedStart, extendedEnd);
  }, []);

  const calculateClouds = async () => {
    setLoading(true);
    try {
      console.log('Calculating trend clouds for validation period...');
      
      const rollingClouds = await generateRollingTrendClouds(
        symbol,
        marketData,
        validationPeriod.start,
        validationPeriod.end,
        '1D',
        5 // Every 5 days
      );
      
      console.log(`Generated ${rollingClouds.length} trend clouds`);
      setClouds(rollingClouds);
      
      // Auto-select a cloud from July-August 2025 for visualization
      const visualizationClouds = rollingClouds.filter(cloud => {
        const calcDate = new Date(cloud.calculationDate);
        return calcDate >= new Date('2025-07-01') && calcDate <= new Date('2025-08-31');
      });
      
      if (visualizationClouds.length > 0) {
        setSelectedCloud(visualizationClouds[0]);
      }
      
    } catch (error) {
      console.error('Error calculating trend clouds:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateClouds();
  }, [validationPeriod]);

  // Filter clouds for July-August 2025 visualization
  const visualizationClouds = useMemo(() => {
    return clouds.filter(cloud => {
      const calcDate = new Date(cloud.calculationDate);
      return calcDate >= new Date('2025-07-01') && calcDate <= new Date('2025-08-31');
    });
  }, [clouds]);

  const cloudStats = useMemo(() => {
    if (clouds.length === 0) return null;
    
    const avgConfidence = clouds.reduce((sum, c) => sum + c.summary.confidenceScore, 0) / clouds.length;
    const avgWeight = clouds.reduce((sum, c) => sum + c.summary.totalWeight, 0) / clouds.length;
    const totalPoints = clouds.reduce((sum, c) => sum + c.cloudPoints.length, 0);
    
    return {
      totalClouds: clouds.length,
      avgConfidence: avgConfidence,
      avgWeight: avgWeight,
      totalPoints: totalPoints
    };
  }, [clouds]);

  return (
    <div className={`bg-white rounded-lg shadow-lg ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Trend Cloud Validator
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Rolling trend cloud calculation for {symbol} | July 2024 - July 2025
            </p>
          </div>
          <button
            onClick={calculateClouds}
            disabled={loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Calculating...
              </>
            ) : (
              'Recalculate Clouds'
            )}
          </button>
        </div>
      </div>

      {/* Statistics */}
      {cloudStats && (
        <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{cloudStats.totalClouds}</div>
              <div className="text-sm text-gray-600">Total Clouds</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{cloudStats.avgConfidence.toFixed(3)}</div>
              <div className="text-sm text-gray-600">Avg Confidence</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{cloudStats.avgWeight.toFixed(1)}</div>
              <div className="text-sm text-gray-600">Avg Weight</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-600">{cloudStats.totalPoints}</div>
              <div className="text-sm text-gray-600">Total Points</div>
            </div>
          </div>
        </div>
      )}

      {/* Validation Period Controls */}
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Validation Start Date
            </label>
            <input
              type="date"
              value={format(validationPeriod.start, 'yyyy-MM-dd')}
              onChange={(e) => setValidationPeriod(prev => ({ 
                ...prev, 
                start: new Date(e.target.value) 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Validation End Date
            </label>
            <input
              type="date"
              value={format(validationPeriod.end, 'yyyy-MM-dd')}
              onChange={(e) => setValidationPeriod(prev => ({ 
                ...prev, 
                end: new Date(e.target.value) 
              }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      {/* Cloud List for July-August 2025 */}
      <div className="px-6 py-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Trend Clouds for July-August 2025 Visualization ({visualizationClouds.length} clouds)
        </h3>
        
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">Calculating trend clouds...</p>
            </div>
          </div>
        ) : visualizationClouds.length > 0 ? (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {visualizationClouds.map((cloud, index) => (
              <div
                key={`${cloud.calculationDate}-${cloud.targetDate}`}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  selectedCloud === cloud
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => setSelectedCloud(cloud)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-gray-900">
                      {format(new Date(cloud.calculationDate), 'MMM dd, yyyy')} → {format(new Date(cloud.targetDate), 'MMM dd, yyyy')}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Peak: ${cloud.summary.peakPrice.toFixed(2)} | Confidence: {cloud.summary.confidenceScore.toFixed(3)}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {cloud.cloudPoints.length} price levels | Weight: {cloud.summary.totalWeight.toFixed(1)}
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    cloud.summary.confidenceScore > 0.7 
                      ? 'bg-green-100 text-green-800'
                      : cloud.summary.confidenceScore > 0.5
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {(cloud.summary.confidenceScore * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            No trend clouds calculated yet. Click &quot;Recalculate Clouds&quot; to generate data.
          </div>
        )}
      </div>

      {/* Chart Visualization */}
      {visualizationClouds.length > 0 && (
        <div className="px-6 py-4 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Trend Cloud Visualization (July-August 2025)
          </h3>
          <TrendCloudChart
            clouds={visualizationClouds}
            currentPrice={marketData[marketData.length - 1]?.close || 400}
            width={800}
            height={400}
            className="mb-4"
          />
        </div>
      )}

      {/* Selected Cloud Details */}
      {selectedCloud && (
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Cloud Details: {format(new Date(selectedCloud.calculationDate), 'MMM dd, yyyy')}
          </h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Cloud Summary */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Summary</h4>
              <div className="bg-white p-4 rounded-lg border">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Target Date:</span>
                    <span className="font-medium">{format(new Date(selectedCloud.targetDate), 'MMM dd, yyyy')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Peak Price:</span>
                    <span className="font-medium">${selectedCloud.summary.peakPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Peak Weight:</span>
                    <span className="font-medium">{selectedCloud.summary.peakWeight.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Weight:</span>
                    <span className="font-medium">{selectedCloud.summary.totalWeight.toFixed(1)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Confidence:</span>
                    <span className="font-medium">{(selectedCloud.summary.confidenceScore * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Price Range:</span>
                    <span className="font-medium">
                      ${selectedCloud.summary.priceRange.min.toFixed(2)} - ${selectedCloud.summary.priceRange.max.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Cloud Points */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Top Price Levels</h4>
              <div className="bg-white p-4 rounded-lg border max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {selectedCloud.cloudPoints
                    .sort((a, b) => b.weight - a.weight)
                    .slice(0, 10)
                    .map((point, index) => (
                      <div key={point.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium">${point.priceLevel.toFixed(2)}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-600">
                            Weight: {point.weight.toFixed(1)}
                          </span>
                          <span className="text-gray-500">
                            ({point.trendlineCount} lines)
                          </span>
                          <div 
                            className="w-12 h-2 bg-purple-200 rounded overflow-hidden"
                          >
                            <div 
                              className="h-full bg-purple-600"
                              style={{ 
                                width: `${(point.weight / selectedCloud.summary.peakWeight) * 100}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TrendCloudValidator;