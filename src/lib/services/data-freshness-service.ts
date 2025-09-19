import { MultiTimeframeService } from '@/lib/data/multi-timeframe-service';
import { Timeframe } from '@/types';
import fs from 'fs';
import path from 'path';

interface DataFreshnessCheck {
  symbol: string;
  marketData: {
    [K in Timeframe]?: {
      isStale: boolean;
      lastUpdate: Date | null;
      recordCount: number;
      hoursOld: number;
    };
  };
  trendClouds: {
    exists: boolean;
    isStale: boolean;
    lastUpdate: Date | null;
    hoursOld: number;
    filePath: string;
  };
  needsUpdate: boolean;
  recommendations: string[];
}

export class DataFreshnessService {
  private multiTimeframeService: MultiTimeframeService;

  constructor() {
    this.multiTimeframeService = new MultiTimeframeService();
  }

  /**
   * Check if market data and trend clouds are up to date
   */
  async checkDataFreshness(symbol: string, timeframes: Timeframe[] = ['1D', '1W', '1M']): Promise<DataFreshnessCheck> {
    const result: DataFreshnessCheck = {
      symbol: symbol.toUpperCase(),
      marketData: {},
      trendClouds: {
        exists: false,
        isStale: false,
        lastUpdate: null,
        hoursOld: 0,
        filePath: ''
      },
      needsUpdate: false,
      recommendations: []
    };

    // Check market data freshness for each timeframe
    for (const timeframe of timeframes) {
      const freshness = this.multiTimeframeService.getDataFreshness(symbol, timeframe);
      const hoursOld = freshness.age / (1000 * 60 * 60);

      // Define staleness thresholds
      const stalenessThresholds: Record<Timeframe, number> = {
        '1H': 1,    // 1 hour
        '4H': 4,    // 4 hours
        '1D': 6,    // 6 hours (refresh during market close)
        '1W': 24,   // 24 hours
        '1M': 72    // 72 hours (3 days)
      };

      const isStale = !freshness.isCached || hoursOld > stalenessThresholds[timeframe];

      result.marketData[timeframe] = {
        isStale,
        lastUpdate: freshness.isCached ? new Date(Date.now() - freshness.age) : null,
        recordCount: 0, // Will be populated by database check
        hoursOld: Math.round(hoursOld * 100) / 100
      };

      if (isStale) {
        result.needsUpdate = true;
        result.recommendations.push(`${timeframe} data is ${hoursOld.toFixed(1)} hours old (threshold: ${stalenessThresholds[timeframe]}h)`);
      }
    }

    // Check database record counts
    try {
      const symbolInfo = await this.multiTimeframeService.getSymbolDataInfo(symbol);
      if (symbolInfo) {
        for (const timeframe of timeframes) {
          if (result.marketData[timeframe]) {
            result.marketData[timeframe]!.recordCount = symbolInfo.recordsByTimeframe[timeframe] || 0;
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to get database info for ${symbol}:`, error);
      result.recommendations.push('Database health check failed - may need fresh data fetch');
    }

    // Check trend clouds file
    const trendCloudsPath = path.resolve(process.cwd(), `results/${symbol.toUpperCase()}_continuous_trend_clouds.json`);
    result.trendClouds.filePath = trendCloudsPath;

    try {
      if (fs.existsSync(trendCloudsPath)) {
        result.trendClouds.exists = true;

        const stats = fs.statSync(trendCloudsPath);
        result.trendClouds.lastUpdate = stats.mtime;

        const hoursOld = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
        result.trendClouds.hoursOld = Math.round(hoursOld * 100) / 100;

        // Trend clouds are stale if older than 24 hours
        result.trendClouds.isStale = hoursOld > 24;

        if (result.trendClouds.isStale) {
          result.needsUpdate = true;
          result.recommendations.push(`Trend clouds are ${hoursOld.toFixed(1)} hours old (threshold: 24h)`);
        }
      } else {
        result.trendClouds.exists = false;
        result.trendClouds.isStale = true;
        result.needsUpdate = true;
        result.recommendations.push('Trend clouds file does not exist - needs generation');
      }
    } catch (error) {
      console.error(`Error checking trend clouds file for ${symbol}:`, error);
      result.recommendations.push('Error checking trend clouds file');
    }

    // Check if it's market hours (avoid unnecessary updates during market hours)
    const now = new Date();
    const marketHours = this.isMarketHours(now);

    if (marketHours && result.needsUpdate) {
      result.recommendations.push('Note: Market is currently open - consider updating during market close for better performance');
    }

    return result;
  }

  /**
   * Check if US market is currently open
   * Adjusted for Singapore timezone (SGT = UTC+8)
   */
  private isMarketHours(date: Date): boolean {
    // Convert current time to US Eastern Time
    const utc = new Date(date.getTime() + (date.getTimezoneOffset() * 60000));

    // EST/EDT offset (EST = UTC-5, EDT = UTC-4)
    // We'll use EST for simplicity, but could check for daylight saving time
    const est = new Date(utc.getTime() + (-5 * 3600000));

    const day = est.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = est.getHours();
    const minutes = est.getMinutes();

    // Market is closed on weekends
    if (day === 0 || day === 6) return false;

    // Market hours: 9:30 AM - 4:00 PM EST
    // Convert to minutes for precise check
    const currentMinutes = hour * 60 + minutes;
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM

    return currentMinutes >= marketOpen && currentMinutes < marketClose;
  }

  /**
   * Get Singapore time equivalent of US market hours
   */
  getMarketHoursSingapore(): {
    isOpen: boolean;
    openTime: string;
    closeTime: string;
    nextOpen: string;
    timeUntilOpen: string;
  } {
    const now = new Date();
    const isOpen = this.isMarketHours(now);

    // US market hours in Singapore time
    // EST 9:30 AM = SGT 10:30 PM (same day)
    // EST 4:00 PM = SGT 5:00 AM (next day)

    return {
      isOpen,
      openTime: "10:30 PM SGT",
      closeTime: "5:00 AM SGT (next day)",
      nextOpen: isOpen ? "Next trading day 10:30 PM SGT" : "Today 10:30 PM SGT",
      timeUntilOpen: isOpen ? "Market is open" : "Check market schedule"
    };
  }

  /**
   * Get market data update priority
   */
  async getUpdatePriority(symbol: string): Promise<{
    priority: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
    estimatedUpdateTime: string;
  }> {
    const freshness = await this.checkDataFreshness(symbol);

    let priority: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const reasons: string[] = [];
    let estimatedMinutes = 1;

    // Check trend clouds
    if (!freshness.trendClouds.exists) {
      priority = 'critical';
      reasons.push('No trend clouds data available');
      estimatedMinutes += 5; // Trend cloud generation takes time
    } else if (freshness.trendClouds.isStale && freshness.trendClouds.hoursOld > 48) {
      priority = 'high';
      reasons.push('Trend clouds very outdated (>48h)');
      estimatedMinutes += 3;
    } else if (freshness.trendClouds.isStale) {
      priority = priority === 'low' ? 'medium' : priority;
      reasons.push('Trend clouds need refresh');
      estimatedMinutes += 2;
    }

    // Check market data
    const staleTimeframes = Object.entries(freshness.marketData)
      .filter(([, data]) => data?.isStale)
      .map(([tf]) => tf);

    if (staleTimeframes.length > 0) {
      if (staleTimeframes.includes('1D') && freshness.marketData['1D']?.hoursOld! > 24) {
        priority = priority === 'low' ? 'high' : priority;
        reasons.push('Daily data very outdated');
        estimatedMinutes += 2;
      } else if (staleTimeframes.length >= 2) {
        priority = priority === 'low' ? 'medium' : priority;
        reasons.push('Multiple timeframes need refresh');
        estimatedMinutes += 1;
      }
    }

    if (reasons.length === 0) {
      reasons.push('All data is up to date');
    }

    return {
      priority,
      reasons,
      estimatedUpdateTime: `~${estimatedMinutes} minute${estimatedMinutes > 1 ? 's' : ''}`
    };
  }

  /**
   * Check database health and available symbols
   */
  async getDatabaseStatus(): Promise<{
    isHealthy: boolean;
    availableSymbols: string[];
    totalRecords: number;
    error?: string;
  }> {
    try {
      const health = await this.multiTimeframeService.getDatabaseHealth();
      const symbols = await this.multiTimeframeService.getAvailableSymbols();

      return {
        isHealthy: health.isHealthy,
        availableSymbols: symbols,
        totalRecords: health.stats?.totalRecords || 0,
        error: health.error
      };
    } catch (error) {
      return {
        isHealthy: false,
        availableSymbols: [],
        totalRecords: 0,
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
    }
  }
}