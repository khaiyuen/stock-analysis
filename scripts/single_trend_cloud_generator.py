#!/usr/bin/env python3
"""
Single Trend Cloud Generator
Generates trend clouds for a symbol using last 365 calendar days to predict 5 days forward.
Simplified version for web interface - single calculation instead of rolling windows.
"""

import numpy as np
import pandas as pd
import json
import sys
import contextlib
from datetime import datetime, timedelta
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

# Import our modular components
from stock_data_loader import load_stock_data_from_db
from pivot_detector import detect_pivot_points_ultra_log
from trendline_detector import detect_time_weighted_trendlines_log
from trend_cloud_detector import detect_trend_clouds, analyze_trend_cloud_metrics

@contextlib.contextmanager
def suppress_stdout():
    """Context manager to suppress stdout"""
    with open('/dev/null', 'w') as devnull:
        old_stdout = sys.stdout
        sys.stdout = devnull
        try:
            yield
        finally:
            sys.stdout = old_stdout


class SingleTrendCloudGenerator:
    """
    Generates trend clouds for a single symbol using last 365 calendar days
    to predict 5 days forward. Optimized for web interface.
    """

    def __init__(self,
                 window_days=365,
                 projection_days=5,
                 max_trendlines=30,
                 half_life_days=80,
                 min_pivot_weight=0.1,
                 weight_factor=2.0,
                 min_convergence_trendlines=3,
                 convergence_tolerance=2.5,
                 merge_threshold=4.0,
                 max_trend_clouds=6,
                 temperature=2.0,
                 output_dir="results"):
        """
        Initialize the single trend cloud generator.

        Args:
            window_days: Calendar days for analysis window (default: 365)
            projection_days: Days to project trend clouds forward (default: 5)
            max_trendlines: Maximum trendlines to detect
            half_life_days: Half-life for time-weighted trendlines
            min_pivot_weight: Minimum weight for pivot points
            weight_factor: Weight amplification factor
            min_convergence_trendlines: Minimum trendlines for convergence
            convergence_tolerance: Price tolerance for convergence ($)
            merge_threshold: Distance threshold for zone merging ($)
            max_trend_clouds: Maximum trend clouds to generate
            temperature: Softmax temperature for weighting
            output_dir: Directory to save results
        """
        self.window_days = window_days
        self.projection_days = projection_days
        self.max_trendlines = max_trendlines
        self.half_life_days = half_life_days
        self.min_pivot_weight = min_pivot_weight
        self.weight_factor = weight_factor
        self.min_convergence_trendlines = min_convergence_trendlines
        self.convergence_tolerance = convergence_tolerance
        self.merge_threshold = merge_threshold
        self.max_trend_clouds = max_trend_clouds
        self.temperature = temperature
        self.output_dir = Path(output_dir)

        # Create output directory if it doesn't exist
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def is_valid_market_data(self, row):
        """
        Validate market data to detect abnormal entries
        Simplified validation without verbose logging
        """
        # Basic price validation
        if row['Open'] <= 0 or row['High'] <= 0 or row['Low'] <= 0 or row['Close'] <= 0:
            return False

        # OHLC relationship validation
        if (row['High'] < row['Low'] or row['Open'] < row['Low'] or row['Close'] < row['Low'] or
            row['Open'] > row['High'] or row['Close'] > row['High']):
            return False

        # Check for weekend/holiday trading (US markets closed)
        date = pd.to_datetime(row['Date'])
        dayOfWeek = date.dayofweek  # 0 = Monday, 6 = Sunday
        if dayOfWeek >= 5:  # Saturday (5) or Sunday (6)
            return False

        # Check for major US holidays
        month = date.month
        day = date.day

        # New Year's Day, Independence Day, Christmas Day
        if (month == 1 and day == 1) or (month == 7 and day == 4) or (month == 12 and day == 25):
            return False

        # Labor Day (first Monday in September)
        if month == 9 and day <= 7 and dayOfWeek == 0:
            return False

        # More intelligent volume validation using statistical outliers
        if hasattr(self, '_volume_percentiles'):
            p99 = self._volume_percentiles.get('p99', 500_000_000)
            # Only reject extreme outliers that are also early morning (aggregated data pattern)
            if row['Volume'] > p99 * 2:
                hour = date.hour
                if 4 <= hour <= 6:
                    return False

        # Check for extreme daily price ranges (data errors)
        daily_range = (row['High'] - row['Low']) / row['Low']
        if daily_range > 0.25:  # More than 25% daily range
            year = date.year
            if year in [2008, 2009, 2020, 2021, 2022]:  # Volatile periods
                if daily_range > 0.35:
                    return False
            else:
                return False

        # Check for suspicious timing patterns
        hour = date.hour
        # Reject 1st-of-month 4 AM entries (aggregated data)
        if hour == 4 and day == 1:
            return False

        # Reject early morning entries with very high volume
        if (4 <= hour <= 6) and row['Volume'] > 100_000_000:
            return False

        return True

    def load_and_clean_data(self, symbol):
        """Load and clean stock data for the symbol"""
        # Load data with extra buffer to ensure we get 365 trading days
        stock_data = load_stock_data_from_db(
            symbol=symbol,
            days=500,  # Load extra to account for weekends/holidays
            timeframe='1D',
            filter_premarket=True
        )

        if stock_data.empty:
            raise ValueError(f"No data available for symbol {symbol}")

        print(f"📊 Loaded {len(stock_data)} raw records for {symbol}")

        # Calculate volume percentiles for intelligent validation
        self._volume_percentiles = {
            'p95': stock_data['Volume'].quantile(0.95),
            'p99': stock_data['Volume'].quantile(0.99),
            'median': stock_data['Volume'].median(),
            'mean': stock_data['Volume'].mean()
        }

        # Apply data validation
        initial_count = len(stock_data)
        valid_mask = stock_data.apply(self.is_valid_market_data, axis=1)
        stock_data = stock_data[valid_mask].copy().reset_index(drop=True)

        # Basic date and price filtering
        min_valid_date = pd.Timestamp('1990-01-01')
        max_valid_date = pd.Timestamp.now() + pd.Timedelta(days=1)

        date_mask = (stock_data['Date'] >= min_valid_date) & (stock_data['Date'] <= max_valid_date)
        price_mask = (
            (stock_data['Price'] > 0.01) &
            (stock_data['Price'] < 100000) &
            (stock_data['Price'].notna())
        )

        clean_mask = date_mask & price_mask
        stock_data = stock_data[clean_mask].copy().reset_index(drop=True)

        # Sort chronologically and add log prices
        stock_data = stock_data.sort_values('Date').reset_index(drop=True)
        stock_data['LogPrice'] = np.log(stock_data['Price'])

        print(f"✅ Clean dataset: {len(stock_data)} records for {symbol}")
        return stock_data

    def generate_trend_clouds(self, symbol):
        """
        Generate trend clouds for last 365 calendar days to predict 5 days forward.

        Args:
            symbol: Stock symbol to analyze

        Returns:
            Dict with trend cloud data and metadata
        """
        print(f"🌤️ Generating trend clouds for {symbol} | Window: {self.window_days} days, Projection: {self.projection_days} days")

        # Load and clean data
        stock_data = self.load_and_clean_data(symbol)

        # Use last 365 calendar days of data for analysis, but project from today
        analysis_end_date = stock_data['Date'].iloc[-1]
        start_date = analysis_end_date - pd.Timedelta(days=self.window_days)

        # Current date for projections should be today (real current date)
        current_real_date = pd.Timestamp.now().normalize()  # Today at midnight
        print(f"📅 Today's real date: {current_real_date}")
        print(f"📅 Last data date: {analysis_end_date}")
        print(f"📅 Time difference: {(current_real_date - analysis_end_date).days} days")

        # Filter to analysis window (use analysis_end_date for window filtering)
        window_mask = (stock_data['Date'] >= start_date) & (stock_data['Date'] <= analysis_end_date)
        window_data = stock_data[window_mask].copy().reset_index(drop=True)

        if len(window_data) < 50:
            raise ValueError(f"Insufficient data in window: {len(window_data)} records")

        print(f"📅 Analysis window: {start_date.date()} → {analysis_end_date.date()} | {len(window_data)} trading days")

        try:
            # Suppress verbose output from underlying functions
            with suppress_stdout():
                # Detect pivots
                pivots, swing_highs, swing_lows = detect_pivot_points_ultra_log(
                    window_data,
                    methods=['scipy', 'rolling', 'zigzag', 'fractal'],
                    combine=True
                )

                if not pivots:
                    raise ValueError("No pivot points detected")

                # Add log prices to pivots
                for pivot in pivots:
                    pivot['log_price'] = np.log(pivot['price'])

                # Detect time-weighted trendlines
                time_weighted_trendlines = detect_time_weighted_trendlines_log(
                    pivots, window_data,
                    max_lines=self.max_trendlines,
                    half_life_days=self.half_life_days,
                    min_weight=self.min_pivot_weight,
                    weight_factor=self.weight_factor
                )

                if not time_weighted_trendlines:
                    raise ValueError("No trendlines detected")

                # Detect trend clouds
                final_trend_clouds = detect_trend_clouds(
                    time_weighted_trendlines,
                    window_data,
                    projection_days=self.projection_days,
                    convergence_tolerance=self.convergence_tolerance,
                    merge_threshold=self.merge_threshold,
                    min_trendlines=self.min_convergence_trendlines,
                    max_clouds=self.max_trend_clouds,
                    temperature=self.temperature
                )

                if not final_trend_clouds:
                    raise ValueError("No trend clouds detected")

        except Exception as e:
            raise ValueError(f"Trend cloud analysis failed: {str(e)}")

        # Get current price
        current_price = window_data['Price'].iloc[-1]

        # Project from the day after the last data point
        current_date = analysis_end_date + pd.Timedelta(days=1)
        print(f"📅 Using projection base date: {current_date} (day after last data)")

        # Process trend clouds into output format
        all_trend_clouds = []
        for cloud in final_trend_clouds:
            trend_cloud_data = {
                'calculation_date': current_date.isoformat(),
                'projection_start': (current_date + pd.Timedelta(days=1)).isoformat(),
                'projection_end': (current_date + pd.Timedelta(days=self.projection_days)).isoformat(),
                'center_price': float(cloud['center_price']),
                'price_range': [float(cloud['price_range'][0]), float(cloud['price_range'][1])],
                'cloud_type': cloud['cloud_type'],
                'cloud_id': cloud['cloud_id'],
                'unique_trendlines': int(cloud['unique_trendlines']),
                'total_weighted_strength': float(cloud['total_weighted_strength']),
                'softmax_weight': float(cloud.get('softmax_weight', 1.0)),
                'merged_from': int(cloud.get('merged_from', 1)),
                'current_price': float(current_price)
            }
            all_trend_clouds.append(trend_cloud_data)

        print(f"✅ Generated {len(all_trend_clouds)} trend clouds for {symbol}")

        # Create comprehensive results
        results = {
            'metadata': {
                'symbol': symbol,
                'generation_date': datetime.now().isoformat(),
                'analysis_start_date': start_date.isoformat(),
                'analysis_end_date': analysis_end_date.isoformat(),
                'analysis_period_days': (analysis_end_date - start_date).days,
                'window_size': self.window_days,
                'step_size': 1,  # Single calculation
                'successful_calculations': 1,
                'total_calculation_points': 1,
                'total_trend_clouds': len(all_trend_clouds),
                'parameters': {
                    'max_trendlines': self.max_trendlines,
                    'projection_days': self.projection_days,
                    'half_life_days': self.half_life_days,
                    'min_pivot_weight': self.min_pivot_weight,
                    'weight_factor': self.weight_factor,
                    'min_convergence_trendlines': self.min_convergence_trendlines,
                    'convergence_tolerance': self.convergence_tolerance,
                    'merge_threshold': self.merge_threshold,
                    'max_trend_clouds': self.max_trend_clouds,
                    'temperature': self.temperature
                }
            },
            'trend_clouds': all_trend_clouds
        }

        # Summary statistics
        if all_trend_clouds:
            df = pd.DataFrame(all_trend_clouds)
            resistance_count = len(df[df['cloud_type'] == 'Resistance'])
            support_count = len(df[df['cloud_type'] == 'Support'])
            avg_strength = df['total_weighted_strength'].mean()
            avg_trendlines = df['unique_trendlines'].mean()
            merged_count = len(df[df['merged_from'] > 1])

            results['summary'] = {
                'resistance_clouds': resistance_count,
                'support_clouds': support_count,
                'avg_strength': float(avg_strength),
                'avg_trendlines_per_cloud': float(avg_trendlines),
                'merged_cloud_count': merged_count,
                'merge_rate_percent': float(merged_count / len(all_trend_clouds) * 100)
            }

        return results

    def save_results(self, results, symbol, suffix=""):
        """Save trend cloud results to JSON file"""
        base_filename = f"{symbol}_continuous_trend_clouds{suffix}"

        # Save as JSON for easy reading/analysis
        json_path = self.output_dir / f"{base_filename}.json"
        with open(json_path, 'w') as f:
            json.dump(results, f, indent=2, default=str)

        print(f"💾 Saved: {json_path.name}")
        return json_path


def generate_single_trend_clouds(symbol, output_dir="results"):
    """
    Convenience function to generate trend clouds for a symbol using last 365 days

    Args:
        symbol: Stock symbol to analyze
        output_dir: Directory to save results

    Returns:
        Path to saved results file
    """
    generator = SingleTrendCloudGenerator(
        window_days=365,
        projection_days=5,
        output_dir=output_dir
    )

    results = generator.generate_trend_clouds(symbol)
    json_path = generator.save_results(results, symbol)

    return json_path


if __name__ == "__main__":
    # Command line usage
    if len(sys.argv) != 2:
        print("Usage: python single_trend_cloud_generator.py <SYMBOL>")
        sys.exit(1)

    symbol = sys.argv[1].upper()
    print(f"🚀 Single Trend Cloud Generator for {symbol}")

    try:
        results_path = generate_single_trend_clouds(symbol)
        print(f"✅ Success: {results_path}")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        sys.exit(1)