# Stock Analysis Trendline Extraction Scripts

Modular scripts extracted from `1.0 trend_cloud_get_trendline.ipynb` for reusable trendline detection.

## 🚀 Quick Start

```python
from scripts.trendline_extractor import TrendlineExtractor

extractor = TrendlineExtractor(symbol='QQQ')
results = extractor.extract_trendlines()
extractor.save_results()
```

## 📦 Modules

- `stock_data_loader.py` - Load data from database or create samples
- `pivot_detector.py` - 6-method pivot detection with log-scale analysis  
- `trendline_detector.py` - Iterative trendline refinement
- `trendline_extractor.py` - Main orchestrator with CLI

## 🔬 Features

- **Log-Scale Analysis**: Percentage-based trendlines
- **6 Pivot Methods**: Scipy, Rolling, ZigZag, Fractal, Slope, Derivative
- **Iterative Refinement**: Maximum-strength trendlines with 2% tolerance
- **Smart Processing**: Efficient pair management, reusable components

## 💾 Usage Examples

```bash
# CLI usage
python scripts/trendline_extractor.py QQQ --days 180

# One-line function
from scripts.trendline_extractor import extract_trendlines_for_symbol
result = extract_trendlines_for_symbol('AAPL')
```

Output files: `data/trendlines_data_log_{symbol}.pkl` and `data/trendlines_summary_log_{symbol}.json`