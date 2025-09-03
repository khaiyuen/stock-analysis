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

export function detectClientSidePivots(marketData: MarketData[], timeframe: Timeframe): PivotPoint[] {
  validateMarketData(marketData);
  
  const pivots: PivotPoint[] = [];
  const checkWindows = [1, 2];

  for (let i = 2; i < marketData.length - 2; i++) {
    const currentCandle = marketData[i];
    let isLocalHigh = false;
    let isLocalLow = false;
    
    for (const window of checkWindows) {
      let highInThisWindow = true;
      let lowInThisWindow = true;
      
      // Combined check for both highs and lows
      for (let j = i - window; j <= i + window; j++) {
        if (j >= 0 && j < marketData.length && j !== i) {
          if (marketData[j].high >= currentCandle.high) {
            highInThisWindow = false;
          }
          if (marketData[j].low <= currentCandle.low) {
            lowInThisWindow = false;
          }
        }
      }
      
      if (highInThisWindow) {
        isLocalHigh = true;
        break;
      }
      if (lowInThisWindow) {
        isLocalLow = true;
        break;
      }
    }
    
    if (isLocalHigh) {
      const strength = calculatePivotStrength(marketData, i, 'HIGH');
      pivots.push({
        id: uuidv4(),
        timestamp: new Date(currentCandle.timestamp),
        price: currentCandle.high,
        type: 'HIGH',
        timeframe,
        strength,
        volume: currentCandle.volume,
        confirmations: 0,
        metadata: {
          lookbackWindow: 2,
          priceDeviation: Math.abs(currentCandle.high - currentCandle.low),
          volumeRatio: currentCandle.volume / (marketData[Math.max(0, i-10)].volume || 1),
          candleIndex: i
        }
      });
    }
    
    if (isLocalLow) {
      const strength = calculatePivotStrength(marketData, i, 'LOW');
      pivots.push({
        id: uuidv4(),
        timestamp: new Date(currentCandle.timestamp),
        price: currentCandle.low,
        type: 'LOW',
        timeframe,
        strength,
        volume: currentCandle.volume,
        confirmations: 0,
        metadata: {
          lookbackWindow: 2,
          priceDeviation: Math.abs(currentCandle.high - currentCandle.low),
          volumeRatio: currentCandle.volume / (marketData[Math.max(0, i-10)].volume || 1),
          candleIndex: i
        }
      });
    }
  }
  
  return pivots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
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
}

export function detectPowerfulTrendlines(pivots: PivotPoint[], tolerance: number = 0.005): PowerfulTrendline[] {
  if (pivots.length < 3) return [];
  
  const spatialIndex = createSpatialIndex(pivots);
  const trendlines: PowerfulTrendline[] = [];
  const minPoints = 3;
  const maxTrendlines = 20;
  
  // Sort pivots by strength and recency for better starting points
  const sortedPivots = [...pivots].sort((a, b) => {
    const strengthDiff = b.strength - a.strength;
    if (Math.abs(strengthDiff) > 0.1) return strengthDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
  
  const usedPivots = new Set<string>();
  const maxIterations = Math.min(100, sortedPivots.length * 5);
  let iterations = 0;
  
  for (let i = 0; i < sortedPivots.length && trendlines.length < maxTrendlines && iterations < maxIterations; i++) {
    const pivot1 = sortedPivots[i];
    if (usedPivots.has(pivot1.id)) continue;
    
    // Find nearby pivots using spatial index for efficiency
    const timeWindow = 30 * 24 * 60 * 60 * 1000; // 30 days
    const candidatePivots = spatialIndex.pivots.filter(p => {
      if (p.id === pivot1.id) return false;
      const timeDiff = Math.abs(new Date(p.timestamp).getTime() - new Date(pivot1.timestamp).getTime());
      return timeDiff <= timeWindow;
    });
    
    for (const pivot2 of candidatePivots) {
      if (usedPivots.has(pivot2.id)) continue;
      iterations++;
      
      const timeBase = new Date(pivot2.timestamp).getTime();
      let lineEq = calculateLineEquation([pivot1, pivot2]);
      let connectedPoints = [pivot1, pivot2];
      
      // Use spatial index to find nearby points more efficiently
      const priceThreshold = Math.max(
        Math.abs(pivot1.price - pivot2.price) * tolerance,
        pivot1.price * tolerance * 0.5
      );
      
      for (const testPoint of candidatePivots) {
        if (testPoint.id === pivot1.id || testPoint.id === pivot2.id) continue;
        
        const distance = calculateDistance(testPoint, lineEq.slope, lineEq.intercept, timeBase);
        if (distance <= priceThreshold) {
          connectedPoints.push(testPoint);
        }
      }
      
      if (connectedPoints.length >= minPoints) {
        // Sort and recalculate with all points
        connectedPoints.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        lineEq = calculateLineEquation(connectedPoints);
        
        // Early termination if line quality is poor
        if (lineEq.rSquared < 0.3) continue;
        
        const avgDeviation = connectedPoints.reduce((sum, point) => {
          return sum + calculateDistance(point, lineEq.slope, lineEq.intercept, timeBase);
        }, 0) / connectedPoints.length;
        
        const highCount = connectedPoints.filter(p => p.type === 'HIGH').length;
        const lowCount = connectedPoints.filter(p => p.type === 'LOW').length;
        const isUpwardSloping = lineEq.slope > 0;
        
        let lineType: 'SUPPORT' | 'RESISTANCE';
        if (highCount > lowCount) {
          lineType = 'RESISTANCE';
        } else if (lowCount > highCount) {
          lineType = 'SUPPORT';
        } else {
          lineType = isUpwardSloping ? 'SUPPORT' : 'RESISTANCE';
        }
        
        const strength = connectedPoints.length; // Actual count of pivot points crossed
        
        const trendline: PowerfulTrendline = {
          id: uuidv4(),
          points: connectedPoints,
          slope: lineEq.slope,
          intercept: lineEq.intercept,
          strength,
          type: lineType,
          rSquared: lineEq.rSquared,
          avgDeviation,
          startTime: new Date(connectedPoints[0].timestamp),
          endTime: new Date(connectedPoints[connectedPoints.length - 1].timestamp)
        };
        
        trendlines.push(trendline);
        connectedPoints.forEach(p => usedPivots.add(p.id));
      }
    }
  }
  
  // Remove duplicates and sort by quality
  const uniqueLines = removeDuplicateTrendlines(trendlines);
  return uniqueLines.slice(0, maxTrendlines);
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

function calculateDistance(point: PivotPoint, slope: number, intercept: number, timeBase: number): number {
  const timeMs = new Date(point.timestamp).getTime();
  const x = (timeMs - timeBase) / (1000 * 60 * 60 * 24); // Convert to days
  const expectedPrice = slope * x + intercept;
  return Math.abs(point.price - expectedPrice);
}

function calculateLineEquation(points: PivotPoint[]): { slope: number; intercept: number; rSquared: number } {
  if (points.length < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  
  const timeBase = new Date(points[0].timestamp).getTime();
  
  const coords = points.map(p => ({
    x: (new Date(p.timestamp).getTime() - timeBase) / (1000 * 60 * 60 * 24),
    y: p.price
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
    const pivots = detectClientSidePivots(lookbackData, timeframe);
    const trendlines = detectPowerfulTrendlines(pivots, 0.005);
    
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
    let convergenceZones: ConvergenceZone[] = [];
    
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
    
    console.log(`🔥 GROUPING: threshold=${convergenceThreshold.toFixed(2)} (5% of ${currentPrice.toFixed(2)})`);
    
    for (const projection of projections) {
      console.log(`🔥 Processing projection: ${projection.projectedPrice.toFixed(2)} (slope: ${projection.trendline.slope.toFixed(4)})`);
      let foundGroup = false;
      for (const [groupPrice, group] of priceGroups) {
        const distance = Math.abs(projection.projectedPrice - groupPrice);
        if (distance <= convergenceThreshold) {
          console.log(`🔥 Added to existing group at ${groupPrice.toFixed(2)} (distance: ${distance.toFixed(2)})`);
          group.push(projection);
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        console.log(`🔥 Created new group at ${projection.projectedPrice.toFixed(2)}`);
        priceGroups.set(projection.projectedPrice, [projection]);
      }
    }
    
    console.log(`🔥 GROUPS CREATED: ${priceGroups.size} price groups from ${projections.length} projections`);
    
    // Create convergence zones ONLY from groups with multiple trendlines (true convergence)
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

