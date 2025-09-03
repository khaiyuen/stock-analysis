// Data service exports
export { YahooFinanceService } from './yahoo-finance';
export { AlphaVantageService } from './alpha-vantage';
export { FREDService } from './fred';

import { YahooFinanceService } from './yahoo-finance';
import { AlphaVantageService } from './alpha-vantage';
import { FREDService } from './fred';
import { DataSource, MarketData, HistoricalDataResponse, Quote, EconomicSeries } from '@/types';

/**
 * Unified data service that aggregates multiple data sources
 */
export class DataService {
  private yahooFinance: YahooFinanceService;
  private alphaVantage: AlphaVantageService;
  private fred: FREDService;

  constructor(config: {
    alphaVantageApiKey?: string;
    fredApiKey?: string;
  } = {}) {
    this.yahooFinance = new YahooFinanceService();
    this.alphaVantage = new AlphaVantageService(config.alphaVantageApiKey);
    this.fred = new FREDService(config.fredApiKey);
  }

  /**
   * Get historical market data with fallback sources
   */
  async getHistoricalData(
    symbol: string,
    period: string = '1y',
    interval: string = '1d',
    preferredSource: DataSource = 'yahoo_finance'
  ): Promise<HistoricalDataResponse> {
    const sources = this.getSourcePriorityOrder(preferredSource);
    
    for (const source of sources) {
      try {
        switch (source) {
          case 'yahoo_finance':
            return await this.yahooFinance.getHistoricalData(symbol, period as any, interval as any);
          
          case 'alpha_vantage':
            if (this.alphaVantage.isConfigured()) {
              if (interval === '1d') {
                return await this.alphaVantage.getDailyData(symbol);
              } else if (['1min', '5min', '15min', '30min', '60min'].includes(interval)) {
                return await this.alphaVantage.getIntradayData(symbol, interval as any);
              }
            }
            break;
            
          default:
            continue;
        }
      } catch (error) {
        console.warn(`Failed to fetch data from ${source} for ${symbol}:`, error);
        continue;
      }
    }
    
    throw new Error(`Failed to fetch historical data for ${symbol} from all available sources`);
  }

  /**
   * Get real-time quotes
   */
  async getQuotes(symbols: string | string[]): Promise<Quote[]> {
    try {
      return await this.yahooFinance.getQuote(symbols);
    } catch (error) {
      console.error('Failed to fetch quotes:', error);
      throw new Error(`Failed to fetch quotes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get economic data
   */
  async getEconomicData(
    seriesId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<EconomicSeries> {
    if (!this.fred.isConfigured()) {
      throw new Error('FRED API key not configured');
    }
    
    return await this.fred.getSeries(seriesId, startDate, endDate);
  }

  /**
   * Get multiple economic indicators
   */
  async getEconomicIndicators(
    seriesIds: string[],
    startDate?: Date,
    endDate?: Date
  ): Promise<Record<string, EconomicSeries>> {
    if (!this.fred.isConfigured()) {
      throw new Error('FRED API key not configured');
    }
    
    return await this.fred.getMultipleSeries(seriesIds, startDate, endDate);
  }

  /**
   * Search for symbols
   */
  async searchSymbols(query: string): Promise<Array<{ symbol: string; name: string; type: string; source: string }>> {
    const results: Array<{ symbol: string; name: string; type: string; source: string }> = [];
    
    // Search Yahoo Finance
    try {
      const yahooResults = await this.yahooFinance.searchSymbols(query);
      results.push(...yahooResults.map(r => ({ ...r, source: 'yahoo_finance' })));
    } catch (error) {
      console.warn('Yahoo Finance search failed:', error);
    }
    
    // Search Alpha Vantage if configured
    if (this.alphaVantage.isConfigured()) {
      try {
        const alphaVantageResults = await this.alphaVantage.searchSymbols(query);
        results.push(...alphaVantageResults.map((r: any) => ({
          symbol: r['1. symbol'],
          name: r['2. name'],
          type: r['3. type'],
          source: 'alpha_vantage'
        })));
      } catch (error) {
        console.warn('Alpha Vantage search failed:', error);
      }
    }
    
    // Remove duplicates based on symbol
    const uniqueResults = results.filter((result, index, self) =>
      index === self.findIndex(r => r.symbol === result.symbol)
    );
    
    return uniqueResults.slice(0, 20); // Limit to 20 results
  }

  /**
   * Get company information
   */
  async getCompanyInfo(symbol: string): Promise<any> {
    try {
      return await this.yahooFinance.getCompanyInfo(symbol);
    } catch (error) {
      if (this.alphaVantage.isConfigured()) {
        try {
          return await this.alphaVantage.getCompanyOverview(symbol);
        } catch (alphaError) {
          console.warn('Both Yahoo Finance and Alpha Vantage failed for company info:', error, alphaError);
        }
      }
      throw new Error(`Failed to fetch company info for ${symbol}`);
    }
  }

  /**
   * Get market status
   */
  async getMarketStatus(): Promise<{ market: string; isOpen: boolean; nextOpen?: Date; nextClose?: Date }[]> {
    try {
      return await this.yahooFinance.getMarketStatus();
    } catch (error) {
      console.warn('Failed to fetch market status:', error);
      return [{
        market: 'US',
        isOpen: false
      }];
    }
  }

  /**
   * Get data source health status
   */
  async getDataSourceStatus(): Promise<Record<DataSource, { available: boolean; configured: boolean; lastError?: string }>> {
    const status: Record<DataSource, { available: boolean; configured: boolean; lastError?: string }> = {
      yahoo_finance: { available: false, configured: true },
      alpha_vantage: { available: false, configured: this.alphaVantage.isConfigured() },
      polygon: { available: false, configured: false },
      iex_cloud: { available: false, configured: false }
    };

    // Test Yahoo Finance
    try {
      await this.yahooFinance.getQuote('AAPL');
      status.yahoo_finance.available = true;
    } catch (error) {
      status.yahoo_finance.lastError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test Alpha Vantage
    if (this.alphaVantage.isConfigured()) {
      try {
        await this.alphaVantage.getGlobalQuote('AAPL');
        status.alpha_vantage.available = true;
      } catch (error) {
        status.alpha_vantage.lastError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return status;
  }

  /**
   * Get source priority order based on preference
   */
  private getSourcePriorityOrder(preferredSource: DataSource): DataSource[] {
    const sources: DataSource[] = ['yahoo_finance', 'alpha_vantage', 'polygon', 'iex_cloud'];
    
    // Move preferred source to front
    const filtered = sources.filter(s => s !== preferredSource);
    return [preferredSource, ...filtered];
  }

  /**
   * Validate symbol format
   */
  static validateSymbol(symbol: string): boolean {
    // Basic symbol validation - alphanumeric, dots, and hyphens
    const symbolRegex = /^[A-Z0-9.-]+$/i;
    return symbolRegex.test(symbol) && symbol.length <= 10;
  }

  /**
   * Format symbol for API requests
   */
  static formatSymbol(symbol: string): string {
    return symbol.toUpperCase().trim();
  }

  /**
   * Get supported intervals for a data source
   */
  static getSupportedIntervals(source: DataSource): string[] {
    switch (source) {
      case 'yahoo_finance':
        return ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];
      case 'alpha_vantage':
        return ['1min', '5min', '15min', '30min', '60min', '1d', '1wk', '1mo'];
      default:
        return ['1d'];
    }
  }

  /**
   * Get supported periods for a data source
   */
  static getSupportedPeriods(source: DataSource): string[] {
    switch (source) {
      case 'yahoo_finance':
        return ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'];
      case 'alpha_vantage':
        return ['compact', 'full']; // Alpha Vantage uses different period system
      default:
        return ['1y'];
    }
  }
}

// Create default instance
export const dataService = new DataService();

// Export utility functions
export const validateSymbol = DataService.validateSymbol;
export const formatSymbol = DataService.formatSymbol;
export const getSupportedIntervals = DataService.getSupportedIntervals;
export const getSupportedPeriods = DataService.getSupportedPeriods;