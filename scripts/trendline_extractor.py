"""
Main Trendline Extraction Script
Combines all modules to extract trendlines for any stock symbol
"""

import os
import sys
import pickle
import json
import pandas as pd
import numpy as np
from datetime import datetime

# Add the scripts directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from stock_data_loader import load_stock_data_from_db, check_database_contents
from pivot_detector import detect_pivot_points_ultra_log
from trendline_detector import detect_powerful_trendlines_log, detect_time_weighted_trendlines_log


class TrendlineExtractor:
    """Main class for extracting trendlines from stock data"""
    
    def __init__(self, symbol='QQQ', lookback_days=365, projection_days=5, 
                 max_trendlines=30, convergence_threshold=0.05, temperature=2.0,
                 use_time_weighting=False, half_life_days=80, min_weight=0.1, weight_factor=2.0):
        """
        Initialize the TrendlineExtractor
        
        Parameters:
        - symbol: Stock symbol (e.g., 'QQQ', 'AAPL')
        - lookback_days: Number of days of historical data to analyze
        - projection_days: Number of days to project trendlines forward
        - max_trendlines: Maximum number of trendlines to detect
        - convergence_threshold: Price threshold for convergence detection
        - temperature: Softmax temperature for trend cloud analysis
        - use_time_weighting: Enable time-weighted trendline detection
        - half_life_days: Half-life for time decay (default 80 days)
        - min_weight: Minimum weight for oldest pivots (default 0.1)
        - weight_factor: Amplification factor for time weights (default 2.0)
        """
        self.symbol = symbol
        self.lookback_days = lookback_days
        self.projection_days = projection_days
        self.max_trendlines = max_trendlines
        self.convergence_threshold = convergence_threshold
        self.temperature = temperature
        
        # Time weighting parameters
        self.use_time_weighting = use_time_weighting
        self.half_life_days = half_life_days
        self.min_weight = min_weight
        self.weight_factor = weight_factor
        
        # Data storage
        self.stock_data = None
        self.pivots = None
        self.swing_highs = None
        self.swing_lows = None
        self.powerful_trendlines = None
        
    def load_data(self, validation_mode=False, window_start=None, window_end=None):
        """Load stock data from database or create sample data"""
        print(f"🔍 Loading data for {self.symbol}...")
        
        # Check database contents first
        db_info = check_database_contents()
        
        # Load stock data
        self.stock_data = load_stock_data_from_db(
            symbol=self.symbol,
            days=self.lookback_days,
            timeframe='1D',
            filter_premarket=True,
            validation_mode=validation_mode,
            window_start=window_start,
            window_end=window_end
        )
        
        print(f"✅ Loaded {len(self.stock_data)} data points for {self.symbol}")
        return self.stock_data
        
    def detect_pivots(self, methods=['scipy', 'rolling', 'zigzag', 'fractal', 'slope', 'derivative']):
        """Detect pivot points using multiple methods"""
        if self.stock_data is None:
            raise ValueError("Must load data first using load_data()")
            
        print(f"🔍 Detecting pivots for {self.symbol}...")
        
        self.pivots, self.swing_highs, self.swing_lows = detect_pivot_points_ultra_log(
            self.stock_data, methods=methods, combine=True
        )
        
        print(f"✅ Detected {len(self.pivots)} pivot points")
        print(f"   Swing highs: {len(self.swing_highs)}")
        print(f"   Swing lows: {len(self.swing_lows)}")
        
        return self.pivots, self.swing_highs, self.swing_lows
        
    def detect_trendlines(self):
        """Detect powerful trendlines using iterative refinement"""
        if self.pivots is None:
            raise ValueError("Must detect pivots first using detect_pivots()")
            
        print(f"🔍 Detecting {'time-weighted' if self.use_time_weighting else 'traditional'} trendlines for {self.symbol}...")
        
        if self.use_time_weighting:
            self.powerful_trendlines = detect_time_weighted_trendlines_log(
                self.pivots, 
                self.stock_data, 
                max_lines=self.max_trendlines,
                half_life_days=self.half_life_days,
                min_weight=self.min_weight,
                weight_factor=self.weight_factor
            )
        else:
            self.powerful_trendlines = detect_powerful_trendlines_log(
                self.pivots, self.stock_data, max_lines=self.max_trendlines
            )
        
        print(f"✅ Detected {len(self.powerful_trendlines)} powerful trendlines")
        
        return self.powerful_trendlines
        
    def extract_trendlines(self, validation_mode=False, window_start=None, window_end=None):
        """Complete trendline extraction process"""
        print(f"🚀 Starting complete trendline extraction for {self.symbol}")
        
        # Load data
        self.load_data(validation_mode=validation_mode, 
                      window_start=window_start, 
                      window_end=window_end)
        
        # Detect pivots
        self.detect_pivots()
        
        # Detect trendlines
        self.detect_trendlines()
        
        print(f"🎉 Trendline extraction complete for {self.symbol}!")
        print(f"   📊 {len(self.stock_data)} data points")
        print(f"   📍 {len(self.pivots)} pivot points")
        print(f"   📈 {len(self.powerful_trendlines)} powerful trendlines")
        
        return {
            'stock_data': self.stock_data,
            'pivots': self.pivots,
            'powerful_trendlines': self.powerful_trendlines,
            'swing_highs': self.swing_highs,
            'swing_lows': self.swing_lows
        }
        
    def save_results(self, validation_mode=False, window_start=None, window_end=None, 
                    expected_price=None, expected_clusters=None):
        """Save trendline results to files"""
        if self.powerful_trendlines is None:
            raise ValueError("Must extract trendlines first")
            
        # Create data directory if it doesn't exist
        os.makedirs('data', exist_ok=True)
        
        print(f"💾 Saving trendline results for {self.symbol}...")
        
        # Prepare trendline data
        trendline_data = {
            'powerful_trendlines': self.powerful_trendlines,
            'stock_data': self.stock_data,
            'pivots': self.pivots,
            'symbol': self.symbol,
            'projection_days': self.projection_days,
            'temperature': self.temperature,
            'log_scale': True,
            'analysis_type': 'log_scale',
            'validation_mode': validation_mode,
            'extraction_timestamp': datetime.now().isoformat()
        }
        
        # Add validation-specific data
        if validation_mode:
            trendline_data['validation_context'] = {
                'window_id': 'W000',
                'window_start': window_start,
                'window_end': window_end,
                'expected_price': expected_price,
                'expected_clusters': expected_clusters,
                'actual_price': float(self.stock_data['Price'].iloc[-1]),
                'price_difference': abs(float(self.stock_data['Price'].iloc[-1]) - expected_price) if expected_price else None,
                'validation_purpose': 'First window validation against fixed clustering algorithm'
            }
        
        # Choose filename based on mode
        if validation_mode:
            pickle_filename = f'data/trendlines_data_log_validation_{self.symbol.lower()}.pkl'
            json_filename = f'data/trendlines_summary_log_validation_{self.symbol.lower()}.json'
        else:
            pickle_filename = f'data/trendlines_data_log_{self.symbol.lower()}.pkl'
            json_filename = f'data/trendlines_summary_log_{self.symbol.lower()}.json'
        
        # Save to pickle file
        with open(pickle_filename, 'wb') as f:
            pickle.dump(trendline_data, f)
        
        print(f"✅ Saved trendline data to {pickle_filename}")
        
        # Create JSON summary
        json_data = {
            'symbol': self.symbol,
            'projection_days': self.projection_days,
            'temperature': self.temperature,
            'current_price': float(self.stock_data['Price'].iloc[-1]),
            'current_log_price': float(self.stock_data['LogPrice'].iloc[-1]),
            'log_scale': True,
            'analysis_type': 'log_scale',
            'validation_mode': validation_mode,
            'extraction_timestamp': datetime.now().isoformat(),
            'date_range': {
                'start': self.stock_data['Date'].min().strftime('%Y-%m-%d'),
                'end': self.stock_data['Date'].max().strftime('%Y-%m-%d')
            },
            'summary': {
                'total_data_points': len(self.stock_data),
                'total_pivots': len(self.pivots),
                'total_trendlines': len(self.powerful_trendlines),
                'swing_highs': len(self.swing_highs),
                'swing_lows': len(self.swing_lows)
            },
            'trendlines': []
        }
        
        # Add validation context to JSON
        if validation_mode and 'validation_context' in trendline_data:
            json_data['validation_context'] = trendline_data['validation_context']
        
        # Add trendline details
        for i, tl in enumerate(self.powerful_trendlines):
            trendline_data_item = {
                'id': i,
                'strength': int(tl['strength']),
                'log_slope': float(tl['log_slope']),
                'log_intercept': float(tl['log_intercept']),
                'daily_growth_rate': float(tl['daily_growth_rate']),
                'annual_growth_rate': float((np.exp(tl['daily_growth_rate']/100 * 365) - 1) * 100),
                'r_squared': float(tl['r_squared']),
                'iterations': int(tl['iterations']),
                'length_days': int(tl['length_days']),
                'start_date': tl['start_pivot']['date'].strftime('%Y-%m-%d'),
                'start_price': float(tl['start_pivot']['price']),
                'start_log_price': float(tl['start_pivot']['log_price']),
                'end_date': tl['end_pivot']['date'].strftime('%Y-%m-%d'),
                'end_price': float(tl['end_pivot']['price']),
                'end_log_price': float(tl['end_pivot']['log_price'])
            }
            json_data['trendlines'].append(trendline_data_item)
        
        # Save JSON summary
        with open(json_filename, 'w') as f:
            json.dump(json_data, f, indent=2)
        
        print(f"✅ Saved trendline summary to {json_filename}")
        
        # Print summary statistics
        if self.powerful_trendlines:
            strengths = [tl['strength'] for tl in self.powerful_trendlines]
            growth_rates = [tl['daily_growth_rate'] for tl in self.powerful_trendlines]
            annual_rates = [(np.exp(g/100 * 365) - 1) * 100 for g in growth_rates]
            
            print(f"\n📊 Trendline Summary for {self.symbol}:")
            print(f"   Strength range: {min(strengths)} - {max(strengths)} points")
            print(f"   Average strength: {sum(strengths)/len(strengths):.1f} points")
            print(f"   Growth rate range: {min(growth_rates):.3f}% - {max(growth_rates):.3f}% per day")
            print(f"   Annual growth range: {min(annual_rates):.1f}% - {max(annual_rates):.1f}% per year")
            print(f"   Bullish trendlines: {len([g for g in growth_rates if g > 0])}")
            print(f"   Bearish trendlines: {len([g for g in growth_rates if g < 0])}")
        
        return {
            'pickle_file': pickle_filename,
            'json_file': json_filename,
            'summary': json_data['summary']
        }
        
    def get_trendline_summary(self):
        """Get a summary of detected trendlines"""
        if self.powerful_trendlines is None:
            return None
            
        summary = []
        for i, tl in enumerate(self.powerful_trendlines):
            annual_growth = (np.exp(tl['daily_growth_rate']/100 * 365) - 1) * 100
            summary.append({
                'id': i + 1,
                'strength': tl['strength'],
                'daily_growth_rate': tl['daily_growth_rate'],
                'annual_growth_rate': annual_growth,
                'r_squared': tl['r_squared'],
                'length_days': tl['length_days'],
                'start_date': tl['start_pivot']['date'].strftime('%Y-%m-%d'),
                'start_price': tl['start_pivot']['price'],
                'end_date': tl['end_pivot']['date'].strftime('%Y-%m-%d'),
                'end_price': tl['end_pivot']['price']
            })
        return summary


def extract_trendlines_for_symbol(symbol, **kwargs):
    """Convenience function to extract trendlines for a given symbol"""
    extractor = TrendlineExtractor(symbol=symbol, **kwargs)
    results = extractor.extract_trendlines()
    save_info = extractor.save_results()
    
    return {
        'extractor': extractor,
        'results': results,
        'save_info': save_info,
        'summary': extractor.get_trendline_summary()
    }


if __name__ == "__main__":
    # Example usage
    import argparse
    
    parser = argparse.ArgumentParser(description='Extract trendlines from stock data')
    parser.add_argument('symbol', help='Stock symbol (e.g., QQQ, AAPL)')
    parser.add_argument('--days', type=int, default=365, help='Number of days to analyze')
    parser.add_argument('--max-trendlines', type=int, default=30, help='Maximum number of trendlines')
    parser.add_argument('--validation', action='store_true', help='Run in validation mode')
    parser.add_argument('--window-start', help='Validation window start date (YYYY-MM-DD)')
    parser.add_argument('--window-end', help='Validation window end date (YYYY-MM-DD)')
    parser.add_argument('--expected-price', type=float, help='Expected final price for validation')
    
    args = parser.parse_args()
    
    print(f"🚀 Extracting trendlines for {args.symbol}")
    
    # Create extractor
    extractor = TrendlineExtractor(
        symbol=args.symbol,
        lookback_days=args.days,
        max_trendlines=args.max_trendlines
    )
    
    # Extract trendlines
    if args.validation:
        results = extractor.extract_trendlines(
            validation_mode=True,
            window_start=args.window_start,
            window_end=args.window_end
        )
        save_info = extractor.save_results(
            validation_mode=True,
            window_start=args.window_start,
            window_end=args.window_end,
            expected_price=args.expected_price
        )
    else:
        results = extractor.extract_trendlines()
        save_info = extractor.save_results()
    
    # Print summary
    summary = extractor.get_trendline_summary()
    if summary:
        print(f"\n📈 Top 5 Trendlines for {args.symbol}:")
        for tl in summary[:5]:
            print(f"   TL{tl['id']}: {tl['strength']} points, growth={tl['daily_growth_rate']:.4f}%/day ({tl['annual_growth_rate']:.1f}%/year)")
            print(f"        {tl['start_date']} ${tl['start_price']:.2f} → {tl['end_date']} ${tl['end_price']:.2f}")
    
    print(f"\n✅ Trendline extraction complete!")
    print(f"   Files saved: {save_info['pickle_file']}, {save_info['json_file']}")