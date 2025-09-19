'use client';

import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { TrendAnalysisPanel } from '@/components/analysis/TrendAnalysisPanel';

interface TrendPageProps {
  params: Promise<{
    symbol: string;
  }>;
}

// Quick switcher symbols for convenience (not used for validation)
const QUICK_SWITCH_SYMBOLS = ['QQQ', 'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY', 'NVDA', 'AMZN', 'META'];

export default function TrendAnalysisPage({ params }: TrendPageProps) {
  const { symbol } = React.use(params);
  const upperSymbol = symbol.toUpperCase();

  // Basic validation for symbol format (must be alphanumeric and reasonable length)
  if (!upperSymbol || upperSymbol.length > 10 || !/^[A-Z0-9]+$/.test(upperSymbol)) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
              
              <div className="h-6 border-l border-gray-300" />
              
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    Multi-Timeframe Trend Analysis
                  </h1>
                  <p className="text-gray-600">
                    {upperSymbol} • Advanced technical analysis across multiple timeframes
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Symbol Switcher */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Quick switch:</span>
              <div className="flex gap-1">
                {QUICK_SWITCH_SYMBOLS.slice(0, 5).map((sym) => (
                  <Link
                    key={sym}
                    href={`/trend/${sym}`}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      sym === upperSymbol
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {sym}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm">
          <TrendAnalysisPanel symbol={upperSymbol} />
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div>
              <p>Stock Analysis Platform • Multi-Timeframe Trend Analysis</p>
              <p className="mt-1">
                Analyzing {upperSymbol} across 1M, 1W, 1D, 4H, and 1H timeframes
              </p>
            </div>
            <div className="text-right">
              <p>Powered by advanced technical analysis algorithms</p>
              <p className="mt-1">Real-time pivot detection and trendline analysis</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}