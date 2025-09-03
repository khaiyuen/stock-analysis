import { HistoricalDataStore } from './historical-data-store';
import { YahooFinanceV2Service } from './yahoo-finance-v2';
import { AlphaVantageService } from './alpha-vantage';
import { MarketData, Timeframe } from '@/types';

interface DataFetchOptions {
  forceRefresh?: boolean;
  maxAge?: number; // Hours
  fillGaps?: boolean;
}

interface FetchResult {
  data: MarketData[];
  source: 'cache' | 'api' | 'mixed';
  cached: number;
  fetched: number;
  errors?: string[];
}

export class SmartDataManager {
  private store: HistoricalDataStore;
  private yahooV2: YahooFinanceV2Service;
  private alphaVantage: AlphaVantageService;

  constructor(dbPath?: string) {
    this.store = new HistoricalDataStore(dbPath);
    this.yahooV2 = new YahooFinanceV2Service();
    this.alphaVantage = new AlphaVantageService();
  }

  /**
   * Get market data with intelligent caching
   */
  async getMarketData(
    symbol: string,
    timeframe: Timeframe,
    requiredPoints: number = 100,
    options: DataFetchOptions = {}
  ): Promise<FetchResult> {
    const { forceRefresh = false, maxAge = 24, fillGaps = true } = options;
    
    console.log(`📊 Fetching ${symbol} ${timeframe} data (${requiredPoints} points required)`);

    // If force refresh, skip cache and fetch fresh data
    if (forceRefresh) {
      return await this.fetchFreshData(symbol, timeframe, requiredPoints);
    }

    // Check if we have recent enough cached data
    const latestData = await this.store.getLatestData(symbol, timeframe);
    const now = new Date();
    
    if (latestData) {
      const ageHours = (now.getTime() - latestData.timestamp.getTime()) / (1000 * 60 * 60);
      
      if (ageHours <= maxAge) {
        // We have recent data, get it from cache
        const endDate = now;
        const startDate = this.calculateStartDate(timeframe, requiredPoints, endDate);
        
        const cachedData = await this.store.getHistoricalData(
          symbol, 
          timeframe, 
          startDate, 
          endDate, 
          requiredPoints
        );

        if (cachedData.length >= requiredPoints * 0.8) { // Allow 20% tolerance
          console.log(`✅ Cache hit: ${cachedData.length} points from cache`);
          return {
            data: cachedData.slice(-requiredPoints), // Take most recent points
            source: 'cache',
            cached: cachedData.length,
            fetched: 0
          };
        }
      }
    }

    // Need to fetch new data or fill gaps
    if (fillGaps) {
      return await this.smartFetch(symbol, timeframe, requiredPoints);
    } else {
      return await this.fetchFreshData(symbol, timeframe, requiredPoints);
    }
  }

  /**
   * Initial data setup - downloads comprehensive historical data
   */
  async initialDataSetup(
    symbol: string, 
    timeframes: Timeframe[] = ['1H', '4H', '1D', '1W', '1M'],
    onProgress?: (progress: { timeframe: Timeframe; progress: number; status: string }) => void
  ): Promise<{ success: boolean; results: Record<Timeframe, number>; errors: string[] }> {
    console.log(`🚀 Starting initial data setup for ${symbol}`);
    
    const results: Record<Timeframe, number> = {} as Record<Timeframe, number>;
    const errors: string[] = [];
    
    for (const timeframe of timeframes) {
      try {
        onProgress?.({ timeframe, progress: 0, status: 'Starting...' });
        
        // Calculate how much data we want to download initially
        const requiredPoints = this.getInitialDataPoints(timeframe);
        const endDate = new Date();
        const startDate = this.calculateStartDate(timeframe, requiredPoints, endDate);
        
        onProgress?.({ timeframe, progress: 25, status: 'Fetching from API...' });
        
        // Fetch comprehensive historical data
        const data = await this.fetchFromAPI(symbol, timeframe, requiredPoints);
        
        onProgress?.({ timeframe, progress: 75, status: 'Storing data...' });
        
        // Store in database
        const stored = await this.store.storeHistoricalData(data);
        results[timeframe] = stored;
        
        onProgress?.({ timeframe, progress: 100, status: `✅ Completed: ${stored} records` });
        
        console.log(`✅ ${timeframe}: Downloaded and stored ${stored} records`);
        
        // Add delay between requests to be respectful to APIs
        await this.delay(1000);
        
      } catch (error) {
        const errorMsg = `Failed to setup ${timeframe} data: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
        
        onProgress?.({ timeframe, progress: 100, status: `❌ Failed` });
      }
    }
    
    const success = errors.length === 0;
    console.log(success ? '🎉 Initial data setup completed successfully!' : '⚠️ Initial data setup completed with errors');
    
    return { success, results, errors };
  }

  /**
   * Update data - fills recent gaps
   */
  async updateData(
    symbols: string[],
    timeframes: Timeframe[] = ['1H', '4H', '1D']
  ): Promise<{ updated: number; errors: string[] }> {
    console.log(`🔄 Updating data for ${symbols.length} symbols, ${timeframes.length} timeframes`);
    
    let totalUpdated = 0;
    const errors: string[] = [];
    
    for (const symbol of symbols) {
      for (const timeframe of timeframes) {
        try {
          // Get gaps that need filling
          const gaps = await this.store.getDataGaps(symbol, timeframe);
          
          for (const gap of gaps) {
            const data = await this.fetchDateRange(symbol, timeframe, gap.start, gap.end);
            const stored = await this.store.storeHistoricalData(data);
            totalUpdated += stored;
            
            console.log(`📈 Updated ${symbol} ${timeframe}: ${stored} new records`);
          }
          
          await this.delay(500); // Rate limiting
          
        } catch (error) {
          const errorMsg = `Update failed for ${symbol} ${timeframe}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(`❌ ${errorMsg}`);
        }
      }
    }
    
    return { updated: totalUpdated, errors };
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    return this.store.getStorageStats();
  }

  /**
   * Clear all stored data
   */
  clearAllData(): void {
    this.store.clearAllData();
  }

  /**
   * Close database connection
   */
  close(): void {
    this.store.close();
  }

  // Private methods

  private async smartFetch(
    symbol: string,
    timeframe: Timeframe,
    requiredPoints: number
  ): Promise<FetchResult> {
    const errors: string[] = [];
    
    // Get what we have in cache
    const endDate = new Date();
    const startDate = this.calculateStartDate(timeframe, requiredPoints, endDate);
    
    const cachedData = await this.store.getHistoricalData(symbol, timeframe, startDate, endDate);
    
    // Determine what gaps we need to fill
    const gaps = await this.store.getDataGaps(symbol, timeframe);
    
    let fetchedData: MarketData[] = [];
    
    // Fill gaps
    for (const gap of gaps.slice(0, 2)) { // Limit to 2 gaps to avoid too many API calls
      try {
        const gapData = await this.fetchDateRange(symbol, timeframe, gap.start, gap.end);
        fetchedData = [...fetchedData, ...gapData];
        
        // Store immediately
        await this.store.storeHistoricalData(gapData);
      } catch (error) {
        errors.push(`Failed to fetch gap ${gap.start.toISOString()} to ${gap.end.toISOString()}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Get final combined data from cache (now updated)
    const finalData = await this.store.getHistoricalData(symbol, timeframe, startDate, endDate, requiredPoints);
    
    return {
      data: finalData.slice(-requiredPoints),
      source: cachedData.length > 0 ? 'mixed' : 'api',
      cached: cachedData.length,
      fetched: fetchedData.length,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  private async fetchFreshData(
    symbol: string,
    timeframe: Timeframe,
    requiredPoints: number
  ): Promise<FetchResult> {
    const data = await this.fetchFromAPI(symbol, timeframe, requiredPoints);
    
    // Store the fresh data
    const stored = await this.store.storeHistoricalData(data);
    
    return {
      data: data.slice(-requiredPoints),
      source: 'api',
      cached: 0,
      fetched: data.length
    };
  }

  private async fetchFromAPI(
    symbol: string,
    timeframe: Timeframe,
    requiredPoints: number
  ): Promise<MarketData[]> {
    // Try Yahoo Finance V2 first
    try {
      return await this.yahooV2.getHistoricalData(symbol, timeframe, requiredPoints);
    } catch (error) {
      console.warn(`Yahoo Finance V2 failed for ${symbol} ${timeframe}:`, error);
    }

    // Fallback to Alpha Vantage if configured
    if (this.alphaVantage.isConfigured()) {
      try {
        // Alpha Vantage implementation would go here
        throw new Error('Alpha Vantage not implemented in this method');
      } catch (error) {
        console.warn(`Alpha Vantage failed for ${symbol} ${timeframe}:`, error);
      }
    }

    throw new Error(`All API sources failed for ${symbol} ${timeframe}`);
  }

  private async fetchDateRange(
    symbol: string,
    timeframe: Timeframe,
    startDate: Date,
    endDate: Date
  ): Promise<MarketData[]> {
    // This would need to be implemented based on the API capabilities
    // For now, use the existing method
    const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    const estimatedPoints = Math.ceil(daysDiff * this.getPointsPerDay(timeframe));
    
    return await this.fetchFromAPI(symbol, timeframe, estimatedPoints);
  }

  private calculateStartDate(timeframe: Timeframe, requiredPoints: number, endDate: Date): Date {
    const start = new Date(endDate);
    
    switch (timeframe) {
      case '1H':
        start.setHours(start.getHours() - requiredPoints);
        break;
      case '4H':
        start.setHours(start.getHours() - (requiredPoints * 4));
        break;
      case '1D':
        start.setDate(start.getDate() - requiredPoints);
        break;
      case '1W':
        start.setDate(start.getDate() - (requiredPoints * 7));
        break;
      case '1M':
        start.setMonth(start.getMonth() - requiredPoints);
        break;
    }
    
    return start;
  }

  private getInitialDataPoints(timeframe: Timeframe): number {
    // How many points to download initially for each timeframe
    switch (timeframe) {
      case '1H':
        return 2000;  // Not supported by Yahoo Finance
      case '4H':
        return 1500;  // Not supported by Yahoo Finance
      case '1D':
        return 10000; // Maximum daily data (26+ years available)
      case '1W':
        return 1500;  // Maximum weekly data (26+ years available)
      case '1M':
        return 350;   // Maximum monthly data (26+ years available)
      default:
        return 10000;
    }
  }

  private getPointsPerDay(timeframe: Timeframe): number {
    switch (timeframe) {
      case '1H': return 24;
      case '4H': return 6;
      case '1D': return 1;
      case '1W': return 1/7;
      case '1M': return 1/30;
      default: return 1;
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}