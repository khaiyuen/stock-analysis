// Technical Indicator Types

export interface IndicatorValue {
  timestamp: Date;
  value: number | null;
}

export interface IndicatorSeries {
  name: string;
  type: IndicatorType;
  values: IndicatorValue[];
  parameters: Record<string, any>;
}

// Base indicator configuration
export interface IndicatorConfig {
  type: IndicatorType;
  parameters?: Record<string, any>;
  weight?: number; // For signal generation
}

// Specific indicator configurations
export interface SMAConfig extends IndicatorConfig {
  type: 'sma';
  parameters: {
    period: number;
  };
}

export interface EMAConfig extends IndicatorConfig {
  type: 'ema';
  parameters: {
    period: number;
  };
}

export interface RSIConfig extends IndicatorConfig {
  type: 'rsi';
  parameters: {
    period: number;
  };
}

export interface MACDConfig extends IndicatorConfig {
  type: 'macd';
  parameters: {
    fastPeriod: number;
    slowPeriod: number;
    signalPeriod: number;
  };
}

export interface BollingerBandsConfig extends IndicatorConfig {
  type: 'bollinger_bands';
  parameters: {
    period: number;
    stdDev: number;
  };
}

export interface StochasticConfig extends IndicatorConfig {
  type: 'stochastic';
  parameters: {
    kPeriod: number;
    dPeriod: number;
    smooth: number;
  };
}

export interface VWAPConfig extends IndicatorConfig {
  type: 'vwap';
  parameters: Record<string, never>;
}

export interface OBVConfig extends IndicatorConfig {
  type: 'obv';
  parameters: Record<string, never>;
}

// Union type for all indicator configurations
export type AnyIndicatorConfig = 
  | SMAConfig 
  | EMAConfig 
  | RSIConfig 
  | MACDConfig 
  | BollingerBandsConfig
  | StochasticConfig
  | VWAPConfig
  | OBVConfig;

// Technical indicator types
export type TechnicalIndicatorType = 
  | 'sma'
  | 'ema'
  | 'rsi'
  | 'macd'
  | 'bollinger_bands'
  | 'stochastic'
  | 'williams_r'
  | 'cci'
  | 'momentum'
  | 'roc'
  | 'vwap'
  | 'obv'
  | 'ad_line'
  | 'money_flow';

// Sentiment indicator types
export type SentimentIndicatorType =
  | 'vix'
  | 'put_call_ratio'
  | 'advance_decline'
  | 'new_highs_lows'
  | 'mcclellan_oscillator'
  | 'arms_index'
  | 'aaii_sentiment';

// Seasonal indicator types
export type SeasonalIndicatorType =
  | 'presidential_cycle'
  | 'monthly_seasonality'
  | 'day_of_week'
  | 'holiday_effect'
  | 'earnings_season';

// Macro indicator types
export type MacroIndicatorType =
  | 'fed_funds_rate'
  | 'yield_curve'
  | 'inflation_rate'
  | 'unemployment'
  | 'gdp_growth'
  | 'dollar_index'
  | 'commodity_prices';

// Combined indicator type
export type IndicatorType = 
  | TechnicalIndicatorType
  | SentimentIndicatorType  
  | SeasonalIndicatorType
  | MacroIndicatorType;

// Complex indicator results
export interface MACDResult {
  timestamp: Date;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
}

export interface BollingerBandsResult {
  timestamp: Date;
  upper: number | null;
  middle: number | null;
  lower: number | null;
  position?: number | null; // Position within bands (0-1)
}

export interface StochasticResult {
  timestamp: Date;
  k: number | null;
  d: number | null;
}

// Indicator signal types
export type SignalType = 'BUY' | 'SELL' | 'HOLD' | 'STRONG_BUY' | 'STRONG_SELL';
export type SignalStrength = 'WEAK' | 'MODERATE' | 'STRONG';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface IndicatorSignal {
  timestamp: Date;
  indicator: IndicatorType;
  signal: SignalType;
  strength: SignalStrength;
  confidence: number; // 0-1
  value?: number;
  description?: string;
}

// Combined signal from multiple indicators
export interface CombinedSignal {
  timestamp: Date;
  symbol: string;
  overall: SignalType;
  confidence: number;
  strength: SignalStrength;
  expectedReturn?: number;
  riskLevel: RiskLevel;
  timeHorizon: string;
  individualSignals: IndicatorSignal[];
  reasoning: string[];
}

// Indicator calculation request/response
export interface IndicatorRequest {
  symbol: string;
  indicators: AnyIndicatorConfig[];
  period?: string;
  interval?: string;
  startDate?: string;
  endDate?: string;
}

export interface IndicatorResponse {
  symbol: string;
  timestamps: number[];
  prices: {
    open: number[];
    high: number[];
    low: number[];
    close: number[];
    volume: number[];
  };
  indicators: Record<string, any>;
}

// Indicator metadata
export interface IndicatorMetadata {
  type: IndicatorType;
  name: string;
  category: 'technical' | 'sentiment' | 'seasonal' | 'macro';
  description: string;
  parameters: Array<{
    name: string;
    type: 'number' | 'string' | 'boolean';
    required: boolean;
    default?: any;
    description: string;
  }>;
  interpretation: {
    bullish: string[];
    bearish: string[];
    neutral: string[];
  };
  timeframes: string[];
  dataRequirements: {
    minPeriods: number;
    requiredFields: string[];
  };
}

// Pattern detection
export interface PatternResult {
  timestamp: Date;
  pattern: string;
  confidence: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  target?: number;
  stopLoss?: number;
  description: string;
}

// Support and resistance levels
export interface SupportResistanceLevel {
  price: number;
  strength: number; // 0-1
  type: 'SUPPORT' | 'RESISTANCE';
  touches: number;
  lastTouch: Date;
  timeframe: string;
}

// Divergence detection
export interface Divergence {
  timestamp: Date;
  type: 'BULLISH' | 'BEARISH';
  indicator: IndicatorType;
  strength: SignalStrength;
  pricePoints: { timestamp: Date; price: number }[];
  indicatorPoints: { timestamp: Date; value: number }[];
}