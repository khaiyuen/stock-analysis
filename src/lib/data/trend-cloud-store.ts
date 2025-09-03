import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { TrendCloudData, TrendCloudPoint } from '@/lib/trendCloud';
import { Timeframe } from '@/types';

export interface StoredTrendCloud {
  id?: number;
  symbol: string;
  calculation_date: number; // Unix timestamp
  target_date: number; // Unix timestamp
  timeframe: Timeframe;
  lookback_days: number;
  total_weight: number;
  total_trendlines: number;
  convergence_zone_count: number;
  peak_price: number;
  peak_weight: number;
  peak_density: number;
  concentration_ratio: number;
  price_range_min: number;
  price_range_max: number;
  confidence_score: number;
  created_at: number;
}

export interface StoredTrendCloudPoint {
  id?: number;
  trend_cloud_id: number;
  price_level: number;
  weight: number;
  normalized_weight: number;
  density: number;
  trendline_count: number;
  confidence: number;
  lookback_days: number;
  total_trendlines: number;
  avg_trendline_strength: number;
  price_range_min: number;
  price_range_max: number;
  total_daily_weight: number;
}

export class TrendCloudStore {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    // Create data directory if it doesn't exist
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dbPath = dbPath || path.join(dataDir, 'stock-data.db');
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * Initialize database schema for trend clouds
   */
  private initializeDatabase(): void {
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');

    // Create trend clouds table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trend_clouds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        calculation_date INTEGER NOT NULL,
        target_date INTEGER NOT NULL,
        timeframe TEXT NOT NULL,
        lookback_days INTEGER NOT NULL,
        total_weight REAL NOT NULL,
        total_trendlines INTEGER NOT NULL,
        convergence_zone_count INTEGER NOT NULL,
        peak_price REAL NOT NULL,
        peak_weight REAL NOT NULL,
        peak_density REAL NOT NULL,
        concentration_ratio REAL NOT NULL,
        price_range_min REAL NOT NULL,
        price_range_max REAL NOT NULL,
        confidence_score REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(symbol, calculation_date, target_date, timeframe)
      );
    `);

    // Create trend cloud points table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trend_cloud_points (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trend_cloud_id INTEGER NOT NULL,
        price_level REAL NOT NULL,
        weight REAL NOT NULL,
        normalized_weight REAL NOT NULL,
        density REAL NOT NULL,
        trendline_count INTEGER NOT NULL,
        confidence REAL NOT NULL,
        lookback_days INTEGER NOT NULL,
        total_trendlines INTEGER NOT NULL,
        avg_trendline_strength REAL NOT NULL,
        price_range_min REAL NOT NULL,
        price_range_max REAL NOT NULL,
        total_daily_weight REAL NOT NULL,
        FOREIGN KEY (trend_cloud_id) REFERENCES trend_clouds (id) ON DELETE CASCADE
      );
    `);

    // Create indexes for fast queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trend_clouds_symbol_date 
      ON trend_clouds(symbol, calculation_date);
      
      CREATE INDEX IF NOT EXISTS idx_trend_clouds_symbol_timeframe 
      ON trend_clouds(symbol, timeframe);
      
      CREATE INDEX IF NOT EXISTS idx_trend_clouds_target_date 
      ON trend_clouds(target_date);
      
      CREATE INDEX IF NOT EXISTS idx_cloud_points_cloud_id 
      ON trend_cloud_points(trend_cloud_id);
    `);
  }

  /**
   * Save a trend cloud to database
   */
  async saveTrendCloud(cloudData: TrendCloudData): Promise<number> {
    const insertCloud = this.db.prepare(`
      INSERT OR REPLACE INTO trend_clouds (
        symbol, calculation_date, target_date, timeframe, lookback_days,
        total_weight, total_trendlines, convergence_zone_count,
        peak_price, peak_weight, peak_density, concentration_ratio,
        price_range_min, price_range_max, confidence_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPoint = this.db.prepare(`
      INSERT INTO trend_cloud_points (
        trend_cloud_id, price_level, weight, normalized_weight, density,
        trendline_count, confidence, lookback_days, total_trendlines,
        avg_trendline_strength, price_range_min, price_range_max, total_daily_weight
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Clear existing points for this cloud
    const deletePoints = this.db.prepare(`
      DELETE FROM trend_cloud_points WHERE trend_cloud_id = (
        SELECT id FROM trend_clouds 
        WHERE symbol = ? AND calculation_date = ? AND target_date = ? AND timeframe = ?
      )
    `);

    const transaction = this.db.transaction(() => {
      // Delete existing points first
      deletePoints.run(
        cloudData.symbol,
        Math.floor(new Date(cloudData.calculationDate).getTime() / 1000),
        Math.floor(new Date(cloudData.targetDate).getTime() / 1000),
        cloudData.timeframe
      );

      // Insert the cloud
      const result = insertCloud.run(
        cloudData.symbol,
        Math.floor(new Date(cloudData.calculationDate).getTime() / 1000),
        Math.floor(new Date(cloudData.targetDate).getTime() / 1000),
        cloudData.timeframe,
        cloudData.lookbackDays,
        cloudData.summary.totalWeight,
        cloudData.summary.totalTrendlines,
        cloudData.summary.convergenceZoneCount,
        cloudData.summary.peakPrice,
        cloudData.summary.peakWeight,
        cloudData.summary.peakDensity,
        cloudData.summary.concentrationRatio,
        cloudData.summary.priceRange.min,
        cloudData.summary.priceRange.max,
        cloudData.summary.confidenceScore
      );

      const cloudId = result.lastInsertRowid as number;

      // Insert all cloud points
      for (const point of cloudData.cloudPoints) {
        insertPoint.run(
          cloudId,
          point.priceLevel,
          point.weight,
          point.normalizedWeight,
          point.density,
          point.trendlineCount,
          point.confidence,
          point.metadata.lookbackDays,
          point.metadata.totalTrendlines,
          point.metadata.avgTrendlineStrength,
          point.metadata.priceRange.min,
          point.metadata.priceRange.max,
          point.metadata.totalDailyWeight
        );
      }

      return cloudId;
    });

    return transaction();
  }

  /**
   * Get trend clouds for a symbol and date range
   */
  async getTrendClouds(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe?: Timeframe
  ): Promise<TrendCloudData[]> {
    let query = `
      SELECT * FROM trend_clouds 
      WHERE symbol = ? 
      AND calculation_date >= ? 
      AND calculation_date <= ?
    `;
    
    const params: any[] = [
      symbol,
      Math.floor(startDate.getTime() / 1000),
      Math.floor(endDate.getTime() / 1000)
    ];

    if (timeframe) {
      query += ` AND timeframe = ?`;
      params.push(timeframe);
    }

    query += ` ORDER BY calculation_date ASC`;

    const getClouds = this.db.prepare(query);
    const getPoints = this.db.prepare(`
      SELECT * FROM trend_cloud_points 
      WHERE trend_cloud_id = ? 
      ORDER BY price_level ASC
    `);

    const clouds = getClouds.all(...params) as StoredTrendCloud[];
    const result: TrendCloudData[] = [];

    for (const cloud of clouds) {
      const points = getPoints.all(cloud.id) as StoredTrendCloudPoint[];
      
      const cloudData: TrendCloudData = {
        symbol: cloud.symbol,
        calculationDate: new Date(cloud.calculation_date * 1000),
        targetDate: new Date(cloud.target_date * 1000),
        timeframe: cloud.timeframe,
        lookbackDays: cloud.lookback_days,
        convergenceZones: [], // We don't store convergence zones separately for now
        cloudPoints: points.map(point => ({
          id: `${cloud.id}-${point.id}`,
          symbol: cloud.symbol,
          calculationDate: new Date(cloud.calculation_date * 1000),
          targetDate: new Date(cloud.target_date * 1000),
          timeframe: cloud.timeframe,
          priceLevel: point.price_level,
          weight: point.weight,
          normalizedWeight: point.normalized_weight,
          density: point.density,
          trendlineCount: point.trendline_count,
          confidence: point.confidence,
          metadata: {
            lookbackDays: point.lookback_days,
            totalTrendlines: point.total_trendlines,
            avgTrendlineStrength: point.avg_trendline_strength,
            priceRange: {
              min: point.price_range_min,
              max: point.price_range_max
            },
            totalDailyWeight: point.total_daily_weight
          }
        })),
        summary: {
          totalWeight: cloud.total_weight,
          totalTrendlines: cloud.total_trendlines,
          convergenceZoneCount: cloud.convergence_zone_count,
          peakPrice: cloud.peak_price,
          peakWeight: cloud.peak_weight,
          peakDensity: cloud.peak_density,
          concentrationRatio: cloud.concentration_ratio,
          priceRange: {
            min: cloud.price_range_min,
            max: cloud.price_range_max
          },
          confidenceScore: cloud.confidence_score
        }
      };

      result.push(cloudData);
    }

    return result;
  }

  /**
   * Check if trend clouds exist for a date range
   */
  async hasTrendClouds(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe?: Timeframe
  ): Promise<boolean> {
    let query = `
      SELECT COUNT(*) as count FROM trend_clouds 
      WHERE symbol = ? 
      AND calculation_date >= ? 
      AND calculation_date <= ?
    `;
    
    const params: any[] = [
      symbol,
      Math.floor(startDate.getTime() / 1000),
      Math.floor(endDate.getTime() / 1000)
    ];

    if (timeframe) {
      query += ` AND timeframe = ?`;
      params.push(timeframe);
    }

    const result = this.db.prepare(query).get(...params) as { count: number };
    return result.count > 0;
  }

  /**
   * Get statistics about stored trend clouds
   */
  async getStats(symbol?: string): Promise<{
    totalClouds: number;
    totalPoints: number;
    dateRange: { start: Date | null; end: Date | null };
    symbols: string[];
  }> {
    let cloudQuery = `SELECT COUNT(*) as count FROM trend_clouds`;
    let pointQuery = `SELECT COUNT(*) as count FROM trend_cloud_points`;
    let rangeQuery = `
      SELECT MIN(calculation_date) as start, MAX(calculation_date) as end 
      FROM trend_clouds
    `;
    let symbolQuery = `SELECT DISTINCT symbol FROM trend_clouds`;
    
    if (symbol) {
      const whereClause = ` WHERE symbol = ?`;
      cloudQuery += whereClause;
      pointQuery += ` WHERE trend_cloud_id IN (SELECT id FROM trend_clouds WHERE symbol = ?)`;
      rangeQuery += whereClause;
      symbolQuery += whereClause;
    }
    
    symbolQuery += ` ORDER BY symbol`;

    const cloudParams = symbol ? [symbol] : [];
    const pointParams = symbol ? [symbol] : [];
    const rangeParams = symbol ? [symbol] : [];
    const symbolParams = symbol ? [symbol] : [];

    const totalClouds = (this.db.prepare(cloudQuery).get(...cloudParams) as { count: number }).count;
    const totalPoints = (this.db.prepare(pointQuery).get(...pointParams) as { count: number }).count;
    const range = this.db.prepare(rangeQuery).get(...rangeParams) as { start: number | null; end: number | null };
    const symbols = (this.db.prepare(symbolQuery).all(...symbolParams) as { symbol: string }[]).map(r => r.symbol);

    return {
      totalClouds,
      totalPoints,
      dateRange: {
        start: range.start ? new Date(range.start * 1000) : null,
        end: range.end ? new Date(range.end * 1000) : null
      },
      symbols
    };
  }

  /**
   * Clear all trend cloud data
   */
  async clearAll(): Promise<void> {
    this.db.exec(`DELETE FROM trend_cloud_points`);
    this.db.exec(`DELETE FROM trend_clouds`);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}