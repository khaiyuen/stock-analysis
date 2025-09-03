'use client';

import Link from 'next/link';
import { TrendingUp, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const supportedSymbols = ['QQQ', 'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY', 'NVDA', 'AMZN', 'META'];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="p-3 bg-red-100 rounded-full w-fit mx-auto mb-4">
          <TrendingUp className="h-8 w-8 text-red-600" />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Symbol Not Found</h1>
        <p className="text-gray-600 mb-6">
          The requested stock symbol is not currently supported for trend analysis.
        </p>
        
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Supported symbols:</h3>
          <div className="grid grid-cols-3 gap-2">
            {supportedSymbols.map((symbol) => (
              <Link
                key={symbol}
                href={`/trend/${symbol}`}
                className="px-3 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors text-sm font-medium"
              >
                {symbol}
              </Link>
            ))}
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          
          <Link
            href="/trend/QQQ"
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            View QQQ Analysis
          </Link>
        </div>
      </div>
    </div>
  );
}