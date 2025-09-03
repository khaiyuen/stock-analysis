# API Reference

## Overview
Complete API documentation for the Stock Analysis Platform's internal REST endpoints and WebSocket connections.

## Base URL
- **Development**: `http://localhost:3000/api`
- **Production**: `https://your-domain.com/api`

## Authentication
Currently, the API doesn't require authentication. Future versions will implement:
- API key authentication for external access
- JWT tokens for user sessions
- Rate limiting per client

## Market Data Endpoints

### Get Historical Data
```http
GET /api/market/historical
```

**Query Parameters:**
- `symbol` (required): Stock symbol (e.g., "AAPL")
- `period` (optional): Time period ("1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max")
- `interval` (optional): Data interval ("1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo")
- `startDate` (optional): Start date (ISO 8601 format)
- `endDate` (optional): End date (ISO 8601 format)

**Example Request:**
```bash
curl "http://localhost:3000/api/market/historical?symbol=AAPL&period=1y&interval=1d"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "currency": "USD",
    "exchangeName": "NMS",
    "timestamps": [1640995200, 1641081600, ...],
    "indicators": {
      "quote": [
        {
          "open": [182.63, 179.61, ...],
          "high": [182.88, 182.13, ...],
          "low": [177.71, 179.12, ...],
          "close": [177.57, 179.70, ...],
          "volume": [74919600, 80861100, ...]
        }
      ],
      "adjclose": [177.57, 179.70, ...]
    }
  },
  "metadata": {
    "lastRefreshed": "2024-01-15T16:00:00Z",
    "source": "yahoo_finance",
    "dataPoints": 252
  }
}
```

### Get Real-Time Quote
```http
GET /api/market/quote
```

**Query Parameters:**
- `symbols` (required): Comma-separated stock symbols (e.g., "AAPL,MSFT,GOOGL")

**Example Request:**
```bash
curl "http://localhost:3000/api/market/quote?symbols=AAPL,MSFT"
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "AAPL",
      "regularMarketPrice": 185.64,
      "regularMarketChange": 2.14,
      "regularMarketChangePercent": 1.17,
      "regularMarketVolume": 48394200,
      "marketCap": 2876525977600,
      "regularMarketOpen": 184.35,
      "regularMarketDayHigh": 186.40,
      "regularMarketDayLow": 183.92,
      "fiftyTwoWeekHigh": 199.62,
      "fiftyTwoWeekLow": 164.08,
      "lastUpdated": "2024-01-15T16:00:04Z"
    }
  ]
}
```

## Technical Indicators Endpoints

### Calculate Technical Indicators
```http
POST /api/indicators/calculate
```

**Request Body:**
```json
{
  "symbol": "AAPL",
  "indicators": [
    {
      "type": "sma",
      "period": 20
    },
    {
      "type": "ema",
      "period": 12
    },
    {
      "type": "rsi",
      "period": 14
    },
    {
      "type": "macd",
      "fastPeriod": 12,
      "slowPeriod": 26,
      "signalPeriod": 9
    }
  ],
  "period": "1y",
  "interval": "1d"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "timestamps": [1640995200, 1641081600, ...],
    "prices": {
      "open": [182.63, 179.61, ...],
      "high": [182.88, 182.13, ...],
      "low": [177.71, 179.12, ...],
      "close": [177.57, 179.70, ...],
      "volume": [74919600, 80861100, ...]
    },
    "indicators": {
      "sma_20": [null, null, ..., 178.45, 179.23, ...],
      "ema_12": [182.63, 180.85, ..., 177.89, 178.65, ...],
      "rsi_14": [null, null, ..., 45.67, 48.32, ...],
      "macd": {
        "macd": [null, null, ..., -1.23, -0.89, ...],
        "signal": [null, null, ..., -1.45, -1.32, ...],
        "histogram": [null, null, ..., 0.22, 0.43, ...]
      }
    }
  }
}
```

### Get Supported Indicators
```http
GET /api/indicators/list
```

**Response:**
```json
{
  "success": true,
  "data": {
    "technical": [
      {
        "type": "sma",
        "name": "Simple Moving Average",
        "parameters": ["period"],
        "description": "Average price over specified periods"
      },
      {
        "type": "ema", 
        "name": "Exponential Moving Average",
        "parameters": ["period"],
        "description": "Weighted average giving more importance to recent prices"
      },
      {
        "type": "rsi",
        "name": "Relative Strength Index",
        "parameters": ["period"],
        "description": "Momentum oscillator measuring speed and change of price movements"
      },
      {
        "type": "macd",
        "name": "MACD",
        "parameters": ["fastPeriod", "slowPeriod", "signalPeriod"],
        "description": "Trend-following momentum indicator"
      },
      {
        "type": "bollinger_bands",
        "name": "Bollinger Bands",
        "parameters": ["period", "stdDev"],
        "description": "Volatility bands around moving average"
      }
    ],
    "sentiment": [
      {
        "type": "vix",
        "name": "VIX Fear Index",
        "parameters": [],
        "description": "Market volatility and fear gauge"
      }
    ],
    "seasonal": [
      {
        "type": "presidential_cycle",
        "name": "Presidential Cycle",
        "parameters": [],
        "description": "4-year presidential election cycle effect"
      }
    ]
  }
}
```

## Signal Generation Endpoints

### Generate Trading Signals
```http
POST /api/signals/generate
```

**Request Body:**
```json
{
  "symbol": "AAPL",
  "strategy": "multi_indicator",
  "indicators": [
    {"type": "sma", "period": 20, "weight": 0.3},
    {"type": "rsi", "period": 14, "weight": 0.25},
    {"type": "macd", "weight": 0.25},
    {"type": "vix", "weight": 0.2}
  ],
  "period": "3mo"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "currentSignal": {
      "action": "BUY",
      "confidence": 0.73,
      "strength": "MODERATE",
      "expectedReturn": 0.065,
      "riskLevel": "MEDIUM",
      "timeHorizon": "1-3 months"
    },
    "signalHistory": [
      {
        "date": "2024-01-15T16:00:00Z",
        "action": "BUY",
        "confidence": 0.73,
        "price": 185.64,
        "indicators": {
          "sma_signal": "BULLISH",
          "rsi_signal": "NEUTRAL", 
          "macd_signal": "BULLISH",
          "vix_signal": "BULLISH"
        }
      }
    ],
    "reasoning": [
      "Price broke above 20-day SMA with strong volume",
      "MACD line crossed above signal line",
      "VIX below 20 indicates low fear",
      "RSI at 48 shows room for upside movement"
    ]
  }
}
```

### Get Signal History
```http
GET /api/signals/history
```

**Query Parameters:**
- `symbol` (required): Stock symbol
- `startDate` (optional): Start date for history
- `endDate` (optional): End date for history
- `limit` (optional): Maximum number of signals to return (default: 100)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "signal_123",
      "symbol": "AAPL",
      "date": "2024-01-15T16:00:00Z",
      "action": "BUY",
      "confidence": 0.73,
      "price": 185.64,
      "performance": {
        "1d": 0.012,
        "5d": 0.045,
        "20d": null
      },
      "status": "OPEN"
    }
  ]
}
```

## Economic Data Endpoints

### Get Economic Indicators
```http
GET /api/economic/indicators
```

**Query Parameters:**
- `series` (required): Comma-separated FRED series IDs (e.g., "FEDFUNDS,UNRATE,CPIAUCSL")
- `startDate` (optional): Start date (YYYY-MM-DD format)
- `endDate` (optional): End date (YYYY-MM-DD format)

**Response:**
```json
{
  "success": true,
  "data": {
    "FEDFUNDS": {
      "title": "Federal Funds Effective Rate",
      "units": "Percent",
      "frequency": "Monthly",
      "data": [
        {"date": "2024-01-01", "value": 5.33},
        {"date": "2023-12-01", "value": 5.33}
      ]
    },
    "UNRATE": {
      "title": "Unemployment Rate",
      "units": "Percent",
      "frequency": "Monthly", 
      "data": [
        {"date": "2024-01-01", "value": 3.7},
        {"date": "2023-12-01", "value": 3.7}
      ]
    }
  }
}
```

### Get Yield Curve Data
```http
GET /api/economic/yield-curve
```

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2024-01-15",
    "rates": {
      "1MO": 5.45,
      "2MO": 5.42,
      "3MO": 5.38,
      "4MO": 5.35,
      "6MO": 5.28,
      "1YR": 4.96,
      "2YR": 4.43,
      "3YR": 4.25,
      "5YR": 4.15,
      "7YR": 4.18,
      "10YR": 4.24,
      "20YR": 4.56,
      "30YR": 4.38
    },
    "spread_2y10y": -0.19,
    "interpretation": "INVERTED"
  }
}
```

## Machine Learning Endpoints

### Get ML Predictions
```http
POST /api/ml/predict
```

**Request Body:**
```json
{
  "symbol": "AAPL",
  "timeHorizon": "1d", // 1d, 5d, 20d
  "features": {
    "includeTechnical": true,
    "includeSentiment": true,
    "includeSeasonal": true,
    "includeMacro": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "AAPL",
    "prediction": {
      "direction": {
        "sell": 0.15,
        "hold": 0.25,
        "buy": 0.60
      },
      "expectedReturn": 0.034,
      "confidence": 0.78,
      "riskScore": 0.42
    },
    "featureImportance": {
      "rsi_14": 0.18,
      "macd_signal": 0.15,
      "vix": 0.12,
      "sma_20": 0.11,
      "yield_spread": 0.09,
      "volume_ratio": 0.08,
      "seasonal_month": 0.07,
      "others": 0.20
    },
    "modelInfo": {
      "modelVersion": "v1.2.3",
      "lastTrained": "2024-01-10T08:00:00Z",
      "trainingAccuracy": 0.67,
      "validationAccuracy": 0.64
    }
  }
}
```

### Get Model Performance
```http
GET /api/ml/performance
```

**Query Parameters:**
- `model` (optional): Model version (default: latest)
- `period` (optional): Performance period ("1mo", "3mo", "6mo", "1y")

**Response:**
```json
{
  "success": true,
  "data": {
    "modelVersion": "v1.2.3",
    "period": "3mo",
    "metrics": {
      "accuracy": 0.64,
      "precision": 0.67,
      "recall": 0.62,
      "f1Score": 0.64,
      "sharpeRatio": 1.34,
      "totalReturn": 0.087,
      "maxDrawdown": -0.034,
      "winRate": 0.58
    },
    "performanceHistory": [
      {"date": "2024-01-01", "cumulativeReturn": 0.087},
      {"date": "2023-12-01", "cumulativeReturn": 0.065}
    ]
  }
}
```

## Portfolio Endpoints (Future Implementation)

### Get Portfolio
```http
GET /api/portfolio
```

### Add Position
```http
POST /api/portfolio/positions
```

### Update Position
```http
PUT /api/portfolio/positions/{id}
```

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws');

ws.onopen = function() {
  // Subscribe to real-time data
  ws.send(JSON.stringify({
    action: 'subscribe',
    type: 'quotes',
    symbols: ['AAPL', 'MSFT', 'GOOGL']
  }));
};

ws.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log(data);
};
```

### Message Types

#### Subscribe to Real-Time Quotes
```json
{
  "action": "subscribe",
  "type": "quotes",
  "symbols": ["AAPL", "MSFT"]
}
```

#### Real-Time Quote Update
```json
{
  "type": "quote_update",
  "data": {
    "symbol": "AAPL",
    "price": 185.64,
    "change": 2.14,
    "changePercent": 1.17,
    "volume": 48394200,
    "timestamp": "2024-01-15T16:00:04Z"
  }
}
```

#### Subscribe to Trading Signals
```json
{
  "action": "subscribe", 
  "type": "signals",
  "symbols": ["AAPL"]
}
```

#### Signal Alert
```json
{
  "type": "signal_alert",
  "data": {
    "symbol": "AAPL",
    "action": "BUY",
    "confidence": 0.73,
    "price": 185.64,
    "timestamp": "2024-01-15T16:00:00Z"
  }
}
```

## Error Handling

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "INVALID_SYMBOL",
    "message": "The symbol 'INVALID' is not recognized",
    "details": {
      "validSymbols": ["AAPL", "MSFT", "GOOGL"]
    }
  }
}
```

### Error Codes
- `INVALID_SYMBOL`: Invalid or unrecognized stock symbol
- `MISSING_PARAMETER`: Required parameter not provided
- `INVALID_PARAMETER`: Parameter value is invalid
- `RATE_LIMIT_EXCEEDED`: API rate limit exceeded
- `DATA_UNAVAILABLE`: Requested data is not available
- `INTERNAL_ERROR`: Internal server error
- `SERVICE_UNAVAILABLE`: External service unavailable

### HTTP Status Codes
- `200`: Success
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (future implementation)
- `403`: Forbidden (rate limit exceeded)
- `404`: Not Found (invalid endpoint)
- `429`: Too Many Requests
- `500`: Internal Server Error
- `502`: Bad Gateway (external service error)
- `503`: Service Unavailable

## Rate Limiting

### Current Limits (Development)
- 1000 requests per hour per IP
- 100 requests per minute per IP
- 10 concurrent WebSocket connections per IP

### Headers
Response includes rate limiting headers:
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 950
X-RateLimit-Reset: 1642281600
```

## SDK Examples

### JavaScript/TypeScript
```typescript
import { StockAnalysisClient } from '@stock-analysis/sdk';

const client = new StockAnalysisClient({
  baseURL: 'http://localhost:3000/api',
  // apiKey: 'your-api-key' // Future implementation
});

// Get historical data
const historicalData = await client.market.getHistorical('AAPL', '1y');

// Calculate indicators
const indicators = await client.indicators.calculate('AAPL', [
  { type: 'sma', period: 20 },
  { type: 'rsi', period: 14 }
]);

// Generate signals
const signals = await client.signals.generate('AAPL', {
  strategy: 'multi_indicator',
  indicators: [
    { type: 'sma', period: 20, weight: 0.4 },
    { type: 'rsi', period: 14, weight: 0.6 }
  ]
});

// Get ML predictions
const prediction = await client.ml.predict('AAPL', '1d');
```

### Python
```python
import requests

class StockAnalysisAPI:
    def __init__(self, base_url='http://localhost:3000/api'):
        self.base_url = base_url
    
    def get_historical_data(self, symbol, period='1y'):
        response = requests.get(f'{self.base_url}/market/historical', {
            'symbol': symbol,
            'period': period
        })
        return response.json()
    
    def calculate_indicators(self, symbol, indicators):
        response = requests.post(f'{self.base_url}/indicators/calculate', {
            'symbol': symbol,
            'indicators': indicators
        })
        return response.json()

# Usage
api = StockAnalysisAPI()
data = api.get_historical_data('AAPL', '1y')
indicators = api.calculate_indicators('AAPL', [
    {'type': 'sma', 'period': 20},
    {'type': 'rsi', 'period': 14}
])
```