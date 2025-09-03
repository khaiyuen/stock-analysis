// Trend Analysis Types

import { MarketData } from './market';

// Timeframes for multi-timeframe analysis
export type Timeframe = '1M' | '1W' | '1D' | '4H' | '1H';

// Pivot point detection
export interface PivotPoint {
  id: string;
  timestamp: Date;
  price: number;
  type: 'HIGH' | 'LOW';
  timeframe: Timeframe;
  strength: number;
  volume: number;
  confirmations: number;
  metadata: {
    lookbackWindow: number;
    priceDeviation: number;
    volumeRatio: number;
    candleIndex: number;
  };
}

// Trendline representation
export interface TrendLine {
  id: string;
  timeframe: Timeframe;
  type: 'SUPPORT' | 'RESISTANCE';
  pivotPoints: PivotPoint[];
  equation: {
    slope: number;
    intercept: number;
    rSquared: number;
  };
  strength: number;
  touchCount: number;
  avgDeviation: number;
  createdAt: Date;
  lastTouched: Date;
  isActive: boolean;
  isDynamic?: boolean; // Flag to distinguish dynamic trendlines
  projectedLevels: {
    current: number;
    oneDay: number;
    oneWeek: number;
    oneMonth: number;
  };
  metadata: {
    ageInDays: number;
    recentTouches: number;
    maxStreak: number;
    lastBreak?: Date;
  };
}

// Convergence zone analysis
export interface ConvergenceZone {
  id: string;
  priceLevel: number;
  upperBound: number;
  lowerBound: number;
  strength: number;
  classification: 'WEAK' | 'MODERATE' | 'STRONG' | 'VERY_STRONG';
  contributingLines: TrendLine[];
  timeframes: Timeframe[];
  confidence: number;
  lastTest: Date;
  testCount: number;
  breakoutProbability: number;
  metadata: {
    avgLineStrength: number;
    timeframeDiversity: number;
    recentTouches: number;
    historicalRespect: number;
    zoneWidth: number;
  };
}

// Configuration for pivot detection
export interface PivotDetectionConfig {
  timeframe: Timeframe;
  lookbackWindow: number;
  minStrength: number;
  volumeWeight: number;
  minSeparation: number; // Minimum bars between pivots
}

// Configuration for trendline generation
export interface TrendlineConfig {
  timeframe: Timeframe;
  minPivots: number;
  maxAge: number; // Maximum age in days
  bufferPercent: number;
  maxSlope: number; // Maximum slope in degrees
  minTouchCount: number;
}

// Configuration for convergence analysis
export interface ConvergenceConfig {
  priceThreshold: number; // Percentage threshold for grouping lines
  minLines: number;
  strengthWeights: {
    touchCount: number;
    ageWeight: number;
    accuracyWeight: number;
    timeframeWeight: Record<Timeframe, number>;
  };
}

// Complete trend analysis result
export interface TrendAnalysis {
  symbol: string;
  timestamp: Date;
  timeframes: Timeframe[];
  pivotPoints: Record<Timeframe, PivotPoint[]>;
  trendLines: Record<Timeframe, TrendLine[]>;
  convergenceZones: ConvergenceZone[];
  marketData: Record<Timeframe, MarketData[]>; // Include raw market data for chart rendering
  metadata: {
    analysisTime: number; // milliseconds
    dataPoints: Record<Timeframe, number>;
    lastUpdated: Record<Timeframe, Date>;
    cacheHits: number;
  };
}

// Analysis request parameters
export interface TrendAnalysisRequest {
  symbol: string;
  timeframes: Timeframe[];
  config?: {
    pivot?: Partial<PivotDetectionConfig>;
    trendline?: Partial<TrendlineConfig>;
    convergence?: Partial<ConvergenceConfig>;
  };
  useCache?: boolean;
  forceRefresh?: boolean;
}

// Real-time update event
export interface TrendUpdateEvent {
  symbol: string;
  timeframe: Timeframe;
  type: 'PIVOT_DETECTED' | 'LINE_BROKEN' | 'ZONE_TESTED' | 'NEW_CONVERGENCE';
  data: {
    pivot?: PivotPoint;
    line?: TrendLine;
    zone?: ConvergenceZone;
    price?: number;
  };
  timestamp: Date;
}

// Historical validation metrics
export interface ValidationMetrics {
  symbol: string;
  period: {
    start: Date;
    end: Date;
  };
  pivotAccuracy: {
    detected: number;
    confirmed: number;
    accuracy: number;
  };
  lineRespect: {
    totalTouches: number;
    respectCount: number;
    respectRate: number;
  };
  convergenceEffectiveness: {
    zonesIdentified: number;
    successfulZones: number;
    effectiveness: number;
  };
  falseBreakouts: {
    totalBreakouts: number;
    falseBreakouts: number;
    falseBreakoutRate: number;
  };
  timeframeMetrics: Record<Timeframe, Partial<ValidationMetrics>>;
}

// Chart visualization configuration
export interface TrendVisualization {
  showTimeframes: Timeframe[];
  minLineStrength: number;
  showConvergenceZones: boolean;
  colorScheme: Record<Timeframe, string>;
  lineStyles: {
    strong: 'solid';
    moderate: 'dashed';
    weak: 'dotted';
  };
  zoneOpacity: number;
  showProjections: boolean;
  maxHistoricalLines: number;
}

// Trading signal based on trend analysis
export interface TrendSignal {
  id: string;
  symbol: string;
  timestamp: Date;
  type: 'SUPPORT_APPROACH' | 'RESISTANCE_APPROACH' | 'BREAKOUT' | 'BREAKDOWN';
  strength: number;
  confidence: number;
  priceLevel: number;
  relatedZone?: ConvergenceZone;
  contributingFactors: {
    convergenceStrength: number;
    timeframeAlignment: number;
    recentRespect: number;
    volumeConfirmation: number;
  };
  tradingLevels: {
    entry: number;
    stopLoss: number;
    target1: number;
    target2?: number;
  };
  riskReward: number;
  expiresAt: Date;
}

// Performance tracking
export interface AnalysisPerformance {
  operation: string;
  timeframe?: Timeframe;
  startTime: number;
  endTime: number;
  duration: number;
  dataPoints: number;
  memoryUsage: number;
  cacheHits: number;
  cacheMisses: number;
}

// Cache entry for analysis results
export interface AnalysisCache {
  key: string;
  symbol: string;
  timeframe: Timeframe;
  data: PivotPoint[] | TrendLine[] | ConvergenceZone[];
  createdAt: Date;
  expiresAt: Date;
  hits: number;
  lastAccessed: Date;
}

// Batch analysis request for multiple symbols
export interface BatchAnalysisRequest {
  symbols: string[];
  timeframes: Timeframe[];
  priority: 'HIGH' | 'NORMAL' | 'LOW';
  config?: TrendAnalysisRequest['config'];
  callback?: string; // Webhook URL for results
}

// Analysis status for batch operations
export interface AnalysisStatus {
  requestId: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  results: TrendAnalysis[];
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
  estimatedCompletion?: Date;
}

// Alert configuration
export interface TrendAlert {
  id: string;
  userId?: string;
  symbol: string;
  name: string;
  conditions: {
    type: 'PRICE_APPROACH_ZONE' | 'ZONE_BREAK' | 'NEW_CONVERGENCE' | 'LINE_TOUCH';
    zoneId?: string;
    lineId?: string;
    priceLevel?: number;
    threshold: number; // Distance threshold
    minStrength?: number;
  };
  notification: {
    email?: boolean;
    webhook?: string;
    mobile?: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  triggeredAt?: Date;
  triggerCount: number;
}

// Market regime classification for trend analysis
export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'SIDEWAYS' | 'VOLATILE';

export interface MarketContext {
  symbol: string;
  regime: MarketRegime;
  volatility: number;
  trendStrength: number;
  volume: 'HIGH' | 'NORMAL' | 'LOW';
  timeframeBias: Record<Timeframe, 'BULLISH' | 'BEARISH' | 'NEUTRAL'>;
  dominantTimeframe: Timeframe;
  contextAt: Date;
}

// Extended analysis with market context
export interface ContextualTrendAnalysis extends TrendAnalysis {
  marketContext: MarketContext;
  adaptedConfigurations: Record<Timeframe, {
    pivot: PivotDetectionConfig;
    trendline: TrendlineConfig;
    convergence: ConvergenceConfig;
  }>;
  regimeAdjustments: {
    bufferAdjustment: number;
    strengthThreshold: number;
    convergenceWeight: number;
  };
}