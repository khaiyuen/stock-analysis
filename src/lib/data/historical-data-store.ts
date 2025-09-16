import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { MarketData, Timeframe } from '@/types';

export interface StoredMarketData {
  id?: number;
  symbol: string;
  timeframe: Timeframe;
  timestamp: number; // Unix timestamp for better indexing
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjusted_close: number;
  created_at: number;
}

export interface DataRange {
  symbol: string;
  timeframe: Timeframe;
  startDate: Date;
  endDate: Date;
  recordCount: number;
  lastUpdated: Date;
}

export class HistoricalDataStore {
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
   * Initialize database schema
   */
  private initializeDatabase(): void {
    // Enable WAL mode for better performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = 10000');

    // Create main data table with optimized schema
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS market_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume INTEGER DEFAULT 0,
        adjusted_close REAL NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(symbol, timeframe, timestamp)
      );
    `);

    // Create indexes for fast queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_symbol_timeframe_timestamp 
      ON market_data(symbol, timeframe, timestamp);
      
      CREATE INDEX IF NOT EXISTS idx_symbol_timeframe 
      ON market_data(symbol, timeframe);
      
      CREATE INDEX IF NOT EXISTS idx_timestamp 
      ON market_data(timestamp);
    `);

    // Create metadata table for tracking data ranges
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS data_ranges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        start_timestamp INTEGER NOT NULL,
        end_timestamp INTEGER NOT NULL,
        record_count INTEGER NOT NULL,
        last_updated INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(symbol, timeframe)
      );
    `);

    console.log(`📁 Historical data store initialized: ${this.dbPath}`);
  }

  /**
   * Store historical data (bulk insert with conflict resolution)
   */
  async storeHistoricalData(data: MarketData[]): Promise<number> {
    if (!data.length) return 0;

    // Filter and deduplicate data before storing
    const filteredData = this.filterAndDeduplicateData(data);

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO market_data 
      (symbol, timeframe, timestamp, open, high, low, close, volume, adjusted_close)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((marketData: MarketData[]) => {
      let inserted = 0;
      for (const item of marketData) {
        const result = insert.run(
          item.symbol,
          this.getTimeframeFromData(item), // Detect timeframe from data
          Math.floor(item.timestamp.getTime() / 1000),
          item.open,
          item.high,
          item.low,
          item.close,
          item.volume || 0,
          item.adjustedClose
        );
        if (result.changes > 0) inserted++;
      }
      return inserted;
    });

    const insertedCount = transaction(filteredData);
    
    // Update metadata
    await this.updateDataRange(filteredData);
    
    console.log(`💾 Stored ${insertedCount} new records (${filteredData.length} filtered from ${data.length} total processed)`);
    return insertedCount;
  }

  /**
   * Get historical data from storage
   */
  async getHistoricalData(
    symbol: string,
    timeframe: Timeframe,
    startDate?: Date,
    endDate?: Date,
    limit?: number
  ): Promise<MarketData[]> {
    let query = `
      SELECT * FROM market_data 
      WHERE symbol = ? AND timeframe = ?
    `;
    const params: any[] = [symbol, timeframe];

    if (startDate) {
      query += ` AND timestamp >= ?`;
      params.push(Math.floor(startDate.getTime() / 1000));
    }

    if (endDate) {
      query += ` AND timestamp <= ?`;
      params.push(Math.floor(endDate.getTime() / 1000));
    }

    query += ` ORDER BY timestamp ASC`;

    if (limit) {
      query += ` LIMIT ?`;
      params.push(limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as StoredMarketData[];

    return rows.map(row => ({
      symbol: row.symbol,
      timestamp: new Date(row.timestamp * 1000),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      adjustedClose: row.adjusted_close
    }));
  }

  /**
   * Get the latest data point for a symbol/timeframe
   */
  async getLatestData(symbol: string, timeframe: Timeframe): Promise<MarketData | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM market_data 
      WHERE symbol = ? AND timeframe = ?
      ORDER BY timestamp DESC 
      LIMIT 1
    `);
    
    const row = stmt.get(symbol, timeframe) as StoredMarketData | undefined;
    
    if (!row) return null;

    return {
      symbol: row.symbol,
      timestamp: new Date(row.timestamp * 1000),
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
      volume: row.volume,
      adjustedClose: row.adjusted_close
    };
  }

  /**
   * Check if we have sufficient data for a date range
   */
  async hasDataForRange(
    symbol: string,
    timeframe: Timeframe,
    startDate: Date,
    endDate: Date
  ): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM market_data
      WHERE symbol = ? AND timeframe = ?
      AND timestamp >= ? AND timestamp <= ?
    `);

    const result = stmt.get(
      symbol,
      timeframe,
      Math.floor(startDate.getTime() / 1000),
      Math.floor(endDate.getTime() / 1000)
    ) as { count: number };

    // Calculate expected data points based on timeframe
    const expectedPoints = this.calculateExpectedDataPoints(timeframe, startDate, endDate);
    const threshold = expectedPoints * 0.8; // Allow 20% missing data

    return result.count >= threshold;
  }

  /**
   * Get data ranges for a symbol across all timeframes
   */
  async getDataRanges(symbol: string): Promise<DataRange[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM data_ranges 
      WHERE symbol = ?
    `);
    
    const rows = stmt.all(symbol) as any[];
    return rows.map(row => ({
      symbol: row.symbol,
      timeframe: row.timeframe,
      startDate: new Date(row.start_timestamp * 1000),
      endDate: new Date(row.end_timestamp * 1000),
      recordCount: row.record_count,
      lastUpdated: new Date(row.last_updated * 1000)
    }));
  }

  /**
   * Get market data for a symbol and timeframe
   */
  async getMarketData(
    symbol: string,
    startDate: Date,
    endDate: Date,
    timeframe: Timeframe
  ): Promise<MarketData[]> {
    return this.getHistoricalData(symbol, timeframe, startDate, endDate);
  }

  /**
   * Get data gaps that need to be filled
   */
  async getDataGaps(symbol: string, timeframe: Timeframe): Promise<{ start: Date; end: Date }[]> {
    const range = await this.getDataRange(symbol, timeframe);
    if (!range) return [{ start: this.getDefaultStartDate(timeframe), end: new Date() }];

    const gaps: { start: Date; end: Date }[] = [];
    
    // Check if we need to backfill (go further into the past)
    const defaultStart = this.getDefaultStartDate(timeframe);
    if (range.startDate > defaultStart) {
      gaps.push({ start: defaultStart, end: range.startDate });
    }

    // Check if we need to update (fill recent data)
    const now = new Date();
    const daysSinceUpdate = (now.getTime() - range.endDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceUpdate > 1) { // Update if older than 1 day
      gaps.push({ start: range.endDate, end: now });
    }

    return gaps;
  }

  /**
   * Get storage statistics
   */
  getStorageStats(): {
    totalRecords: number;
    uniqueSymbols: number;
    timeframes: { timeframe: Timeframe; count: number }[];
    dbSize: number;
    oldestRecord: Date | null;
    newestRecord: Date | null;
  } {
    const totalRecords = this.db.prepare('SELECT COUNT(*) as count FROM market_data').get() as { count: number };
    
    const uniqueSymbols = this.db.prepare('SELECT COUNT(DISTINCT symbol) as count FROM market_data').get() as { count: number };
    
    const timeframes = this.db.prepare(`
      SELECT timeframe, COUNT(*) as count 
      FROM market_data 
      GROUP BY timeframe
    `).all() as { timeframe: Timeframe; count: number }[];

    const oldestRecord = this.db.prepare('SELECT MIN(timestamp) as ts FROM market_data').get() as { ts: number | null };
    const newestRecord = this.db.prepare('SELECT MAX(timestamp) as ts FROM market_data').get() as { ts: number | null };

    let dbSize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      dbSize = stats.size;
    } catch (error) {
      console.warn('Could not get database file size:', error);
    }

    return {
      totalRecords: totalRecords.count,
      uniqueSymbols: uniqueSymbols.count,
      timeframes,
      dbSize,
      oldestRecord: oldestRecord.ts ? new Date(oldestRecord.ts * 1000) : null,
      newestRecord: newestRecord.ts ? new Date(newestRecord.ts * 1000) : null
    };
  }

  /**
   * Clear all data (for testing/reset)
   */
  clearAllData(): void {
    this.db.exec('DELETE FROM market_data');
    this.db.exec('DELETE FROM data_ranges');
    console.log('🗑️ All historical data cleared');
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  // Private helper methods

  /**
   * Filter and deduplicate market data to prevent duplicate dates and prefer regular market hours
   */
  private filterAndDeduplicateData(data: MarketData[]): MarketData[] {
    if (!data.length) return data;

    // Group by date (YYYY-MM-DD) for the same symbol
    const dateGroups = new Map<string, MarketData[]>();
    
    for (const item of data) {
      const dateKey = item.timestamp.toISOString().split('T')[0]; // Get YYYY-MM-DD
      const groupKey = `${item.symbol}-${dateKey}`;
      
      if (!dateGroups.has(groupKey)) {
        dateGroups.set(groupKey, []);
      }
      dateGroups.get(groupKey)!.push(item);
    }

    const filteredData: MarketData[] = [];

    // For each date group, prefer regular market hours data
    for (const [groupKey, items] of dateGroups) {
      if (items.length === 1) {
        // No duplicates, keep the single item
        filteredData.push(items[0]);
      } else {
        // Multiple entries for same date - prefer regular market hours data
        // Filter out abnormal data first, then select best entry
        const validItems = items.filter(item => this.isValidMarketData(item));
        const itemsToConsider = validItems.length > 0 ? validItems : items; // Fallback to all items if none pass validation

        const preferred = itemsToConsider.reduce((best, current) => {
          // First, prefer entries that pass data validation
          const bestIsValid = this.isValidMarketData(best);
          const currentIsValid = this.isValidMarketData(current);

          if (currentIsValid && !bestIsValid) {
            return current;
          }
          if (bestIsValid && !currentIsValid) {
            return best;
          }

          // Both valid or both invalid - use other criteria
          // Prefer regular market hours (typically 13:30 vs 04:00)
          const bestHour = best.timestamp.getUTCHours();
          const currentHour = current.timestamp.getUTCHours();

          // Prefer entries between 13:00-21:00 UTC (market hours)
          const bestIsMarketHours = bestHour >= 13 && bestHour <= 21;
          const currentIsMarketHours = currentHour >= 13 && currentHour <= 21;

          if (currentIsMarketHours && !bestIsMarketHours) {
            return current;
          }
          if (bestIsMarketHours && !currentIsMarketHours) {
            return best;
          }

          // If both in market hours or both outside, prefer later timestamp
          if (current.timestamp.getTime() > best.timestamp.getTime()) {
            return current;
          }

          return best;
        });
        
        filteredData.push(preferred);
        
        // Log when we filter out duplicates
        console.log(`🔍 Filtered duplicate data for ${groupKey}: kept ${preferred.timestamp.toISOString()}, removed ${items.length - 1} duplicate(s)`);
      }
    }

    return filteredData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Validate market data to detect abnormal entries
   */
  private isValidMarketData(item: MarketData): boolean {
    // Basic price validation
    if (item.open <= 0 || item.high <= 0 || item.low <= 0 || item.close <= 0) {
      return false;
    }

    // OHLC relationship validation
    if (item.high < item.low || item.open < item.low || item.close < item.low ||
        item.open > item.high || item.close > item.high) {
      return false;
    }

    // Check for abnormal volume (likely aggregated/monthly data)
    // For QQQ, normal daily volume is 20M-150M, suspicious >200M, clearly abnormal >300M
    if (item.volume > 200_000_000) {
      console.log(`⚠️ Rejecting abnormal volume: ${item.symbol} ${item.timestamp.toISOString()} volume=${item.volume.toLocaleString()}`);
      return false;
    }

    // Check for abnormal daily price ranges
    const dailyRange = (item.high - item.low) / item.low;
    if (dailyRange > 0.15) { // More than 15% daily range is suspicious
      console.log(`⚠️ Rejecting abnormal price range: ${item.symbol} ${item.timestamp.toISOString()} range=${(dailyRange * 100).toFixed(1)}%`);
      return false;
    }

    // Check for suspicious 4:00 AM entries (often aggregated/weekly data)
    const hour = item.timestamp.getUTCHours();
    const day = item.timestamp.getUTCDate();

    // Reject 4:00 AM entries on 1st of month (definitely aggregated data)
    if (hour === 4 && day === 1) {
      console.log(`⚠️ Rejecting suspicious 1st-of-month 4AM entry: ${item.symbol} ${item.timestamp.toISOString()}`);
      return false;
    }

    // Reject early morning entries (4:00-6:00 AM) with high volume (likely aggregated data)
    if ((hour >= 4 && hour <= 6) && item.volume > 100_000_000) {
      console.log(`⚠️ Rejecting suspicious early morning high-volume entry: ${item.symbol} ${item.timestamp.toISOString()} volume=${item.volume.toLocaleString()}`);
      return false;
    }

    return true;
  }

  private async updateDataRange(data: MarketData[]): Promise<void> {
    if (!data.length) return;

    const symbol = data[0].symbol;
    const timeframe = this.getTimeframeFromData(data[0]);
    
    const timestamps = data.map(d => Math.floor(d.timestamp.getTime() / 1000));
    const startTimestamp = Math.min(...timestamps);
    const endTimestamp = Math.max(...timestamps);

    const upsert = this.db.prepare(`
      INSERT OR REPLACE INTO data_ranges 
      (symbol, timeframe, start_timestamp, end_timestamp, record_count, last_updated)
      VALUES (?, ?, 
        COALESCE((SELECT MIN(start_timestamp, ?) FROM data_ranges WHERE symbol = ? AND timeframe = ?), ?),
        COALESCE((SELECT MAX(end_timestamp, ?) FROM data_ranges WHERE symbol = ? AND timeframe = ?), ?),
        (SELECT COUNT(*) FROM market_data WHERE symbol = ? AND timeframe = ?),
        strftime('%s', 'now')
      )
    `);

    upsert.run(
      symbol, timeframe, startTimestamp, symbol, timeframe, startTimestamp,
      endTimestamp, symbol, timeframe, endTimestamp,
      symbol, timeframe
    );
  }

  private async getDataRange(symbol: string, timeframe: Timeframe): Promise<DataRange | null> {
    const stmt = this.db.prepare(`
      SELECT * FROM data_ranges 
      WHERE symbol = ? AND timeframe = ?
    `);
    
    const row = stmt.get(symbol, timeframe) as any;
    if (!row) return null;

    return {
      symbol: row.symbol,
      timeframe: row.timeframe,
      startDate: new Date(row.start_timestamp * 1000),
      endDate: new Date(row.end_timestamp * 1000),
      recordCount: row.record_count,
      lastUpdated: new Date(row.last_updated * 1000)
    };
  }

  private getTimeframeFromData(data: MarketData): Timeframe {
    // This would ideally be passed in, but we can detect from spacing
    // For now, default to '1D' - this should be improved
    return '1D';
  }

  private calculateExpectedDataPoints(timeframe: Timeframe, start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    switch (timeframe) {
      case '1H':
        return Math.floor(diffDays * 24 * 5/7); // 5 trading days per week
      case '4H':
        return Math.floor(diffDays * 6 * 5/7); // 6 periods per day, 5 days per week
      case '1D':
        return Math.floor(diffDays * 5/7); // 5 trading days per week
      case '1W':
        return Math.floor(diffDays / 7);
      case '1M':
        return Math.floor(diffDays / 30);
      default:
        return Math.floor(diffDays);
    }
  }

  private getDefaultStartDate(timeframe: Timeframe): Date {
    const now = new Date();
    const start = new Date(now);

    switch (timeframe) {
      case '1H':
        start.setMonth(now.getMonth() - 3); // 3 months of hourly data
        break;
      case '4H':
        start.setMonth(now.getMonth() - 6); // 6 months of 4H data
        break;
      case '1D':
        start.setFullYear(now.getFullYear() - 2); // 2 years of daily data
        break;
      case '1W':
        start.setFullYear(now.getFullYear() - 5); // 5 years of weekly data
        break;
      case '1M':
        start.setFullYear(now.getFullYear() - 10); // 10 years of monthly data
        break;
    }

    return start;
  }
}