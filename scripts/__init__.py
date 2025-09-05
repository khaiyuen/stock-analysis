"""
Stock Analysis Trendline Extraction Scripts

This package provides modular components for extracting trendlines from stock data
using logarithmic scale analysis with multiple pivot detection methods and 
iterative trendline refinement.

Main Components:
- stock_data_loader: Load stock data from database or create sample data
- pivot_detector: Detect pivot points using multiple sophisticated methods
- trendline_detector: Find powerful trendlines using iterative best-fit refinement
- trendline_extractor: Main extraction class combining all components

Usage:
    from scripts.trendline_extractor import TrendlineExtractor
    
    extractor = TrendlineExtractor(symbol='QQQ')
    results = extractor.extract_trendlines()
    extractor.save_results()
"""

from .stock_data_loader import (
    load_stock_data_from_db, 
    check_database_contents,
    create_sample_data,
    create_sample_data_validation
)

from .pivot_detector import (
    detect_pivot_points_ultra_log,
    combine_overlapping_pivots,
    get_indices_by_type,
    safe_date_format
)

from .trendline_detector import (
    detect_powerful_trendlines_log,
    find_iterative_trendline_log,
    calculate_trendline_strength_log
)

from .trendline_extractor import (
    TrendlineExtractor,
    extract_trendlines_for_symbol
)

__version__ = "1.0.0"
__author__ = "Stock Analysis System"
__description__ = "Modular trendline extraction system with logarithmic scale analysis"