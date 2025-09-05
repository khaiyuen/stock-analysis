# Trendline Generation

**Converting Pivot Points into Predictive Linear Models**

Trendline generation transforms discrete pivot points into continuous linear models that can project future support and resistance levels with mathematical precision.

## 🎯 Core Concept

A **trendline** is a linear regression model fitted through pivot points that:

- **Connects** similar pivot types (highs-to-highs, lows-to-lows)
- **Projects** the trend forward in time
- **Provides** mathematical support/resistance levels
- **Carries** statistical confidence based on fit quality

Unlike manual trendline drawing, this system generates **hundreds of potential trendlines** and selects the most statistically robust ones.

## 🔍 Mathematical Foundation

### Log-Scale Linear Regression

The system uses **logarithmic price scaling** for more accurate modeling:

```python
import numpy as np
from sklearn.linear_model import LinearRegression

def fit_trendline_log_scale(pivot_points):
    # Convert to log scale for better linear relationships
    x = np.array([p['index'] for p in pivot_points]).reshape(-1, 1)  # Time
    y_log = np.log([p['price'] for p in pivot_points])  # Log prices
    
    # Fit linear regression in log space
    model = LinearRegression().fit(x, y_log)
    
    return {
        'log_slope': model.coef_[0],
        'log_intercept': model.intercept_,
        'r_squared': model.score(x, y_log),
        'pivot_count': len(pivot_points)
    }
```

### Why Log Scale?

- **Linear growth** appears linear in log space
- **Percentage moves** are preserved across price levels  
- **Better fit** for exponential price trends
- **Scale invariant** - works for $10 or $1000 stocks

### Projection Formula

```python
def project_price(trendline, future_time_index):
    log_price = trendline['log_slope'] * future_time_index + trendline['log_intercept']
    return np.exp(log_price)  # Convert back to normal scale
```

## 🔗 Pivot Connection Strategies

### Same-Type Connections

**Primary approach**: Connect pivots of the same type

```python
def generate_same_type_trendlines(pivots):
    highs = [p for p in pivots if p['type'] == 'high']
    lows = [p for p in pivots if p['type'] == 'low']
    
    trendlines = []
    
    # Connect swing highs
    for combination in combinations(highs, 2):
        if is_valid_combination(combination):
            tl = fit_trendline_log_scale(combination)
            tl['trendline_type'] = 'resistance'
            tl['connected_points'] = combination
            trendlines.append(tl)
    
    # Connect swing lows  
    for combination in combinations(lows, 2):
        if is_valid_combination(combination):
            tl = fit_trendline_log_scale(combination)
            tl['trendline_type'] = 'support'
            tl['connected_points'] = combination
            trendlines.append(tl)
    
    return trendlines
```

### Multi-Point Connections

**Advanced approach**: Connect 3+ pivot points for stronger trends

```python
def generate_multi_point_trendlines(pivots, max_points=4):
    trendlines = []
    
    for point_count in range(3, max_points + 1):
        for combination in combinations(pivots, point_count):
            # Must be same type and reasonable time spacing
            if (all(p['type'] == combination[0]['type'] for p in combination) and
                is_reasonable_spacing(combination)):
                
                tl = fit_trendline_log_scale(combination)
                tl['strength_multiplier'] = point_count * 0.5  # More points = stronger
                trendlines.append(tl)
    
    return trendlines
```

### Channel Detection

**Pattern-based**: Create channels from parallel trendlines

```python
def detect_channels(trendlines, tolerance=0.001):
    channels = []
    
    for i, tl1 in enumerate(trendlines):
        for j, tl2 in enumerate(trendlines[i+1:], i+1):
            # Look for parallel lines with similar slopes
            slope_diff = abs(tl1['log_slope'] - tl2['log_slope'])
            
            if slope_diff < tolerance and tl1['trendline_type'] != tl2['trendline_type']:
                channel = {
                    'upper_trendline': tl1 if tl1['trendline_type'] == 'resistance' else tl2,
                    'lower_trendline': tl2 if tl1['trendline_type'] == 'resistance' else tl1,
                    'channel_width': calculate_channel_width(tl1, tl2),
                    'strength': (tl1['r_squared'] + tl2['r_squared']) / 2
                }
                channels.append(channel)
    
    return channels
```

## 📊 Quality Assessment

### Statistical Metrics

```python
def calculate_trendline_quality(trendline):
    quality_metrics = {}
    
    # R-squared: How well the line fits the points
    quality_metrics['fit_quality'] = trendline['r_squared']
    
    # Point count: More points = more reliable
    quality_metrics['point_strength'] = min(trendline['pivot_count'] / 4.0, 1.0)
    
    # Time span: Longer trends = more significant
    time_span = max([p['index'] for p in trendline['connected_points']]) - \
                min([p['index'] for p in trendline['connected_points']])
    quality_metrics['time_strength'] = min(time_span / 50.0, 1.0)  # Normalize to 50 bars
    
    # Combined quality score
    quality_metrics['overall_quality'] = (
        quality_metrics['fit_quality'] * 0.5 +
        quality_metrics['point_strength'] * 0.3 +
        quality_metrics['time_strength'] * 0.2
    )
    
    return quality_metrics
```

### Validation Filters

```python
def filter_low_quality_trendlines(trendlines, min_r_squared=0.7, min_points=2):
    filtered = []
    
    for tl in trendlines:
        # Statistical significance
        if tl['r_squared'] < min_r_squared:
            continue
            
        # Minimum pivot count
        if tl['pivot_count'] < min_points:
            continue
            
        # Reasonable slope (not too steep)
        daily_change = abs(tl['log_slope'])
        if daily_change > 0.01:  # 1% per day maximum
            continue
            
        # Time spacing validation
        if not has_reasonable_time_distribution(tl['connected_points']):
            continue
            
        filtered.append(tl)
    
    return filtered
```

## ⚡ Advanced Techniques

### Weighted Regression

**Account for pivot strength** in regression fitting:

```python
from sklearn.linear_model import LinearRegression

def fit_weighted_trendline(pivot_points):
    x = np.array([p['index'] for p in pivot_points]).reshape(-1, 1)
    y_log = np.log([p['price'] for p in pivot_points])
    weights = np.array([p['strength'] for p in pivot_points])  # Use pivot strength as weights
    
    # Weighted linear regression
    model = LinearRegression().fit(x, y_log, sample_weight=weights)
    
    return {
        'log_slope': model.coef_[0],
        'log_intercept': model.intercept_,
        'weighted_r_squared': calculate_weighted_r_squared(model, x, y_log, weights),
        'total_weight': np.sum(weights)
    }
```

### Robust Regression

**Handle outliers** using robust statistical methods:

```python
from sklearn.linear_model import HuberRegressor

def fit_robust_trendline(pivot_points):
    x = np.array([p['index'] for p in pivot_points]).reshape(-1, 1)
    y_log = np.log([p['price'] for p in pivot_points])
    
    # Huber regression is less sensitive to outliers
    model = HuberRegressor(epsilon=1.35, alpha=0.01).fit(x, y_log)
    
    return {
        'log_slope': model.coef_[0],
        'log_intercept': model.intercept_,
        'outliers_detected': len(model.outliers_) > 0,
        'robust_score': model.score(x, y_log)
    }
```

### Dynamic Trendlines

**Adapt trendlines** as new data arrives:

```python
class DynamicTrendline:
    def __init__(self, initial_pivots):
        self.pivots = initial_pivots
        self.model = self.fit_model()
        self.last_update = len(initial_pivots)
    
    def update(self, new_pivot):
        """Add new pivot and refit if necessary"""
        self.pivots.append(new_pivot)
        
        # Refit periodically or when significant new information
        if (len(self.pivots) - self.last_update > 3 or 
            self.is_significant_change(new_pivot)):
            self.model = self.fit_model()
            self.last_update = len(self.pivots)
    
    def is_significant_change(self, new_pivot):
        """Check if new pivot significantly changes the trend"""
        predicted_price = self.project_price(new_pivot['index'])
        actual_price = new_pivot['price']
        deviation = abs(predicted_price - actual_price) / actual_price
        
        return deviation > 0.05  # 5% deviation threshold
```

## 🎯 Trendline Strength Calculation

### Multi-Factor Strength Model

```python
def calculate_trendline_strength(trendline, current_price):
    strength_components = {}
    
    # 1. Statistical fit quality (0-30 points)
    fit_score = trendline['r_squared'] * 30
    strength_components['fit_quality'] = fit_score
    
    # 2. Number of connecting points (0-25 points) 
    point_score = min(trendline['pivot_count'] * 5, 25)
    strength_components['point_count'] = point_score
    
    # 3. Time span coverage (0-20 points)
    time_span = max([p['index'] for p in trendline['connected_points']]) - \
                min([p['index'] for p in trendline['connected_points']])
    time_score = min(time_span / 10, 20)  # Max 20 points for 10+ day span
    strength_components['time_span'] = time_score
    
    # 4. Recent relevance (0-15 points)
    days_since_last_pivot = current_index - max([p['index'] for p in trendline['connected_points']])
    recency_score = max(15 - days_since_last_pivot * 0.5, 0)
    strength_components['recency'] = recency_score
    
    # 5. Price proximity (0-10 points)
    current_distance = abs(current_price - trendline['current_projected_price']) / current_price
    proximity_score = max(10 - current_distance * 100, 0)  # Closer = higher score
    strength_components['proximity'] = proximity_score
    
    # Total strength (0-100 scale)
    total_strength = sum(strength_components.values())
    
    return {
        'total_strength': total_strength,
        'components': strength_components,
        'grade': assign_strength_grade(total_strength)
    }

def assign_strength_grade(strength):
    if strength >= 80: return 'A'
    elif strength >= 70: return 'B' 
    elif strength >= 60: return 'C'
    elif strength >= 50: return 'D'
    else: return 'F'
```

## 📈 Real-World Example

### Input Pivots
```json
[
  {"type": "high", "index": 100, "price": 515.25, "strength": 3.2},
  {"type": "high", "index": 125, "price": 518.75, "strength": 2.8},
  {"type": "high", "index": 150, "price": 522.10, "strength": 4.1}
]
```

### Generated Trendline
```python
# Log-scale regression results
trendline = {
    "log_slope": 0.000234,          # ~0.023% per day increase
    "log_intercept": 6.234,         # Base level
    "r_squared": 0.94,              # Excellent fit
    "trendline_type": "resistance", # Connecting highs
    "connected_points": 3,          # Three pivot connection
    "strength": 78.5,               # Grade B strength
    "projected_150_day": 525.45     # 150-day projection
}
```

### Projection Calculation
```python
# Project 10 days forward (index 160)
future_index = 160
log_price = 0.000234 * 160 + 6.234 = 6.271
projected_price = exp(6.271) = 528.92

# This becomes a resistance level at ~$529
```

## 🔧 Configuration Parameters

### Generation Settings
```yaml
trendline_generation:
  min_pivots_per_line: 2          # Minimum points to connect
  max_pivots_per_line: 5          # Maximum for computational efficiency
  max_trendlines_per_window: 30   # Quality over quantity
  
quality_filters:
  min_r_squared: 0.70             # Statistical fit requirement
  max_slope_per_day: 0.01         # 1% daily change maximum
  min_time_span: 5                # Minimum days between first/last pivot
  
projection:
  forward_days: 5                 # Days to project ahead
  max_price_ratio: 2.0           # Maximum 100% price change
  min_price_ratio: 0.5           # Minimum -50% price change
```

### Advanced Options
```yaml
advanced:
  use_weighted_regression: true   # Weight by pivot strength
  enable_robust_regression: false # Use Huber regression for outliers
  dynamic_updating: true          # Update trendlines with new data
  channel_detection: true         # Find parallel trendline pairs
  
performance:
  parallel_generation: true       # Multi-core trendline fitting
  cache_regression_results: true  # Speed up repeated calculations
  batch_size: 1000               # Process trendlines in batches
```

This trendline generation process transforms discrete pivot points into a continuous mathematical framework that can predict future price levels with quantified confidence, forming the backbone of the trend cloud analysis system.