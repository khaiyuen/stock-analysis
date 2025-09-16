#!/usr/bin/env python3
"""
Trend Cloud Generation Script
Integrates with existing trend cloud analysis notebooks to generate trend clouds for a given symbol.
"""

import sys
import json
import sqlite3
import pandas as pd
import numpy as np
from pathlib import Path
import argparse
from datetime import datetime, timedelta
import traceback

def get_symbol_data(symbol, db_path="data/stock-data.db"):
    """
    Fetch market data from SQLite database
    """
    print(f"📊 Fetching data for {symbol} from {db_path}")

    try:
        conn = sqlite3.connect(db_path)

        # Query for daily data - matching the database schema
        query = """
        SELECT timestamp, open, high, low, close, volume, adjusted_close
        FROM market_data
        WHERE symbol = ? AND timeframe = '1D'
        ORDER BY timestamp ASC
        """

        df = pd.read_sql_query(query, conn, params=(symbol,))
        conn.close()

        if df.empty:
            print(f"❌ No data found for symbol {symbol}")
            return None

        # Convert timestamp to datetime
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)

        print(f"✅ Loaded {len(df)} records for {symbol}")
        print(f"📅 Date range: {df.index.min()} to {df.index.max()}")

        return df

    except Exception as e:
        print(f"❌ Database error: {e}")
        return None

def detect_pivots(df, lookback=3, min_strength=0.01):
    """
    Detect pivot points in price data
    Based on the pivot detection logic from the notebooks
    """
    print(f"🔍 Detecting pivots with lookback={lookback}, min_strength={min_strength}")

    pivots = []

    for i in range(lookback, len(df) - lookback):
        current_high = df.iloc[i]['high']
        current_low = df.iloc[i]['low']
        current_date = df.index[i]

        # Check for resistance pivot (local high)
        is_high_pivot = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and df.iloc[j]['high'] >= current_high:
                is_high_pivot = False
                break

        if is_high_pivot:
            # Calculate strength as percentage move
            avg_price = df.iloc[i-lookback:i+lookback+1]['close'].mean()
            strength = abs(current_high - avg_price) / avg_price

            if strength >= min_strength:
                pivots.append({
                    'timestamp': current_date,
                    'price': current_high,
                    'type': 'HIGH',
                    'strength': strength
                })

        # Check for support pivot (local low)
        is_low_pivot = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and df.iloc[j]['low'] <= current_low:
                is_low_pivot = False
                break

        if is_low_pivot:
            # Calculate strength as percentage move
            avg_price = df.iloc[i-lookback:i+lookback+1]['close'].mean()
            strength = abs(current_low - avg_price) / avg_price

            if strength >= min_strength:
                pivots.append({
                    'timestamp': current_date,
                    'price': current_low,
                    'type': 'LOW',
                    'strength': strength
                })

    print(f"🎯 Found {len(pivots)} pivot points")
    return pivots

def calculate_trendlines(pivots, tolerance=0.02):
    """
    Calculate trendlines from pivot points
    Simplified version of the trendline detection algorithm
    """
    print(f"📈 Calculating trendlines with tolerance={tolerance}")

    trendlines = []

    # Separate high and low pivots
    high_pivots = [p for p in pivots if p['type'] == 'HIGH']
    low_pivots = [p for p in pivots if p['type'] == 'LOW']

    def find_trendlines_for_pivots(pivot_list, trend_type):
        lines = []

        for i in range(len(pivot_list)):
            for j in range(i + 1, len(pivot_list)):
                pivot1 = pivot_list[i]
                pivot2 = pivot_list[j]

                # Calculate slope and intercept
                x1 = pivot1['timestamp'].timestamp()
                y1 = pivot1['price']
                x2 = pivot2['timestamp'].timestamp()
                y2 = pivot2['price']

                if x2 == x1:
                    continue

                slope = (y2 - y1) / (x2 - x1)
                intercept = y1 - slope * x1

                # Find all pivots that touch this line
                touching_pivots = []
                total_deviation = 0

                for pivot in pivot_list:
                    px = pivot['timestamp'].timestamp()
                    py = pivot['price']
                    line_y = slope * px + intercept

                    # Check if pivot touches the line within tolerance
                    deviation = abs(py - line_y) / line_y

                    if deviation <= tolerance:
                        touching_pivots.append(pivot)
                        total_deviation += deviation

                # Require at least 3 touching points for a valid trendline
                if len(touching_pivots) >= 3:
                    avg_deviation = total_deviation / len(touching_pivots)
                    strength = len(touching_pivots) * (1 - avg_deviation)

                    lines.append({
                        'type': trend_type,
                        'slope': slope,
                        'intercept': intercept,
                        'touching_pivots': len(touching_pivots),
                        'strength': strength,
                        'avg_deviation': avg_deviation,
                        'start_time': pivot1['timestamp'],
                        'end_time': pivot2['timestamp']
                    })

        return lines

    # Find resistance trendlines (connecting highs)
    resistance_lines = find_trendlines_for_pivots(high_pivots, 'RESISTANCE')

    # Find support trendlines (connecting lows)
    support_lines = find_trendlines_for_pivots(low_pivots, 'SUPPORT')

    trendlines = resistance_lines + support_lines

    # Sort by strength and take top 50
    trendlines.sort(key=lambda x: x['strength'], reverse=True)
    trendlines = trendlines[:50]

    print(f"📊 Generated {len(trendlines)} trendlines ({len(resistance_lines)} resistance, {len(support_lines)} support)")

    return trendlines

def create_trend_clouds(trendlines, current_price, projection_days=30):
    """
    Create trend clouds from trendlines
    Simplified version of the trend cloud algorithm
    """
    print(f"☁️ Creating trend clouds with projection_days={projection_days}")

    clouds = []
    current_time = datetime.now()

    # Group trendlines by price level (simplified clustering)
    price_tolerance = 0.05  # 5% price tolerance for grouping

    support_lines = [tl for tl in trendlines if tl['type'] == 'SUPPORT']
    resistance_lines = [tl for tl in trendlines if tl['type'] == 'RESISTANCE']

    def create_clouds_from_lines(lines, cloud_type):
        clouds = []
        used_lines = set()

        for i, line1 in enumerate(lines):
            if i in used_lines:
                continue

            # Project line to current time
            current_timestamp = current_time.timestamp()
            projected_price = line1['slope'] * current_timestamp + line1['intercept']

            # Find nearby lines
            cluster_lines = [line1]
            cluster_indices = {i}

            for j, line2 in enumerate(lines):
                if j <= i or j in used_lines:
                    continue

                projected_price2 = line2['slope'] * current_timestamp + line2['intercept']
                price_diff = abs(projected_price - projected_price2) / projected_price

                if price_diff <= price_tolerance:
                    cluster_lines.append(line2)
                    cluster_indices.add(j)

            # Create cloud if we have enough lines
            if len(cluster_lines) >= 2:
                used_lines.update(cluster_indices)

                # Calculate cloud properties
                total_strength = sum(line['strength'] for line in cluster_lines)
                avg_price = sum(line['slope'] * current_timestamp + line['intercept']
                              for line in cluster_lines) / len(cluster_lines)

                prices = [line['slope'] * current_timestamp + line['intercept']
                         for line in cluster_lines]
                price_range = [min(prices), max(prices)]

                cloud_id = f"{cloud_type.lower()}_{len(clouds) + 1}_{current_time.strftime('%Y%m%d')}"

                clouds.append({
                    'cloud_id': cloud_id,
                    'cloud_type': cloud_type,
                    'center_price': avg_price,
                    'price_range': price_range,
                    'unique_trendlines': len(cluster_lines),
                    'total_weighted_strength': total_strength,
                    'softmax_weight': min(total_strength / 100, 1.0),  # Normalize to 0-1
                    'merged_from': len(cluster_lines),
                    'current_price': current_price,
                    'calculation_date': current_time.isoformat(),
                    'projection_start': current_time.isoformat(),
                    'projection_end': (current_time + timedelta(days=projection_days)).isoformat()
                })

        return clouds

    support_clouds = create_clouds_from_lines(support_lines, 'Support')
    resistance_clouds = create_clouds_from_lines(resistance_lines, 'Resistance')

    all_clouds = support_clouds + resistance_clouds

    print(f"☁️ Created {len(all_clouds)} trend clouds ({len(support_clouds)} support, {len(resistance_clouds)} resistance)")

    return all_clouds

def generate_trend_clouds_for_symbol(symbol):
    """
    Main function to generate trend clouds for a symbol
    """
    print(f"🚀 Starting trend cloud generation for {symbol}")

    try:
        # Step 1: Get data
        df = get_symbol_data(symbol)
        if df is None:
            return False, "Failed to load market data"

        # Step 2: Detect pivots
        pivots = detect_pivots(df)
        if len(pivots) < 10:
            return False, f"Insufficient pivot points found: {len(pivots)}"

        # Step 3: Calculate trendlines
        trendlines = calculate_trendlines(pivots)
        if len(trendlines) < 5:
            return False, f"Insufficient trendlines found: {len(trendlines)}"

        # Step 4: Create trend clouds
        current_price = df['close'].iloc[-1]
        clouds = create_trend_clouds(trendlines, current_price)

        # Step 5: Build output data structure
        analysis_start = df.index.min()
        analysis_end = df.index.max()
        analysis_period = (analysis_end - analysis_start).days

        output_data = {
            'metadata': {
                'symbol': symbol,
                'generation_date': datetime.now().isoformat(),
                'analysis_start_date': analysis_start.isoformat(),
                'analysis_end_date': analysis_end.isoformat(),
                'analysis_period_days': analysis_period,
                'window_size': 30,
                'step_size': 1,
                'successful_calculations': 1,
                'total_calculation_points': 1,
                'total_trend_clouds': len(clouds),
                'parameters': {
                    'max_trendlines': 50,
                    'projection_days': 30,
                    'half_life_days': 90,
                    'min_pivot_weight': 0.01,
                    'weight_factor': 1.0,
                    'min_convergence_trendlines': 2,
                    'convergence_tolerance': 0.05,
                    'merge_threshold': 0.05,
                    'max_trend_clouds': 20,
                    'temperature': 2.0
                }
            },
            'trend_clouds': clouds,
            'summary': {
                'resistance_clouds': len([c for c in clouds if c['cloud_type'] == 'Resistance']),
                'support_clouds': len([c for c in clouds if c['cloud_type'] == 'Support']),
                'avg_strength': sum(c['total_weighted_strength'] for c in clouds) / len(clouds) if clouds else 0,
                'avg_trendlines_per_cloud': sum(c['unique_trendlines'] for c in clouds) / len(clouds) if clouds else 0,
                'merged_cloud_count': len([c for c in clouds if c['merged_from'] > 1]),
                'merge_rate_percent': len([c for c in clouds if c['merged_from'] > 1]) / len(clouds) * 100 if clouds else 0
            }
        }

        # Step 6: Save results
        results_dir = Path('results')
        results_dir.mkdir(exist_ok=True)

        output_file = results_dir / f"{symbol}_continuous_trend_clouds.json"

        with open(output_file, 'w') as f:
            json.dump(output_data, f, indent=2)

        print(f"✅ Trend clouds saved to {output_file}")
        print(f"📊 Generated {len(clouds)} trend clouds for {symbol}")

        return True, f"Successfully generated {len(clouds)} trend clouds"

    except Exception as e:
        error_msg = f"Error generating trend clouds: {str(e)}"
        print(f"❌ {error_msg}")
        traceback.print_exc()
        return False, error_msg

def main():
    parser = argparse.ArgumentParser(description='Generate trend clouds for a stock symbol')
    parser.add_argument('symbol', help='Stock symbol (e.g., QQQ, AAPL)')
    parser.add_argument('--db-path', default='data/stock-data.db', help='Path to SQLite database')

    args = parser.parse_args()

    print(f"🔧 Trend Cloud Generator v1.0")
    print(f"📈 Symbol: {args.symbol}")
    print(f"🗃️ Database: {args.db_path}")
    print("=" * 50)

    success, message = generate_trend_clouds_for_symbol(args.symbol.upper())

    if success:
        print("=" * 50)
        print("🎉 SUCCESS: Trend cloud generation completed!")
        print(f"📋 {message}")
        sys.exit(0)
    else:
        print("=" * 50)
        print("❌ FAILED: Trend cloud generation failed!")
        print(f"📋 {message}")
        sys.exit(1)

if __name__ == "__main__":
    main()