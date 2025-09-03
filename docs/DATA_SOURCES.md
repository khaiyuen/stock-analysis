# Data Sources Reference

## Overview
Comprehensive guide to all external data sources, APIs, and data schemas used in the Stock Analysis Platform.

## Market Data Sources

### Yahoo Finance API
**Base URL**: `https://query1.finance.yahoo.com/`

**Endpoints**:
```typescript
// Historical Data
GET /v8/finance/chart/{symbol}?period1={start}&period2={end}&interval={interval}

// Real-time Quote
GET /v6/finance/quote?symbols={symbols}

// Company Info
GET /v10/finance/quoteSummary/{symbol}?modules=summaryDetail,assetProfile
```

**Rate Limits**: 
- 2,000 requests/hour
- No API key required
- Best for: Historical data, basic quotes

**Data Schema**:
```typescript
interface YahooHistoricalData {
  timestamp: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  adjclose: number[];
}

interface YahooQuote {
  symbol: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap: number;
}
```

### Alpha Vantage API
**Base URL**: `https://www.alphavantage.co/query`
**API Key**: Required (free tier: 25 calls/day)

**Endpoints**:
```typescript
// Daily Adjusted
GET ?function=TIME_SERIES_DAILY_ADJUSTED&symbol={symbol}&apikey={key}

// Intraday
GET ?function=TIME_SERIES_INTRADAY&symbol={symbol}&interval={interval}&apikey={key}

// Technical Indicators
GET ?function={indicator}&symbol={symbol}&interval={interval}&apikey={key}
```

**Rate Limits**:
- Free: 25 requests/day, 5 requests/minute
- Premium: Up to 1,200 requests/minute
- Best for: Technical indicators, fundamental data

**Data Schema**:
```typescript
interface AlphaVantageDaily {
  'Meta Data': {
    'Information': string;
    'Symbol': string;
    'Last Refreshed': string;
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
    };
  };
}
```

### Polygon.io API
**Base URL**: `https://api.polygon.io/`
**API Key**: Required (free tier: 5 calls/minute)

**Endpoints**:
```typescript
// Aggregates (OHLCV)
GET /v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from}/{to}?apikey={key}

// Real-time Trades
GET /v3/trades/{symbol}?timestamp.gte={timestamp}&apikey={key}

// Market Status
GET /v1/marketstatus/now?apikey={key}
```

**Rate Limits**:
- Free: 5 requests/minute
- Basic: 100 requests/minute
- Advanced: Up to 1,000 requests/minute
- Best for: High-quality data, real-time feeds

## Economic Data Sources

### FRED (Federal Reserve Economic Data)
**Base URL**: `https://api.stlouisfed.org/fred/`
**API Key**: Required (free, no rate limits)

**Key Series**:
```typescript
const FRED_SERIES = {
  FED_FUNDS_RATE: 'FEDFUNDS',
  UNEMPLOYMENT: 'UNRATE',
  INFLATION_CPI: 'CPIAUCSL',
  INFLATION_PCE: 'PCEPI',
  GDP_GROWTH: 'GDP',
  M2_MONEY_SUPPLY: 'M2SL',
  DGS10: 'DGS10', // 10-Year Treasury
  DGS2: 'DGS2',   // 2-Year Treasury
  DGS3MO: 'DGS3MO', // 3-Month Treasury
  VIX: 'VIXCLS',
};
```

**Endpoints**:
```typescript
// Series Data
GET /series/observations?series_id={series_id}&api_key={key}&file_type=json

// Series Info
GET /series?series_id={series_id}&api_key={key}&file_type=json
```

**Data Schema**:
```typescript
interface FREDSeries {
  observations: Array<{
    realtime_start: string;
    realtime_end: string;
    date: string;
    value: string;
  }>;
}
```

### Bureau of Labor Statistics (BLS)
**Base URL**: `https://api.bls.gov/publicAPI/v2/timeseries/data/`

**Key Series**:
```typescript
const BLS_SERIES = {
  CPI_ALL_URBAN: 'CUUR0000SA0', // Consumer Price Index
  PPI_FINISHED_GOODS: 'PPIFGS', // Producer Price Index
  EMPLOYMENT_COST: 'CIU1010000000000A', // Employment Cost Index
  PRODUCTIVITY: 'PRS85006092', // Labor Productivity
};
```

**Rate Limits**:
- Unregistered: 25 queries/day
- Registered: 500 queries/day
- Best for: Employment, inflation, productivity data

## Market Breadth Data

### NYSE Advance/Decline Data
**Source**: Yahoo Finance or Alpha Vantage
**Symbols**: 
- `$ADVN-NY` (Advancing Issues)
- `$DECL-NY` (Declining Issues)
- `$ADD-NY` (Advance/Decline Line)

### NASDAQ Breadth Data
**Symbols**:
- `$ADVN-NQ` (NASDAQ Advancing)
- `$DECL-NQ` (NASDAQ Declining)
- `$UVOL-NY` (Up Volume)
- `$DVOL-NY` (Down Volume)

## Sentiment Data Sources

### VIX and Fear Indicators
```typescript
const SENTIMENT_SYMBOLS = {
  VIX: '^VIX',           // CBOE Volatility Index
  VIX9D: '^VIX9D',       // 9-Day VIX
  VXN: '^VXN',           // NASDAQ Volatility
  RVX: '^RVX',           // Russell 2000 Volatility
  SKEW: 'SKEW',          // CBOE SKEW Index
};
```

### Put/Call Ratio
**Source**: CBOE or market data providers
**Symbols**:
- `$CPCE` (CBOE Put/Call Ratio)
- `$CPC` (CBOE Total Put/Call)

## Currency and Commodity Data

### Major Currencies
```typescript
const CURRENCY_PAIRS = {
  DXY: 'DX-Y.NYB',       // US Dollar Index
  EURUSD: 'EURUSD=X',    // Euro/USD
  USDJPY: 'JPY=X',       // USD/Japanese Yen
  GBPUSD: 'GBPUSD=X',    // British Pound/USD
};
```

### Commodities
```typescript
const COMMODITIES = {
  GOLD: 'GC=F',          // Gold Futures
  SILVER: 'SI=F',        // Silver Futures
  OIL_WTI: 'CL=F',       // Crude Oil WTI
  OIL_BRENT: 'BZ=F',     // Brent Crude
  COPPER: 'HG=F',        // Copper
  NATURAL_GAS: 'NG=F',   // Natural Gas
};
```

## Data Pipeline Architecture

### Data Ingestion Flow
```typescript
interface DataPipeline {
  source: 'yahoo' | 'alphavantage' | 'polygon' | 'fred' | 'bls';
  symbol: string;
  interval: '1min' | '5min' | '1hour' | '1day' | '1week' | '1month';
  fields: string[];
  lastUpdate: Date;
  nextUpdate: Date;
}
```

### Data Storage Schema
```sql
-- Time series data table
CREATE TABLE market_data (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  open DECIMAL(10,4),
  high DECIMAL(10,4),
  low DECIMAL(10,4),
  close DECIMAL(10,4),
  volume BIGINT,
  adjusted_close DECIMAL(10,4),
  source VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, timestamp, source)
);

-- Create hypertable for time-series optimization
SELECT create_hypertable('market_data', 'timestamp');

-- Economic indicators table
CREATE TABLE economic_indicators (
  id SERIAL PRIMARY KEY,
  series_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  value DECIMAL(15,6),
  source VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(series_id, date)
);

-- Technical indicators cache
CREATE TABLE indicator_cache (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL,
  indicator_type VARCHAR(50) NOT NULL,
  period INTEGER,
  timestamp TIMESTAMPTZ NOT NULL,
  value DECIMAL(15,6),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, indicator_type, period, timestamp)
);
```

### Error Handling and Retry Logic
```typescript
interface APIError {
  source: string;
  endpoint: string;
  error: string;
  timestamp: Date;
  retryCount: number;
  nextRetry: Date;
}

const retryConfig = {
  maxRetries: 3,
  backoffMultiplier: 2,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
};
```

## Data Quality and Validation

### Data Quality Checks
```typescript
interface DataQualityCheck {
  symbol: string;
  checks: {
    missingData: boolean;
    priceSpikes: boolean; // > 20% daily change without news
    volumeSpikes: boolean; // > 5x average volume
    dataConsistency: boolean; // OHLC relationships
    timestampGaps: boolean;
  };
  lastValidated: Date;
  score: number; // 0-100 quality score
}
```

### Data Cleaning Rules
1. **Price Validation**: High >= Low, Close between High/Low
2. **Volume Validation**: Non-negative, reasonable bounds
3. **Missing Data**: Interpolation vs flagging
4. **Corporate Actions**: Split/dividend adjustments
5. **Outlier Detection**: Statistical methods for anomaly detection

## Rate Limiting and Caching Strategy

### Rate Limit Management
```typescript
interface RateLimiter {
  source: string;
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  currentMinute: number;
  currentHour: number;
  currentDay: number;
  resetTimes: {
    minute: Date;
    hour: Date;
    day: Date;
  };
}
```

### Caching Strategy
- **L1 Cache**: Redis (hot data, real-time quotes)
- **L2 Cache**: Database (warm data, recent history)
- **L3 Cache**: File system (cold data, deep history)
- **Cache TTL**: 
  - Real-time data: 30 seconds
  - Daily data: 4 hours
  - Historical data: 24 hours
  - Economic data: 6 hours

## API Integration Examples

### TypeScript Service Classes
```typescript
// Abstract base class
abstract class DataService {
  protected baseURL: string;
  protected apiKey?: string;
  protected rateLimiter: RateLimiter;
  
  abstract fetchHistoricalData(symbol: string, period: string): Promise<any>;
  abstract fetchRealTimeQuote(symbol: string): Promise<any>;
}

// Yahoo Finance implementation
class YahooFinanceService extends DataService {
  constructor() {
    super();
    this.baseURL = 'https://query1.finance.yahoo.com';
  }
  
  async fetchHistoricalData(symbol: string, period: string) {
    // Implementation
  }
}

// Alpha Vantage implementation
class AlphaVantageService extends DataService {
  constructor(apiKey: string) {
    super();
    this.baseURL = 'https://www.alphavantage.co';
    this.apiKey = apiKey;
  }
  
  async fetchHistoricalData(symbol: string, period: string) {
    // Implementation
  }
}
```

This documentation provides the foundation for implementing robust data ingestion and management systems for the stock analysis platform.