import { YahooFinanceService } from './yahoo-finance';
import { YahooFinanceV2Service } from './yahoo-finance-v2';
import { AlphaVantageService } from './alpha-vantage';
import { SmartDataManager } from './smart-data-manager';
import { LocalDatabaseService } from './local-database-service';
import { MarketData, HistoricalDataResponse, Timeframe } from '@/types';

interface TimeframeCache {
  [key: string]: {
    data: MarketData[];
    timestamp: Date;
    ttl: number;
  };
}

export class MultiTimeframeService {
  private yahooFinance: YahooFinanceService;
  private yahooFinanceV2: YahooFinanceV2Service;
  private alphaVantage: AlphaVantageService;
  private smartDataManager: SmartDataManager;
  private localDatabase: LocalDatabaseService;
  private cache: TimeframeCache = {};

  // Cache TTL settings (in milliseconds)
  private readonly cacheTTL: Record<Timeframe, number> = {
    '1H': 5 * 60 * 1000,      // 5 minutes
    '4H': 15 * 60 * 1000,     // 15 minutes  
    '1D': 60 * 60 * 1000,     // 1 hour
    '1W': 4 * 60 * 60 * 1000, // 4 hours
    '1M': 24 * 60 * 60 * 1000 // 24 hours
  };

  // Data points for maximum historical analysis
  private readonly dataPoints: Record<Timeframe, number> = {
    '1H': 168,    // Not supported - would be massive dataset
    '4H': 180,    // Not supported - would be massive dataset  
    '1D': 10000,  // Maximum daily data (26+ years for QQQ since 1999)
    '1W': 1500,   // Maximum weekly data (26+ years)
    '1M': 350     // Maximum monthly data (26+ years)
  };

  constructor(alphaVantageApiKey?: string) {
    this.yahooFinance = new YahooFinanceService();
    this.yahooFinanceV2 = new YahooFinanceV2Service();
    this.alphaVantage = new AlphaVantageService(alphaVantageApiKey);
    this.smartDataManager = new SmartDataManager();
    this.localDatabase = new LocalDatabaseService();
  }

  /**
   * Get market data for multiple timeframes
   */
  async getMultiTimeframeData(
    symbol: string,
    timeframes: Timeframe[],
    useCache: boolean = true
  ): Promise<Record<Timeframe, MarketData[]>> {
    const results: Record<Timeframe, MarketData[]> = {} as Record<Timeframe, MarketData[]>;
    const promises = timeframes.map(async (timeframe) => {
      try {
        const data = await this.getTimeframeData(symbol, timeframe, useCache);
        results[timeframe] = data;
      } catch (error) {
        console.error(`Failed to fetch ${timeframe} data for ${symbol}:`, error);
        results[timeframe] = [];
      }
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Get data for a specific timeframe with caching
   */
  async getTimeframeData(
    symbol: string,
    timeframe: Timeframe,
    useCache: boolean = true
  ): Promise<MarketData[]> {
    const cacheKey = `${symbol}_${timeframe}`;

    // Check cache first
    if (useCache && this.isCacheValid(cacheKey, timeframe)) {
      console.log(`Cache hit for ${cacheKey}`);
      return this.cache[cacheKey].data;
    }

    // Fetch fresh data
    console.log(`Fetching fresh data for ${cacheKey}`);
    const data = await this.fetchTimeframeData(symbol, timeframe, useCache);

    // Cache the result
    this.cache[cacheKey] = {
      data,
      timestamp: new Date(),
      ttl: this.cacheTTL[timeframe]
    };

    return data;
  }

  /**
   * Fetch data for specific timeframe from local database first, then APIs
   */
  private async fetchTimeframeData(
    symbol: string,
    timeframe: Timeframe,
    useCache: boolean = true
  ): Promise<MarketData[]> {
    const requiredPoints = this.dataPoints[timeframe];

    // Try local database first
    try {
      console.log(`🗃️ Trying local database for ${symbol} ${timeframe}...`);
      const localData = await this.localDatabase.getMarketData(symbol, timeframe, requiredPoints);
      
      if (localData.length > 0) {
        console.log(`✅ Local database success: ${localData.length} points for ${symbol} ${timeframe}`);
        // Reverse array since database returns newest first, but charts expect oldest first
        return localData.reverse();
      }
      
      console.log(`⚠️ No local data found for ${symbol} ${timeframe}, falling back to APIs...`);
    } catch (error) {
      console.warn(`❌ Local database failed for ${symbol} ${timeframe}:`, error);
    }

    try {
      // Use smart data manager as fallback (handles caching and API fallbacks)
      console.log(`📊 Using smart data manager for ${symbol} ${timeframe}...`);
      const result = await this.smartDataManager.getMarketData(
        symbol, 
        timeframe, 
        requiredPoints,
        { 
          forceRefresh: !useCache,
          maxAge: timeframe === '1H' ? 1 : timeframe === '4H' ? 4 : 24,
          fillGaps: true
        }
      );

      if (result.data.length > 0) {
        console.log(`✅ Smart data manager success: ${result.data.length} points (${result.source}) for ${symbol} ${timeframe}`);
        if (result.cached > 0) console.log(`   📋 Used ${result.cached} cached records`);
        if (result.fetched > 0) console.log(`   🌐 Fetched ${result.fetched} new records`);
        if (result.errors) console.warn(`   ⚠️ Errors: ${result.errors.join(', ')}`);
        
        return result.data;
      }
    } catch (error) {
      console.warn(`❌ Smart data manager failed for ${symbol} ${timeframe}:`, error);
    }

    // Fallback to direct API calls if smart manager fails
    console.log(`🔄 Falling back to direct API calls for ${symbol} ${timeframe}...`);

    try {
      const yahooV2Data = await this.yahooFinanceV2.getHistoricalData(symbol, timeframe, requiredPoints);
      if (yahooV2Data.length > 0) {
        console.log(`✅ Direct Yahoo V2 success: ${yahooV2Data.length} points for ${symbol} ${timeframe}`);
        return yahooV2Data;
      }
    } catch (error) {
      console.warn(`❌ Direct Yahoo V2 failed for ${symbol} ${timeframe}:`, error);
    }

    try {
      const yahooData = await this.fetchFromYahoo(symbol, timeframe, requiredPoints);
      if (yahooData.length > 0) {
        console.log(`✅ Yahoo Finance (old) success: ${yahooData.length} points for ${symbol} ${timeframe}`);
        return yahooData;
      }
    } catch (error) {
      console.warn(`❌ Yahoo Finance (old) failed for ${symbol} ${timeframe}:`, error);
    }

    try {
      if (this.alphaVantage.isConfigured()) {
        const alphaData = await this.fetchFromAlphaVantage(symbol, timeframe);
        if (alphaData.length > 0) {
          console.log(`✅ Alpha Vantage success: ${alphaData.length} points for ${symbol} ${timeframe}`);
          return alphaData;
        }
      }
    } catch (error) {
      console.warn(`❌ Alpha Vantage failed for ${symbol} ${timeframe}:`, error);
    }

    // No fallback to mock data - throw error if all sources fail
    throw new Error(`All data sources failed for ${symbol} ${timeframe}. Cannot provide synthetic data as requested.`);
  }

  /**
   * Fetch data from Yahoo Finance
   */
  private async fetchFromYahoo(
    symbol: string,
    timeframe: Timeframe,
    requiredPoints: number
  ): Promise<MarketData[]> {
    const { period, interval } = this.mapTimeframeToYahoo(timeframe, requiredPoints);
    const response = await this.yahooFinance.getHistoricalData(symbol, period, interval);
    return response.data;
  }

  /**
   * Fetch data from Alpha Vantage
   */
  private async fetchFromAlphaVantage(
    symbol: string,
    timeframe: Timeframe
  ): Promise<MarketData[]> {
    let response: HistoricalDataResponse;

    switch (timeframe) {
      case '1H':
        response = await this.alphaVantage.getIntradayData(symbol, '60min', 'full');
        break;
      case '4H':
        throw new Error('4H timeframe is not supported by Alpha Vantage');
      case '1D':
        response = await this.alphaVantage.getDailyData(symbol, 'full');
        break;
      case '1W':
        response = await this.alphaVantage.getWeeklyData(symbol);
        break;
      case '1M':
        response = await this.alphaVantage.getMonthlyData(symbol);
        break;
      default:
        throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    return response.data;
  }

  /**
   * Map timeframe to Yahoo Finance parameters
   */
  private mapTimeframeToYahoo(
    timeframe: Timeframe,
    requiredPoints: number
  ): { period: string; interval: string } {
    switch (timeframe) {
      case '1H':
        throw new Error('1H timeframe is not supported by Yahoo Finance');
      case '4H':
        throw new Error('4H timeframe is not supported by Yahoo Finance');
      case '1D':
        return { period: '2y', interval: '1d' };
      case '1W':
        return { period: '5y', interval: '1wk' };
      case '1M':
        return { period: '10y', interval: '1mo' };
      default:
        throw new Error(`Unsupported timeframe: ${timeframe}`);
    }
  }


  /**
   * Check if cached data is still valid
   */
  private isCacheValid(cacheKey: string, timeframe: Timeframe): boolean {
    const cached = this.cache[cacheKey];
    if (!cached) return false;

    const now = Date.now();
    const cacheAge = now - cached.timestamp.getTime();
    return cacheAge < this.cacheTTL[timeframe];
  }

  /**
   * Get the latest data point for a timeframe
   */
  async getLatestPoint(
    symbol: string,
    timeframe: Timeframe
  ): Promise<MarketData | null> {
    try {
      const data = await this.getTimeframeData(symbol, timeframe, true);
      return data.length > 0 ? data[data.length - 1] : null;
    } catch (error) {
      console.error(`Failed to get latest point for ${symbol} ${timeframe}:`, error);
      return null;
    }
  }

  /**
   * Warm up cache for multiple symbols and timeframes
   */
  async warmCache(symbols: string[], timeframes: Timeframe[]): Promise<void> {
    console.log(`Warming cache for ${symbols.length} symbols and ${timeframes.length} timeframes`);
    
    const promises: Promise<void>[] = [];
    
    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        promises.push(
          this.getTimeframeData(symbol, timeframe, false)
            .then(() => {})
            .catch(error => {
              console.warn(`Cache warm failed for ${symbol} ${timeframe}:`, error);
            })
        );

        // Add delay to respect rate limits
        if (promises.length % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    await Promise.allSettled(promises);
    console.log('Cache warming completed');
  }

  /**
   * Clear cache for specific symbol or all
   */
  clearCache(symbol?: string): void {
    if (symbol) {
      const keysToDelete = Object.keys(this.cache).filter(key => 
        key.startsWith(`${symbol}_`)
      );
      keysToDelete.forEach(key => delete this.cache[key]);
      console.log(`Cleared cache for ${symbol}`);
    } else {
      this.cache = {};
      console.log('Cleared all cache');
    }
  }




  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    entriesByTimeframe: Record<Timeframe, number>;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    totalSizeEstimate: number;
  } {
    const entries = Object.entries(this.cache);
    const entriesByTimeframe: Record<Timeframe, number> = {
      '1H': 0, '4H': 0, '1D': 0, '1W': 0, '1M': 0
    };

    let oldestEntry: Date | null = null;
    let newestEntry: Date | null = null;
    let totalSize = 0;

    entries.forEach(([key, value]) => {
      const timeframe = key.split('_')[1] as Timeframe;
      if (timeframe && entriesByTimeframe[timeframe] !== undefined) {
        entriesByTimeframe[timeframe]++;
      }

      if (!oldestEntry || value.timestamp < oldestEntry) {
        oldestEntry = value.timestamp;
      }
      if (!newestEntry || value.timestamp > newestEntry) {
        newestEntry = value.timestamp;
      }

      // Rough size estimate (JSON string length)
      totalSize += JSON.stringify(value).length;
    });

    return {
      totalEntries: entries.length,
      entriesByTimeframe,
      oldestEntry,
      newestEntry,
      totalSizeEstimate: totalSize
    };
  }

  /**
   * Clean expired cache entries
   */
  cleanExpiredCache(): void {
    const now = Date.now();
    let cleaned = 0;

    Object.keys(this.cache).forEach(key => {
      const cached = this.cache[key];
      const age = now - cached.timestamp.getTime();
      
      if (age > cached.ttl) {
        delete this.cache[key];
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`Cleaned ${cleaned} expired cache entries`);
    }
  }

  /**
   * Get data freshness for a symbol/timeframe
   */
  getDataFreshness(symbol: string, timeframe: Timeframe): {
    isCached: boolean;
    age: number;
    isStale: boolean;
  } {
    const cacheKey = `${symbol}_${timeframe}`;
    const cached = this.cache[cacheKey];

    if (!cached) {
      return { isCached: false, age: 0, isStale: false };
    }

    const age = Date.now() - cached.timestamp.getTime();
    const isStale = age > this.cacheTTL[timeframe];

    return { isCached: true, age, isStale };
  }

  /**
   * Validate data quality for analysis
   */
  validateDataQuality(data: MarketData[], timeframe: Timeframe): {
    isValid: boolean;
    issues: string[];
    coverage: number;
  } {
    const issues: string[] = [];
    const expectedPoints = this.dataPoints[timeframe];

    // Check minimum data points
    if (data.length < Math.min(50, expectedPoints * 0.2)) {
      issues.push(`Insufficient data points: ${data.length} < ${Math.min(50, expectedPoints * 0.2)}`);
    }

    // Check for data gaps
    let gaps = 0;
    for (let i = 1; i < data.length; i++) {
      const timeDiff = data[i].timestamp.getTime() - data[i - 1].timestamp.getTime();
      const expectedDiff = this.getExpectedTimeDiff(timeframe);
      
      if (timeDiff > expectedDiff * 2) {
        gaps++;
      }
    }

    if (gaps > data.length * 0.05) {
      issues.push(`Too many data gaps: ${gaps}/${data.length} (${(gaps/data.length*100).toFixed(1)}%)`);
    }

    // Check for invalid prices
    const invalidPrices = data.filter(d => 
      d.open <= 0 || d.high <= 0 || d.low <= 0 || d.close <= 0 ||
      d.high < d.low || d.open < 0 || d.close < 0
    ).length;

    if (invalidPrices > 0) {
      issues.push(`Invalid price data: ${invalidPrices} candles`);
    }

    const coverage = data.length / expectedPoints;

    return {
      isValid: issues.length === 0,
      issues,
      coverage: Math.min(coverage, 1.0)
    };
  }

  /**
   * Get expected time difference between candles
   */
  private getExpectedTimeDiff(timeframe: Timeframe): number {
    const timeDiffs: Record<Timeframe, number> = {
      '1H': 60 * 60 * 1000,           // 1 hour
      '4H': 4 * 60 * 60 * 1000,       // 4 hours
      '1D': 24 * 60 * 60 * 1000,      // 1 day
      '1W': 7 * 24 * 60 * 60 * 1000,  // 1 week
      '1M': 30 * 24 * 60 * 60 * 1000  // 1 month (approx)
    };
    
    return timeDiffs[timeframe];
  }

  /**
   * Get local database health status
   */
  async getDatabaseHealth(): Promise<{
    isHealthy: boolean;
    error?: string;
    stats?: {
      totalRecords: number;
      symbols: number;
      timeframes: string[];
    };
  }> {
    return await this.localDatabase.healthCheck();
  }

  /**
   * Get available symbols in local database
   */
  async getAvailableSymbols(): Promise<string[]> {
    try {
      return await this.localDatabase.getAvailableSymbols();
    } catch (error) {
      console.warn('Failed to get available symbols from database:', error);
      return [];
    }
  }

  /**
   * Get data info for a symbol from local database
   */
  async getSymbolDataInfo(symbol: string): Promise<{
    symbol: string;
    totalRecords: number;
    timeframes: Timeframe[];
    dateRange: {
      earliest: Date;
      latest: Date;
    };
    recordsByTimeframe: Record<Timeframe, number>;
  } | null> {
    try {
      return await this.localDatabase.getDataInfo(symbol);
    } catch (error) {
      console.warn(`Failed to get data info for ${symbol}:`, error);
      return null;
    }
  }
}