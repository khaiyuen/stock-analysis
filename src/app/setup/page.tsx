'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Database, Download, CheckCircle, AlertCircle, Clock, HardDrive } from 'lucide-react';

interface SetupProgress {
  timeframe: string;
  progress: number;
  status: string;
}

interface SetupResult {
  success: boolean;
  data?: {
    symbol: string;
    results: Record<string, number>;
    stats: any;
    processingTime: string;
  };
  errors?: string[];
}

export default function SetupPage() {
  const [symbol, setSymbol] = useState('QQQ');
  const [timeframes, setTimeframes] = useState(['1D', '1W', '1M']);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<SetupProgress[]>([]);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [stats, setStats] = useState<any>(null);

  const availableTimeframes = [
    { value: '1D', label: '1 Day', description: 'Daily candles - real Yahoo Finance data' },
    { value: '1W', label: '1 Week', description: 'Weekly candles - real Yahoo Finance data' },
    { value: '1M', label: '1 Month', description: 'Monthly candles - real Yahoo Finance data' }
  ];

  const handleTimeframeToggle = (timeframe: string) => {
    setTimeframes(prev => 
      prev.includes(timeframe) 
        ? prev.filter(tf => tf !== timeframe)
        : [...prev, timeframe]
    );
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/data/setup');
      const data = await response.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleSetup = async () => {
    if (timeframes.length === 0) {
      alert('Please select at least one timeframe');
      return;
    }

    setIsLoading(true);
    setProgress([]);
    setResult(null);

    try {
      const response = await fetch('/api/data/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframes })
      });

      const data = await response.json();
      setResult(data);
      
      // Refresh stats after setup
      await fetchStats();
      
    } catch (error) {
      console.error('Setup failed:', error);
      setResult({
        success: false,
        errors: ['Failed to connect to setup API']
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch initial stats
  React.useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
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
                <Database className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Historical Data Setup</h1>
                <p className="text-gray-600">Download and store historical stock data locally</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Setup Form */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Setup Configuration</h2>
            
            {/* Symbol Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stock Symbol
              </label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., QQQ, AAPL, MSFT"
              />
              <p className="text-xs text-gray-500 mt-1">
                Start with QQQ for best results
              </p>
            </div>

            {/* Timeframe Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Timeframes to Download
              </label>
              <div className="space-y-2">
                {availableTimeframes.map((tf) => (
                  <label key={tf.value} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={timeframes.includes(tf.value)}
                      onChange={() => handleTimeframeToggle(tf.value)}
                      className="rounded border-gray-300 mr-3"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{tf.label}</div>
                      <div className="text-sm text-gray-500">{tf.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Setup Button */}
            <button
              onClick={handleSetup}
              disabled={isLoading || timeframes.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Setting up...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Download Historical Data
                </>
              )}
            </button>

            {/* Warning */}
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-yellow-800">
                  <strong>Note:</strong> This will download several years of historical data. 
                  The process may take 1-3 minutes depending on selected timeframes.
                </div>
              </div>
            </div>
          </div>

          {/* Current Status */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Database Status</h2>
            
            {stats ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{stats.totalRecords.toLocaleString()}</div>
                    <div className="text-sm text-blue-800">Total Records</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{stats.uniqueSymbols}</div>
                    <div className="text-sm text-green-800">Symbols</div>
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="h-4 w-4 text-gray-600" />
                    <span className="font-medium">Database Size: {stats.dbSize}</span>
                  </div>
                  {stats.oldestRecord && stats.newestRecord && (
                    <div className="text-sm text-gray-600">
                      Data range: {new Date(stats.oldestRecord).toLocaleDateString()} - {new Date(stats.newestRecord).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {stats.timeframes && stats.timeframes.length > 0 && (
                  <div>
                    <h3 className="font-medium mb-2">Data by Timeframe:</h3>
                    <div className="space-y-1">
                      {stats.timeframes.map((tf: any) => (
                        <div key={tf.timeframe} className="flex justify-between text-sm">
                          <span>{tf.timeframe}:</span>
                          <span>{tf.count.toLocaleString()} records</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Loading database status...</p>
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="mt-8 bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center gap-2 mb-4">
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <h3 className="text-lg font-semibold">
                {result.success ? 'Setup Completed Successfully!' : 'Setup Failed'}
              </h3>
            </div>

            {result.success && result.data && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(result.data.results).map(([timeframe, count]) => (
                    <div key={timeframe} className="text-center">
                      <div className="text-xl font-bold text-green-600">{count}</div>
                      <div className="text-sm text-gray-600">{timeframe} records</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Processing time: {result.data.processingTime}
                  </div>
                  <div className="flex items-center gap-1">
                    <HardDrive className="h-4 w-4" />
                    Database: {result.data.stats.dbSize}
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-green-800">
                    ✅ Historical data for <strong>{result.data.symbol}</strong> has been downloaded and stored. 
                    You can now use the trend analysis with real historical data!
                  </p>
                  <div className="mt-3">
                    <Link
                      href={`/trend/${result.data.symbol}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                    >
                      View Trend Analysis
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <h4 className="font-medium text-red-800 mb-2">Errors:</h4>
                <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                  {result.errors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}