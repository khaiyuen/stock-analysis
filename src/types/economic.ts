// Economic Data Types

export interface EconomicIndicator {
  seriesId: string;
  title: string;
  units: string;
  frequency: 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Annual';
  source: 'FRED' | 'BLS' | 'Treasury' | 'Other';
  lastUpdated: Date;
}

export interface EconomicDataPoint {
  date: Date;
  value: number | null;
  revision?: number;
}

export interface EconomicSeries {
  indicator: EconomicIndicator;
  data: EconomicDataPoint[];
}

// FRED API Types
export interface FREDSeriesResponse {
  realtime_start: string;
  realtime_end: string;
  observation_start: string;
  observation_end: string;
  units: string;
  output_type: number;
  file_type: string;
  order_by: string;
  sort_order: string;
  count: number;
  offset: number;
  limit: number;
  observations: Array<{
    realtime_start: string;
    realtime_end: string;
    date: string;
    value: string;
  }>;
}

export interface FREDSeriesInfo {
  id: string;
  realtime_start: string;
  realtime_end: string;
  title: string;
  observation_start: string;
  observation_end: string;
  frequency: string;
  frequency_short: string;
  units: string;
  units_short: string;
  seasonal_adjustment: string;
  seasonal_adjustment_short: string;
  last_updated: string;
  popularity: number;
  group_popularity: number;
  notes: string;
}

// Pre-defined economic series
export const FRED_SERIES = {
  // Federal Reserve
  FED_FUNDS_RATE: 'FEDFUNDS',
  FED_FUNDS_TARGET: 'DFEDTARU',
  M1_MONEY_SUPPLY: 'M1SL',
  M2_MONEY_SUPPLY: 'M2SL',
  
  // Treasury Yields
  DGS3MO: 'DGS3MO',   // 3-Month Treasury
  DGS2: 'DGS2',       // 2-Year Treasury
  DGS5: 'DGS5',       // 5-Year Treasury
  DGS10: 'DGS10',     // 10-Year Treasury
  DGS30: 'DGS30',     // 30-Year Treasury
  
  // Inflation
  CPI_ALL_URBAN: 'CPIAUCSL',      // Consumer Price Index
  CPI_CORE: 'CPILFESL',           // Core CPI (ex food & energy)
  PCE_PRICE_INDEX: 'PCEPI',       // PCE Price Index
  PCE_CORE: 'PCEPILFE',           // Core PCE
  
  // Employment
  UNEMPLOYMENT_RATE: 'UNRATE',
  NONFARM_PAYROLLS: 'PAYEMS',
  JOBLESS_CLAIMS: 'ICSA',
  PARTICIPATION_RATE: 'CIVPART',
  
  // Economic Growth
  GDP: 'GDP',
  GDP_REAL: 'GDPC1',
  INDUSTRIAL_PRODUCTION: 'INDPRO',
  RETAIL_SALES: 'RSAFS',
  
  // Housing
  HOUSING_STARTS: 'HOUST',
  EXISTING_HOME_SALES: 'EXHOSLUSM495S',
  CASE_SHILLER: 'CSUSHPISA',
  
  // Financial Markets
  VIX: 'VIXCLS',
  CORPORATE_SPREADS: 'BAMLC0A0CM',
  TED_SPREAD: 'TEDRATE',
  
  // International
  DOLLAR_INDEX: 'DTWEXBGS',
  CRUDE_OIL: 'DCOILWTICO',
  GOLD_PRICE: 'GOLDAMGBD228NLBM',
} as const;

// BLS Series IDs
export const BLS_SERIES = {
  CPI_ALL_URBAN: 'CUUR0000SA0',
  CPI_CORE: 'CUUR0000SA0L1E',
  PPI_FINISHED_GOODS: 'PPIFGS',
  EMPLOYMENT_COST_INDEX: 'CIU1010000000000A',
  PRODUCTIVITY: 'PRS85006092',
} as const;

// Yield curve data
export interface YieldCurvePoint {
  maturity: string; // e.g., "3MO", "2YR", "10YR"
  rate: number;
  days: number; // Days to maturity
}

export interface YieldCurve {
  date: Date;
  rates: YieldCurvePoint[];
  spread2y10y: number;
  spread3mo10y: number;
  interpretation: 'NORMAL' | 'FLAT' | 'INVERTED' | 'STEEP';
}

// Economic calendar events
export interface EconomicEvent {
  id: string;
  date: Date;
  time?: string;
  event: string;
  country: string;
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  actual?: number;
  forecast?: number;
  previous?: number;
  unit?: string;
  description?: string;
}

// Federal Reserve meeting data
export interface FOMCMeeting {
  date: Date;
  type: 'FOMC_MEETING' | 'SPEECH' | 'TESTIMONY' | 'MINUTES_RELEASE';
  title: string;
  summary?: string;
  rateDecision?: {
    previous: number;
    current: number;
    votes: {
      for: number;
      against: number;
      abstain: number;
    };
  };
  dotPlot?: {
    year: number;
    projections: number[];
    median: number;
  }[];
}

// Sector performance data
export interface SectorPerformance {
  sector: string;
  symbol?: string; // ETF symbol representing sector
  performance: {
    '1d': number;
    '1w': number;
    '1m': number;
    '3m': number;
    '6m': number;
    '1y': number;
    'ytd': number;
  };
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
}

// Economic indicator interpretation
export interface EconomicInterpretation {
  indicator: string;
  currentValue: number;
  previousValue?: number;
  change?: number;
  changePercent?: number;
  interpretation: {
    trend: 'IMPROVING' | 'DETERIORATING' | 'STABLE';
    level: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
    marketImpact: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number; // 0-1
  };
  historical: {
    percentile: number; // Where current value sits in historical range
    zScore: number;     // Standard deviations from mean
    range: {
      min: number;
      max: number;
      mean: number;
    };
  };
}

// Composite economic indicators
export interface CompositeIndicator {
  name: string;
  components: Array<{
    seriesId: string;
    weight: number;
    transformation?: 'LEVEL' | 'CHANGE' | 'PERCENT_CHANGE' | 'Z_SCORE';
  }>;
  value: number;
  change: number;
  interpretation: EconomicInterpretation['interpretation'];
}

// Predefined composite indicators
export interface LEI { // Leading Economic Indicators
  value: number;
  change: number;
  components: {
    averageWorkweek: number;
    joblessClaimsInverse: number;
    manufacturingNewOrders: number;
    vendorDeliveries: number;
    capitalGoodsOrders: number;
    buildingPermits: number;
    stockPrices: number;
    moneySupply: number;
    interestRateSpread: number;
    consumerExpectations: number;
  };
}

export interface InflationExpectations {
  breakeven5y: number;  // 5-year breakeven inflation rate
  breakeven10y: number; // 10-year breakeven inflation rate
  tip5y: number;        // 5-year TIPS spread
  tip10y: number;       // 10-year TIPS spread
  surveys: {
    michigan: number;   // University of Michigan inflation expectations
    survey: number;     // Survey of Professional Forecasters
  };
}

// Economic regime classification
export type EconomicRegime = 
  | 'EXPANSION'
  | 'PEAK'
  | 'RECESSION'
  | 'TROUGH'
  | 'RECOVERY';

export interface RegimeClassification {
  current: EconomicRegime;
  probability: Record<EconomicRegime, number>;
  duration: number; // Months in current regime
  indicators: {
    gdpGrowth: number;
    unemploymentTrend: 'RISING' | 'FALLING' | 'STABLE';
    inflationTrend: 'RISING' | 'FALLING' | 'STABLE';
    yieldCurve: 'NORMAL' | 'FLAT' | 'INVERTED';
    stockMarket: 'BULL' | 'BEAR' | 'SIDEWAYS';
  };
}

// Central bank policy stance
export interface PolicyStance {
  bank: 'FED' | 'ECB' | 'BOJ' | 'BOE' | 'PBOC';
  stance: 'DOVISH' | 'NEUTRAL' | 'HAWKISH';
  confidence: number;
  indicators: {
    rateDirection: 'CUTTING' | 'HOLDING' | 'RAISING';
    speechSentiment: number; // -1 to 1
    meetingMinutesSentiment: number;
    balanceSheetAction: 'EXPANDING' | 'STABLE' | 'CONTRACTING';
  };
  nextMeetingExpectation: {
    date: Date;
    rateProbabilities: Record<number, number>; // Rate -> Probability
  };
}