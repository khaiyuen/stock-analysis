import axios, { AxiosResponse } from 'axios';
import { 
  MarketData, 
  Quote, 
  HistoricalDataResponse, 
  YahooHistoricalResponse, 
  YahooQuoteResponse,
  TimePeriod,
  TimeInterval
} from '@/types';

export class YahooFinanceService {
  private readonly baseUrl = 'https://query1.finance.yahoo.com';
  private readonly corsProxy = process.env.NODE_ENV === 'development' ? 'http://localhost:3001/proxy' : '';

  /**
   * Get historical data for a symbol
   */
  async getHistoricalData(
    symbol: string,
    period: TimePeriod = '1y',
    interval: TimeInterval = '1d'
  ): Promise<HistoricalDataResponse> {
    try {
      const url = `${this.corsProxy}${this.baseUrl}/v8/finance/chart/${symbol}`;
      const params = {
        period1: this.getPeriodStart(period),
        period2: Math.floor(Date.now() / 1000),
        interval,
        includePrePost: false,
        events: 'div,splits'
      };

      const response: AxiosResponse<YahooHistoricalResponse> = await axios.get(url, { params });
      
      if (!response.data.chart.result || response.data.chart.result.length === 0) {
        throw new Error(`No data found for symbol: ${symbol}`);
      }

      const result = response.data.chart.result[0];
      const quote = result.indicators.quote[0];
      const adjClose = result.indicators.adjclose?.[0]?.adjclose;

      const marketData: MarketData[] = result.timestamp.map((timestamp, index) => ({
        symbol,
        timestamp: new Date(timestamp * 1000),
        open: quote.open[index] || 0,
        high: quote.high[index] || 0,
        low: quote.low[index] || 0,
        close: quote.close[index] || 0,
        volume: quote.volume[index] || 0,
        adjustedClose: adjClose ? adjClose[index] : quote.close[index] || 0
      })).filter(data => data.open !== null && data.high !== null && data.low !== null && data.close !== null);

      return {
        symbol,
        data: marketData,
        metadata: {
          lastRefreshed: new Date(),
          source: 'yahoo_finance',
          dataPoints: marketData.length
        }
      };
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      throw new Error(`Failed to fetch historical data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get real-time quote for one or more symbols
   */
  async getQuote(symbols: string | string[]): Promise<Quote[]> {
    try {
      const symbolList = Array.isArray(symbols) ? symbols.join(',') : symbols;
      const url = `${this.corsProxy}${this.baseUrl}/v6/finance/quote`;
      const params = { symbols: symbolList };

      const response: AxiosResponse<YahooQuoteResponse> = await axios.get(url, { params });
      
      if (!response.data.quoteResponse.result || response.data.quoteResponse.result.length === 0) {
        throw new Error(`No quote data found for symbols: ${symbolList}`);
      }

      return response.data.quoteResponse.result.map(quote => ({
        symbol: quote.symbol,
        regularMarketPrice: quote.regularMarketPrice || 0,
        regularMarketChange: quote.regularMarketChange || 0,
        regularMarketChangePercent: quote.regularMarketChangePercent || 0,
        regularMarketVolume: quote.regularMarketVolume || 0,
        marketCap: quote.marketCap,
        regularMarketOpen: quote.regularMarketOpen || 0,
        regularMarketDayHigh: quote.regularMarketDayHigh || 0,
        regularMarketDayLow: quote.regularMarketDayLow || 0,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        lastUpdated: new Date(quote.regularMarketTime * 1000)
      }));
    } catch (error) {
      console.error(`Error fetching quote data for ${symbols}:`, error);
      throw new Error(`Failed to fetch quote data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get multiple quotes efficiently
   */
  async getMultipleQuotes(symbols: string[]): Promise<Quote[]> {
    // Yahoo Finance allows up to 100 symbols per request
    const batchSize = 100;
    const quotes: Quote[] = [];

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      try {
        const batchQuotes = await this.getQuote(batch);
        quotes.push(...batchQuotes);
      } catch (error) {
        console.warn(`Failed to fetch batch starting at index ${i}:`, error);
        // Continue with remaining batches
      }
    }

    return quotes;
  }

  /**
   * Search for symbols
   */
  async searchSymbols(query: string): Promise<Array<{ symbol: string; name: string; type: string }>> {
    try {
      const url = `${this.corsProxy}${this.baseUrl}/v1/finance/search`;
      const params = { q: query, quotesCount: 10, newsCount: 0 };

      const response = await axios.get(url, { params });
      
      if (!response.data.quotes) {
        return [];
      }

      return response.data.quotes.map((quote: any) => ({
        symbol: quote.symbol,
        name: quote.longname || quote.shortname || quote.symbol,
        type: quote.typeDisp || 'Stock'
      }));
    } catch (error) {
      console.error(`Error searching for symbols with query "${query}":`, error);
      return [];
    }
  }

  /**
   * Get company information
   */
  async getCompanyInfo(symbol: string): Promise<any> {
    try {
      const url = `${this.corsProxy}${this.baseUrl}/v10/finance/quoteSummary/${symbol}`;
      const params = {
        modules: 'summaryProfile,summaryDetail,assetProfile,fundProfile,price,quoteType,defaultKeyStatistics'
      };

      const response = await axios.get(url, { params });
      
      if (!response.data.quoteSummary.result || response.data.quoteSummary.result.length === 0) {
        throw new Error(`No company info found for symbol: ${symbol}`);
      }

      return response.data.quoteSummary.result[0];
    } catch (error) {
      console.error(`Error fetching company info for ${symbol}:`, error);
      throw new Error(`Failed to fetch company info for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if market is open
   */
  async getMarketStatus(): Promise<{ market: string; isOpen: boolean; nextOpen?: Date; nextClose?: Date }[]> {
    try {
      const url = `${this.corsProxy}${this.baseUrl}/v6/finance/quote`;
      const params = { symbols: 'SPY' }; // Use SPY as a proxy for US market

      const response = await axios.get(url, { params });
      const quote = response.data.quoteResponse.result[0];
      
      return [{
        market: 'US',
        isOpen: quote.marketState === 'REGULAR',
        // Would need additional API calls for exact open/close times
      }];
    } catch (error) {
      console.error('Error fetching market status:', error);
      return [{
        market: 'US',
        isOpen: false
      }];
    }
  }

  /**
   * Convert period string to Unix timestamp
   */
  private getPeriodStart(period: TimePeriod): number {
    const now = new Date();
    const startDate = new Date(now);

    switch (period) {
      case '1d':
        startDate.setDate(now.getDate() - 1);
        break;
      case '5d':
        startDate.setDate(now.getDate() - 5);
        break;
      case '1mo':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case '3mo':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case '6mo':
        startDate.setMonth(now.getMonth() - 6);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case '2y':
        startDate.setFullYear(now.getFullYear() - 2);
        break;
      case '5y':
        startDate.setFullYear(now.getFullYear() - 5);
        break;
      case '10y':
        startDate.setFullYear(now.getFullYear() - 10);
        break;
      case 'ytd':
        startDate.setMonth(0, 1); // January 1st of current year
        break;
      case 'max':
        startDate.setFullYear(1970); // Unix epoch
        break;
      default:
        startDate.setFullYear(now.getFullYear() - 1); // Default to 1 year
    }

    return Math.floor(startDate.getTime() / 1000);
  }

  /**
   * Get current stock price efficiently
   */
  async getCurrentPrice(symbol: string): Promise<number> {
    const quotes = await this.getQuote([symbol]);
    return quotes[0]?.regularMarketPrice || 0;
  }

  /**
   * Get historical data with date range
   */
  async getHistoricalDataRange(
    symbol: string,
    startDate: Date,
    endDate: Date,
    interval: TimeInterval = '1d'
  ): Promise<HistoricalDataResponse> {
    try {
      const url = `${this.corsProxy}${this.baseUrl}/v8/finance/chart/${symbol}`;
      const params = {
        period1: Math.floor(startDate.getTime() / 1000),
        period2: Math.floor(endDate.getTime() / 1000),
        interval,
        includePrePost: false,
        events: 'div,splits'
      };

      const response: AxiosResponse<YahooHistoricalResponse> = await axios.get(url, { params });
      
      if (!response.data.chart.result || response.data.chart.result.length === 0) {
        throw new Error(`No data found for symbol: ${symbol}`);
      }

      const result = response.data.chart.result[0];
      const quote = result.indicators.quote[0];
      const adjClose = result.indicators.adjclose?.[0]?.adjclose;

      const marketData: MarketData[] = result.timestamp.map((timestamp, index) => ({
        symbol,
        timestamp: new Date(timestamp * 1000),
        open: quote.open[index] || 0,
        high: quote.high[index] || 0,
        low: quote.low[index] || 0,
        close: quote.close[index] || 0,
        volume: quote.volume[index] || 0,
        adjustedClose: adjClose ? adjClose[index] : quote.close[index] || 0
      })).filter(data => data.open !== null && data.high !== null && data.low !== null && data.close !== null);

      return {
        symbol,
        data: marketData,
        metadata: {
          lastRefreshed: new Date(),
          source: 'yahoo_finance',
          dataPoints: marketData.length
        }
      };
    } catch (error) {
      console.error(`Error fetching historical data for ${symbol}:`, error);
      throw new Error(`Failed to fetch historical data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}