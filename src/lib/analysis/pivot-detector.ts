import { MarketData, PivotPoint, PivotDetectionConfig, Timeframe } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export class PivotDetector {
  // Default configurations for each timeframe (TEMPORARILY RELAXED)
  private readonly defaultConfigs: Record<Timeframe, PivotDetectionConfig> = {
    '1M': {
      timeframe: '1M',
      lookbackWindow: 5,
      minStrength: 0.001, // Reduced from 0.02 to 0.001
      volumeWeight: 0.3,
      minSeparation: 3
    },
    '1W': {
      timeframe: '1W',
      lookbackWindow: 4,
      minStrength: 0.001, // Reduced from 0.015 to 0.001
      volumeWeight: 0.25,
      minSeparation: 2
    },
    '1D': {
      timeframe: '1D',
      lookbackWindow: 2, // Reduced from 3 to 2
      minStrength: 0.001, // Reduced from 0.01 to 0.001
      volumeWeight: 0.2,
      minSeparation: 1 // Reduced from 2 to 1
    },
    '4H': {
      timeframe: '4H',
      lookbackWindow: 6,
      minStrength: 0.008,
      volumeWeight: 0.15,
      minSeparation: 3
    },
    '1H': {
      timeframe: '1H',
      lookbackWindow: 10,
      minStrength: 0.005,
      volumeWeight: 0.1,
      minSeparation: 5
    }
  };

  /**
   * Detect pivot points in market data
   */
  detectPivots(
    marketData: MarketData[],
    timeframe: Timeframe,
    config?: Partial<PivotDetectionConfig>
  ): PivotPoint[] {
    if (marketData.length < 5) {
      console.warn(`Insufficient data for pivot detection: ${marketData.length} candles`);
      return [];
    }

    console.log(`SIMPLE Pivot detection for ${timeframe} with ${marketData.length} candles`);
    
    // SUPER SIMPLE ALGORITHM: Just find obvious local highs and lows
    const pivots: PivotPoint[] = [];
    const windowSize = 2; // Look at 2 candles on each side

    // Find local highs
    for (let i = windowSize; i < marketData.length - windowSize; i++) {
      const currentCandle = marketData[i];
      let isLocalHigh = true;
      
      // Check if this high is higher than surrounding candles
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j !== i && marketData[j].high >= currentCandle.high) {
          isLocalHigh = false;
          break;
        }
      }
      
      if (isLocalHigh) {
        pivots.push({
          id: uuidv4(),
          timestamp: currentCandle.timestamp,
          price: currentCandle.high,
          type: 'HIGH',
          timeframe,
          strength: 0.8, // Fixed high strength for testing
          volume: currentCandle.volume,
          confirmations: 0,
          metadata: {
            lookbackWindow: windowSize,
            priceDeviation: 0,
            volumeRatio: 1,
            candleIndex: i
          }
        });
      }
    }

    // Find local lows
    for (let i = windowSize; i < marketData.length - windowSize; i++) {
      const currentCandle = marketData[i];
      let isLocalLow = true;
      
      // Check if this low is lower than surrounding candles
      for (let j = i - windowSize; j <= i + windowSize; j++) {
        if (j !== i && marketData[j].low <= currentCandle.low) {
          isLocalLow = false;
          break;
        }
      }
      
      if (isLocalLow) {
        pivots.push({
          id: uuidv4(),
          timestamp: currentCandle.timestamp,
          price: currentCandle.low,
          type: 'LOW',
          timeframe,
          strength: 0.8, // Fixed high strength for testing
          volume: currentCandle.volume,
          confirmations: 0,
          metadata: {
            lookbackWindow: windowSize,
            priceDeviation: 0,
            volumeRatio: 1,
            candleIndex: i
          }
        });
      }
    }

    console.log(`SIMPLE algorithm found ${pivots.length} pivots (${pivots.filter(p => p.type === 'HIGH').length} highs, ${pivots.filter(p => p.type === 'LOW').length} lows)`);

    // Sort by timestamp
    return pivots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Detect local highs (resistance pivots)
   */
  private detectLocalHighs(
    marketData: MarketData[],
    config: PivotDetectionConfig
  ): PivotPoint[] {
    const highs: PivotPoint[] = [];
    const { lookbackWindow } = config;

    for (let i = lookbackWindow; i < marketData.length - lookbackWindow; i++) {
      const currentHigh = marketData[i].high;
      let isLocalHigh = true;

      // Check left side (past candles)
      for (let j = i - lookbackWindow; j < i; j++) {
        if (marketData[j].high >= currentHigh) {
          isLocalHigh = false;
          break;
        }
      }

      // Check right side (future candles) if left side passed
      if (isLocalHigh) {
        for (let j = i + 1; j <= i + lookbackWindow; j++) {
          if (marketData[j].high >= currentHigh) {
            isLocalHigh = false;
            break;
          }
        }
      }

      if (isLocalHigh) {
        const priceDeviation = this.calculatePriceDeviation(marketData, i, lookbackWindow);
        
        highs.push({
          id: uuidv4(),
          timestamp: marketData[i].timestamp,
          price: currentHigh,
          type: 'HIGH',
          timeframe: config.timeframe,
          strength: 0, // Will be calculated later
          volume: marketData[i].volume,
          confirmations: 0, // Will be calculated later
          metadata: {
            lookbackWindow,
            priceDeviation,
            volumeRatio: 0, // Will be calculated later
            candleIndex: i
          }
        });
      }
    }

    return highs;
  }

  /**
   * Detect local lows (support pivots)
   */
  private detectLocalLows(
    marketData: MarketData[],
    config: PivotDetectionConfig
  ): PivotPoint[] {
    const lows: PivotPoint[] = [];
    const { lookbackWindow } = config;

    for (let i = lookbackWindow; i < marketData.length - lookbackWindow; i++) {
      const currentLow = marketData[i].low;
      let isLocalLow = true;

      // Check left side (past candles)
      for (let j = i - lookbackWindow; j < i; j++) {
        if (marketData[j].low <= currentLow) {
          isLocalLow = false;
          break;
        }
      }

      // Check right side (future candles) if left side passed
      if (isLocalLow) {
        for (let j = i + 1; j <= i + lookbackWindow; j++) {
          if (marketData[j].low <= currentLow) {
            isLocalLow = false;
            break;
          }
        }
      }

      if (isLocalLow) {
        const priceDeviation = this.calculatePriceDeviation(marketData, i, lookbackWindow);
        
        lows.push({
          id: uuidv4(),
          timestamp: marketData[i].timestamp,
          price: currentLow,
          type: 'LOW',
          timeframe: config.timeframe,
          strength: 0, // Will be calculated later
          volume: marketData[i].volume,
          confirmations: 0, // Will be calculated later
          metadata: {
            lookbackWindow,
            priceDeviation,
            volumeRatio: 0, // Will be calculated later
            candleIndex: i
          }
        });
      }
    }

    return lows;
  }

  /**
   * Calculate pivot strength using multiple factors
   */
  private calculatePivotStrength(
    pivot: PivotPoint,
    marketData: MarketData[],
    avgPrice: number,
    avgVolume: number,
    config: PivotDetectionConfig
  ): number {
    // Price deviation factor (higher deviation = stronger pivot)
    const priceDeviationFactor = Math.abs(pivot.metadata.priceDeviation) / avgPrice;

    // Volume factor (higher volume at pivot = stronger)
    const volumeRatio = pivot.volume / avgVolume;
    pivot.metadata.volumeRatio = volumeRatio;
    const volumeFactor = Math.min(volumeRatio, 3) * config.volumeWeight;

    // Time factor (consider age - newer pivots might be more relevant)
    const pivotIndex = pivot.metadata.candleIndex;
    const ageFactor = 1 - (marketData.length - pivotIndex - 1) / marketData.length * 0.2;

    // Isolation factor (how isolated the pivot is from other extremes)
    const isolationFactor = this.calculateIsolationFactor(pivot, marketData, config.lookbackWindow);

    // SIMPLIFIED strength calculation for debugging
    console.log('Strength components:', {
      priceDeviationFactor,
      volumeFactor, 
      ageFactor,
      isolationFactor,
      timeframe: config.timeframe
    });
    
    // Simplified calculation - just use price deviation as primary factor
    let strength = priceDeviationFactor * 2; // Make it more generous
    
    console.log('Calculated strength before timeframe weight:', strength);

    // Apply timeframe weight
    const timeframeWeight = this.getTimeframeWeight(config.timeframe);
    strength *= timeframeWeight;
    
    console.log('Final strength after timeframe weight:', strength, 'timeframeWeight:', timeframeWeight);

    return Math.max(0, Math.min(1, strength));
  }

  /**
   * Calculate price deviation from surrounding candles
   */
  private calculatePriceDeviation(
    marketData: MarketData[],
    index: number,
    window: number
  ): number {
    const start = Math.max(0, index - window);
    const end = Math.min(marketData.length - 1, index + window);
    
    const prices = marketData.slice(start, end + 1)
      .map(d => (d.high + d.low + d.close) / 3);
    
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const currentPrice = (marketData[index].high + marketData[index].low + marketData[index].close) / 3;
    
    return currentPrice - avgPrice;
  }

  /**
   * Calculate isolation factor (how unique/isolated the pivot is)
   */
  private calculateIsolationFactor(
    pivot: PivotPoint,
    marketData: MarketData[],
    window: number
  ): number {
    const pivotIndex = pivot.metadata.candleIndex;
    const start = Math.max(0, pivotIndex - window * 2);
    const end = Math.min(marketData.length - 1, pivotIndex + window * 2);

    let competingExtremes = 0;
    const thresholdPercent = 0.005; // 0.5% threshold

    for (let i = start; i <= end; i++) {
      if (i === pivotIndex) continue;

      const candle = marketData[i];
      if (pivot.type === 'HIGH') {
        if (Math.abs(candle.high - pivot.price) / pivot.price < thresholdPercent) {
          competingExtremes++;
        }
      } else {
        if (Math.abs(candle.low - pivot.price) / pivot.price < thresholdPercent) {
          competingExtremes++;
        }
      }
    }

    // Return inverse of competing extremes (fewer competitors = higher isolation)
    return 1 / (1 + competingExtremes * 0.2);
  }

  /**
   * Count subsequent confirmations of the pivot level
   */
  private countConfirmations(
    pivot: PivotPoint,
    marketData: MarketData[],
    config: PivotDetectionConfig
  ): number {
    const pivotIndex = pivot.metadata.candleIndex;
    const thresholdPercent = 0.01; // 1% threshold for confirmation
    let confirmations = 0;

    // Look for touches after the pivot
    for (let i = pivotIndex + 1; i < marketData.length; i++) {
      const candle = marketData[i];
      
      if (pivot.type === 'HIGH') {
        // For resistance, look for subsequent highs near the level
        if (Math.abs(candle.high - pivot.price) / pivot.price < thresholdPercent) {
          confirmations++;
        }
      } else {
        // For support, look for subsequent lows near the level
        if (Math.abs(candle.low - pivot.price) / pivot.price < thresholdPercent) {
          confirmations++;
        }
      }
    }

    return confirmations;
  }

  /**
   * Filter pivots by minimum separation requirement
   */
  private filterBySeparation(
    pivots: PivotPoint[],
    minSeparation: number
  ): PivotPoint[] {
    const filtered: PivotPoint[] = [];
    const sortedPivots = [...pivots].sort((a, b) => b.strength - a.strength);

    for (const pivot of sortedPivots) {
      let tooClose = false;

      for (const existing of filtered) {
        const separation = Math.abs(
          pivot.metadata.candleIndex - existing.metadata.candleIndex
        );
        
        if (separation < minSeparation && pivot.type === existing.type) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        filtered.push(pivot);
      }
    }

    return filtered;
  }

  /**
   * Calculate average price for normalization
   */
  private calculateAveragePrice(marketData: MarketData[]): number {
    const sum = marketData.reduce((total, candle) => 
      total + (candle.high + candle.low + candle.close) / 3, 0
    );
    return sum / marketData.length;
  }

  /**
   * Calculate average volume for normalization
   */
  private calculateAverageVolume(marketData: MarketData[]): number {
    const sum = marketData.reduce((total, candle) => total + candle.volume, 0);
    return sum / marketData.length;
  }

  /**
   * Get timeframe weight for strength calculation
   */
  private getTimeframeWeight(timeframe: Timeframe): number {
    const weights: Record<Timeframe, number> = {
      '1M': 1.2,  // Monthly pivots get highest weight
      '1W': 1.1,  // Weekly pivots
      '1D': 1.0,  // Daily pivots (baseline)
      '4H': 0.9,  // 4-hour pivots
      '1H': 0.8   // Hourly pivots get lowest weight
    };
    
    return weights[timeframe];
  }

  /**
   * Validate pivot points for quality
   */
  validatePivots(pivots: PivotPoint[], marketData: MarketData[]): {
    valid: PivotPoint[];
    rejected: Array<{ pivot: PivotPoint; reason: string }>;
  } {
    const valid: PivotPoint[] = [];
    const rejected: Array<{ pivot: PivotPoint; reason: string }> = [];

    for (const pivot of pivots) {
      const validation = this.validateSinglePivot(pivot, marketData);
      
      if (validation.isValid) {
        valid.push(pivot);
      } else {
        rejected.push({ pivot, reason: validation.reason });
      }
    }

    return { valid, rejected };
  }

  /**
   * Validate a single pivot point
   */
  private validateSinglePivot(
    pivot: PivotPoint,
    marketData: MarketData[]
  ): { isValid: boolean; reason: string } {
    const candleIndex = pivot.metadata.candleIndex;

    // Check if index is within bounds
    if (candleIndex < 0 || candleIndex >= marketData.length) {
      return { isValid: false, reason: 'Invalid candle index' };
    }

    const candle = marketData[candleIndex];

    // Validate pivot price matches candle data
    if (pivot.type === 'HIGH' && Math.abs(pivot.price - candle.high) > 0.01) {
      return { isValid: false, reason: 'Pivot price does not match candle high' };
    }

    if (pivot.type === 'LOW' && Math.abs(pivot.price - candle.low) > 0.01) {
      return { isValid: false, reason: 'Pivot price does not match candle low' };
    }

    // Validate strength is within reasonable bounds
    if (pivot.strength < 0 || pivot.strength > 1) {
      return { isValid: false, reason: 'Invalid strength value' };
    }

    // Validate timestamp matches
    if (pivot.timestamp.getTime() !== candle.timestamp.getTime()) {
      return { isValid: false, reason: 'Timestamp mismatch' };
    }

    return { isValid: true, reason: '' };
  }

  /**
   * Get pivot detection statistics
   */
  getDetectionStats(
    pivots: PivotPoint[],
    marketData: MarketData[]
  ): {
    totalPivots: number;
    highPivots: number;
    lowPivots: number;
    avgStrength: number;
    strongPivots: number;
    coverage: number;
    timeframeDistribution: Record<Timeframe, number>;
  } {
    const stats = {
      totalPivots: pivots.length,
      highPivots: pivots.filter(p => p.type === 'HIGH').length,
      lowPivots: pivots.filter(p => p.type === 'LOW').length,
      avgStrength: pivots.reduce((sum, p) => sum + p.strength, 0) / pivots.length || 0,
      strongPivots: pivots.filter(p => p.strength > 0.7).length,
      coverage: pivots.length / marketData.length,
      timeframeDistribution: {} as Record<Timeframe, number>
    };

    // Calculate timeframe distribution
    const timeframes: Timeframe[] = ['1M', '1W', '1D', '4H', '1H'];
    timeframes.forEach(tf => {
      stats.timeframeDistribution[tf] = pivots.filter(p => p.timeframe === tf).length;
    });

    return stats;
  }

  /**
   * Export pivots to JSON format
   */
  exportPivots(pivots: PivotPoint[]): string {
    return JSON.stringify(pivots.map(pivot => ({
      ...pivot,
      timestamp: pivot.timestamp.toISOString()
    })), null, 2);
  }

  /**
   * Import pivots from JSON format
   */
  importPivots(jsonString: string): PivotPoint[] {
    const data = JSON.parse(jsonString);
    return data.map((item: any) => ({
      ...item,
      timestamp: new Date(item.timestamp)
    }));
  }
}