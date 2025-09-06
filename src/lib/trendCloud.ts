import { MarketData, PivotPoint, Timeframe } from '@/types';
import { v4 as uuidv4 } from 'uuid';

class PriceBinner {
  private precision: number;
  
  constructor(decimalPlaces: number = 2) {
    this.precision = Math.pow(10, decimalPlaces);
  }
  
  toBin(price: number): number {
    return Math.round(price * this.precision);
  }
  
  fromBin(bin: number): number {
    return bin / this.precision;
  }
  
  snapToGrid(price: number, binSize: number): number {
    const binSizeInt = Math.round(binSize * this.precision);
    const priceInt = this.toBin(price);
    const snappedInt = Math.round(priceInt / binSizeInt) * binSizeInt;
    return this.fromBin(snappedInt);
  }
}

interface SpatialIndex {
  pivots: PivotPoint[];
  timeIndex: Map<number, PivotPoint[]>;
  priceIndex: Map<number, PivotPoint[]>;
}

function createSpatialIndex(pivots: PivotPoint[]): SpatialIndex {
  const timeIndex = new Map<number, PivotPoint[]>();
  const priceIndex = new Map<number, PivotPoint[]>();
  const binner = new PriceBinner(2);
  
  for (const pivot of pivots) {
    const timeKey = Math.floor(new Date(pivot.timestamp).getTime() / (24 * 60 * 60 * 1000));
    const priceKey = binner.toBin(pivot.price);
    
    if (!timeIndex.has(timeKey)) timeIndex.set(timeKey, []);
    if (!priceIndex.has(priceKey)) priceIndex.set(priceKey, []);
    
    timeIndex.get(timeKey)!.push(pivot);
    priceIndex.get(priceKey)!.push(pivot);
  }
  
  return { pivots, timeIndex, priceIndex };
}

function validateMarketData(marketData: MarketData[]): void {
  if (!Array.isArray(marketData)) {
    throw new Error('Market data must be an array');
  }
  
  if (marketData.length < 5) {
    throw new Error('Insufficient market data: minimum 5 data points required');
  }
  
  for (let i = 0; i < marketData.length; i++) {
    const data = marketData[i];
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid market data at index ${i}`);
    }
    
    if (typeof data.high !== 'number' || typeof data.low !== 'number' || 
        typeof data.close !== 'number' || typeof data.volume !== 'number') {
      throw new Error(`Invalid market data types at index ${i}`);
    }
    
    if (data.high < data.low || data.close < 0 || data.volume < 0) {
      throw new Error(`Invalid market data values at index ${i}`);
    }
    
    if (!data.timestamp) {
      throw new Error(`Missing timestamp at index ${i}`);
    }
  }
}

export interface TrendCloudPoint {
  id: string;
  symbol: string;
  calculationDate: Date; // The date this cloud was calculated for
  targetDate: Date; // 5 days ahead prediction target
  timeframe: Timeframe;
  priceLevel: number;
  weight: number; // Normalized weight (sum across all price levels = constant)
  normalizedWeight: number; // Weight as percentage of total daily weight
  density: number; // Visual density for shading (0-1)
  trendlineCount: number; // Number of trendlines contributing
  confidence: number; // 0-1 based on trendline quality metrics
  metadata: {
    lookbackDays: number;
    totalTrendlines: number;
    avgTrendlineStrength: number;
    priceRange: { min: number; max: number };
    totalDailyWeight: number; // Total weight for this prediction day
  };
}

interface ConvergenceZone {
  centerPrice: number;
  priceRange: { min: number; max: number };
  convergingTrendlines: PowerfulTrendline[];
  totalStrength: number; // Sum of trendline strengths
  avgConfidence: number; // Average R-squared of converging lines
  weight: number; // Allocated weight based on convergence strength
}

export interface TrendCloudData {
  symbol: string;
  calculationDate: Date;
  targetDate: Date;
  timeframe: Timeframe;
  lookbackDays: number; // Always 365 for consistency
  convergenceZones: ConvergenceZone[];
  cloudPoints: TrendCloudPoint[];
  summary: {
    totalWeight: number; // Always constant (e.g., 100)
    totalTrendlines: number;
    convergenceZoneCount: number;
    peakPrice: number;
    peakWeight: number;
    peakDensity: number;
    concentrationRatio: number; // How many zones vs spread
    priceRange: { min: number; max: number };
    confidenceScore: number;
  };
}

function calculatePivotStrength(marketData: MarketData[], index: number, type: 'HIGH' | 'LOW'): number {
  const current = marketData[index];
  const lookback = 10;
  const start = Math.max(0, index - lookback);
  const end = Math.min(marketData.length - 1, index + lookback);
  
  let volumeSum = 0;
  let priceRange = 0;
  let count = 0;
  
  for (let i = start; i <= end; i++) {
    if (i !== index) {
      volumeSum += marketData[i].volume;
      const priceDiff = type === 'HIGH' 
        ? Math.abs(marketData[i].high - current.high)
        : Math.abs(marketData[i].low - current.low);
      priceRange += priceDiff;
      count++;
    }
  }
  
  const avgVolume = count > 0 ? volumeSum / count : 1;
  const avgPriceRange = count > 0 ? priceRange / count : 1;
  const volumeRatio = current.volume / avgVolume;
  const priceSignificance = avgPriceRange > 0 ? (current.high - current.low) / avgPriceRange : 1;
  
  return Math.min(1.0, Math.max(0.1, (volumeRatio * 0.4 + priceSignificance * 0.6)));
}

interface RawPivot {
  index: number;
  price: number;
  logPrice: number;
  type: 'HIGH' | 'LOW';
  timestamp: Date;
  method: string;
  strength: number;
}

// Ultra-enhanced pivot detection using multiple methods on LOG SCALE (from notebook)
export function detectClientSidePivots(marketData: MarketData[], timeframe: Timeframe): PivotPoint[] {
  validateMarketData(marketData);
  
  // Convert to log scale for analysis
  const logPrices = marketData.map(candle => Math.log(candle.close));
  const regularPrices = marketData.map(candle => candle.close);
  
  const allPivots: RawPivot[] = [];
  
  // Method 1: Scipy-style argrelextrema with multiple windows (LOG SCALE)
  for (const window of [2, 3, 4, 5, 7, 10, 15]) {
    const swingHighs = findLocalExtrema(logPrices, 'max', window);
    const swingLows = findLocalExtrema(logPrices, 'min', window);
    
    for (const idx of swingHighs) {
      allPivots.push({
        index: idx,
        price: regularPrices[idx],
        logPrice: logPrices[idx],
        type: 'HIGH',
        timestamp: new Date(marketData[idx].timestamp),
        method: `scipy_w${window}`,
        strength: window
      });
    }
    
    for (const idx of swingLows) {
      allPivots.push({
        index: idx,
        price: regularPrices[idx],
        logPrice: logPrices[idx],
        type: 'LOW',
        timestamp: new Date(marketData[idx].timestamp),
        method: `scipy_w${window}`,
        strength: window
      });
    }
  }
  
  // Method 2: Rolling window extremes (LOG SCALE)
  for (const window of [3, 5, 7, 10, 15, 20]) {
    const rollingExtrema = findRollingExtrema(logPrices, regularPrices, marketData, window);
    allPivots.push(...rollingExtrema);
  }
  
  // Method 3: ZigZag with multiple thresholds (LOG SCALE)
  for (const threshold of [0.01, 0.015, 0.02, 0.03, 0.05, 0.08]) {
    const zigzagPivots = detectZigZagPivots(logPrices, regularPrices, marketData, threshold);
    for (const pivot of zigzagPivots) {
      pivot.method = `zigzag_${(threshold * 100).toFixed(1)}pct`;
      pivot.strength = 1 / threshold;
      allPivots.push(pivot);
    }
  }
  
  // Method 4: Fractal-based detection (LOG SCALE)
  const fractalPivots = detectFractalPivots(logPrices, regularPrices, marketData, 2);
  for (const pivot of fractalPivots) {
    pivot.method = 'fractal';
    pivot.strength = 3;
    allPivots.push(pivot);
  }
  
  // Method 5: Slope change detection (LOG SCALE)
  const slopePivots = detectSlopeChangePivots(logPrices, regularPrices, marketData, 3);
  for (const pivot of slopePivots) {
    pivot.method = 'slope';
    pivot.strength = 2;
    allPivots.push(pivot);
  }
  
  // Method 6: Derivative-based detection (LOG SCALE)
  const derivativePivots = detectDerivativePivots(logPrices, regularPrices, marketData);
  for (const pivot of derivativePivots) {
    pivot.method = 'derivative';
    pivot.strength = 1.5;
    allPivots.push(pivot);
  }
  
  // Combine overlapping pivots with tighter proximity
  const combinedPivots = combineOverlappingPivots(allPivots, 3);
  
  // Convert to PivotPoint format
  return combinedPivots.map(pivot => ({
    id: uuidv4(),
    timestamp: pivot.timestamp,
    price: pivot.price,
    type: pivot.type,
    timeframe,
    strength: pivot.strength,
    volume: marketData[pivot.index]?.volume || 0,
    confirmations: 0,
    metadata: {
      lookbackWindow: 2,
      priceDeviation: Math.abs(marketData[pivot.index]?.high - marketData[pivot.index]?.low) || 0,
      volumeRatio: marketData[pivot.index]?.volume / (marketData[Math.max(0, pivot.index - 10)]?.volume || 1) || 1,
      candleIndex: pivot.index,
      logPrice: pivot.logPrice,
      detectionMethod: pivot.method,
      enhancedStrength: pivot.strength
    }
  })).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

// Helper functions for ultra-enhanced pivot detection
function findLocalExtrema(logPrices: number[], type: 'max' | 'min', order: number): number[] {
  const indices: number[] = [];
  
  for (let i = order; i < logPrices.length - order; i++) {
    let isExtremum = true;
    
    for (let j = i - order; j <= i + order; j++) {
      if (j !== i) {
        if (type === 'max' && logPrices[j] >= logPrices[i]) {
          isExtremum = false;
          break;
        }
        if (type === 'min' && logPrices[j] <= logPrices[i]) {
          isExtremum = false;
          break;
        }
      }
    }
    
    if (isExtremum) {
      indices.push(i);
    }
  }
  
  return indices;
}

function findRollingExtrema(logPrices: number[], regularPrices: number[], marketData: MarketData[], window: number): RawPivot[] {
  const pivots: RawPivot[] = [];
  const halfWindow = Math.floor(window / 2);
  
  for (let i = halfWindow; i < logPrices.length - halfWindow; i++) {
    const windowStart = i - halfWindow;
    const windowEnd = i + halfWindow + 1;
    const windowSlice = logPrices.slice(windowStart, windowEnd);
    
    const maxVal = Math.max(...windowSlice);
    const minVal = Math.min(...windowSlice);
    
    if (logPrices[i] === maxVal) {
      pivots.push({
        index: i,
        price: regularPrices[i],
        logPrice: logPrices[i],
        type: 'HIGH',
        timestamp: new Date(marketData[i].timestamp),
        method: `rolling_w${window}`,
        strength: window / 3
      });
    }
    
    if (logPrices[i] === minVal) {
      pivots.push({
        index: i,
        price: regularPrices[i],
        logPrice: logPrices[i],
        type: 'LOW',
        timestamp: new Date(marketData[i].timestamp),
        method: `rolling_w${window}`,
        strength: window / 3
      });
    }
  }
  
  return pivots;
}

function detectZigZagPivots(logPrices: number[], regularPrices: number[], marketData: MarketData[], threshold: number): RawPivot[] {
  const pivots: RawPivot[] = [];
  
  if (logPrices.length < 3) return pivots;
  
  let lastPivotIdx = 0;
  let lastPivotLogPrice = logPrices[0];
  let direction: 'up' | 'down' | null = null;
  const logThreshold = Math.log(1 + threshold);
  
  for (let i = 1; i < logPrices.length; i++) {
    const logPrice = logPrices[i];
    const pctChange = logPrice - lastPivotLogPrice; // Log difference = percentage change
    
    if (direction === null) {
      if (pctChange > logThreshold) {
        direction = 'up';
      } else if (pctChange < -logThreshold) {
        direction = 'down';
      }
    } else if (direction === 'up') {
      if (pctChange < -logThreshold) {
        pivots.push({
          index: lastPivotIdx,
          price: regularPrices[lastPivotIdx],
          logPrice: logPrices[lastPivotIdx],
          type: 'HIGH',
          timestamp: new Date(marketData[lastPivotIdx].timestamp),
          method: 'zigzag',
          strength: 1
        });
        direction = 'down';
        lastPivotIdx = i;
        lastPivotLogPrice = logPrice;
      } else if (logPrice > lastPivotLogPrice) {
        lastPivotIdx = i;
        lastPivotLogPrice = logPrice;
      }
    } else if (direction === 'down') {
      if (pctChange > logThreshold) {
        pivots.push({
          index: lastPivotIdx,
          price: regularPrices[lastPivotIdx],
          logPrice: logPrices[lastPivotIdx],
          type: 'LOW',
          timestamp: new Date(marketData[lastPivotIdx].timestamp),
          method: 'zigzag',
          strength: 1
        });
        direction = 'up';
        lastPivotIdx = i;
        lastPivotLogPrice = logPrice;
      } else if (logPrice < lastPivotLogPrice) {
        lastPivotIdx = i;
        lastPivotLogPrice = logPrice;
      }
    }
  }
  
  return pivots;
}

function detectFractalPivots(logPrices: number[], regularPrices: number[], marketData: MarketData[], lookback: number = 2): RawPivot[] {
  const pivots: RawPivot[] = [];
  
  for (let i = lookback; i < logPrices.length - lookback; i++) {
    let isFractalHigh = true;
    let isFractalLow = true;
    
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i) {
        if (logPrices[j] >= logPrices[i]) isFractalHigh = false;
        if (logPrices[j] <= logPrices[i]) isFractalLow = false;
      }
    }
    
    if (isFractalHigh) {
      pivots.push({
        index: i,
        price: regularPrices[i],
        logPrice: logPrices[i],
        type: 'HIGH',
        timestamp: new Date(marketData[i].timestamp),
        method: 'fractal',
        strength: 3
      });
    }
    
    if (isFractalLow) {
      pivots.push({
        index: i,
        price: regularPrices[i],
        logPrice: logPrices[i],
        type: 'LOW',
        timestamp: new Date(marketData[i].timestamp),
        method: 'fractal',
        strength: 3
      });
    }
  }
  
  return pivots;
}

function detectSlopeChangePivots(logPrices: number[], regularPrices: number[], marketData: MarketData[], window: number = 3): RawPivot[] {
  const pivots: RawPivot[] = [];
  const slopes: number[] = [];
  
  // Calculate slopes
  for (let i = 0; i < logPrices.length - window; i++) {
    const slope = (logPrices[i + window] - logPrices[i]) / window;
    slopes.push(slope);
  }
  
  // Find slope changes
  for (let i = 1; i < slopes.length - 1; i++) {
    const prevSlope = slopes[i - 1];
    const currSlope = slopes[i];
    
    // Positive to negative (potential high)
    if (prevSlope > 0 && currSlope < 0) {
      const pivotIdx = i + Math.floor(window / 2);
      if (pivotIdx >= 0 && pivotIdx < logPrices.length) {
        pivots.push({
          index: pivotIdx,
          price: regularPrices[pivotIdx],
          logPrice: logPrices[pivotIdx],
          type: 'HIGH',
          timestamp: new Date(marketData[pivotIdx].timestamp),
          method: 'slope',
          strength: 2
        });
      }
    }
    
    // Negative to positive (potential low)
    if (prevSlope < 0 && currSlope > 0) {
      const pivotIdx = i + Math.floor(window / 2);
      if (pivotIdx >= 0 && pivotIdx < logPrices.length) {
        pivots.push({
          index: pivotIdx,
          price: regularPrices[pivotIdx],
          logPrice: logPrices[pivotIdx],
          type: 'LOW',
          timestamp: new Date(marketData[pivotIdx].timestamp),
          method: 'slope',
          strength: 2
        });
      }
    }
  }
  
  return pivots;
}

function detectDerivativePivots(logPrices: number[], regularPrices: number[], marketData: MarketData[]): RawPivot[] {
  const pivots: RawPivot[] = [];
  
  // Calculate first derivative (gradient)
  const firstDeriv: number[] = [];
  for (let i = 1; i < logPrices.length; i++) {
    firstDeriv.push(logPrices[i] - logPrices[i - 1]);
  }
  
  // Calculate second derivative
  const secondDeriv: number[] = [];
  for (let i = 1; i < firstDeriv.length; i++) {
    secondDeriv.push(firstDeriv[i] - firstDeriv[i - 1]);
  }
  
  // Find sign changes in first derivative and significant second derivative changes
  for (let i = 1; i < firstDeriv.length - 1; i++) {
    // Sign changes in first derivative
    if (firstDeriv[i - 1] > 0 && firstDeriv[i + 1] < 0) { // Peak
      pivots.push({
        index: i + 1, // Adjust for derivative offset
        price: regularPrices[i + 1],
        logPrice: logPrices[i + 1],
        type: 'HIGH',
        timestamp: new Date(marketData[i + 1].timestamp),
        method: 'derivative',
        strength: 1.5
      });
    } else if (firstDeriv[i - 1] < 0 && firstDeriv[i + 1] > 0) { // Trough
      pivots.push({
        index: i + 1,
        price: regularPrices[i + 1],
        logPrice: logPrices[i + 1],
        type: 'LOW',
        timestamp: new Date(marketData[i + 1].timestamp),
        method: 'derivative',
        strength: 1.5
      });
    }
    
    // Significant second derivative changes
    if (i < secondDeriv.length) {
      const stdDev = Math.sqrt(secondDeriv.reduce((sum, val) => sum + val * val, 0) / secondDeriv.length);
      if (Math.abs(secondDeriv[i]) > stdDev * 2) {
        const pivotIdx = i + 2; // Adjust for double derivative offset
        if (pivotIdx < logPrices.length) {
          if (secondDeriv[i] < 0) { // Concave down (potential high)
            pivots.push({
              index: pivotIdx,
              price: regularPrices[pivotIdx],
              logPrice: logPrices[pivotIdx],
              type: 'HIGH',
              timestamp: new Date(marketData[pivotIdx].timestamp),
              method: 'derivative',
              strength: 1.5
            });
          } else if (secondDeriv[i] > 0) { // Concave up (potential low)
            pivots.push({
              index: pivotIdx,
              price: regularPrices[pivotIdx],
              logPrice: logPrices[pivotIdx],
              type: 'LOW',
              timestamp: new Date(marketData[pivotIdx].timestamp),
              method: 'derivative',
              strength: 1.5
            });
          }
        }
      }
    }
  }
  
  return pivots;
}

function combineOverlappingPivots(allPivots: RawPivot[], proximityThreshold: number = 3): RawPivot[] {
  if (allPivots.length === 0) return [];
  
  // Sort by index
  allPivots.sort((a, b) => a.index - b.index);
  
  const combined: RawPivot[] = [];
  let i = 0;
  
  while (i < allPivots.length) {
    const currentPivot = allPivots[i];
    const group = [currentPivot];
    
    // Look ahead for similar pivots
    let j = i + 1;
    while (j < allPivots.length) {
      const nextPivot = allPivots[j];
      
      // Same type and within proximity
      if (nextPivot.type === currentPivot.type &&
          Math.abs(nextPivot.index - currentPivot.index) <= proximityThreshold) {
        group.push(nextPivot);
        j++;
      } else {
        break;
      }
    }
    
    // Choose best pivot from group based on log prices
    let bestPivot: RawPivot;
    if (group.length === 1) {
      bestPivot = group[0];
    } else {
      // For highs, take highest log price; for lows, take lowest log price
      if (currentPivot.type === 'HIGH') {
        bestPivot = group.reduce((max, pivot) => pivot.logPrice > max.logPrice ? pivot : max);
      } else {
        bestPivot = group.reduce((min, pivot) => pivot.logPrice < min.logPrice ? pivot : min);
      }
      
      // If multiple have same log price, take one with highest strength
      const samePriceGroup = group.filter(p => Math.abs(p.logPrice - bestPivot.logPrice) < 1e-6);
      if (samePriceGroup.length > 1) {
        bestPivot = samePriceGroup.reduce((max, pivot) => pivot.strength > max.strength ? pivot : max);
      }
    }
    
    combined.push(bestPivot);
    i = j;
  }
  
  return combined;
}

interface PowerfulTrendline {
  id: string;
  points: PivotPoint[];
  slope: number;
  intercept: number;
  strength: number;
  type: 'SUPPORT' | 'RESISTANCE';
  rSquared: number;
  avgDeviation: number;
  startTime: Date;
  endTime: Date;
  metadata?: {
    logSlope?: number;
    logIntercept?: number;
    dailyGrowthRate?: number;
    iterations?: number;
    isLogScale?: boolean;
  };
}

// Iterative best-fit trendline refinement using LOG SCALE (from notebook)
export function detectPowerfulTrendlines(pivots: PivotPoint[], tolerancePercent: number = 0.02): PowerfulTrendline[] {
  if (pivots.length < 2) return [];
  
  const trendlines: PowerfulTrendline[] = [];
  const maxTrendlines = 30;
  const usedTrendlinePairs = new Set<string>();
  
  console.log(`🔬 LOG SCALE: Detecting trendlines with ${tolerancePercent * 100}% tolerance on ${pivots.length} pivots`);
  
  // Create all possible pairs, sorted by time distance (prefer longer trendlines)
  const allPairs: Array<{ i: number, j: number, pivot1: PivotPoint, pivot2: PivotPoint, timeDist: number }> = [];
  
  for (let i = 0; i < pivots.length; i++) {
    for (let j = i + 1; j < pivots.length; j++) {
      const timeDist = Math.abs(new Date(pivots[j].timestamp).getTime() - new Date(pivots[i].timestamp).getTime());
      allPairs.push({
        i, j,
        pivot1: pivots[i],
        pivot2: pivots[j],
        timeDist
      });
    }
  }
  
  // Sort by time distance to prefer longer trendlines first
  allPairs.sort((a, b) => b.timeDist - a.timeDist);
  
  console.log(`🔬 Created ${allPairs.length} potential trendline pairs (sorted by time distance)`);
  
  let processedPairs = 0;
  let skippedPairs = 0;
  
  for (const pair of allPairs) {
    processedPairs++;
    
    // Check if this pair is already used in an existing trendline
    const pairKey = `${Math.min(pair.i, pair.j)}-${Math.max(pair.i, pair.j)}`;
    if (usedTrendlinePairs.has(pairKey)) {
      skippedPairs++;
      continue;
    }
    
    // Find iterative trendline starting with this pair using LOG SCALE
    const result = findIterativeTrendlineLog(pair.pivot1, pair.pivot2, pivots, tolerancePercent);
    
    if (result && result.strength >= 2) { // Must connect at least 2 points
      const trendline: PowerfulTrendline = {
        id: uuidv4(),
        points: result.connectedPoints,
        slope: result.regularSlope, // Store regular slope for compatibility
        intercept: result.regularIntercept, // Store regular intercept
        strength: result.strength,
        type: result.type,
        rSquared: result.rSquared,
        avgDeviation: result.avgDeviation,
        startTime: new Date(result.connectedPoints[0].timestamp),
        endTime: new Date(result.connectedPoints[result.connectedPoints.length - 1].timestamp),
        // Store log scale data in metadata
        metadata: {
          logSlope: result.logSlope,
          logIntercept: result.logIntercept,
          dailyGrowthRate: result.dailyGrowthRate,
          iterations: result.iterations,
          isLogScale: true
        }
      };
      
      trendlines.push(trendline);
      
      // Mark pairs that use ANY TWO points from this trendline's connected points
      const connectedIndices: number[] = [];
      for (const point of result.connectedPoints) {
        const idx = pivots.findIndex(p => p.id === point.id);
        if (idx !== -1) connectedIndices.push(idx);
      }
      
      // Remove pairs that use any two points from this trendline
      let newRemovedPairs = 0;
      for (let pi = 0; pi < connectedIndices.length; pi++) {
        for (let pj = pi + 1; pj < connectedIndices.length; pj++) {
          const pairToRemove = `${Math.min(connectedIndices[pi], connectedIndices[pj])}-${Math.max(connectedIndices[pi], connectedIndices[pj])}`;
          if (!usedTrendlinePairs.has(pairToRemove)) {
            usedTrendlinePairs.add(pairToRemove);
            newRemovedPairs++;
          }
        }
      }
      
      if (trendlines.length <= 10) {
        console.log(`🔬 Trendline #${trendlines.length}: ${result.strength} points, R²=${result.rSquared.toFixed(3)}, growth=${result.dailyGrowthRate.toFixed(4)}%/day, ${result.iterations} iterations`);
      }
      
      // Stop if we have enough trendlines
      if (trendlines.length >= maxTrendlines) break;
    }
  }
  
  // Sort by strength and R-squared
  trendlines.sort((a, b) => (b.strength * b.rSquared) - (a.strength * a.rSquared));
  
  console.log(`🔬 Found ${trendlines.length} LOG SCALE trendlines using iterative refinement`);
  console.log(`🔬 Processed ${processedPairs} pairs, skipped ${skippedPairs} internal pairs`);
  
  if (trendlines.length > 0) {
    const strengths = trendlines.map(tl => tl.strength);
    const growthRates = trendlines.map(tl => tl.metadata?.dailyGrowthRate || 0);
    
    console.log(`🔬 Strength range: ${Math.min(...strengths)} - ${Math.max(...strengths)} connected points`);
    console.log(`🔬 Average strength: ${(strengths.reduce((a, b) => a + b, 0) / strengths.length).toFixed(1)} points`);
    console.log(`🔬 Growth rate range: ${Math.min(...growthRates).toFixed(4)}% - ${Math.max(...growthRates).toFixed(4)}% per day`);
  }
  
  return trendlines.slice(0, maxTrendlines);
}

// Helper function for iterative trendline refinement using LOG SCALE
function findIterativeTrendlineLog(
  pivot1: PivotPoint, 
  pivot2: PivotPoint, 
  allPivots: PivotPoint[], 
  tolerancePercent: number
): {
  connectedPoints: PivotPoint[],
  strength: number,
  logSlope: number,
  logIntercept: number,
  regularSlope: number,
  regularIntercept: number,
  dailyGrowthRate: number,
  rSquared: number,
  avgDeviation: number,
  iterations: number,
  type: 'SUPPORT' | 'RESISTANCE'
} | null {
  
  // Start with the initial two points
  const currentPoints = [pivot1, pivot2];
  const logTolerance = Math.log(1 + tolerancePercent); // Convert percentage to log tolerance
  const maxIterations = 100;
  let iteration = 0;
  
  // Helper to get log price from pivot metadata or calculate it
  const getLogPrice = (pivot: PivotPoint): number => {
    if (pivot.metadata && typeof pivot.metadata.logPrice === 'number') {
      return pivot.metadata.logPrice;
    }
    return Math.log(pivot.price);
  };
  
  // Helper to convert points to x,y coordinates using LOG SCALE
  const pointsToXYLog = (points: PivotPoint[]) => {
    const baseTime = new Date(pivot1.timestamp).getTime();
    const xVals = points.map(p => (new Date(p.timestamp).getTime() - baseTime) / (1000 * 60 * 60 * 24));
    const yVals = points.map(p => getLogPrice(p)); // Use LOG prices for trendline fitting
    return { xVals, yVals };
  };
  
  while (iteration < maxIterations) {
    iteration++;
    
    // Calculate current best-fit line using LOG PRICES
    const { xVals, yVals } = pointsToXYLog(currentPoints);
    
    if (xVals.length < 2) break;
    
    // Calculate linear regression on LOG SCALE
    const n = xVals.length;
    const sumX = xVals.reduce((sum, x) => sum + x, 0);
    const sumY = yVals.reduce((sum, y) => sum + y, 0);
    const sumXY = xVals.reduce((sum, x, i) => sum + x * yVals[i], 0);
    const sumXX = xVals.reduce((sum, x) => sum + x * x, 0);
    const sumYY = yVals.reduce((sum, y) => sum + y * y, 0);
    
    const logSlope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const logIntercept = (sumY - logSlope * sumX) / n;
    
    // Calculate R-squared
    const meanY = sumY / n;
    const ssRes = yVals.reduce((sum, y, i) => {
      const predicted = logSlope * xVals[i] + logIntercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    const ssTot = yVals.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const rSquared = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
    
    // Find additional points within tolerance of this best-fit line
    const newPoints: PivotPoint[] = [];
    const baseTime = new Date(pivot1.timestamp).getTime();
    
    for (const testPivot of allPivots) {
      // Skip if already in current points
      if (currentPoints.some(p => p.id === testPivot.id)) continue;
      
      const xPivot = (new Date(testPivot.timestamp).getTime() - baseTime) / (1000 * 60 * 60 * 24);
      const expectedLogY = logSlope * xPivot + logIntercept;
      const actualLogY = getLogPrice(testPivot);
      
      // Check if within log tolerance (proper percentage tolerance)
      const logDifference = Math.abs(expectedLogY - actualLogY);
      if (logDifference <= logTolerance) {
        newPoints.push(testPivot);
      }
    }
    
    // If no new points found, we're done
    if (newPoints.length === 0) break;
    
    // Add new points and continue iteration
    currentPoints.push(...newPoints);
  }
  
  // Final calculation with all points
  if (currentPoints.length >= 2) {
    const { xVals, yVals } = pointsToXYLog(currentPoints);
    const n = xVals.length;
    const sumX = xVals.reduce((sum, x) => sum + x, 0);
    const sumY = yVals.reduce((sum, y) => sum + y, 0);
    const sumXY = xVals.reduce((sum, x, i) => sum + x * yVals[i], 0);
    const sumXX = xVals.reduce((sum, x) => sum + x * x, 0);
    
    const logSlope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const logIntercept = (sumY - logSlope * sumX) / n;
    
    // Calculate R-squared
    const meanY = sumY / n;
    const ssRes = yVals.reduce((sum, y, i) => {
      const predicted = logSlope * xVals[i] + logIntercept;
      return sum + Math.pow(y - predicted, 2);
    }, 0);
    const ssTot = yVals.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0);
    const rSquared = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
    
    // Calculate daily growth rate from log slope
    const dailyGrowthRate = (Math.exp(logSlope) - 1) * 100;
    
    // Calculate average deviation in log space
    const baseTime = new Date(pivot1.timestamp).getTime();
    const avgDeviation = currentPoints.reduce((sum, point) => {
      const xPoint = (new Date(point.timestamp).getTime() - baseTime) / (1000 * 60 * 60 * 24);
      const expectedLogY = logSlope * xPoint + logIntercept;
      const actualLogY = getLogPrice(point);
      return sum + Math.abs(expectedLogY - actualLogY);
    }, 0) / currentPoints.length;
    
    // Convert log scale back to regular scale for compatibility
    // Since log scale trendlines are exponential in regular space, we'll use two points to calculate
    // an approximate linear slope that represents the average rate of change
    const startTime = new Date(currentPoints[0].timestamp).getTime();
    const endTime = new Date(currentPoints[currentPoints.length - 1].timestamp).getTime();
    const timeDiffDays = (endTime - startTime) / (1000 * 60 * 60 * 24);
    
    let regularSlope: number;
    let regularIntercept: number;
    
    if (timeDiffDays > 0) {
      // Calculate prices at start and end using the log equation
      const startLogPrice = logSlope * 0 + logIntercept; // At day 0
      const endLogPrice = logSlope * timeDiffDays + logIntercept;
      
      const startRegularPrice = Math.exp(startLogPrice);
      const endRegularPrice = Math.exp(endLogPrice);
      
      // Calculate regular slope as price change per day
      regularSlope = (endRegularPrice - startRegularPrice) / timeDiffDays;
      regularIntercept = startRegularPrice;
    } else {
      // Fallback for single point or zero time difference
      regularSlope = 0;
      regularIntercept = Math.exp(logIntercept);
    }
    
    // Determine trendline type based on slope and point types
    const highCount = currentPoints.filter(p => p.type === 'HIGH').length;
    const lowCount = currentPoints.filter(p => p.type === 'LOW').length;
    const isUpward = logSlope > 0;
    
    let lineType: 'SUPPORT' | 'RESISTANCE';
    if (highCount > lowCount) {
      lineType = 'RESISTANCE';
    } else if (lowCount > highCount) {
      lineType = 'SUPPORT';
    } else {
      lineType = isUpward ? 'SUPPORT' : 'RESISTANCE';
    }
    
    // Sort points by time
    currentPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    return {
      connectedPoints: currentPoints,
      strength: currentPoints.length,
      logSlope,
      logIntercept,
      regularSlope,
      regularIntercept,
      dailyGrowthRate,
      rSquared,
      avgDeviation,
      iterations: iteration,
      type: lineType
    };
  }
  
  return null;
}

function removeDuplicateTrendlines(trendlines: PowerfulTrendline[]): PowerfulTrendline[] {
  const uniqueLines: PowerfulTrendline[] = [];
  const sortedLines = trendlines.sort((a, b) => {
    const qualityA = a.strength * a.rSquared;
    const qualityB = b.strength * b.rSquared;
    return qualityB - qualityA;
  });
  
  for (const line of sortedLines) {
    const isDuplicate = uniqueLines.some(existing => {
      const slopeDiff = Math.abs(line.slope - existing.slope);
      const interceptDiff = Math.abs(line.intercept - existing.intercept);
      const avgPrice = (line.intercept + existing.intercept) / 2;
      const normalizedInterceptDiff = avgPrice > 0 ? interceptDiff / avgPrice : interceptDiff;
      
      return slopeDiff < 0.1 && normalizedInterceptDiff < 0.02;
    });
    
    if (!isDuplicate) {
      uniqueLines.push(line);
    }
  }
  
  return uniqueLines;
}

// Updated to work with LOG SCALE calculations
function calculateDistance(point: PivotPoint, slope: number, intercept: number, timeBase: number): number {
  const timeMs = new Date(point.timestamp).getTime();
  const x = (timeMs - timeBase) / (1000 * 60 * 60 * 24); // Convert to days
  const expectedPrice = slope * x + intercept;
  return Math.abs(point.price - expectedPrice);
}

// Legacy function for compatibility - now uses log scale internally
function calculateLineEquation(points: PivotPoint[]): { slope: number; intercept: number; rSquared: number } {
  if (points.length < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  
  const timeBase = new Date(points[0].timestamp).getTime();
  
  // Use log prices for better trend analysis
  const coords = points.map(p => ({
    x: (new Date(p.timestamp).getTime() - timeBase) / (1000 * 60 * 60 * 24),
    y: p.metadata?.logPrice || Math.log(p.price) // Use log price if available
  }));
  
  const n = coords.length;
  const sumX = coords.reduce((sum, p) => sum + p.x, 0);
  const sumY = coords.reduce((sum, p) => sum + p.y, 0);
  const sumXY = coords.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = coords.reduce((sum, p) => sum + p.x * p.x, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  const meanY = sumY / n;
  const ssRes = coords.reduce((sum, p) => {
    const predicted = slope * p.x + intercept;
    return sum + Math.pow(p.y - predicted, 2);
  }, 0);
  const ssTot = coords.reduce((sum, p) => sum + Math.pow(p.y - meanY, 2), 0);
  const rSquared = ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
  
  return { slope, intercept, rSquared };
}

// Project trendline price N days into future from calculation date
function projectTrendlinePrice(
  trendline: PowerfulTrendline, 
  daysAhead: number, 
  calculationDate: Date
): number {
  const timeBase = new Date(trendline.startTime).getTime();
  const currentTime = calculationDate.getTime();
  const targetTime = currentTime + (daysAhead * 24 * 60 * 60 * 1000);
  
  const x = (targetTime - timeBase) / (1000 * 60 * 60 * 24); // Convert to days
  return trendline.slope * x + trendline.intercept;
}

export function calculateTrendCloud(
  symbol: string,
  marketData: MarketData[],
  calculationDate: Date,
  timeframe: Timeframe,
  daysAhead: number = 5,
  priceBinSize: number = 0.1
): TrendCloudData {
  try {
    console.log(`🔥🔥🔥 TREND CLOUD CALCULATION STARTED for ${symbol} on ${calculationDate.toISOString()}`);
    console.log(`💰 ${symbol} Price range: ${Math.min(...marketData.map(d => d.low)).toFixed(2)}-${Math.max(...marketData.map(d => d.high)).toFixed(2)}, current: ${marketData[marketData.length - 1]?.close.toFixed(2)}`);
    validateMarketData(marketData);
    
    if (daysAhead <= 0 || daysAhead > 30) {
      throw new Error('daysAhead must be between 1 and 30');
    }
    
    if (priceBinSize <= 0 || priceBinSize > 100) {
      throw new Error('priceBinSize must be positive and reasonable');
    }
    
    const LOOKBACK_DAYS = 365; // Fixed 1-year lookback
    const TOTAL_WEIGHT = 100; // Constant total weight to distribute
    
    // Always use exactly 1 year of data ending at calculation date
    const lookbackStart = new Date(calculationDate.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const lookbackData = marketData.filter(item => {
      const itemDate = new Date(item.timestamp);
      return itemDate >= lookbackStart && itemDate <= calculationDate;
    });
    
    if (lookbackData.length < 50) {
      throw new Error('Insufficient data in 1-year lookback window');
    }
    
    // Calculate trendlines from 1-year data
    console.log(`🔬 LOG SCALE: Using ultra-enhanced pivot detection with 6 methods`);
    const pivots = detectClientSidePivots(lookbackData, timeframe);
    console.log(`🔬 LOG SCALE: Found ${pivots.length} pivots using enhanced detection`);
    console.log(`🔬 LOG SCALE: Detecting powerful trendlines with iterative refinement`);
    const trendlines = detectPowerfulTrendlines(pivots, 0.02); // Use 2% tolerance like notebook
    console.log(`🔬 LOG SCALE: Found ${trendlines.length} powerful trendlines`);
    
    const targetDate = new Date(calculationDate.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    
    // Get current price for validation
    const currentPrice = marketData[marketData.length - 1]?.close || 0;
    if (currentPrice <= 0) {
      throw new Error('Invalid current price');
    }
    
    let totalWeight = 0;
    let totalTrendlineStrength = 0;
    
    // Use more permissive quality trendlines for convergence detection
    const basicQualityTrendlines = trendlines.filter(line => 
      line.rSquared > 0.3 && // Very permissive R-squared (was 0.6)
      line.strength >= 1 &&  // At least 1 point (was 2)
      line.points.length >= 2 // Confirmed minimum points
    );
    
    console.log(`Debug trend cloud: Total trendlines: ${trendlines.length}, Quality trendlines: ${basicQualityTrendlines.length}`);
    
    // SIMPLIFIED APPROACH: Always create zones from available trendlines
    const convergenceZones: ConvergenceZone[] = [];
    
    if (trendlines.length === 0) {
      // No trendlines at all - return empty cloud
      return {
        symbol,
        calculationDate,
        targetDate,
        timeframe,
        lookbackDays: LOOKBACK_DAYS,
        convergenceZones: [],
        cloudPoints: [],
        summary: {
          totalWeight: 0,
          totalTrendlines: 0,
          convergenceZoneCount: 0,
          peakPrice: currentPrice,
          peakWeight: 0,
          peakDensity: 0,
          concentrationRatio: 0,
          priceRange: { min: currentPrice, max: currentPrice },
          confidenceScore: 0
        }
      };
    }
    
    // Use top 20 quality trendlines (most pivot points crossed)
    const topQualityTrendlines = trendlines.filter(line => 
      line.points.length >= 2 && 
      line.rSquared > 0.3 // Reasonable quality filter
    );
    
    // Sort by strength (number of pivot points) and take top 20
    const topTrendlines = topQualityTrendlines
      .sort((a, b) => b.strength - a.strength) // Sort by strength (pivot points crossed)
      .slice(0, Math.min(20, topQualityTrendlines.length));
    
    console.log(`Using top ${topTrendlines.length} trendlines from ${trendlines.length} total`);
    
    // Find where these trendlines converge 5 days later
    const projections = topTrendlines.map(trendline => {
      const projectedPrice = projectTrendlinePrice(trendline, daysAhead, calculationDate);
      console.log(`Trendline slope: ${trendline.slope.toFixed(4)}, current->projected: ${currentPrice.toFixed(2)}->${projectedPrice.toFixed(2)}`);
      return {
        trendline,
        projectedPrice
      };
    });
    
    // Group projections by similar prices (convergence zones)
    const priceGroups = new Map<number, typeof projections>();
    const convergenceThreshold = currentPrice * 0.05; // 5% of current price
    
    console.log(`🔬 LOG SCALE: Grouping convergences with ${convergenceThreshold.toFixed(2)} threshold (5% of ${currentPrice.toFixed(2)})`);
    
    for (const projection of projections) {
      let foundGroup = false;
      for (const [groupPrice, group] of priceGroups) {
        const distance = Math.abs(projection.projectedPrice - groupPrice);
        if (distance <= convergenceThreshold) {
          group.push(projection);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        priceGroups.set(projection.projectedPrice, [projection]);
      }
    }
    
    console.log(`🔥 GROUPS CREATED: ${priceGroups.size} price groups from ${projections.length} projections`);
    
    // Create convergence zones ONLY from groups with multiple trendlines (true convergence)
    convergenceZones.length = 0; // Clear existing zones
    for (const [_, group] of priceGroups) {
      if (group.length >= 2) { // Require at least 2 trendlines for convergence
        const avgPrice = group.reduce((sum, p) => sum + p.projectedPrice, 0) / group.length;
        const totalStrength = group.reduce((sum, p) => sum + p.trendline.strength, 0);
        const avgConfidence = group.reduce((sum, p) => sum + p.trendline.rSquared, 0) / group.length;
        
        convergenceZones.push({
          centerPrice: avgPrice,
          priceRange: { min: avgPrice * 0.98, max: avgPrice * 1.02 },
          convergingTrendlines: group.map(p => p.trendline),
          totalStrength: totalStrength,
          avgConfidence: avgConfidence,
          weight: 0 // Will be calculated later
        });
      }
    }
    
    console.log(`🔥 DEBUGGING: Created ${convergenceZones.length} convergence zones from ${topTrendlines.length} trendlines`);
    console.log(`🔥 DEBUGGING: Convergence zones:`, convergenceZones.map(z => `${z.centerPrice.toFixed(2)} (${z.convergingTrendlines.length} lines)`));
    
    // BINNING METHOD: Group convergence zones into price bins before applying softmax
    if (convergenceZones.length === 0) {
      return { 
        zones: [], 
        summary: {
          totalWeight: 0,
          totalTrendlines: topTrendlines.length,
          convergenceZoneCount: 0,
          peakPrice: currentPrice,
          peakWeight: 0,
          peakDensity: 0,
          concentrationRatio: 1.0,
          priceRange: { min: currentPrice, max: currentPrice },
          confidenceScore: 0
        }
      };
    }
    
    const zonePrices = convergenceZones.map(zone => zone.centerPrice);
    const minPrice = Math.min(...zonePrices);
    const maxPrice = Math.max(...zonePrices);
    const priceRange = maxPrice - minPrice;
    
    // Create 10-15 bins across the price range for better differentiation
    const numBins = Math.min(15, Math.max(5, Math.floor(convergenceZones.length / 2)));
    const binSize = priceRange > 0 ? priceRange / numBins : 1;
    
    // Create bins and assign zones to bins
    const bins: Array<{
      minPrice: number;
      maxPrice: number;
      zones: typeof convergenceZones;
      totalStrength: number;
      softmaxWeight: number;
    }> = [];
    
    for (let i = 0; i < numBins; i++) {
      const binMin = minPrice + (i * binSize);
      const binMax = minPrice + ((i + 1) * binSize);
      bins.push({
        minPrice: binMin,
        maxPrice: binMax,
        zones: [],
        totalStrength: 0,
        softmaxWeight: 0
      });
    }
    
    // Assign each zone to appropriate bin
    convergenceZones.forEach(zone => {
      const binIndex = Math.min(
        numBins - 1,
        Math.floor((zone.centerPrice - minPrice) / binSize)
      );
      bins[binIndex].zones.push(zone);
      bins[binIndex].totalStrength += zone.totalStrength;
    });
    
    // Filter out empty bins
    const nonEmptyBins = bins.filter(bin => bin.zones.length > 0);
    
    console.log(`🔥 BINNING: Created ${nonEmptyBins.length} price bins from ${numBins} total bins`);
    nonEmptyBins.forEach((bin, i) => {
      console.log(`🔥 Bin ${i}: ${bin.minPrice.toFixed(2)}-${bin.maxPrice.toFixed(2)}, ${bin.zones.length} zones, strength=${bin.totalStrength.toFixed(1)}`);
    });
    
    // Apply softmax to bin-level strengths
    const temperature = 2.0;
    const binStrengths = nonEmptyBins.map(bin => bin.totalStrength);
    const maxBinStrength = Math.max(...binStrengths);
    
    if (maxBinStrength > 0) {
      // Calculate softmax weights for bins
      const binSoftmaxWeights = nonEmptyBins.map(bin => {
        const normalizedStrength = bin.totalStrength / maxBinStrength;
        return Math.exp(normalizedStrength / temperature);
      });
      
      const binSoftmaxSum = binSoftmaxWeights.reduce((sum, weight) => sum + weight, 0);
      
      // Assign softmax weights to bins
      nonEmptyBins.forEach((bin, index) => {
        if (binSoftmaxSum > 0) {
          const softmaxProb = binSoftmaxWeights[index] / binSoftmaxSum;
          bin.softmaxWeight = softmaxProb * TOTAL_WEIGHT;
          console.log(`🔥 Bin ${index}: strength=${bin.totalStrength.toFixed(1)}, softmax_weight=${bin.softmaxWeight.toFixed(2)}, zones=${bin.zones.length}`);
        }
      });
      
      // Distribute bin weights equally among zones within each bin
      nonEmptyBins.forEach(bin => {
        const weightPerZone = bin.softmaxWeight / bin.zones.length;
        bin.zones.forEach((zone, zoneIndex) => {
          zone.weight = weightPerZone;
          console.log(`🔥 Zone in bin: price=${zone.centerPrice.toFixed(2)}, final_weight=${zone.weight.toFixed(2)}, bin_weight=${bin.softmaxWeight.toFixed(2)}`);
        });
      });
    } else {
      // Fallback: equal weights
      convergenceZones.forEach(zone => {
        zone.weight = TOTAL_WEIGHT / convergenceZones.length;
      });
    }
    
    // Calculate metrics for summary
    const zoneCount = convergenceZones.length;
    
    // Calculate price range for the summary (reuse zonePrices from binning section)
    const actualMinPrice = zonePrices.length > 0 ? Math.min(...zonePrices) : currentPrice;
    const actualMaxPrice = zonePrices.length > 0 ? Math.max(...zonePrices) : currentPrice;
    
    // Create cloud points directly from convergence zones
    const cloudPoints: TrendCloudPoint[] = [];
    let peakWeight = 0;
    let peakDensity = 0;
    let peakPrice = currentPrice;
    
    for (const zone of convergenceZones) {
      totalWeight += zone.weight;
      totalTrendlineStrength += zone.totalStrength;
      
      // Calculate normalized weight (as percentage of total)
      const normalizedWeight = zone.weight / TOTAL_WEIGHT;
      
      // Use softmax weight directly for density/shading with more dramatic differences
      const density = Math.min(1, Math.max(0.2, normalizedWeight * 1.5)); // More dramatic scaling: 0.2 to 1.0
      console.log(`🎨 DENSITY: Zone weight=${zone.weight.toFixed(1)}, normalized=${normalizedWeight.toFixed(3)}, final_density=${density.toFixed(3)}`);
      
      // Create single cloud point per zone for clearer visualization
      const cloudPoint: TrendCloudPoint = {
        id: uuidv4(),
        symbol,
        calculationDate,
        targetDate,
        timeframe,
        priceLevel: zone.centerPrice,
        weight: zone.weight,
        normalizedWeight: zone.weight / TOTAL_WEIGHT,
        density,
        trendlineCount: zone.convergingTrendlines.length,
        confidence: zone.avgConfidence,
        metadata: {
          lookbackDays: LOOKBACK_DAYS,
          totalTrendlines: trendlines.length,
          avgTrendlineStrength: trendlines.length > 0 ? totalTrendlineStrength / trendlines.length : 0,
          priceRange: { min: actualMinPrice, max: actualMaxPrice },
          totalDailyWeight: TOTAL_WEIGHT
        }
      };
      
      cloudPoints.push(cloudPoint);
      
      if (zone.weight > peakWeight) {
        peakWeight = zone.weight;
        peakPrice = zone.centerPrice;
        peakDensity = density;
      }
    }
    
    const confidenceScore = cloudPoints.length > 0 && totalWeight > 0
      ? cloudPoints.reduce((sum, p) => sum + p.confidence * p.weight, 0) / totalWeight
      : 0;
    
    // Weight should always equal TOTAL_WEIGHT due to convergence-based distribution
    const actualTotalWeight = cloudPoints.reduce((sum, p) => sum + p.weight, 0);
    
    console.log(`🔥 FINAL RESULT: ${cloudPoints.length} cloud points, total weight: ${actualTotalWeight.toFixed(1)}`);
    console.log(`🔥 PEAK PRICE SET TO: ${peakPrice.toFixed(2)} with weight: ${peakWeight.toFixed(1)}`);
    
    return {
      symbol,
      calculationDate,
      targetDate,
      timeframe,
      lookbackDays: LOOKBACK_DAYS,
      convergenceZones,
      cloudPoints,
      summary: {
        totalWeight: actualTotalWeight,
        totalTrendlines: trendlines.length,
        convergenceZoneCount: convergenceZones.length,
        peakPrice,
        peakWeight,
        peakDensity,
        concentrationRatio: zoneCount <= 1 ? 1.0 : Math.max(0, 1 - (zoneCount - 1) / 10),
        priceRange: { min: actualMinPrice, max: actualMaxPrice },
        confidenceScore
      }
    };
  } catch (error) {
    console.error('Error calculating trend cloud:', error);
    throw error;
  }
}

export async function generateRollingTrendClouds(
  symbol: string,
  marketData: MarketData[],
  startDate: Date,
  endDate: Date,
  timeframe: Timeframe,
  intervalDays: number = 5
): Promise<TrendCloudData[]> {
  try {
    validateMarketData(marketData);
    
    if (startDate >= endDate) {
      throw new Error('Start date must be before end date');
    }
    
    if (intervalDays <= 0 || intervalDays > 30) {
      throw new Error('intervalDays must be between 1 and 30');
    }
    
    const clouds: TrendCloudData[] = [];
    const lookbackDays = 365;
    
    // Pre-index market data by timestamp for efficient filtering
    const dataByTimestamp = new Map<number, MarketData>();
    const sortedTimestamps: number[] = [];
    
    for (const item of marketData) {
      const timestamp = new Date(item.timestamp).getTime();
      dataByTimestamp.set(timestamp, item);
      sortedTimestamps.push(timestamp);
    }
    sortedTimestamps.sort((a, b) => a - b);
    
    const currentDate = new Date(startDate);
    
    while (currentDate <= endDate) {
      const windowStartTime = currentDate.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
      const windowEndTime = currentDate.getTime();
      
      // Binary search for efficient data filtering
      const startIndex = binarySearchClosest(sortedTimestamps, windowStartTime);
      const endIndex = binarySearchClosest(sortedTimestamps, windowEndTime);
      
      const windowData: MarketData[] = [];
      for (let i = startIndex; i <= endIndex && i < sortedTimestamps.length; i++) {
        const data = dataByTimestamp.get(sortedTimestamps[i]);
        if (data) windowData.push(data);
      }
      
      if (windowData.length >= 50) {
        try {
          // Create a new Date object to avoid mutation issues
          const calculationDate = new Date(currentDate);
          const cloud = calculateTrendCloud(symbol, windowData, calculationDate, timeframe);
          clouds.push(cloud);
        } catch (cloudError) {
          console.warn(`Failed to calculate trend cloud for ${currentDate.toISOString()}:`, cloudError);
        }
      }
      
      currentDate.setDate(currentDate.getDate() + intervalDays);
    }
    
    return clouds;
  } catch (error) {
    console.error('Error generating rolling trend clouds:', error);
    throw error;
  }
}

function binarySearchClosest(sortedArray: number[], target: number): number {
  let left = 0;
  let right = sortedArray.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (sortedArray[mid] === target) return mid;
    if (sortedArray[mid] < target) left = mid + 1;
    else right = mid - 1;
  }
  
  return Math.max(0, Math.min(left, sortedArray.length - 1));
}

