"""
Continuous Trend Cloud Generator Module

Generates trend cloud data for any symbol across the entire available period
with configurable parameters. Saves only the essential trend cloud data needed
to recreate visualizations.

Key Features:
- Processes entire available data period for any symbol
- Rolling windows with configurable step size
- Saves only trend cloud data (no pivots/stock data)
- Optimized for storage and visualization recreation
- Modular design using existing trend cloud detector
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


class ContinuousTrendCloudGenerator:
    """
    Generates trend cloud data across entire available period for any symbol
    """

    def __init__(self,
                 window_size=365,
                 step_size=5,
                 max_trendlines=30,
                 projection_days=5,
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
        Initialize the continuous trend cloud generator.

        Args:
            window_size: Calendar days per analysis window (default: 365 = 1 year)
            step_size: Days to shift window forward each step (default: 5)
            max_trendlines: Maximum trendlines per window
            projection_days: Days to project trend clouds forward
            half_life_days: Half-life for time-weighted trendlines
            min_pivot_weight: Minimum weight for pivot points
            weight_factor: Weight amplification factor
            min_convergence_trendlines: Minimum trendlines for convergence
            convergence_tolerance: Price tolerance for convergence ($)
            merge_threshold: Distance threshold for zone merging ($)
            max_trend_clouds: Maximum trend clouds per window
            temperature: Softmax temperature for weighting
            output_dir: Directory to save results
        """
        self.window_size = window_size
        self.step_size = step_size
        self.max_trendlines = max_trendlines
        self.projection_days = projection_days
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

    def load_and_clean_data(self, symbol):
        """Load and clean stock data for the symbol"""
        # Load maximum available data
        stock_data = load_stock_data_from_db(
            symbol=symbol,
            days=10000,  # Load maximum available
            timeframe='1D',
            filter_premarket=True
        )

        if stock_data.empty:
            raise ValueError(f"No data available for symbol {symbol}")

        # Minimal cleaning to preserve historical data
        min_valid_date = pd.Timestamp('1990-01-01')
        max_valid_date = pd.Timestamp.now() + pd.Timedelta(days=1)

        # Date and price filtering
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

        return stock_data

    def analyze_window_at_date(self, stock_data, calculation_date):
        """Analyze trend clouds for a specific calculation date"""

        # Define window bounds
        end_date = calculation_date
        start_date = end_date - pd.Timedelta(days=self.window_size)

        # Filter to window data
        window_mask = (stock_data['Date'] >= start_date) & (stock_data['Date'] <= end_date)
        window_data = stock_data[window_mask].copy().reset_index(drop=True)

        if len(window_data) < 50:
            return None

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
                    return None

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
                    return None

                # Detect trend clouds using modular detector
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

            return final_trend_clouds if final_trend_clouds else None

        except Exception as e:
            return None

    def generate_trend_clouds(self, symbol, analysis_period_years=None):
        """
        Generate trend cloud data for entire available period or specified years.

        Args:
            symbol: Stock symbol to analyze
            analysis_period_years: Number of years to analyze from beginning (None = all available)

        Returns:
            Dict with trend cloud data and metadata
        """
        print(f"🌤️ Generating trend clouds for {symbol} | Window: {self.window_size}d, Step: {self.step_size}d")

        # Load and clean data
        stock_data = self.load_and_clean_data(symbol)

        # Define analysis period
        analysis_start_date = stock_data['Date'].iloc[0]

        if analysis_period_years:
            analysis_end_date = analysis_start_date + pd.Timedelta(days=int(analysis_period_years * 365.25))
            analysis_end_date = min(analysis_end_date, stock_data['Date'].iloc[-1])
        else:
            analysis_end_date = stock_data['Date'].iloc[-1]

        # Generate calculation dates
        calculation_dates = []
        current_date = analysis_start_date + pd.Timedelta(days=self.window_size)

        while current_date <= analysis_end_date:
            if current_date <= stock_data['Date'].iloc[-1]:
                calculation_dates.append(current_date)
            current_date += pd.Timedelta(days=self.step_size)

        print(f"📅 {analysis_start_date.date()} → {analysis_end_date.date()} | {len(calculation_dates)} windows")

        # Process each calculation date
        all_trend_clouds = []
        successful_calculations = 0

        for i, calc_date in enumerate(calculation_dates):
            if i % 50 == 0:  # Progress every 50 calculations
                progress = (i / len(calculation_dates)) * 100
                print(f"📊 {progress:.1f}% ({i+1}/{len(calculation_dates)}) - {calc_date.date()}")

            trend_clouds = self.analyze_window_at_date(stock_data, calc_date)

            if trend_clouds:
                current_price = stock_data[stock_data['Date'] <= calc_date]['Price'].iloc[-1]

                for cloud in trend_clouds:
                    # Store only essential trend cloud data
                    trend_cloud_data = {
                        'calculation_date': calc_date.isoformat(),
                        'projection_start': (calc_date + pd.Timedelta(days=1)).isoformat(),
                        'projection_end': (calc_date + pd.Timedelta(days=self.projection_days)).isoformat(),
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

                successful_calculations += 1

        print(f"✅ Complete! {successful_calculations}/{len(calculation_dates)} windows, {len(all_trend_clouds)} clouds")

        # Create comprehensive results
        results = {
            'metadata': {
                'symbol': symbol,
                'generation_date': datetime.now().isoformat(),
                'analysis_start_date': analysis_start_date.isoformat(),
                'analysis_end_date': analysis_end_date.isoformat(),
                'analysis_period_days': (analysis_end_date - analysis_start_date).days,
                'window_size': self.window_size,
                'step_size': self.step_size,
                'successful_calculations': successful_calculations,
                'total_calculation_points': len(calculation_dates),
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

        print(f"💾 Saved: {json_path.name} ({json_path.stat().st_size:,} bytes)")

        return json_path

    def load_results(self, filepath):
        """Load trend cloud results from JSON file"""
        filepath = Path(filepath)

        if filepath.suffix == '.json':
            with open(filepath, 'r') as f:
                return json.load(f)
        else:
            raise ValueError("File must be .json")


def generate_continuous_trend_clouds(symbol,
                                   analysis_period_years=None,
                                   window_size=365,
                                   step_size=5,
                                   output_dir="results"):
    """
    Convenience function to generate continuous trend clouds for a symbol

    Args:
        symbol: Stock symbol to analyze
        analysis_period_years: Years to analyze from beginning (None = all available)
        window_size: Analysis window size in days
        step_size: Days between calculation windows
        output_dir: Directory to save results

    Returns:
        Path to saved results file
    """
    generator = ContinuousTrendCloudGenerator(
        window_size=window_size,
        step_size=step_size,
        output_dir=output_dir
    )

    results = generator.generate_trend_clouds(symbol, analysis_period_years)
    json_path = generator.save_results(results, symbol)

    return json_path


if __name__ == "__main__":
    # Example usage
    print("🚀 Trend Cloud Generator Test")

    # Generate trend clouds for QQQ
    results_path = generate_continuous_trend_clouds(
        symbol='QQQ',
        analysis_period_years=None,  # Full period
        window_size=365,
        step_size=5
    )

    print(f"✅ Test complete: {results_path}")
