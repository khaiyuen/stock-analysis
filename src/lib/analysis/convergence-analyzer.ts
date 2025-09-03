import { TrendLine, ConvergenceZone, MarketData, ConvergenceConfig, Timeframe } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export class ConvergenceAnalyzer {
  // Default configuration for convergence analysis
  private readonly defaultConfig: ConvergenceConfig = {
    priceThreshold: 0.005, // 0.5% price threshold for grouping lines
    minLines: 2,
    strengthWeights: {
      touchCount: 0.3,
      ageWeight: 0.2,
      accuracyWeight: 0.25,
      timeframeWeight: {
        '1M': 1.3,
        '1W': 1.2,
        '1D': 1.0,
        '4H': 0.8,
        '1H': 0.6
      }
    }
  };

  /**
   * Identify convergence zones from trendlines
   */
  identifyConvergenceZones(
    trendlines: TrendLine[],
    marketData: MarketData[],
    config?: Partial<ConvergenceConfig>
  ): ConvergenceZone[] {
    if (trendlines.length < 2) {
      console.warn(`Insufficient trendlines for convergence analysis: ${trendlines.length}`);
      return [];
    }

    const finalConfig = { ...this.defaultConfig, ...config };
    
    // Get current price levels for all lines
    const currentTime = new Date().getTime();
    const lineLevels = trendlines.map(line => ({
      line,
      level: line.equation.slope * currentTime + line.equation.intercept
    }));

    // Group lines by similar price levels
    const priceGroups = this.groupLinesByPrice(lineLevels, finalConfig.priceThreshold);

    // Convert groups to convergence zones
    const zones: ConvergenceZone[] = [];
    
    for (const group of priceGroups) {
      if (group.length >= finalConfig.minLines) {
        const zone = this.createConvergenceZone(group, marketData, finalConfig);
        if (zone) {
          zones.push(zone);
        }
      }
    }

    // Sort by strength and return
    return zones
      .sort((a, b) => b.strength - a.strength)
      .slice(0, Math.min(15, zones.length)); // Limit to top 15 zones
  }

  /**
   * Group trendlines by similar current price levels
   */
  private groupLinesByPrice(
    lineLevels: Array<{ line: TrendLine; level: number }>,
    threshold: number
  ): Array<Array<{ line: TrendLine; level: number }>> {
    const groups: Array<Array<{ line: TrendLine; level: number }>> = [];
    const used = new Set<number>();

    for (let i = 0; i < lineLevels.length; i++) {
      if (used.has(i)) continue;

      const group = [lineLevels[i]];
      used.add(i);

      const baseLevel = lineLevels[i].level;

      // Find similar levels
      for (let j = i + 1; j < lineLevels.length; j++) {
        if (used.has(j)) continue;

        const levelDiff = Math.abs(lineLevels[j].level - baseLevel) / baseLevel;
        if (levelDiff <= threshold) {
          group.push(lineLevels[j]);
          used.add(j);
        }
      }

      if (group.length >= 2) {
        groups.push(group);
      }
    }

    return groups;
  }

  /**
   * Create convergence zone from grouped lines
   */
  private createConvergenceZone(
    groupedLines: Array<{ line: TrendLine; level: number }>,
    marketData: MarketData[],
    config: ConvergenceConfig
  ): ConvergenceZone | null {
    if (groupedLines.length < config.minLines) return null;

    const lines = groupedLines.map(gl => gl.line);
    const levels = groupedLines.map(gl => gl.level);

    // Calculate zone boundaries
    const upperBound = Math.max(...levels);
    const lowerBound = Math.min(...levels);
    const priceLevel = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    const zoneWidth = upperBound - lowerBound;

    // Calculate zone strength
    const strength = this.calculateZoneStrength(lines, config);

    // Analyze historical tests of this level
    const testAnalysis = this.analyzeHistoricalTests(priceLevel, marketData, zoneWidth);

    // Determine classification
    const classification = this.classifyZone(strength, lines.length);

    // Calculate confidence based on multiple factors
    const confidence = this.calculateConfidence(lines, testAnalysis, zoneWidth, priceLevel);

    // Get unique timeframes
    const timeframes = [...new Set(lines.map(line => line.timeframe))];

    // Calculate breakout probability
    const breakoutProbability = this.calculateBreakoutProbability(
      lines,
      testAnalysis,
      marketData
    );

    const zone: ConvergenceZone = {
      id: uuidv4(),
      priceLevel,
      upperBound,
      lowerBound,
      strength,
      classification,
      contributingLines: lines,
      timeframes,
      confidence,
      lastTest: testAnalysis.lastTest,
      testCount: testAnalysis.testCount,
      breakoutProbability,
      metadata: {
        avgLineStrength: lines.reduce((sum, l) => sum + l.strength, 0) / lines.length,
        timeframeDiversity: this.calculateTimeframeDiversity(timeframes),
        recentTouches: testAnalysis.recentTouches,
        historicalRespect: testAnalysis.respectRate,
        zoneWidth
      }
    };

    return zone;
  }

  /**
   * Calculate convergence zone strength
   */
  private calculateZoneStrength(lines: TrendLine[], config: ConvergenceConfig): number {
    let totalStrength = 0;

    for (const line of lines) {
      // Base line strength
      let lineContribution = line.strength;

      // Touch count factor
      const touchFactor = Math.min(line.touchCount / 10, 1) * config.strengthWeights.touchCount;
      lineContribution += touchFactor;

      // Age factor (mature lines are stronger)
      const ageFactor = Math.min(line.metadata.ageInDays / 180, 1) * config.strengthWeights.ageWeight;
      lineContribution += ageFactor;

      // Accuracy factor (lower deviation = stronger)
      const accuracyFactor = (1 - line.avgDeviation) * config.strengthWeights.accuracyWeight;
      lineContribution += accuracyFactor;

      // Timeframe weight
      const timeframeWeight = config.strengthWeights.timeframeWeight[line.timeframe];
      lineContribution *= timeframeWeight;

      totalStrength += lineContribution;
    }

    // Bonus for multiple timeframe convergence
    const uniqueTimeframes = new Set(lines.map(l => l.timeframe)).size;
    const timeframeDiversityBonus = Math.min(uniqueTimeframes / 3, 1) * 0.2;
    totalStrength *= (1 + timeframeDiversityBonus);

    // Bonus for line type diversity (both support and resistance)
    const uniqueTypes = new Set(lines.map(l => l.type)).size;
    const typeDiversityBonus = uniqueTypes > 1 ? 0.1 : 0;
    totalStrength *= (1 + typeDiversityBonus);

    return Math.max(0, Math.min(1, totalStrength / lines.length));
  }

  /**
   * Analyze historical tests of the price level
   */
  private analyzeHistoricalTests(
    priceLevel: number,
    marketData: MarketData[],
    zoneWidth: number
  ): {
    testCount: number;
    respectCount: number;
    respectRate: number;
    lastTest: Date;
    recentTouches: number;
    avgBounceStrength: number;
  } {
    let testCount = 0;
    let respectCount = 0;
    let lastTest = marketData[0]?.timestamp || new Date();
    let recentTouches = 0;
    const bounceStrengths: number[] = [];

    const threshold = Math.max(zoneWidth, priceLevel * 0.01); // 1% or zone width, whichever is larger
    const thirtyDaysAgo = new Date().getTime() - (30 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < marketData.length; i++) {
      const candle = marketData[i];
      const isNearLevel = 
        (candle.low <= priceLevel + threshold && candle.high >= priceLevel - threshold);

      if (isNearLevel) {
        testCount++;
        lastTest = candle.timestamp;

        if (candle.timestamp.getTime() > thirtyDaysAgo) {
          recentTouches++;
        }

        // Check if level was respected (bounce occurred)
        const bounceStrength = this.calculateBounceStrength(i, marketData, priceLevel);
        if (bounceStrength > 0.01) { // 1% minimum bounce
          respectCount++;
          bounceStrengths.push(bounceStrength);
        }
      }
    }

    const respectRate = testCount > 0 ? respectCount / testCount : 0;
    const avgBounceStrength = bounceStrengths.length > 0 
      ? bounceStrengths.reduce((sum, b) => sum + b, 0) / bounceStrengths.length 
      : 0;

    return {
      testCount,
      respectCount,
      respectRate,
      lastTest,
      recentTouches,
      avgBounceStrength
    };
  }

  /**
   * Calculate bounce strength from a test level
   */
  private calculateBounceStrength(
    testIndex: number,
    marketData: MarketData[],
    level: number
  ): number {
    const lookAhead = 5; // Look 5 candles ahead for bounce
    let maxBounce = 0;

    for (let i = testIndex + 1; i < Math.min(testIndex + lookAhead + 1, marketData.length); i++) {
      const bounceDistance = Math.abs(marketData[i].close - level) / level;
      maxBounce = Math.max(maxBounce, bounceDistance);
    }

    return maxBounce;
  }

  /**
   * Classify convergence zone strength
   */
  private classifyZone(strength: number, lineCount: number): ConvergenceZone['classification'] {
    if (strength >= 0.8 && lineCount >= 4) return 'VERY_STRONG';
    if (strength >= 0.6 && lineCount >= 3) return 'STRONG';
    if (strength >= 0.4 && lineCount >= 2) return 'MODERATE';
    return 'WEAK';
  }

  /**
   * Calculate zone confidence score
   */
  private calculateConfidence(
    lines: TrendLine[],
    testAnalysis: { respectRate: number; testCount: number },
    zoneWidth: number,
    priceLevel: number
  ): number {
    // Line strength factor
    const avgLineStrength = lines.reduce((sum, l) => sum + l.strength, 0) / lines.length;
    const lineStrengthFactor = avgLineStrength * 0.3;

    // Historical respect factor
    const respectFactor = testAnalysis.respectRate * 0.3;

    // Test frequency factor (more tests = more confidence, but diminishing returns)
    const testFactor = Math.min(testAnalysis.testCount / 10, 1) * 0.2;

    // Zone tightness factor (tighter zones = higher confidence)
    const tightnessFactor = Math.max(0, 1 - (zoneWidth / priceLevel * 50)) * 0.1;

    // Line count factor
    const lineCountFactor = Math.min(lines.length / 5, 1) * 0.1;

    const confidence = lineStrengthFactor + respectFactor + testFactor + tightnessFactor + lineCountFactor;
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Calculate timeframe diversity score
   */
  private calculateTimeframeDiversity(timeframes: Timeframe[]): number {
    const maxTimeframes = 5; // Total possible timeframes
    return timeframes.length / maxTimeframes;
  }

  /**
   * Calculate breakout probability
   */
  private calculateBreakoutProbability(
    lines: TrendLine[],
    testAnalysis: { testCount: number; respectRate: number; recentTouches: number },
    marketData: MarketData[]
  ): number {
    // Base probability from historical respect rate (inverted)
    const baseProb = 1 - testAnalysis.respectRate;

    // Recent pressure factor (more recent touches = higher breakout chance)
    const pressureFactor = Math.min(testAnalysis.recentTouches / 5, 1) * 0.3;

    // Line age factor (older lines more likely to break)
    const avgAge = lines.reduce((sum, l) => sum + l.metadata.ageInDays, 0) / lines.length;
    const ageFactor = Math.min(avgAge / 365, 1) * 0.2;

    // Market momentum factor
    const momentumFactor = this.calculateMarketMomentum(marketData) * 0.3;

    // Volume factor (higher recent volume = higher breakout chance)
    const volumeFactor = this.calculateVolumePattern(marketData) * 0.2;

    let breakoutProb = baseProb + pressureFactor + ageFactor + momentumFactor + volumeFactor;
    
    return Math.max(0, Math.min(1, breakoutProb));
  }

  /**
   * Calculate current market momentum
   */
  private calculateMarketMomentum(marketData: MarketData[]): number {
    if (marketData.length < 20) return 0;

    const recent = marketData.slice(-20);
    const prices = recent.map(d => d.close);
    
    // Calculate slope of recent price movement
    const n = prices.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = prices.reduce((sum, p) => sum + p, 0);
    const sumXY = prices.reduce((sum, p, i) => sum + (p * i), 0);
    const sumXX = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgPrice = sumY / n;

    // Normalize slope by average price
    return Math.abs(slope / avgPrice);
  }

  /**
   * Calculate recent volume patterns
   */
  private calculateVolumePattern(marketData: MarketData[]): number {
    if (marketData.length < 20) return 0;

    const recent = marketData.slice(-10);
    const older = marketData.slice(-20, -10);

    const recentAvgVol = recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
    const olderAvgVol = older.reduce((sum, d) => sum + d.volume, 0) / older.length;

    // Return volume increase ratio, capped at 1
    return Math.min((recentAvgVol / olderAvgVol) - 1, 1);
  }

  /**
   * Rank zones by importance/strength
   */
  rankZonesByImportance(zones: ConvergenceZone[]): ConvergenceZone[] {
    return zones.sort((a, b) => {
      // Primary sort by classification
      const classificationOrder = { 'VERY_STRONG': 4, 'STRONG': 3, 'MODERATE': 2, 'WEAK': 1 };
      const classificationDiff = classificationOrder[b.classification] - classificationOrder[a.classification];
      if (classificationDiff !== 0) return classificationDiff;

      // Secondary sort by strength
      const strengthDiff = b.strength - a.strength;
      if (Math.abs(strengthDiff) > 0.05) return strengthDiff;

      // Tertiary sort by confidence
      const confidenceDiff = b.confidence - a.confidence;
      if (Math.abs(confidenceDiff) > 0.05) return confidenceDiff;

      // Final sort by line count
      return b.contributingLines.length - a.contributingLines.length;
    });
  }

  /**
   * Find zones near current price
   */
  findZonesNearPrice(
    zones: ConvergenceZone[],
    currentPrice: number,
    maxDistance: number = 0.05 // 5% by default
  ): ConvergenceZone[] {
    return zones.filter(zone => {
      const distance = Math.abs(zone.priceLevel - currentPrice) / currentPrice;
      return distance <= maxDistance;
    }).sort((a, b) => {
      // Sort by distance from current price
      const distanceA = Math.abs(a.priceLevel - currentPrice) / currentPrice;
      const distanceB = Math.abs(b.priceLevel - currentPrice) / currentPrice;
      return distanceA - distanceB;
    });
  }

  /**
   * Update zones with new market data
   */
  updateZonesWithNewData(
    zones: ConvergenceZone[],
    newMarketData: MarketData[]
  ): ConvergenceZone[] {
    return zones.map(zone => {
      // Recalculate test analysis with new data
      const testAnalysis = this.analyzeHistoricalTests(
        zone.priceLevel,
        newMarketData,
        zone.metadata.zoneWidth
      );

      // Update zone properties
      return {
        ...zone,
        lastTest: testAnalysis.lastTest,
        testCount: testAnalysis.testCount,
        breakoutProbability: this.calculateBreakoutProbability(
          zone.contributingLines,
          testAnalysis,
          newMarketData
        ),
        metadata: {
          ...zone.metadata,
          recentTouches: testAnalysis.recentTouches,
          historicalRespect: testAnalysis.respectRate
        }
      };
    });
  }

  /**
   * Get convergence analysis statistics
   */
  getAnalysisStats(zones: ConvergenceZone[]): {
    totalZones: number;
    strongZones: number;
    avgStrength: number;
    avgConfidence: number;
    timeframeDistribution: Record<Timeframe, number>;
    typeDistribution: Record<string, number>;
    avgLineCount: number;
  } {
    const stats = {
      totalZones: zones.length,
      strongZones: zones.filter(z => z.classification === 'STRONG' || z.classification === 'VERY_STRONG').length,
      avgStrength: zones.reduce((sum, z) => sum + z.strength, 0) / zones.length || 0,
      avgConfidence: zones.reduce((sum, z) => sum + z.confidence, 0) / zones.length || 0,
      timeframeDistribution: {} as Record<Timeframe, number>,
      typeDistribution: {} as Record<string, number>,
      avgLineCount: zones.reduce((sum, z) => sum + z.contributingLines.length, 0) / zones.length || 0
    };

    // Calculate timeframe distribution
    const allTimeframes = zones.flatMap(z => z.timeframes);
    const timeframes: Timeframe[] = ['1M', '1W', '1D', '4H', '1H'];
    timeframes.forEach(tf => {
      stats.timeframeDistribution[tf] = allTimeframes.filter(t => t === tf).length;
    });

    // Calculate type distribution
    const classifications = ['WEAK', 'MODERATE', 'STRONG', 'VERY_STRONG'];
    classifications.forEach(classification => {
      stats.typeDistribution[classification] = zones.filter(z => z.classification === classification).length;
    });

    return stats;
  }

  /**
   * Export convergence zones to JSON format
   */
  exportZones(zones: ConvergenceZone[]): string {
    return JSON.stringify(zones.map(zone => ({
      ...zone,
      lastTest: zone.lastTest.toISOString(),
      contributingLines: zone.contributingLines.map(line => line.id) // Just store IDs to avoid circular references
    })), null, 2);
  }

  /**
   * Import convergence zones from JSON format (requires trendlines for full reconstruction)
   */
  importZones(jsonString: string, allTrendlines: TrendLine[]): ConvergenceZone[] {
    const data = JSON.parse(jsonString);
    const trendlineMap = new Map(allTrendlines.map(line => [line.id, line]));

    return data.map((item: any) => ({
      ...item,
      lastTest: new Date(item.lastTest),
      contributingLines: item.contributingLines
        .map((id: string) => trendlineMap.get(id))
        .filter(Boolean) // Remove any missing trendlines
    }));
  }
}