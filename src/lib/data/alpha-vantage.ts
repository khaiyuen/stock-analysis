import axios, { AxiosResponse } from 'axios';
import { 
  MarketData, 
  HistoricalDataResponse, 
  AlphaVantageResponse,
  TimeInterval
} from '@/types';

export class AlphaVantageService {
  private readonly baseUrl = 'https://www.alphavantage.co/query';
  private readonly apiKey: string;
  private rateLimitDelay = 12000; // 12 seconds between requests for free tier

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ALPHA_VANTAGE_API_KEY || '';
    if (!this.apiKey) {
      console.warn('Alpha Vantage API key not provided. Service will not function properly.');
    }
  }

  /**
   * Get daily historical data
   */
  async getDailyData(symbol: string, outputSize: 'compact' | 'full' = 'compact'): Promise<HistoricalDataResponse> {
    try {
      await this.rateLimitWait();
      
      const params = {
        function: 'TIME_SERIES_DAILY_ADJUSTED',
        symbol: symbol.toUpperCase(),
        outputsize: outputSize,
        apikey: this.apiKey
      };

      const response: AxiosResponse<AlphaVantageResponse> = await axios.get(this.baseUrl, { params });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      const timeSeries = response.data['Time Series (Daily)'];
      if (!timeSeries) {
        throw new Error(`No daily data found for symbol: ${symbol}`);
      }

      const marketData: MarketData[] = Object.entries(timeSeries)
        .map(([dateStr, values]) => ({
          symbol,
          timestamp: new Date(dateStr),
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['6. volume']),
          adjustedClose: parseFloat(values['5. adjusted close'])
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        symbol,
        data: marketData,
        metadata: {
          lastRefreshed: new Date(response.data['Meta Data']['3. Last Refreshed']),
          source: 'alpha_vantage',
          dataPoints: marketData.length
        }
      };
    } catch (error) {
      console.error(`Error fetching daily data for ${symbol}:`, error);
      throw new Error(`Failed to fetch daily data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get intraday data
   */
  async getIntradayData(
    symbol: string, 
    interval: '1min' | '5min' | '15min' | '30min' | '60min' = '60min',
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<HistoricalDataResponse> {
    try {
      await this.rateLimitWait();
      
      const params = {
        function: 'TIME_SERIES_INTRADAY',
        symbol: symbol.toUpperCase(),
        interval,
        outputsize: outputSize,
        apikey: this.apiKey
      };

      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      const timeSeries = response.data[`Time Series (${interval})`];
      if (!timeSeries) {
        throw new Error(`No intraday data found for symbol: ${symbol}`);
      }

      const marketData: MarketData[] = Object.entries(timeSeries)
        .map(([dateStr, values]: [string, any]) => ({
          symbol,
          timestamp: new Date(dateStr),
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['5. volume']),
          adjustedClose: parseFloat(values['4. close']) // Intraday doesn't have adjusted close
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        symbol,
        data: marketData,
        metadata: {
          lastRefreshed: new Date(response.data['Meta Data']['3. Last Refreshed']),
          source: 'alpha_vantage',
          dataPoints: marketData.length
        }
      };
    } catch (error) {
      console.error(`Error fetching intraday data for ${symbol}:`, error);
      throw new Error(`Failed to fetch intraday data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get weekly data
   */
  async getWeeklyData(symbol: string): Promise<HistoricalDataResponse> {
    try {
      await this.rateLimitWait();
      
      const params = {
        function: 'TIME_SERIES_WEEKLY_ADJUSTED',
        symbol: symbol.toUpperCase(),
        apikey: this.apiKey
      };

      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      const timeSeries = response.data['Weekly Adjusted Time Series'];
      if (!timeSeries) {
        throw new Error(`No weekly data found for symbol: ${symbol}`);
      }

      const marketData: MarketData[] = Object.entries(timeSeries)
        .map(([dateStr, values]: [string, any]) => ({
          symbol,
          timestamp: new Date(dateStr),
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['6. volume']),
          adjustedClose: parseFloat(values['5. adjusted close'])
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        symbol,
        data: marketData,
        metadata: {
          lastRefreshed: new Date(response.data['Meta Data']['3. Last Refreshed']),
          source: 'alpha_vantage',
          dataPoints: marketData.length
        }
      };
    } catch (error) {
      console.error(`Error fetching weekly data for ${symbol}:`, error);
      throw new Error(`Failed to fetch weekly data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get monthly data
   */
  async getMonthlyData(symbol: string): Promise<HistoricalDataResponse> {
    try {
      await this.rateLimitWait();
      
      const params = {
        function: 'TIME_SERIES_MONTHLY_ADJUSTED',
        symbol: symbol.toUpperCase(),
        apikey: this.apiKey
      };

      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      const timeSeries = response.data['Monthly Adjusted Time Series'];
      if (!timeSeries) {
        throw new Error(`No monthly data found for symbol: ${symbol}`);
      }

      const marketData: MarketData[] = Object.entries(timeSeries)
        .map(([dateStr, values]: [string, any]) => ({
          symbol,
          timestamp: new Date(dateStr),
          open: parseFloat(values['1. open']),
          high: parseFloat(values['2. high']),
          low: parseFloat(values['3. low']),
          close: parseFloat(values['4. close']),
          volume: parseInt(values['6. volume']),
          adjustedClose: parseFloat(values['5. adjusted close'])
        }))
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

      return {
        symbol,
        data: marketData,
        metadata: {
          lastRefreshed: new Date(response.data['Meta Data']['3. Last Refreshed']),
          source: 'alpha_vantage',
          dataPoints: marketData.length
        }
      };
    } catch (error) {
      console.error(`Error fetching monthly data for ${symbol}:`, error);
      throw new Error(`Failed to fetch monthly data for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get company overview/fundamentals
   */
  async getCompanyOverview(symbol: string): Promise<any> {
    try {
      await this.rateLimitWait();
      
      const params = {
        function: 'OVERVIEW',
        symbol: symbol.toUpperCase(),
        apikey: this.apiKey
      };

      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      return response.data;
    } catch (error) {
      console.error(`Error fetching company overview for ${symbol}:`, error);
      throw new Error(`Failed to fetch company overview for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get technical indicator data
   */
  async getTechnicalIndicator(
    symbol: string,
    indicatorFunction: string,
    interval: TimeInterval,
    params: Record<string, any> = {}
  ): Promise<any> {
    try {
      await this.rateLimitWait();
      
      const requestParams = {
        function: indicatorFunction.toUpperCase(),
        symbol: symbol.toUpperCase(),
        interval,
        apikey: this.apiKey,
        ...params
      };

      const response = await axios.get(this.baseUrl, { params: requestParams });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      return response.data;
    } catch (error) {
      console.error(`Error fetching ${indicatorFunction} for ${symbol}:`, error);
      throw new Error(`Failed to fetch ${indicatorFunction} for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get SMA (Simple Moving Average)
   */
  async getSMA(symbol: string, interval: TimeInterval = '1d', timePeriod: number = 20): Promise<any> {
    return this.getTechnicalIndicator(symbol, 'SMA', interval, {
      time_period: timePeriod,
      series_type: 'close'
    });
  }

  /**
   * Get EMA (Exponential Moving Average)
   */
  async getEMA(symbol: string, interval: TimeInterval = '1d', timePeriod: number = 20): Promise<any> {
    return this.getTechnicalIndicator(symbol, 'EMA', interval, {
      time_period: timePeriod,
      series_type: 'close'
    });
  }

  /**
   * Get RSI (Relative Strength Index)
   */
  async getRSI(symbol: string, interval: TimeInterval = '1d', timePeriod: number = 14): Promise<any> {
    return this.getTechnicalIndicator(symbol, 'RSI', interval, {
      time_period: timePeriod,
      series_type: 'close'
    });
  }

  /**
   * Get MACD (Moving Average Convergence Divergence)
   */
  async getMACD(
    symbol: string, 
    interval: TimeInterval = '1d',
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
  ): Promise<any> {
    return this.getTechnicalIndicator(symbol, 'MACD', interval, {
      series_type: 'close',
      fastperiod: fastPeriod,
      slowperiod: slowPeriod,
      signalperiod: signalPeriod
    });
  }

  /**
   * Get Bollinger Bands
   */
  async getBollingerBands(
    symbol: string,
    interval: TimeInterval = '1d',
    timePeriod: number = 20,
    nbdevup: number = 2,
    nbdevdn: number = 2
  ): Promise<any> {
    return this.getTechnicalIndicator(symbol, 'BBANDS', interval, {
      time_period: timePeriod,
      series_type: 'close',
      nbdevup,
      nbdevdn
    });
  }

  /**
   * Search for symbols
   */
  async searchSymbols(keywords: string): Promise<any> {
    try {
      await this.rateLimitWait();
      
      const params = {
        function: 'SYMBOL_SEARCH',
        keywords,
        apikey: this.apiKey
      };

      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      return response.data.bestMatches || [];
    } catch (error) {
      console.error(`Error searching for symbols with keywords "${keywords}":`, error);
      throw new Error(`Failed to search symbols: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get global market quotes
   */
  async getGlobalQuote(symbol: string): Promise<any> {
    try {
      await this.rateLimitWait();
      
      const params = {
        function: 'GLOBAL_QUOTE',
        symbol: symbol.toUpperCase(),
        apikey: this.apiKey
      };

      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded. Please try again later.');
      }

      return response.data['Global Quote'];
    } catch (error) {
      console.error(`Error fetching global quote for ${symbol}:`, error);
      throw new Error(`Failed to fetch global quote for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rate limiting for API requests
   */
  private async rateLimitWait(): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, this.rateLimitDelay);
    });
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Set rate limit delay (useful for premium accounts)
   */
  setRateLimitDelay(milliseconds: number): void {
    this.rateLimitDelay = milliseconds;
  }
}