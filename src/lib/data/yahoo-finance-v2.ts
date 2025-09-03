import yahooFinance from 'yahoo-finance2';
import { MarketData, HistoricalDataResponse, Timeframe } from '@/types';

export class YahooFinanceV2Service {
  
  /**
   * Map our timeframe to Yahoo Finance intervals
   * Only supports intervals that Yahoo Finance actually provides
   */
  private mapTimeframeToInterval(timeframe: Timeframe): string | null {
    const mapping: Record<Timeframe, string | null> = {
      '1H': null,   // Not supported by Yahoo Finance
      '4H': null,   // Not supported by Yahoo Finance
      '1D': '1d',
      '1W': '1wk',
      '1M': '1mo'
    };
    return mapping[timeframe] || null;
  }


  /**
   * Get start date for timeframe
   */
  private getStartDateForTimeframe(timeframe: Timeframe, requiredPoints: number): Date {
    const now = new Date();
    const startDate = new Date(now);

    // Calculate how far back we need to go to get required points
    switch (timeframe) {
      case '1H':
        throw new Error('1H timeframe is not supported by Yahoo Finance');
      
      case '4H':
        throw new Error('4H timeframe is not supported by Yahoo Finance');
      
      case '1D':
      case '1W':
      case '1M':
        // Get maximum historical data available from Yahoo Finance
        // Set to a very early date and let Yahoo Finance return what's available
        // QQQ: March 10, 1999 | SPY: January 29, 1993 | AAPL: December 12, 1980
        startDate.setFullYear(1980, 0, 1); // January 1, 1980 - before most symbols existed
        break;
      
      default:
        // Default to 2 years
        startDate.setFullYear(now.getFullYear() - 2);
    }

    // No artificial time limits - let Yahoo Finance return what it has available
    // For QQQ, this goes back to March 10, 1999 (inception date)

    return startDate;
  }

  /**
   * Get historical data for a symbol and timeframe
   */
  async getHistoricalData(
    symbol: string,
    timeframe: Timeframe,
    requiredPoints: number = 100
  ): Promise<MarketData[]> {
    const interval = this.mapTimeframeToInterval(timeframe);
    
    if (!interval) {
      throw new Error(`Timeframe ${timeframe} is not supported by Yahoo Finance. Only 1D, 1W, and 1M are available.`);
    }
    
    try {
      const startDate = this.getStartDateForTimeframe(timeframe, requiredPoints);
      const endDate = new Date(); // Current date

      console.log(`Fetching ${symbol} data: interval=${interval}, from=${startDate.toISOString().split('T')[0]} to=${endDate.toISOString().split('T')[0]}`);

      const result = await yahooFinance.historical(symbol, {
        period1: startDate,
        period2: endDate,
        interval: interval as any,
        includeAdjustedClose: true
      });

      if (!result || result.length === 0) {
        throw new Error(`No data returned for ${symbol}`);
      }

      // Convert to our MarketData format
      const marketData: MarketData[] = result
        .filter(item => item.open && item.high && item.low && item.close)
        .map(item => ({
          symbol,
          timestamp: item.date,
          open: item.open!,
          high: item.high!,
          low: item.low!,
          close: item.close!,
          volume: item.volume || 0,
          adjustedClose: item.adjClose || item.close!
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        // Return all available historical data (no artificial slicing)

      console.log(`Retrieved ${marketData.length} data points for ${symbol} ${timeframe}`);
      return marketData;

    } catch (error) {
      console.error(`Yahoo Finance V2 error for ${symbol} ${timeframe}:`, error);
      throw error;
    }
  }

  /**
   * Get quote for a symbol
   */
  async getQuote(symbol: string) {
    try {
      const result = await yahooFinance.quote(symbol);
      return {
        symbol: result.symbol,
        regularMarketPrice: result.regularMarketPrice || 0,
        regularMarketChange: result.regularMarketChange || 0,
        regularMarketChangePercent: result.regularMarketChangePercent || 0,
        regularMarketVolume: result.regularMarketVolume || 0,
        marketCap: result.marketCap,
        regularMarketOpen: result.regularMarketOpen || 0,
        regularMarketDayHigh: result.regularMarketDayHigh || 0,
        regularMarketDayLow: result.regularMarketDayLow || 0,
        fiftyTwoWeekHigh: result.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: result.fiftyTwoWeekLow,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error(`Quote error for ${symbol}:`, error);
      throw error;
    }
  }


  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getQuote('AAPL');
      return true;
    } catch (error) {
      console.error('Yahoo Finance V2 connection test failed:', error);
      return false;
    }
  }
}