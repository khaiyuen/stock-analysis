// Export all types from a central location
export * from './market';
export * from './indicators';
export * from './economic';
export * from './ml';
export * from './analysis';

// Common utility types
export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  metadata?: {
    timestamp: Date;
    version: string;
    requestId?: string;
  };
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Generic time series data
export interface TimeSeriesPoint<T = number> {
  timestamp: Date;
  value: T;
}

export interface TimeSeries<T = number> {
  name: string;
  data: TimeSeriesPoint<T>[];
  metadata?: {
    source: string;
    frequency: string;
    lastUpdated: Date;
  };
}

// Configuration types
export interface AppConfig {
  api: {
    baseUrl: string;
    timeout: number;
    retryAttempts: number;
  };
  dataSources: {
    yahoo: {
      enabled: boolean;
      priority: number;
    };
    alphaVantage: {
      enabled: boolean;
      apiKey?: string;
      priority: number;
    };
    fred: {
      enabled: boolean;
      apiKey?: string;
      priority: number;
    };
  };
  ui: {
    theme: 'light' | 'dark' | 'system';
    defaultChartPeriod: string;
    refreshInterval: number;
  };
  features: {
    realTimeData: boolean;
    mlPredictions: boolean;
    backtesting: boolean;
    alerts: boolean;
  };
}

// Chart data types
export interface ChartData {
  timestamps: Date[];
  datasets: Array<{
    name: string;
    data: number[];
    type: 'line' | 'bar' | 'candlestick' | 'area';
    color?: string;
    yAxis?: 'left' | 'right';
    visible?: boolean;
  }>;
}

export interface CandlestickData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// Portfolio types (future implementation)
export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  dayChange: number;
  dayChangePercent: number;
  entryDate: Date;
}

export interface Portfolio {
  id: string;
  name: string;
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  totalPnL: number;
  totalPnLPercent: number;
  positions: Position[];
  cash: number;
  lastUpdated: Date;
}

// Alert types (future implementation)
export interface Alert {
  id: string;
  symbol: string;
  type: 'PRICE' | 'INDICATOR' | 'NEWS' | 'ML_SIGNAL';
  condition: {
    field: string;
    operator: '>' | '<' | '=' | '>=' | '<=' | '!=';
    value: number;
  };
  message: string;
  status: 'ACTIVE' | 'TRIGGERED' | 'EXPIRED';
  createdAt: Date;
  triggeredAt?: Date;
  expiresAt?: Date;
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'quote_update' | 'signal_alert' | 'ml_prediction' | 'error';
  data: any;
  timestamp: Date;
}

// Error types
export type ErrorCode = 
  | 'INVALID_SYMBOL'
  | 'MISSING_PARAMETER'
  | 'INVALID_PARAMETER'
  | 'RATE_LIMIT_EXCEEDED'
  | 'DATA_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_FAILED'
  | 'PERMISSION_DENIED';

export interface SystemError extends Error {
  code: ErrorCode;
  statusCode?: number;
  details?: Record<string, any>;
  retryable?: boolean;
}

// Utility types for API endpoints
export interface RequestParams {
  [key: string]: string | number | boolean | undefined;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}