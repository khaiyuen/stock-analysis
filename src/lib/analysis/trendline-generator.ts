import { PivotPoint, TrendLine, MarketData, TrendlineConfig, Timeframe } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export class TrendlineGenerator {
  // Default configurations for each timeframe
  private readonly defaultConfigs: Record<Timeframe, TrendlineConfig> = {
    '1M': {
      timeframe: '1M',
      minPivots: 2,
      maxAge: 1260, // ~3.5 years (252 * 5)
      bufferPercent: 0.008, // 0.8%
      maxSlope: 60, // degrees
      minTouchCount: 2
    },
    '1W': {
      timeframe: '1W',
      minPivots: 2,
      maxAge: 780, // ~3 years (52 * 15)
      bufferPercent: 0.006, // 0.6%
      maxSlope: 65,
      minTouchCount: 2
    },
    '1D': {
      timeframe: '1D',
      minPivots: 2,
      maxAge: 504, // ~2 years
      bufferPercent: 0.005, // 0.5%
      maxSlope: 70,
      minTouchCount: 2
    },
    '4H': {
      timeframe: '4H',
      minPivots: 3,
      maxAge: 180, // ~1 month
      bufferPercent: 0.003, // 0.3%
      maxSlope: 75,
      minTouchCount: 3
    },
    '1H': {
      timeframe: '1H',
      minPivots: 3,
      maxAge: 168, // 1 week
      bufferPercent: 0.002, // 0.2%
      maxSlope: 80,
      minTouchCount: 3
    }
  };

  /**
   * Generate trendlines from pivot points
   */
  generateTrendlines(
    pivots: PivotPoint[],
    marketData: MarketData[],
    timeframe: Timeframe,
    config?: Partial<TrendlineConfig>
  ): TrendLine[] {
    if (pivots.length < 2) {
      console.warn(`Insufficient pivots for trendline generation: ${pivots.length}`);
      return [];
    }

    const finalConfig = { ...this.defaultConfigs[timeframe], ...config };
    const trendlines: TrendLine[] = [];

    // Separate highs and lows
    const highs = pivots.filter(p => p.type === 'HIGH').sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const lows = pivots.filter(p => p.type === 'LOW').sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Generate resistance lines from highs
    const resistanceLines = this.generateLinesFromPivots(highs, 'RESISTANCE', marketData, finalConfig);
    trendlines.push(...resistanceLines);

    // Generate support lines from lows  
    const supportLines = this.generateLinesFromPivots(lows, 'SUPPORT', marketData, finalConfig);
    trendlines.push(...supportLines);

    // Calculate strength for all lines and filter
    const strengthCalculatedLines = trendlines.map(line => ({
      ...line,
      strength: this.calculateLineStrength(line, marketData, finalConfig)
    }));

    // Filter by minimum touch count and strength
    const filteredLines = strengthCalculatedLines.filter(line => 
      line.touchCount >= finalConfig.minTouchCount && line.strength > 0.1
    );

    // Sort by strength and return top lines (prevent too many lines)
    return filteredLines
      .sort((a, b) => b.strength - a.strength)
      .slice(0, Math.min(20, filteredLines.length));
  }

  /**
   * Generate lines from pivot points of the same type
   */
  private generateLinesFromPivots(
    pivots: PivotPoint[],
    type: 'SUPPORT' | 'RESISTANCE',
    marketData: MarketData[],
    config: TrendlineConfig
  ): TrendLine[] {
    if (pivots.length < config.minPivots) return [];

    const lines: TrendLine[] = [];

    // Try all combinations of pivots for line generation
    for (let i = 0; i < pivots.length - 1; i++) {
      for (let j = i + 1; j < pivots.length; j++) {
        const pivot1 = pivots[i];
        const pivot2 = pivots[j];

        // Check age constraint
        const ageInDays = this.calculateAgeInDays(pivot1.timestamp, new Date());
        if (ageInDays > config.maxAge) continue;

        // Generate line equation
        const equation = this.calculateLineEquation(pivot1, pivot2);
        if (!this.isValidSlope(equation.slope, config.maxSlope)) continue;

        // Count touches and calculate quality metrics
        const touchAnalysis = this.analyzeTouches(equation, marketData, config.bufferPercent);
        if (touchAnalysis.touchCount < config.minTouchCount) continue;

        // Create trendline
        const line: TrendLine = {
          id: uuidv4(),
          timeframe: config.timeframe,
          type,
          pivotPoints: [pivot1, pivot2],
          equation,
          strength: 0, // Will be calculated later
          touchCount: touchAnalysis.touchCount,
          avgDeviation: touchAnalysis.avgDeviation,
          createdAt: pivot1.timestamp,
          lastTouched: this.findLastTouch(equation, marketData, config.bufferPercent),
          isActive: this.isLineActive(equation, marketData, config.bufferPercent),
          projectedLevels: this.calculateProjections(equation),
          metadata: {
            ageInDays,
            recentTouches: this.countRecentTouches(equation, marketData, config.bufferPercent, 30),
            maxStreak: touchAnalysis.maxStreak,
            lastBreak: touchAnalysis.lastBreak
          }
        };

        // Add additional pivot points that fit the line
        line.pivotPoints = this.findAdditionalPivots(line, pivots, config.bufferPercent);
        
        lines.push(line);
      }
    }

    return this.removeDuplicateLines(lines);
  }

  /**
   * Calculate line equation from two pivot points
   */
  private calculateLineEquation(pivot1: PivotPoint, pivot2: PivotPoint): {
    slope: number;
    intercept: number;
    rSquared: number;
  } {
    const x1 = pivot1.timestamp.getTime();
    const y1 = pivot1.price;
    const x2 = pivot2.timestamp.getTime();
    const y2 = pivot2.price;

    const slope = (y2 - y1) / (x2 - x1);
    const intercept = y1 - (slope * x1);

    // Calculate R-squared (correlation coefficient)
    const rSquared = this.calculateRSquared([pivot1, pivot2], slope, intercept);

    return { slope, intercept, rSquared };
  }

  /**
   * Check if slope is within acceptable range
   */
  private isValidSlope(slope: number, maxSlope: number): boolean {
    const slopeInDegrees = Math.abs(Math.atan(slope * 1000000) * 180 / Math.PI); // Convert to degrees per day
    return slopeInDegrees <= maxSlope;
  }

  /**
   * Analyze how market data touches the trendline
   */
  private analyzeTouches(
    equation: { slope: number; intercept: number },
    marketData: MarketData[],
    bufferPercent: number
  ): {
    touchCount: number;
    avgDeviation: number;
    maxStreak: number;
    lastBreak?: Date;
  } {
    let touchCount = 0;
    let totalDeviation = 0;
    let maxStreak = 0;
    let currentStreak = 0;
    let lastBreak: Date | undefined;

    for (const candle of marketData) {
      const timestamp = candle.timestamp.getTime();
      const lineLevel = equation.slope * timestamp + equation.intercept;
      
      const highDeviation = Math.abs(candle.high - lineLevel) / lineLevel;
      const lowDeviation = Math.abs(candle.low - lineLevel) / lineLevel;
      const minDeviation = Math.min(highDeviation, lowDeviation);

      if (minDeviation <= bufferPercent) {
        touchCount++;
        totalDeviation += minDeviation;
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        if (currentStreak > 0) {
          currentStreak = 0;
        }
        
        // Check for significant breaks
        if (minDeviation > bufferPercent * 3) {
          lastBreak = candle.timestamp;
        }
      }
    }

    const avgDeviation = touchCount > 0 ? totalDeviation / touchCount : 1;

    return { touchCount, avgDeviation, maxStreak, lastBreak };
  }

  /**
   * Calculate line strength based on multiple factors
   */
  calculateLineStrength(
    line: TrendLine,
    marketData: MarketData[],
    config: TrendlineConfig
  ): number {
    // Touch count factor (more touches = stronger)
    const touchFactor = Math.min(line.touchCount / 10, 1) * 30;

    // Age factor (mature lines with consistent touches)
    const ageFactor = Math.min(line.metadata.ageInDays / 90, 1) * 20;

    // Accuracy factor (lower deviation = stronger)
    const accuracyFactor = (1 - line.avgDeviation) * 25;

    // Recent activity factor
    const recentFactor = Math.min(line.metadata.recentTouches / 5, 1) * 15;

    // Streak factor (consecutive respect periods)
    const streakFactor = Math.min(line.metadata.maxStreak / 5, 1) * 10;

    // Timeframe weight
    const timeframeWeight = this.getTimeframeWeight(line.timeframe);

    let strength = (touchFactor + ageFactor + accuracyFactor + recentFactor + streakFactor) / 100;
    strength *= timeframeWeight;

    // Penalty for broken lines
    if (line.metadata.lastBreak) {
      const daysSinceBreak = this.calculateAgeInDays(line.metadata.lastBreak, new Date());
      if (daysSinceBreak < 30) {
        strength *= 0.7; // 30% penalty for recent breaks
      }
    }

    return Math.max(0, Math.min(1, strength));
  }

  /**
   * Calculate R-squared for line fit quality
   */
  private calculateRSquared(
    pivots: PivotPoint[],
    slope: number,
    intercept: number
  ): number {
    if (pivots.length < 2) return 0;

    const meanY = pivots.reduce((sum, p) => sum + p.price, 0) / pivots.length;
    
    let ssRes = 0; // Sum of squares of residuals
    let ssTot = 0; // Total sum of squares

    for (const pivot of pivots) {
      const x = pivot.timestamp.getTime();
      const actualY = pivot.price;
      const predictedY = slope * x + intercept;
      
      ssRes += Math.pow(actualY - predictedY, 2);
      ssTot += Math.pow(actualY - meanY, 2);
    }

    return ssTot === 0 ? 1 : 1 - (ssRes / ssTot);
  }

  /**
   * Find additional pivot points that fit the line
   */
  private findAdditionalPivots(
    line: TrendLine,
    allPivots: PivotPoint[],
    bufferPercent: number
  ): PivotPoint[] {
    const fittingPivots = [...line.pivotPoints];

    for (const pivot of allPivots) {
      if (line.pivotPoints.some(p => p.id === pivot.id)) continue;

      const timestamp = pivot.timestamp.getTime();
      const lineLevel = line.equation.slope * timestamp + line.equation.intercept;
      const deviation = Math.abs(pivot.price - lineLevel) / lineLevel;

      if (deviation <= bufferPercent) {
        fittingPivots.push(pivot);
      }
    }

    return fittingPivots.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Find the most recent touch of the line
   */
  private findLastTouch(
    equation: { slope: number; intercept: number },
    marketData: MarketData[],
    bufferPercent: number
  ): Date {
    for (let i = marketData.length - 1; i >= 0; i--) {
      const candle = marketData[i];
      const timestamp = candle.timestamp.getTime();
      const lineLevel = equation.slope * timestamp + equation.intercept;
      
      const highDeviation = Math.abs(candle.high - lineLevel) / lineLevel;
      const lowDeviation = Math.abs(candle.low - lineLevel) / lineLevel;

      if (Math.min(highDeviation, lowDeviation) <= bufferPercent) {
        return candle.timestamp;
      }
    }

    return marketData[0]?.timestamp || new Date();
  }

  /**
   * Check if line is currently active (recent touches)
   */
  private isLineActive(
    equation: { slope: number; intercept: number },
    marketData: MarketData[],
    bufferPercent: number
  ): boolean {
    const recentCandles = marketData.slice(-20); // Last 20 candles
    
    for (const candle of recentCandles) {
      const timestamp = candle.timestamp.getTime();
      const lineLevel = equation.slope * timestamp + equation.intercept;
      
      const highDeviation = Math.abs(candle.high - lineLevel) / lineLevel;
      const lowDeviation = Math.abs(candle.low - lineLevel) / lineLevel;

      if (Math.min(highDeviation, lowDeviation) <= bufferPercent) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate projected price levels
   */
  private calculateProjections(equation: { slope: number; intercept: number }): {
    current: number;
    oneDay: number;
    oneWeek: number;
    oneMonth: number;
  } {
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;

    return {
      current: equation.slope * now + equation.intercept,
      oneDay: equation.slope * (now + oneDay) + equation.intercept,
      oneWeek: equation.slope * (now + oneWeek) + equation.intercept,
      oneMonth: equation.slope * (now + oneMonth) + equation.intercept
    };
  }

  /**
   * Count recent touches within specified days
   */
  private countRecentTouches(
    equation: { slope: number; intercept: number },
    marketData: MarketData[],
    bufferPercent: number,
    days: number
  ): number {
    const cutoffTime = new Date().getTime() - (days * 24 * 60 * 60 * 1000);
    let recentTouches = 0;

    for (const candle of marketData) {
      if (candle.timestamp.getTime() < cutoffTime) continue;

      const timestamp = candle.timestamp.getTime();
      const lineLevel = equation.slope * timestamp + equation.intercept;
      
      const highDeviation = Math.abs(candle.high - lineLevel) / lineLevel;
      const lowDeviation = Math.abs(candle.low - lineLevel) / lineLevel;

      if (Math.min(highDeviation, lowDeviation) <= bufferPercent) {
        recentTouches++;
      }
    }

    return recentTouches;
  }

  /**
   * Remove duplicate/similar lines
   */
  private removeDuplicateLines(lines: TrendLine[]): TrendLine[] {
    const uniqueLines: TrendLine[] = [];
    const similarityThreshold = 0.02; // 2% price similarity

    for (const line of lines) {
      let isDuplicate = false;

      for (const existing of uniqueLines) {
        if (this.areLinessimilar(line, existing, similarityThreshold)) {
          // Keep the one with higher touch count
          if (line.touchCount > existing.touchCount) {
            const index = uniqueLines.indexOf(existing);
            uniqueLines[index] = line;
          }
          isDuplicate = true;
          break;
        }
      }

      if (!isDuplicate) {
        uniqueLines.push(line);
      }
    }

    return uniqueLines;
  }

  /**
   * Check if two lines are similar
   */
  private areLinesimilar(
    line1: TrendLine,
    line2: TrendLine,
    threshold: number
  ): boolean {
    if (line1.type !== line2.type) return false;

    const currentTime = new Date().getTime();
    const level1 = line1.equation.slope * currentTime + line1.equation.intercept;
    const level2 = line2.equation.slope * currentTime + line2.equation.intercept;

    const priceDiff = Math.abs(level1 - level2) / Math.min(level1, level2);
    return priceDiff < threshold;
  }

  /**
   * Calculate age in days
   */
  private calculateAgeInDays(startDate: Date, endDate: Date): number {
    const diffTime = endDate.getTime() - startDate.getTime();
    return diffTime / (1000 * 60 * 60 * 24);
  }

  /**
   * Get timeframe weight for strength calculation
   */
  private getTimeframeWeight(timeframe: Timeframe): number {
    const weights: Record<Timeframe, number> = {
      '1M': 1.3,  // Monthly lines get highest weight
      '1W': 1.2,  // Weekly lines
      '1D': 1.0,  // Daily lines (baseline)
      '4H': 0.8,  // 4-hour lines
      '1H': 0.6   // Hourly lines get lowest weight
    };
    
    return weights[timeframe];
  }

  /**
   * Extend line to future timestamp
   */
  extendLine(line: TrendLine, futureTimestamp: Date): number {
    return line.equation.slope * futureTimestamp.getTime() + line.equation.intercept;
  }

  /**
   * Check if price is approaching a trendline
   */
  isPriceApproachingLine(
    currentPrice: number,
    line: TrendLine,
    threshold: number = 0.02
  ): boolean {
    const currentTime = new Date().getTime();
    const lineLevel = line.equation.slope * currentTime + line.equation.intercept;
    
    const distance = Math.abs(currentPrice - lineLevel) / lineLevel;
    return distance <= threshold;
  }

  /**
   * Get line statistics for analysis
   */
  getLineStatistics(lines: TrendLine[]): {
    totalLines: number;
    supportLines: number;
    resistanceLines: number;
    avgStrength: number;
    strongLines: number;
    activeLines: number;
    timeframeDistribution: Record<Timeframe, number>;
  } {
    const stats = {
      totalLines: lines.length,
      supportLines: lines.filter(l => l.type === 'SUPPORT').length,
      resistanceLines: lines.filter(l => l.type === 'RESISTANCE').length,
      avgStrength: lines.reduce((sum, l) => sum + l.strength, 0) / lines.length || 0,
      strongLines: lines.filter(l => l.strength > 0.7).length,
      activeLines: lines.filter(l => l.isActive).length,
      timeframeDistribution: {} as Record<Timeframe, number>
    };

    // Calculate timeframe distribution
    const timeframes: Timeframe[] = ['1M', '1W', '1D', '4H', '1H'];
    timeframes.forEach(tf => {
      stats.timeframeDistribution[tf] = lines.filter(l => l.timeframe === tf).length;
    });

    return stats;
  }

  /**
   * Export trendlines to JSON format
   */
  exportTrendlines(lines: TrendLine[]): string {
    return JSON.stringify(lines.map(line => ({
      ...line,
      createdAt: line.createdAt.toISOString(),
      lastTouched: line.lastTouched.toISOString(),
      pivotPoints: line.pivotPoints.map(p => ({
        ...p,
        timestamp: p.timestamp.toISOString()
      })),
      metadata: {
        ...line.metadata,
        lastBreak: line.metadata.lastBreak?.toISOString()
      }
    })), null, 2);
  }

  /**
   * Import trendlines from JSON format
   */
  importTrendlines(jsonString: string): TrendLine[] {
    const data = JSON.parse(jsonString);
    return data.map((item: any) => ({
      ...item,
      createdAt: new Date(item.createdAt),
      lastTouched: new Date(item.lastTouched),
      pivotPoints: item.pivotPoints.map((p: any) => ({
        ...p,
        timestamp: new Date(p.timestamp)
      })),
      metadata: {
        ...item.metadata,
        lastBreak: item.metadata.lastBreak ? new Date(item.metadata.lastBreak) : undefined
      }
    }));
  }
}