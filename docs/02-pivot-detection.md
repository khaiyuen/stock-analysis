# Pivot Point Detection

**Mathematical Identification of Critical Price Turning Points**

Pivot point detection is the foundation of trend cloud analysis, identifying significant price reversals that form the basis for trendline construction.

## 🎯 What are Pivot Points?

**Pivot points** are local extrema in price data where the trend changes direction:

- **Swing Highs**: Local maximum points (resistance levels)
- **Swing Lows**: Local minimum points (support levels)
- **Turning Points**: Where price momentum shifts

These points represent critical moments where supply and demand dynamics shifted, making them valuable for predicting future price behavior.

## 🔍 Detection Algorithm

### Core Logic

The system uses a **symmetrical window approach** to identify pivots:

```python
def detect_pivots(prices, lookback=2):
    pivots = []
    for i in range(lookback, len(prices) - lookback):
        window_before = prices[i-lookback:i]
        window_after = prices[i+1:i+lookback+1]
        current_price = prices[i]
        
        # Swing High: Current price is maximum in window
        if (current_price > max(window_before) and 
            current_price > max(window_after)):
            pivots.append({
                'type': 'high',
                'index': i,
                'price': current_price,
                'strength': calculate_strength(window_before, window_after, current_price)
            })
        
        # Swing Low: Current price is minimum in window  
        elif (current_price < min(window_before) and 
              current_price < min(window_after)):
            pivots.append({
                'type': 'low',
                'index': i, 
                'price': current_price,
                'strength': calculate_strength(window_before, window_after, current_price)
            })
    
    return pivots
```

### Parameters

- **Lookback window**: 2 bars (Williams Fractal method for high sensitivity)
- **Symmetrical**: Same lookback before and after candidate point  
- **Strength calculation**: Based on price distance from neighboring points

## 📊 Strength Calculation

Pivot strength measures how significant a turning point is:

### Distance-Based Strength

```python
def calculate_strength(window_before, window_after, pivot_price):
    # For swing highs
    if pivot_type == 'high':
        before_max = max(window_before)
        after_max = max(window_after)
        strength = (pivot_price - max(before_max, after_max)) / pivot_price
    
    # For swing lows  
    else:
        before_min = min(window_before)
        after_min = min(window_after) 
        strength = (min(before_min, after_min) - pivot_price) / pivot_price
    
    return abs(strength) * 100  # Convert to percentage
```

### Strength Categories

- **Strong Pivots** (>5%): Major reversals, high reliability
- **Medium Pivots** (2-5%): Significant turning points
- **Weak Pivots** (<2%): Minor fluctuations, lower confidence

## 🎯 Quality Filtering

Not all mathematical pivots are useful for trend analysis:

### Volume Confirmation
```python
if volume_at_pivot > average_volume * 1.5:
    pivot['volume_confirmed'] = True
    pivot['strength'] *= 1.2  # Boost strength for volume confirmation
```

### Time-Based Filtering
```python
# Minimum time between pivots (prevents noise)
MIN_PIVOT_SEPARATION = 3  # bars

def filter_close_pivots(pivots):
    filtered = []
    for pivot in pivots:
        if not filtered or (pivot['index'] - filtered[-1]['index']) >= MIN_PIVOT_SEPARATION:
            filtered.append(pivot)
    return filtered
```

### Strength Thresholding
```python
def filter_weak_pivots(pivots, min_strength=1.5):
    return [p for p in pivots if p['strength'] >= min_strength]
```

## 📈 Pattern Recognition

The system recognizes common pivot patterns:

### Double Tops/Bottoms
```python
def detect_double_patterns(pivots):
    for i in range(len(pivots)-1):
        current = pivots[i]
        next_pivot = pivots[i+1]
        
        if (current['type'] == next_pivot['type'] and 
            abs(current['price'] - next_pivot['price']) < current['price'] * 0.02):
            return {
                'pattern': f"double_{current['type']}",
                'strength': (current['strength'] + next_pivot['strength']) / 2,
                'pivots': [current, next_pivot]
            }
```

### Higher Highs/Lower Lows
```python
def analyze_trend_structure(pivots):
    highs = [p for p in pivots if p['type'] == 'high']
    lows = [p for p in pivots if p['type'] == 'low']
    
    # Uptrend: Higher highs and higher lows
    hh = all(highs[i]['price'] > highs[i-1]['price'] for i in range(1, len(highs)))
    hl = all(lows[i]['price'] > lows[i-1]['price'] for i in range(1, len(lows)))
    
    if hh and hl:
        return 'uptrend'
    elif not hh and not hl:
        return 'downtrend'
    else:
        return 'sideways'
```

## ⚡ Performance Optimizations

### Vectorized Detection

```python
import numpy as np
from scipy.signal import argrelextrema

def detect_pivots_vectorized(prices, order=5):
    # Find local maxima (swing highs)
    high_indices = argrelextrema(prices, np.greater, order=order)[0]
    
    # Find local minima (swing lows) 
    low_indices = argrelextrema(prices, np.less, order=order)[0]
    
    pivots = []
    
    # Process highs
    for idx in high_indices:
        pivots.append({
            'type': 'high',
            'index': idx,
            'price': prices[idx],
            'strength': calculate_strength_vectorized(prices, idx, 'high')
        })
    
    # Process lows
    for idx in low_indices:
        pivots.append({
            'type': 'low', 
            'index': idx,
            'price': prices[idx],
            'strength': calculate_strength_vectorized(prices, idx, 'low')
        })
    
    return sorted(pivots, key=lambda x: x['index'])
```

### Memory Efficiency

```python
def detect_pivots_streaming(price_generator, lookback=5):
    """Memory-efficient pivot detection for large datasets"""
    buffer = collections.deque(maxlen=2*lookback+1)
    pivots = []
    
    for price in price_generator:
        buffer.append(price)
        
        if len(buffer) == 2*lookback+1:
            center_idx = lookback
            if is_pivot(list(buffer), center_idx, lookback):
                pivots.append(create_pivot(buffer[center_idx], len(pivots)))
                
    return pivots
```

## 📊 Validation and Quality Metrics

### Statistical Validation

```python
def validate_pivot_quality(pivots, prices):
    metrics = {
        'total_pivots': len(pivots),
        'pivot_density': len(pivots) / len(prices),  # Pivots per bar
        'avg_strength': np.mean([p['strength'] for p in pivots]),
        'strength_std': np.std([p['strength'] for p in pivots])
    }
    
    # Quality thresholds
    if metrics['pivot_density'] > 0.15:  # Too many pivots = noise
        metrics['quality'] = 'noisy'
    elif metrics['pivot_density'] < 0.05:  # Too few pivots = missing signals
        metrics['quality'] = 'sparse' 
    else:
        metrics['quality'] = 'good'
    
    return metrics
```

### Backtesting Validation

```python
def validate_pivot_accuracy(pivots, future_prices, horizon=10):
    """Test how well pivots predict future reversals"""
    accuracy_scores = []
    
    for pivot in pivots:
        future_slice = future_prices[pivot['index']:pivot['index']+horizon]
        if len(future_slice) < horizon:
            continue
            
        if pivot['type'] == 'low':
            # Did price go up after the low?
            accuracy = (max(future_slice) > pivot['price'])
        else:
            # Did price go down after the high?
            accuracy = (min(future_slice) < pivot['price'])
            
        accuracy_scores.append(accuracy)
    
    return np.mean(accuracy_scores) if accuracy_scores else 0
```

## 🎯 Real-World Example

For QQQ analysis with typical parameters:

### Input Data
```
Prices: [510.25, 512.50, 515.75, 509.30, 507.85, 511.20, ...]
Lookback: 5 bars
Minimum strength: 1.5%
```

### Detected Pivots
```json
[
  {
    "type": "high", 
    "index": 125,
    "price": 515.75,
    "strength": 3.2,
    "date": "2024-09-03",
    "volume_confirmed": true
  },
  {
    "type": "low",
    "index": 132, 
    "price": 507.85,
    "strength": 2.8,
    "date": "2024-09-04", 
    "volume_confirmed": false
  }
]
```

### Quality Metrics
```json
{
  "total_pivots": 103,
  "pivot_density": 0.12,  
  "avg_strength": 2.7,
  "quality": "good",
  "accuracy_10day": 0.73
}
```

## 🔧 Configuration

### Standard Parameters
```yaml
pivot_detection:
  lookback_window: 5      # Bars before/after for comparison
  min_strength: 1.5       # Minimum percentage strength
  min_separation: 3       # Minimum bars between pivots
  volume_confirmation: true # Require volume spike
  
quality_filters:
  max_density: 0.15       # Maximum pivots per bar
  min_density: 0.05       # Minimum pivots per bar
  strength_percentile: 60 # Only keep top 60% by strength
```

### Advanced Options
```yaml
pattern_recognition:
  enable_double_patterns: true
  double_tolerance: 0.02   # 2% price difference
  trend_structure: true    # Analyze HH, LL patterns
  
optimization:
  use_vectorized: true     # Faster processing
  streaming_mode: false    # For large datasets
  parallel_windows: true   # Multi-core processing
```

This pivot detection forms the critical foundation for all subsequent trend analysis, providing the key turning points that define market structure and enable predictive modeling.