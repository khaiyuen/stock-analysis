// Market Data Types
export interface MarketData {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

export interface Quote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap?: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  lastUpdated: Date;
}

export interface HistoricalDataResponse {
  symbol: string;
  data: MarketData[];
  metadata: {
    lastRefreshed: Date;
    source: string;
    dataPoints: number;
  };
}

// Yahoo Finance API Types
export interface YahooHistoricalResponse {
  chart: {
    result: Array<{
      meta: {
        currency: string;
        symbol: string;
        exchangeName: string;
        instrumentType: string;
        firstTradeDate: number;
        regularMarketTime: number;
        gmtoffset: number;
        timezone: string;
      };
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
        adjclose?: Array<{
          adjclose: number[];
        }>;
      };
    }>;
    error: null;
  };
}

export interface YahooQuoteResponse {
  quoteResponse: {
    result: Array<{
      language: string;
      region: string;
      quoteType: string;
      typeDisp: string;
      quoteSourceName: string;
      triggerable: boolean;
      customPriceAlertConfidence: string;
      currency: string;
      marketState: string;
      regularMarketChangePercent: number;
      regularMarketPrice: number;
      exchange: string;
      shortName: string;
      longName: string;
      messageBoardId: string;
      exchangeTimezoneName: string;
      exchangeTimezoneShortName: string;
      gmtOffSetMilliseconds: number;
      market: string;
      esgPopulated: boolean;
      hasPrePostMarketData: boolean;
      firstTradeDateMilliseconds: number;
      priceHint: number;
      regularMarketChange: number;
      regularMarketTime: number;
      regularMarketDayHigh: number;
      regularMarketDayRange: string;
      regularMarketDayLow: number;
      regularMarketVolume: number;
      regularMarketPreviousClose: number;
      bid: number;
      ask: number;
      bidSize: number;
      askSize: number;
      fullExchangeName: string;
      financialCurrency: string;
      regularMarketOpen: number;
      averageDailyVolume3Month: number;
      averageDailyVolume10Day: number;
      fiftyTwoWeekLowChange: number;
      fiftyTwoWeekLowChangePercent: number;
      fiftyTwoWeekRange: string;
      fiftyTwoWeekHighChange: number;
      fiftyTwoWeekHighChangePercent: number;
      fiftyTwoWeekLow: number;
      fiftyTwoWeekHigh: number;
      dividendDate?: number;
      earningsTimestamp?: number;
      earningsTimestampStart?: number;
      earningsTimestampEnd?: number;
      trailingAnnualDividendRate?: number;
      trailingPE?: number;
      dividendRate?: number;
      trailingAnnualDividendYield?: number;
      dividendYield?: number;
      epsTrailingTwelveMonths?: number;
      epsForward?: number;
      epsCurrentYear?: number;
      priceEpsCurrentYear?: number;
      sharesOutstanding?: number;
      bookValue?: number;
      fiftyDayAverage?: number;
      fiftyDayAverageChange?: number;
      fiftyDayAverageChangePercent?: number;
      twoHundredDayAverage?: number;
      twoHundredDayAverageChange?: number;
      twoHundredDayAverageChangePercent?: number;
      marketCap?: number;
      forwardPE?: number;
      priceToBook?: number;
      sourceInterval?: number;
      exchangeDataDelayedBy?: number;
      pageViews?: {
        shortTermTrend: string;
        midTermTrend: string;
        longTermTrend: string;
      };
      symbol: string;
    }>;
    error: null;
  };
}

// Alpha Vantage API Types
export interface AlphaVantageResponse {
  'Meta Data': {
    '1. Information': string;
    '2. Symbol': string;
    '3. Last Refreshed': string;
    '4. Output Size': string;
    '5. Time Zone': string;
  };
  'Time Series (Daily)': {
    [date: string]: {
      '1. open': string;
      '2. high': string;
      '3. low': string;
      '4. close': string;
      '5. adjusted close': string;
      '6. volume': string;
      '7. dividend amount': string;
      '8. split coefficient': string;
    };
  };
}

// Time periods and intervals
export type TimePeriod = '1d' | '5d' | '1mo' | '3mo' | '6mo' | '1y' | '2y' | '5y' | '10y' | 'ytd' | 'max';
export type TimeInterval = '1m' | '2m' | '5m' | '15m' | '30m' | '60m' | '90m' | '1h' | '1d' | '5d' | '1wk' | '1mo' | '3mo';

// Data source types
export type DataSource = 'yahoo_finance' | 'alpha_vantage' | 'polygon' | 'iex_cloud';

export interface DataSourceConfig {
  source: DataSource;
  apiKey?: string;
  baseUrl: string;
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
  };
}

// Market session information
export interface MarketSession {
  market: string;
  timezone: string;
  isOpen: boolean;
  nextOpen?: Date;
  nextClose?: Date;
  regularHours: {
    start: string; // HH:MM format
    end: string;   // HH:MM format
  };
  preMarket?: {
    start: string;
    end: string;
  };
  afterHours?: {
    start: string;
    end: string;
  };
}