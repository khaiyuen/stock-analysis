# Technical Indicators Reference

## Overview
Comprehensive guide to all technical, sentiment, seasonal, and macroeconomic indicators implemented in the Stock Analysis Platform.

## Technical Analysis Indicators

### Moving Averages

#### Simple Moving Average (SMA)
**Formula**: `SMA = (P1 + P2 + ... + Pn) / n`

**Implementation**:
```typescript
function calculateSMA(prices: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = period - 1; i < prices.length; i++) {
    const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
    sma.push(sum / period);
  }
  return sma;
}
```

**Signal Logic**:
- **Buy**: Price crosses above SMA
- **Sell**: Price crosses below SMA
- **Strength**: Multiple timeframe confirmation

#### Exponential Moving Average (EMA)
**Formula**: `EMA = (Price × α) + (Previous EMA × (1 - α))`
Where α = 2 / (period + 1)

**Implementation**:
```typescript
function calculateEMA(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);
  ema[0] = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
  }
  return ema;
}
```

**Signal Logic**:
- **Buy**: Fast EMA crosses above Slow EMA (Golden Cross)
- **Sell**: Fast EMA crosses below Slow EMA (Death Cross)
- **Common Pairs**: 12/26, 20/50, 50/200

#### Bollinger Bands
**Formula**: 
- Middle Band: 20-period SMA
- Upper Band: Middle + (2 × Standard Deviation)
- Lower Band: Middle - (2 × Standard Deviation)

**Signal Logic**:
- **Buy**: Price touches lower band and bounces
- **Sell**: Price touches upper band and rejects
- **Breakout**: Price closes outside bands with volume

### Momentum Indicators

#### Relative Strength Index (RSI)
**Formula**: `RSI = 100 - (100 / (1 + RS))`
Where RS = Average Gain / Average Loss over n periods

**Implementation**:
```typescript
function calculateRSI(prices: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? -change : 0);
  }
  
  // Calculate RSI
  for (let i = period - 1; i < gains.length; i++) {
    const avgGain = gains.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
    const avgLoss = losses.slice(i - period + 1, i + 1).reduce((a, b) => a + b) / period;
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  return rsi;
}
```

**Signal Logic**:
- **Oversold**: RSI < 30 (potential buy)
- **Overbought**: RSI > 70 (potential sell)
- **Divergence**: Price vs RSI direction mismatch

#### MACD (Moving Average Convergence Divergence)
**Components**:
- MACD Line: 12-EMA - 26-EMA
- Signal Line: 9-EMA of MACD Line
- Histogram: MACD Line - Signal Line

**Signal Logic**:
- **Buy**: MACD crosses above Signal Line
- **Sell**: MACD crosses below Signal Line
- **Momentum**: Histogram increasing/decreasing

### Volume Indicators

#### Volume-Weighted Average Price (VWAP)
**Formula**: `VWAP = Σ(Price × Volume) / Σ(Volume)`

**Signal Logic**:
- **Buy**: Price above VWAP (bullish)
- **Sell**: Price below VWAP (bearish)
- **Institutional**: Large volume at VWAP level

#### On-Balance Volume (OBV)
**Formula**: 
- If Close > Previous Close: OBV = Previous OBV + Volume
- If Close < Previous Close: OBV = Previous OBV - Volume
- If Close = Previous Close: OBV = Previous OBV

**Signal Logic**:
- **Buy**: OBV trending up while price consolidates
- **Sell**: OBV trending down while price consolidates
- **Divergence**: OBV vs Price direction mismatch

## Market Breadth Indicators

### Advance/Decline Line
**Formula**: `A/D Line = Previous A/D + (Advancing Issues - Declining Issues)`

**Signal Logic**:
- **Bullish**: A/D Line making new highs with market
- **Bearish**: A/D Line diverging from market highs
- **Confirmation**: Strong breadth confirms trend

### McClellan Oscillator
**Formula**: `McClellan = 19-day EMA - 39-day EMA of (Advances - Declines)`

**Signal Logic**:
- **Buy**: Oscillator > +50 (strong breadth)
- **Sell**: Oscillator < -50 (weak breadth)
- **Extremes**: > +100 or < -100 (potential reversal)

## Sentiment Indicators

### VIX (Fear Index)
**Interpretation**:
- **Low Fear**: VIX < 20 (complacent market)
- **Moderate Fear**: VIX 20-30 (normal volatility)
- **High Fear**: VIX > 30 (potential opportunity)
- **Extreme Fear**: VIX > 40 (major bottom signal)

### Put/Call Ratio
**Formula**: `Put/Call Ratio = Put Volume / Call Volume`

**Signal Logic**:
- **Bullish**: Ratio > 1.0 (excessive pessimism)
- **Bearish**: Ratio < 0.7 (excessive optimism)
- **Contrarian**: Extreme readings signal reversals

## Seasonal Patterns

### Presidential Cycle
**Pattern**: 
- Year 1: Weak (post-election adjustment)
- Year 2: Weak (midterm uncertainty)
- Year 3: Strong (policy implementation)
- Year 4: Strong (election year stimulus)

### Monthly Seasonality
**Strong Months**: November, December, January, April
**Weak Months**: May, June, August, September
**Special**: "Sell in May and Go Away"

### Day-of-Week Effect
**Pattern**:
- Monday: Often weak (weekend news)
- Tuesday-Thursday: Typically strong
- Friday: Mixed (position squaring)

## Macroeconomic Indicators

### Federal Funds Rate
**Signal Logic**:
- **Rising Rates**: Potential headwind for stocks
- **Falling Rates**: Potential tailwind for stocks
- **Rate of Change**: More important than absolute level

### Yield Curve (2Y/10Y Spread)
**Signal Logic**:
- **Normal**: 10Y > 2Y (healthy economy)
- **Flat**: Spread < 50bps (slowing growth)
- **Inverted**: 2Y > 10Y (recession signal)

### Inflation (CPI/PCE)
**Signal Logic**:
- **Low Inflation**: < 2% (Fed accommodation)
- **Target Inflation**: ~2% (Goldilocks scenario)
- **High Inflation**: > 4% (Fed tightening risk)

### Economic Growth (GDP)
**Signal Logic**:
- **Strong Growth**: > 3% (bullish for stocks)
- **Moderate Growth**: 1-3% (steady market)
- **Recession**: < 0% (bearish for stocks)

## Combined Signal Framework

### Signal Strength Levels
1. **Strong Buy**: 5+ bullish indicators align
2. **Buy**: 3-4 bullish indicators
3. **Hold**: Mixed or unclear signals
4. **Sell**: 3-4 bearish indicators
5. **Strong Sell**: 5+ bearish indicators align

### Indicator Weights
- **Technical**: 40% (price action is king)
- **Sentiment**: 25% (contrarian value)
- **Seasonal**: 15% (statistical edge)
- **Macro**: 20% (fundamental backdrop)

### Confirmation Rules
- **Trend Confirmation**: Multiple timeframes align
- **Volume Confirmation**: Strong volume supports moves
- **Breadth Confirmation**: Market participation is broad
- **Divergence Warning**: Conflicting signals require caution

## Implementation Notes

### Data Requirements
- **Frequency**: Daily data minimum, intraday preferred
- **History**: 2+ years for reliable calculations
- **Quality**: Clean data with dividend adjustments
- **Timeliness**: Real-time or near real-time updates

### Performance Optimization
- **Caching**: Store calculated indicators
- **Incremental**: Update only new data points
- **Parallel**: Calculate independent indicators simultaneously
- **Memory**: Efficient data structures for large datasets

### Validation
- **Cross-Reference**: Compare with known platforms
- **Historical**: Backtest signal accuracy
- **Edge Cases**: Handle missing data, splits, etc.
- **Performance**: Monitor calculation speed