'use client';

import React, { useState, useEffect } from 'react';
import { Search, TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';
import { StockChart } from '../charts/StockChart';
import { CandlestickChart } from '../charts/CandlestickChart';
import { TrendAnalysisPanel } from '../analysis/TrendAnalysisPanel';
import { MarketData, Quote, IndicatorSeries } from '@/types';

interface StockDashboardProps {
  initialSymbol?: string;
}

interface DashboardState {
  symbol: string;
  searchQuery: string;
  timeframe: '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y';
  chartType: 'line' | 'candlestick';
  marketData: MarketData[];
  quote: Quote | null;
  indicators: IndicatorSeries[];
  loading: boolean;
  error: string | null;
}

export const StockDashboard: React.FC<StockDashboardProps> = ({
  initialSymbol = 'AAPL'
}) => {
  const [state, setState] = useState<DashboardState>({
    symbol: initialSymbol,
    searchQuery: initialSymbol,
    timeframe: '1y',
    chartType: 'line',
    marketData: [],
    quote: null,
    indicators: [],
    loading: false,
    error: null
  });



  const loadData = async (symbol: string, timeframe: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      throw new Error('Dashboard mock data removed. Use real data sources only.');
      
      setState(prev => ({
        ...prev,
        marketData: [],
        quote: null,
        loading: false,
        symbol
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load data'
      }));
    }
  };

  useEffect(() => {
    loadData(state.symbol, state.timeframe);
  }, [state.symbol, state.timeframe]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (state.searchQuery.trim()) {
      loadData(state.searchQuery.trim().toUpperCase(), state.timeframe);
    }
  };

  const formatPrice = (price: number) => 
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(price);

  const formatPercent = (percent: number) =>
    `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;

  const formatVolume = (volume: number) => {
    if (volume >= 1e9) return `${(volume / 1e9).toFixed(1)}B`;
    if (volume >= 1e6) return `${(volume / 1e6).toFixed(1)}M`;
    if (volume >= 1e3) return `${(volume / 1e3).toFixed(1)}K`;
    return volume.toString();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Stock Analysis Platform</h1>
              <p className="text-gray-600 mt-1">Technical analysis with machine learning insights</p>
            </div>
            
            {/* Search */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={state.searchQuery}
                  onChange={(e) => setState(prev => ({ ...prev, searchQuery: e.target.value.toUpperCase() }))}
                  placeholder="Enter symbol (e.g., AAPL)"
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                type="submit"
                disabled={state.loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {state.loading ? 'Loading...' : 'Search'}
              </button>
              
              {/* Trend Analysis Link */}
              <a
                href={`/trend/${state.symbol}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                <TrendingUp className="h-4 w-4" />
                Trend Analysis
              </a>
            </form>
          </div>
        </div>

        {/* Quote Card */}
        {state.quote && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">{state.quote.symbol}</h2>
              <div className="flex items-center gap-4">
                {/* Timeframe Selector */}
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  {(['1d', '5d', '1mo', '3mo', '6mo', '1y'] as const).map((period) => (
                    <button
                      key={period}
                      onClick={() => setState(prev => ({ ...prev, timeframe: period }))}
                      className={`px-3 py-1 text-sm font-medium transition-colors ${
                        state.timeframe === period
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>
                
                {/* Chart Type Selector */}
                <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                  <button
                    onClick={() => setState(prev => ({ ...prev, chartType: 'line' }))}
                    className={`px-3 py-1 text-sm font-medium transition-colors ${
                      state.chartType === 'line'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Line
                  </button>
                  <button
                    onClick={() => setState(prev => ({ ...prev, chartType: 'candlestick' }))}
                    className={`px-3 py-1 text-sm font-medium transition-colors ${
                      state.chartType === 'candlestick'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Candlestick
                  </button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Price</p>
                  <p className="text-lg font-semibold">
                    {formatPrice(state.quote.regularMarketPrice)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  state.quote.regularMarketChange >= 0 ? 'bg-green-100' : 'bg-red-100'
                }`}>
                  {state.quote.regularMarketChange >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Change</p>
                  <p className={`text-lg font-semibold ${
                    state.quote.regularMarketChange >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatPrice(state.quote.regularMarketChange)} ({formatPercent(state.quote.regularMarketChangePercent)})
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Activity className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Volume</p>
                  <p className="text-lg font-semibold">
                    {formatVolume(state.quote.regularMarketVolume)}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">52W High</p>
                  <p className="text-lg font-semibold">
                    {state.quote.fiftyTwoWeekHigh ? formatPrice(state.quote.fiftyTwoWeekHigh) : 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Price Chart - {state.symbol}
          </h3>
          
          {state.loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : state.error ? (
            <div className="flex items-center justify-center h-64 text-red-600">
              <p>Error: {state.error}</p>
            </div>
          ) : (
            <div>
              {state.chartType === 'line' ? (
                <StockChart
                  data={state.marketData}
                  indicators={state.indicators}
                  height={400}
                  showVolume={false}
                  timeframe={state.timeframe}
                />
              ) : (
                <CandlestickChart
                  data={state.marketData}
                  indicators={state.indicators}
                  height={500}
                  showVolume={true}
                />
              )}
            </div>
          )}
        </div>

        {/* Trend Analysis Panel */}
        <TrendAnalysisPanel 
          symbol={state.symbol}
          className="mb-6"
        />

        {/* Technical Indicators Panel (placeholder) */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Technical Indicators</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-gray-700">RSI (14)</h4>
              <p className="text-2xl font-bold text-blue-600">--</p>
              <p className="text-sm text-gray-500">Coming soon</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-gray-700">MACD</h4>
              <p className="text-2xl font-bold text-green-600">--</p>
              <p className="text-sm text-gray-500">Coming soon</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-gray-700">SMA (20)</h4>
              <p className="text-2xl font-bold text-orange-600">--</p>
              <p className="text-sm text-gray-500">Coming soon</p>
            </div>
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium text-gray-700">Bollinger Bands</h4>
              <p className="text-2xl font-bold text-purple-600">--</p>
              <p className="text-sm text-gray-500">Coming soon</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockDashboard;