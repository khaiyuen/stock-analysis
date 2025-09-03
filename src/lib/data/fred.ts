import axios, { AxiosResponse } from 'axios';
import { 
  EconomicSeries, 
  EconomicDataPoint, 
  EconomicIndicator, 
  FREDSeriesResponse, 
  FREDSeriesInfo,
  FRED_SERIES 
} from '@/types';

export class FREDService {
  private readonly baseUrl = 'https://api.stlouisfed.org/fred';
  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FRED_API_KEY || '';
    if (!this.apiKey) {
      console.warn('FRED API key not provided. Service will not function properly.');
    }
  }

  /**
   * Get economic data series
   */
  async getSeries(
    seriesId: string,
    startDate?: Date,
    endDate?: Date,
    frequency?: string
  ): Promise<EconomicSeries> {
    try {
      const params: Record<string, any> = {
        series_id: seriesId,
        api_key: this.apiKey,
        file_type: 'json'
      };

      if (startDate) {
        params.observation_start = this.formatDate(startDate);
      }
      if (endDate) {
        params.observation_end = this.formatDate(endDate);
      }
      if (frequency) {
        params.frequency = frequency;
      }

      // Get series metadata first
      const infoResponse = await this.getSeriesInfo(seriesId);
      
      // Get series data
      const dataResponse: AxiosResponse<FREDSeriesResponse> = await axios.get(
        `${this.baseUrl}/series/observations`,
        { params }
      );

      if (!dataResponse.data.observations) {
        throw new Error(`No data found for series: ${seriesId}`);
      }

      const dataPoints: EconomicDataPoint[] = dataResponse.data.observations
        .map(obs => ({
          date: new Date(obs.date),
          value: obs.value === '.' ? null : parseFloat(obs.value)
        }))
        .filter(point => point.value !== null);

      return {
        indicator: {
          seriesId,
          title: infoResponse.title,
          units: infoResponse.units,
          frequency: this.mapFrequency(infoResponse.frequency),
          source: 'FRED',
          lastUpdated: new Date(infoResponse.last_updated)
        },
        data: dataPoints
      };
    } catch (error) {
      console.error(`Error fetching FRED series ${seriesId}:`, error);
      throw new Error(`Failed to fetch FRED series ${seriesId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get series metadata
   */
  async getSeriesInfo(seriesId: string): Promise<FREDSeriesInfo> {
    try {
      const params = {
        series_id: seriesId,
        api_key: this.apiKey,
        file_type: 'json'
      };

      const response = await axios.get(`${this.baseUrl}/series`, { params });
      
      if (!response.data.seriess || response.data.seriess.length === 0) {
        throw new Error(`No metadata found for series: ${seriesId}`);
      }

      return response.data.seriess[0];
    } catch (error) {
      console.error(`Error fetching series info for ${seriesId}:`, error);
      throw new Error(`Failed to fetch series info for ${seriesId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get multiple series at once
   */
  async getMultipleSeries(
    seriesIds: string[],
    startDate?: Date,
    endDate?: Date
  ): Promise<Record<string, EconomicSeries>> {
    const results: Record<string, EconomicSeries> = {};
    
    // FRED API doesn't support bulk requests, so we need to make individual calls
    for (const seriesId of seriesIds) {
      try {
        const series = await this.getSeries(seriesId, startDate, endDate);
        results[seriesId] = series;
        
        // Add delay to respect rate limits
        await this.delay(100);
      } catch (error) {
        console.warn(`Failed to fetch series ${seriesId}:`, error);
      }
    }

    return results;
  }

  /**
   * Get Federal Funds Rate
   */
  async getFedFundsRate(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.FED_FUNDS_RATE, startDate, endDate);
  }

  /**
   * Get unemployment rate
   */
  async getUnemploymentRate(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.UNEMPLOYMENT_RATE, startDate, endDate);
  }

  /**
   * Get inflation rate (CPI)
   */
  async getInflationRate(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.CPI_ALL_URBAN, startDate, endDate);
  }

  /**
   * Get GDP data
   */
  async getGDP(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.GDP, startDate, endDate);
  }

  /**
   * Get Treasury yields
   */
  async getTreasuryYields(startDate?: Date, endDate?: Date): Promise<Record<string, EconomicSeries>> {
    const yieldSeries = [
      FRED_SERIES.DGS3MO,
      FRED_SERIES.DGS2,
      FRED_SERIES.DGS5,
      FRED_SERIES.DGS10,
      FRED_SERIES.DGS30
    ];

    return this.getMultipleSeries(yieldSeries, startDate, endDate);
  }

  /**
   * Get VIX data
   */
  async getVIX(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.VIX, startDate, endDate);
  }

  /**
   * Get money supply (M2)
   */
  async getM2MoneySupply(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.M2_MONEY_SUPPLY, startDate, endDate);
  }

  /**
   * Get industrial production
   */
  async getIndustrialProduction(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.INDUSTRIAL_PRODUCTION, startDate, endDate);
  }

  /**
   * Get retail sales
   */
  async getRetailSales(startDate?: Date, endDate?: Date): Promise<EconomicSeries> {
    return this.getSeries(FRED_SERIES.RETAIL_SALES, startDate, endDate);
  }

  /**
   * Get housing data
   */
  async getHousingData(startDate?: Date, endDate?: Date): Promise<Record<string, EconomicSeries>> {
    const housingSeries = [
      FRED_SERIES.HOUSING_STARTS,
      FRED_SERIES.EXISTING_HOME_SALES,
      FRED_SERIES.CASE_SHILLER
    ];

    return this.getMultipleSeries(housingSeries, startDate, endDate);
  }

  /**
   * Get key economic indicators dashboard data
   */
  async getEconomicDashboard(startDate?: Date, endDate?: Date): Promise<Record<string, EconomicSeries>> {
    const keyIndicators = [
      FRED_SERIES.FED_FUNDS_RATE,
      FRED_SERIES.UNEMPLOYMENT_RATE,
      FRED_SERIES.CPI_ALL_URBAN,
      FRED_SERIES.GDP,
      FRED_SERIES.DGS10,
      FRED_SERIES.DGS2,
      FRED_SERIES.VIX,
      FRED_SERIES.INDUSTRIAL_PRODUCTION
    ];

    return this.getMultipleSeries(keyIndicators, startDate, endDate);
  }

  /**
   * Search for series by keywords
   */
  async searchSeries(searchText: string, limit: number = 20): Promise<any[]> {
    try {
      const params = {
        search_text: searchText,
        api_key: this.apiKey,
        file_type: 'json',
        limit
      };

      const response = await axios.get(`${this.baseUrl}/series/search`, { params });
      
      return response.data.seriess || [];
    } catch (error) {
      console.error(`Error searching FRED series with text "${searchText}":`, error);
      throw new Error(`Failed to search FRED series: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get categories (for browsing economic data categories)
   */
  async getCategories(categoryId?: number): Promise<any[]> {
    try {
      const params: Record<string, any> = {
        api_key: this.apiKey,
        file_type: 'json'
      };

      if (categoryId) {
        params.category_id = categoryId;
      }

      const response = await axios.get(`${this.baseUrl}/category/children`, { params });
      
      return response.data.categories || [];
    } catch (error) {
      console.error('Error fetching FRED categories:', error);
      throw new Error(`Failed to fetch FRED categories: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get latest release data
   */
  async getReleases(limit: number = 20): Promise<any[]> {
    try {
      const params = {
        api_key: this.apiKey,
        file_type: 'json',
        limit
      };

      const response = await axios.get(`${this.baseUrl}/releases`, { params });
      
      return response.data.releases || [];
    } catch (error) {
      console.error('Error fetching FRED releases:', error);
      throw new Error(`Failed to fetch FRED releases: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Format date for FRED API (YYYY-MM-DD)
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Map FRED frequency to our standard frequency
   */
  private mapFrequency(fredFreq: string): EconomicIndicator['frequency'] {
    const freqMap: Record<string, EconomicIndicator['frequency']> = {
      'd': 'Daily',
      'w': 'Weekly', 
      'm': 'Monthly',
      'q': 'Quarterly',
      'a': 'Annual'
    };
    
    return freqMap[fredFreq.toLowerCase()] || 'Monthly';
  }

  /**
   * Add delay between requests
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  /**
   * Get yield curve spread (10Y - 2Y)
   */
  async getYieldCurveSpread(startDate?: Date, endDate?: Date): Promise<EconomicDataPoint[]> {
    try {
      const yields = await this.getTreasuryYields(startDate, endDate);
      const twoYear = yields[FRED_SERIES.DGS2];
      const tenYear = yields[FRED_SERIES.DGS10];

      if (!twoYear || !tenYear) {
        throw new Error('Unable to fetch required yield data');
      }

      // Calculate spread for dates where both yields are available
      const spreads: EconomicDataPoint[] = [];
      const twoYearMap = new Map(twoYear.data.map(d => [d.date.toISOString().split('T')[0], d.value]));
      
      for (const tenYearPoint of tenYear.data) {
        const dateKey = tenYearPoint.date.toISOString().split('T')[0];
        const twoYearValue = twoYearMap.get(dateKey);
        
        if (tenYearPoint.value !== null && twoYearValue !== null) {
          spreads.push({
            date: tenYearPoint.date,
            value: tenYearPoint.value - twoYearValue
          });
        }
      }

      return spreads;
    } catch (error) {
      console.error('Error calculating yield curve spread:', error);
      throw new Error(`Failed to calculate yield curve spread: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}