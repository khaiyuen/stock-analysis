# Technical Pattern Detection System

A comprehensive technical analysis pattern recognition system built on high-quality pivot point detection using logarithmic price analysis.

## 🚀 Quick Start

### Run the Interactive Notebook
```bash
jupyter notebook "1.4 technical_pattern_detection.ipynb"
```

### Run the Command-Line Demo
```bash
# Default QQQ analysis
python pattern_demo.py

# Custom symbol and parameters
python pattern_demo.py AAPL 365 0.6
```

### Python API Usage
```python
from scripts.pattern_detector import detect_patterns_for_symbol

# Detect patterns
patterns, summary = detect_patterns_for_symbol('QQQ', lookback_days=365, min_strength=0.6)

# Display results
print(f"Found {len(patterns)} patterns")
for pattern in patterns[:5]:
    print(f"{pattern['type']} ({pattern['direction']}) - {pattern['confidence']:.3f}")
```

## 📊 Supported Patterns

### Reversal Patterns
- **Head and Shoulders** - Classic bearish reversal pattern
- **Inverse Head and Shoulders** - Bullish reversal pattern  
- **Double Top/Bottom** - Two-peak/valley reversal patterns
- **Triple Top/Bottom** - Three-peak/valley reversal patterns

### Continuation Patterns
- **Cup and Handle** - Bullish continuation pattern
- **Ascending Triangle** - Usually bullish breakout pattern
- **Descending Triangle** - Usually bearish breakdown pattern
- **Symmetrical Triangle** - Neutral breakout pattern
- **Wedges** - Ascending (bearish) and Descending (bullish)
- **Rectangles** - Horizontal support/resistance ranges
- **Flags and Pennants** - Brief consolidation patterns

## 🔧 System Architecture

### Core Components

1. **Pivot Point Detection** (`scripts/pivot_detector.py`)
   - 6-method pivot detection system
   - Log-scale analysis for exponential price movements
   - Comprehensive pivot validation and combination

2. **Pattern Recognition Engine** (`scripts/pattern_detector.py`)
   - Advanced pattern matching algorithms
   - Confidence scoring and validation
   - Target price calculations
   - Overlap detection and filtering

3. **Interactive Analysis** (`1.4 technical_pattern_detection.ipynb`)
   - Comprehensive pattern detection workflow
   - Advanced visualization and pattern annotation
   - Statistical analysis and performance metrics

4. **Command-Line Interface** (`pattern_demo.py`)
   - Quick pattern analysis for any symbol
   - Batch processing capabilities
   - JSON export for integration

### Data Flow
```
Stock Data → Pivot Detection → Pattern Recognition → Analysis & Visualization
     ↓              ↓                    ↓                      ↓
 OHLC Prices    Swing Points      Pattern Objects      Reports & Charts
```

## 📈 Pattern Detection Features

### High-Quality Analysis
- **Log-Scale Processing** - Better handling of exponential price movements
- **Multi-Method Validation** - 6 different pivot detection algorithms
- **Confidence Scoring** - Statistical validation of pattern strength
- **Target Price Calculation** - Theoretical price objectives
- **Overlap Filtering** - Removes duplicate and conflicting patterns

### Pattern Validation Criteria
- **Geometric Accuracy** - Precise shape matching requirements
- **Volume Confirmation** - Enhanced confidence with volume analysis
- **Time Constraints** - Configurable pattern duration limits
- **Statistical Significance** - Minimum confidence thresholds

## 🎯 Configuration Options

### Pattern Detection Parameters
```python
detector = TechnicalPatternDetector(
    stock_data=data,
    high_pivots=highs,
    low_pivots=lows,
    min_strength=0.6,        # Minimum confidence threshold
    min_pattern_width=10,    # Minimum pattern duration (days)
    max_pattern_width=120    # Maximum pattern duration (days)
)
```

### Analysis Settings
```python
# Symbol and timeframe
SYMBOL = 'QQQ'
LOOKBACK_DAYS = 365

# Pattern filters
MIN_PATTERN_STRENGTH = 0.6
MAX_PATTERN_WIDTH = 120
MIN_PATTERN_WIDTH = 10
```

## 📊 Output Formats

### Pattern Object Structure
```python
pattern = {
    'type': 'Head and Shoulders',
    'direction': 'bearish',
    'confidence': 0.85,
    'start_date': datetime(2024, 1, 15),
    'end_date': datetime(2024, 2, 10),
    'pattern_width': 26,
    'pivots': {
        'left_shoulder': pivot_dict,
        'head': pivot_dict,
        'right_shoulder': pivot_dict,
        'neckline_lows': [pivot_dict, ...]
    },
    'metrics': {
        'shoulder_ratio': 0.997,
        'head_prominence': 0.045,
        'neckline_support': 2
    },
    'target_price': 385.50
}
```

### Summary Statistics
```python
summary = {
    'total_patterns': 43,
    'pattern_counts': {
        'Head and Shoulders': 9,
        'Double Top': 7,
        ...
    },
    'directions': {
        'bullish': 23,
        'bearish': 20
    },
    'avg_confidence': 0.876,
    'confidence_range': [0.612, 1.000],
    'strongest_pattern': pattern_dict
}
```

## 🚀 Advanced Features

### Pattern Strength Analysis
- **Multi-factor scoring** - Geometric accuracy, volume, duration
- **Relative ranking** - Compare patterns within same analysis
- **Historical validation** - Track pattern success rates

### Market Sentiment Analysis
- **Bullish vs Bearish ratio** - Overall market direction bias
- **Recent pattern trends** - Short-term sentiment shifts
- **High-confidence alerts** - Focus on strongest signals

### Integration Capabilities
- **JSON Export** - Easy integration with other systems
- **Database Storage** - Persistent pattern history
- **API Ready** - Structured data for trading systems

## 📋 Example Analysis Results

### QQQ Analysis (365 days, min confidence 0.7)
```
📊 Pattern Detection Summary:
   Total Patterns: 43
   Average Confidence: 1.000
   Confidence Range: 0.994 - 1.000

🎯 Pattern Type Breakdown:
   Inverse Head and Shoulders  11 patterns ( 25.6%)
   Head and Shoulders          9 patterns ( 20.9%)
   Double Top                  7 patterns ( 16.3%)
   Ascending Triangle          5 patterns ( 11.6%)
   Double Bottom               5 patterns ( 11.6%)

📈 Market Sentiment Analysis:
   Bullish Patterns:  23 ( 53.5%)
   Bearish Patterns:  20 ( 46.5%)
   Overall Sentiment: Slightly Bullish
```

## 🔄 Integration with Existing System

### Builds on 1.0.0 Pivot Detection
- Uses existing `TrendlineExtractor` class
- Leverages 6-method pivot detection system
- Maintains log-scale analysis approach
- Compatible with existing data infrastructure

### Extends Analysis Capabilities
- **Pattern Recognition** - Beyond trendline analysis
- **Market Sentiment** - Directional bias analysis
- **Trading Signals** - Entry/exit point identification
- **Risk Management** - Target prices and stop levels

## 🛠️ Customization and Extension

### Adding New Patterns
1. Implement detection method in `TechnicalPatternDetector`
2. Add confidence scoring logic
3. Include target price calculation
4. Add visualization support

### Pattern Detection Templates
```python
def _detect_custom_pattern(self) -> List[Dict]:
    """Detect custom pattern"""
    patterns = []
    
    # Pattern detection logic
    for i in range(len(self.high_pivots)):
        # Check pattern criteria
        if pattern_matches:
            confidence = self._calculate_confidence()
            
            if confidence >= self.min_strength:
                patterns.append({
                    'type': 'Custom Pattern',
                    'direction': 'bullish/bearish',
                    'confidence': confidence,
                    'start_date': start_date,
                    'end_date': end_date,
                    'pattern_width': width_days,
                    'pivots': relevant_pivots,
                    'target_price': calculated_target
                })
    
    return patterns
```

## 🚨 Usage Notes

### Best Practices
- **Multiple Timeframes** - Analyze different lookback periods
- **Confidence Thresholds** - Adjust based on risk tolerance
- **Pattern Validation** - Confirm with volume and momentum
- **Historical Context** - Consider broader market conditions

### Performance Considerations
- **Large Datasets** - May require filtering for performance
- **Real-time Analysis** - Consider incremental updates
- **Memory Usage** - Monitor with extensive pattern searches

### Limitations
- **False Signals** - No pattern detection is 100% accurate
- **Market Context** - Patterns work best in trending markets
- **Volume Confirmation** - Low volume patterns are less reliable
- **Time Sensitivity** - Pattern completion timing can vary

## 📚 Further Development

### Planned Enhancements
- **Machine Learning Integration** - Pattern success prediction
- **Real-time Monitoring** - Live pattern detection
- **Multi-asset Analysis** - Cross-instrument pattern correlation
- **Backtesting Framework** - Historical pattern performance

### Research Areas
- **Pattern Reliability** - Statistical validation studies
- **Market Regime Analysis** - Pattern effectiveness by market type
- **Combination Strategies** - Multiple pattern confirmation
- **Risk-Adjusted Returns** - Pattern-based portfolio optimization

## 🤝 Contributing

### Code Structure
- Follow existing naming conventions
- Include comprehensive docstrings
- Add unit tests for new patterns
- Update documentation and examples

### Testing New Patterns
```python
# Test pattern detection
detector = TechnicalPatternDetector(data, highs, lows)
patterns = detector.detect_all_patterns()

# Validate results
assert len(patterns) > 0
assert all(p['confidence'] >= 0 for p in patterns)
assert all('target_price' in p for p in patterns)
```

---

🔬 **Built on proven pivot point analysis with advanced pattern recognition algorithms**
📈 **Ready for trading strategy development and market analysis**
⚡ **High-performance, scalable, and extensible architecture**