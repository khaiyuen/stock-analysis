'use client';

import React from 'react';
import TrendAnalysisPanel from '@/components/analysis/TrendAnalysisPanel';

export default function TrendCloudDemo() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🔮 Trend Cloud Analysis Demo
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Experience the new rolling trend cloud feature that predicts price movements 
            5 days ahead using powerful trendline aggregation and weighting algorithms.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">How Trend Clouds Work</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
            <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="font-semibold text-purple-900">Rolling Window</span>
              </div>
              <p className="text-purple-800">
                1-year lookback window moving every 5 days to capture evolving market patterns.
              </p>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="font-semibold text-blue-900">Trendline Detection</span>
              </div>
              <p className="text-blue-800">
                Identifies powerful trendlines connecting multiple pivot points with quality scoring.
              </p>
            </div>

            <div className="p-4 bg-green-50 rounded-lg border border-green-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="font-semibold text-green-900">Weight Aggregation</span>
              </div>
              <p className="text-green-800">
                Combines predictions by trendline strength - more pivot points = higher weight.
              </p>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <span className="font-semibold text-amber-900">Cloud Visualization</span>
              </div>
              <p className="text-amber-800">
                Displays prediction density as colored clouds with confidence-based coloring.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Interactive Analysis Panel
            </h2>
            <p className="text-gray-600">
              Enable the "Trend Cloud" checkbox in Display Options to see 5-day price predictions.
              Purple dots show peak predictions, colored clouds show confidence levels.
            </p>
          </div>
          
          <TrendAnalysisPanel
            symbol="QQQ"
            className=""
          />
        </div>

        <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Chart Legend</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-red-500 opacity-60"></div>
              <span>Low Confidence (0-0.3)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-yellow-500 opacity-60"></div>
              <span>Medium Confidence (0.3-0.7)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-green-500 opacity-60"></div>
              <span>High Confidence (0.7-1.0)</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-purple-600"></div>
              <span>Peak Prediction</span>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">💡 Pro Tips</h4>
            <ul className="text-blue-800 text-sm space-y-1">
              <li>• Larger circles indicate higher prediction weight (more trendlines converging)</li>
              <li>• Greener colors show higher confidence based on trendline quality (R² values)</li>
              <li>• Purple dots mark the highest-weighted price prediction for each 5-day period</li>
              <li>• Dense cloud areas suggest strong consensus among multiple trendlines</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}