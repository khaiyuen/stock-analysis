import Database from 'better-sqlite3';
import { MarketData, Timeframe } from '@/types';
import path from 'path';

export interface DatabaseConfig {
  dbPath: string;
  tableName: string;
}

export class LocalDatabaseService {
  private config: DatabaseConfig;
  
  constructor(config?: Partial<DatabaseConfig>) {
    this.config = {
      dbPath: config?.dbPath || path.resolve(process.cwd(), 'data/stock-data.db'),
      tableName: config?.tableName || 'market_data'
    };
  }

  /**
   * Get market data from local database
   */
  async getMarketData(
    symbol: string,
    timeframe: Timeframe,
    limit: number = 1000
  ): Promise<MarketData[]> {
    try {
      const db = new Database(this.config.dbPath, { readonly: true });
      
      // Query based on timeframe
      const query = this.buildQuery();
      
      console.log(`📊 Querying database for ${symbol} ${timeframe}, limit ${limit}`);

      const stmt = db.prepare(query);
      const rows = stmt.all(symbol, timeframe, limit);
      db.close();

      if (!rows || rows.length === 0) {
        console.warn(`No data found for ${symbol} ${timeframe}`);
        return [];
      }

      // Convert database rows to MarketData format
      const marketData = rows.map(row => this.convertRowToMarketData(row));
      
      console.log(`✅ Loaded ${marketData.length} records for ${symbol} ${timeframe}`);
      console.log(`   Date range: ${marketData[marketData.length - 1]?.timestamp} to ${marketData[0]?.timestamp}`);
      console.log(`   Price range: $${Math.min(...marketData.map(d => d.low)).toFixed(2)} - $${Math.max(...marketData.map(d => d.high)).toFixed(2)}`);
      
      return marketData;
    } catch (error) {
      console.error('Database error:', error);
      throw new Error(`Database operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build SQL query based on timeframe with deduplication
   */
  private buildQuery(): string {
    // Deduplicated query - get latest entry per trading day to avoid duplicates
    // This handles cases where multiple entries exist for the same trading day
    const query = `
      SELECT
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        adjusted_close
      FROM (
        SELECT
          timestamp,
          open,
          high,
          low,
          close,
          volume,
          adjusted_close,
          ROW_NUMBER() OVER (
            PARTITION BY date(timestamp, 'unixepoch')
            ORDER BY timestamp DESC
          ) as rn
        FROM ${this.config.tableName}
        WHERE symbol = ? AND timeframe = ?
      ) ranked
      WHERE rn = 1
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    return query;
  }

  /**
   * Convert database row to MarketData format
   */
  private convertRowToMarketData(row: any): MarketData {
    return {
      timestamp: new Date(row.timestamp * 1000), // Convert Unix timestamp to Date
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume) || 0,
      adjustedClose: parseFloat(row.adjusted_close || row.close)
    };
  }

  /**
   * Get available symbols in the database
   */
  async getAvailableSymbols(): Promise<string[]> {
    try {
      const db = new Database(this.config.dbPath, { readonly: true });
      const query = `SELECT DISTINCT symbol FROM ${this.config.tableName} ORDER BY symbol`;
      
      const rows = db.prepare(query).all();
      db.close();
      
      const symbols = rows.map((row: any) => row.symbol);
      return symbols;
    } catch (error) {
      throw new Error(`Failed to get symbols: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get data availability info for a symbol
   */
  async getDataInfo(symbol: string): Promise<{
    symbol: string;
    totalRecords: number;
    timeframes: Timeframe[];
    dateRange: {
      earliest: Date;
      latest: Date;
    };
    recordsByTimeframe: Record<Timeframe, number>;
  }> {
    try {
      const db = new Database(this.config.dbPath, { readonly: true });
      
      const query = `
        SELECT 
          timeframe,
          COUNT(*) as count,
          MIN(timestamp) as earliest,
          MAX(timestamp) as latest
        FROM ${this.config.tableName}
        WHERE symbol = ?
        GROUP BY timeframe
        ORDER BY timeframe
      `;

      const rows = db.prepare(query).all(symbol);
      db.close();

      if (!rows || rows.length === 0) {
        return {
          symbol,
          totalRecords: 0,
          timeframes: [],
          dateRange: {
            earliest: new Date(),
            latest: new Date()
          },
          recordsByTimeframe: {} as Record<Timeframe, number>
        };
      }

      const totalRecords = rows.reduce((sum: number, row: any) => sum + row.count, 0);
      const timeframes = rows.map((row: any) => row.timeframe as Timeframe);
      const recordsByTimeframe = rows.reduce((acc: any, row: any) => {
        acc[row.timeframe as Timeframe] = row.count;
        return acc;
      }, {} as Record<Timeframe, number>);

      const allEarliest = Math.min(...rows.map((row: any) => row.earliest));
      const allLatest = Math.max(...rows.map((row: any) => row.latest));

      return {
        symbol,
        totalRecords,
        timeframes,
        dateRange: {
          earliest: new Date(allEarliest * 1000),
          latest: new Date(allLatest * 1000)
        },
        recordsByTimeframe
      };
    } catch (error) {
      throw new Error(`Failed to get data info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if database exists and is accessible
   */
  async healthCheck(): Promise<{
    isHealthy: boolean;
    error?: string;
    stats?: {
      totalRecords: number;
      symbols: number;
      timeframes: string[];
    };
  }> {
    try {
      const db = new Database(this.config.dbPath, { readonly: true });
      
      // Test query to check database structure and data
      const query = `
        SELECT 
          COUNT(*) as total_records,
          COUNT(DISTINCT symbol) as symbol_count,
          GROUP_CONCAT(DISTINCT timeframe) as timeframes
        FROM ${this.config.tableName}
      `;

      const row = db.prepare(query).get() as any;
      db.close();

      return {
        isHealthy: true,
        stats: {
          totalRecords: row.total_records,
          symbols: row.symbol_count,
          timeframes: row.timeframes ? row.timeframes.split(',') : []
        }
      };
    } catch (error) {
      return {
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}