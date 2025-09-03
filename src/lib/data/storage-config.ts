import path from 'path';
import os from 'os';

export class StorageConfig {
  /**
   * Get the default storage path for the database
   */
  static getDefaultPath(): string {
    // Default: project/data/stock-data.db
    return path.join(process.cwd(), 'data', 'stock-data.db');
  }

  /**
   * Get user's home directory storage path
   * Useful for keeping data separate from project
   */
  static getHomePath(): string {
    // User home: ~/Documents/StockAnalysis/stock-data.db
    return path.join(os.homedir(), 'Documents', 'StockAnalysis', 'stock-data.db');
  }

  /**
   * Get temporary directory storage path  
   * Useful for testing or temporary data
   */
  static getTempPath(): string {
    // Temp: /tmp/stock-analysis/stock-data.db (or Windows equivalent)
    return path.join(os.tmpdir(), 'stock-analysis', 'stock-data.db');
  }

  /**
   * Get custom path with environment variable override
   */
  static getConfiguredPath(): string {
    // Allow environment variable override: STOCK_DATA_PATH
    const envPath = process.env.STOCK_DATA_PATH;
    
    if (envPath) {
      return path.isAbsolute(envPath) ? envPath : path.join(process.cwd(), envPath);
    }
    
    return this.getDefaultPath();
  }
}

// Example usage in .env.local:
// STOCK_DATA_PATH=/Users/khaiyuenlooi/MyStockData/database.db
// STOCK_DATA_PATH=./custom-data/stocks.db