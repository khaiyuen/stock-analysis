"""
Pivot Point Detection Module
Extracts pivot detection functionality from the trend cloud notebook
"""

import numpy as np
import pandas as pd
from scipy.signal import argrelextrema
from scipy import stats


def detect_pivot_points_ultra_log(data, methods=['scipy', 'rolling', 'zigzag', 'fractal', 'slope', 'derivative'], combine=True):
    """Ultra-enhanced pivot detection with comprehensive methods ON LOG SCALE"""
    log_prices = data['LogPrice'].values  # Use log prices instead of regular prices
    regular_prices = data['Price'].values  # Keep regular prices for display
    dates = data['Date'].values

    all_pivots = []

    print(f"🔍 Ultra-enhanced LOG SCALE pivot detection using methods: {methods}")
    print(f"   📈 Working with log prices: {log_prices.min():.4f} to {log_prices.max():.4f}")

    # Method 1: Scipy with multiple window sizes ON LOG SCALE
    if 'scipy' in methods:
        print("   📊 Method 1: Scipy argrelextrema with multiple windows (LOG SCALE)")
        for window in [2, 3, 4, 5, 7, 10, 15]:
            swing_highs = argrelextrema(log_prices, np.greater, order=window)[0]
            swing_lows = argrelextrema(log_prices, np.less, order=window)[0]

            for idx in swing_highs:
                all_pivots.append({
                    'date': pd.to_datetime(dates[idx]),
                    'price': regular_prices[idx],
                    'log_price': log_prices[idx],
                    'type': 'high',
                    'index': idx,
                    'method': f'scipy_w{window}',
                    'strength': window
                })

            for idx in swing_lows:
                all_pivots.append({
                    'date': pd.to_datetime(dates[idx]),
                    'price': regular_prices[idx],
                    'log_price': log_prices[idx],
                    'type': 'low',
                    'index': idx,
                    'method': f'scipy_w{window}',
                    'strength': window
                })

        print(f"      Found {len([p for p in all_pivots if 'scipy' in p['method']])} scipy pivots")

    # Method 2: Rolling window extremes ON LOG SCALE
    if 'rolling' in methods:
        print("   📊 Method 2: Rolling window extremes (LOG SCALE)")
        for window in [3, 5, 7, 10, 15, 20]:
            df_temp = pd.DataFrame({'log_price': log_prices, 'price': regular_prices, 'index': range(len(log_prices))})

            rolling_max = df_temp['log_price'].rolling(window=window, center=True).max()
            rolling_min = df_temp['log_price'].rolling(window=window, center=True).min()

            highs = df_temp[(df_temp['log_price'] == rolling_max)]['index'].values
            lows = df_temp[(df_temp['log_price'] == rolling_min)]['index'].values

            for idx in highs:
                if 0 < idx < len(log_prices) - 1:
                    all_pivots.append({
                        'date': pd.to_datetime(dates[idx]),
                        'price': regular_prices[idx],
                        'log_price': log_prices[idx],
                        'type': 'high',
                        'index': idx,
                        'method': f'rolling_w{window}',
                        'strength': window / 3
                    })

            for idx in lows:
                if 0 < idx < len(log_prices) - 1:
                    all_pivots.append({
                        'date': pd.to_datetime(dates[idx]),
                        'price': regular_prices[idx],
                        'log_price': log_prices[idx],
                        'type': 'low',
                        'index': idx,
                        'method': f'rolling_w{window}',
                        'strength': window / 3
                    })

        print(f"      Found {len([p for p in all_pivots if 'rolling' in p['method']])} rolling pivots")

    # Method 3: ZigZag with multiple thresholds ON LOG SCALE
    if 'zigzag' in methods:
        print("   📊 Method 3: ZigZag percentage-based detection (LOG SCALE)")
        for threshold in [0.01, 0.015, 0.02, 0.03, 0.05, 0.08]:
            zigzag_pivots = detect_zigzag_pivots_log(log_prices, regular_prices, dates, threshold)
            for pivot in zigzag_pivots:
                pivot['method'] = f'zigzag_{threshold*100:.1f}pct'
                pivot['strength'] = 1 / threshold
                pivot['date'] = pd.to_datetime(pivot['date'])
                all_pivots.append(pivot)

        print(f"      Found {len([p for p in all_pivots if 'zigzag' in p['method']])} zigzag pivots")

    # Method 4: Fractal-based detection ON LOG SCALE
    if 'fractal' in methods:
        print("   📊 Method 4: Fractal pattern detection (LOG SCALE)")
        fractal_pivots = detect_fractal_pivots_log(log_prices, regular_prices, dates)
        for pivot in fractal_pivots:
            pivot['method'] = 'fractal'
            pivot['strength'] = 3
            pivot['date'] = pd.to_datetime(pivot['date'])
            all_pivots.append(pivot)

        print(f"      Found {len([p for p in all_pivots if 'fractal' in p['method']])} fractal pivots")

    # Method 5: Slope change detection ON LOG SCALE
    if 'slope' in methods:
        print("   📊 Method 5: Slope change detection (LOG SCALE)")
        slope_pivots = detect_slope_change_pivots_log(log_prices, regular_prices, dates)
        for pivot in slope_pivots:
            pivot['method'] = 'slope'
            pivot['strength'] = 2
            pivot['date'] = pd.to_datetime(pivot['date'])
            all_pivots.append(pivot)

        print(f"      Found {len([p for p in all_pivots if 'slope' in p['method']])} slope pivots")

    # Method 6: Derivative-based detection ON LOG SCALE
    if 'derivative' in methods:
        print("   📊 Method 6: Derivative-based detection (LOG SCALE)")
        derivative_pivots = detect_derivative_pivots_log(log_prices, regular_prices, dates)
        for pivot in derivative_pivots:
            pivot['method'] = 'derivative'
            pivot['strength'] = 1.5
            pivot['date'] = pd.to_datetime(pivot['date'])
            all_pivots.append(pivot)

        print(f"      Found {len([p for p in all_pivots if 'derivative' in p['method']])} derivative pivots")

    print(f"🔍 Total raw pivots found: {len(all_pivots)}")

    if combine and len(all_pivots) > 0:
        combined_pivots = combine_overlapping_pivots(all_pivots, proximity_threshold=3)
        print(f"🔍 Combined to {len(combined_pivots)} unique pivots")
        return combined_pivots, get_indices_by_type(combined_pivots, 'high'), get_indices_by_type(combined_pivots, 'low')
    else:
        return all_pivots, get_indices_by_type(all_pivots, 'high'), get_indices_by_type(all_pivots, 'low')


def detect_fractal_pivots_log(log_prices, regular_prices, dates, lookback=2):
    """Detect fractal patterns (Williams Fractal) ON LOG SCALE"""
    pivots = []

    for i in range(lookback, len(log_prices) - lookback):
        # Check for fractal high (higher than surrounding points) ON LOG SCALE
        is_fractal_high = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and log_prices[j] >= log_prices[i]:
                is_fractal_high = False
                break

        if is_fractal_high:
            pivots.append({
                'date': dates[i],
                'price': regular_prices[i],
                'log_price': log_prices[i],
                'type': 'high',
                'index': i
            })

        # Check for fractal low (lower than surrounding points) ON LOG SCALE
        is_fractal_low = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and log_prices[j] <= log_prices[i]:
                is_fractal_low = False
                break

        if is_fractal_low:
            pivots.append({
                'date': dates[i],
                'price': regular_prices[i],
                'log_price': log_prices[i],
                'type': 'low',
                'index': i
            })

    return pivots


def detect_slope_change_pivots_log(log_prices, regular_prices, dates, window=3):
    """Detect pivots based on slope changes ON LOG SCALE"""
    pivots = []

    # Calculate slopes ON LOG SCALE
    slopes = []
    for i in range(len(log_prices) - window):
        slope = (log_prices[i + window] - log_prices[i]) / window
        slopes.append(slope)

    # Find slope changes
    for i in range(1, len(slopes) - 1):
        prev_slope = slopes[i - 1]
        curr_slope = slopes[i]
        next_slope = slopes[i + 1]

        # Detect slope change from positive to negative (potential high)
        if prev_slope > 0 and curr_slope < 0:
            pivot_idx = i + window // 2
            if 0 <= pivot_idx < len(log_prices):
                pivots.append({
                    'date': dates[pivot_idx],
                    'price': regular_prices[pivot_idx],
                    'log_price': log_prices[pivot_idx],
                    'type': 'high',
                    'index': pivot_idx
                })

        # Detect slope change from negative to positive (potential low)
        elif prev_slope < 0 and curr_slope > 0:
            pivot_idx = i + window // 2
            if 0 <= pivot_idx < len(log_prices):
                pivots.append({
                    'date': dates[pivot_idx],
                    'price': regular_prices[pivot_idx],
                    'log_price': log_prices[pivot_idx],
                    'type': 'low',
                    'index': pivot_idx
                })

    return pivots


def detect_derivative_pivots_log(log_prices, regular_prices, dates):
    """Detect pivots using first and second derivatives ON LOG SCALE"""
    pivots = []

    # Calculate first derivative (gradient) ON LOG SCALE
    first_deriv = np.gradient(log_prices)

    # Calculate second derivative ON LOG SCALE
    second_deriv = np.gradient(first_deriv)

    for i in range(1, len(log_prices) - 1):
        # Look for sign changes in first derivative
        if first_deriv[i-1] > 0 and first_deriv[i+1] < 0:  # Peak
            pivots.append({
                'date': dates[i],
                'price': regular_prices[i],
                'log_price': log_prices[i],
                'type': 'high',
                'index': i
            })
        elif first_deriv[i-1] < 0 and first_deriv[i+1] > 0:  # Trough
            pivots.append({
                'date': dates[i],
                'price': regular_prices[i],
                'log_price': log_prices[i],
                'type': 'low',
                'index': i
            })

        # Also look for significant second derivative changes (inflection points)
        if abs(second_deriv[i]) > np.std(second_deriv) * 2:  # Significant curvature change
            if second_deriv[i] < 0:  # Concave down (potential high)
                pivots.append({
                    'date': dates[i],
                    'price': regular_prices[i],
                    'log_price': log_prices[i],
                    'type': 'high',
                    'index': i
                })
            elif second_deriv[i] > 0:  # Concave up (potential low)
                pivots.append({
                    'date': dates[i],
                    'price': regular_prices[i],
                    'log_price': log_prices[i],
                    'type': 'low',
                    'index': i
                })

    return pivots


def detect_zigzag_pivots_log(log_prices, regular_prices, dates, threshold=0.05):
    """ZigZag-style pivot detection based on percentage moves ON LOG SCALE"""
    pivots = []

    if len(log_prices) < 3:
        return pivots

    last_pivot_idx = 0
    last_pivot_log_price = log_prices[0]
    direction = None

    for i in range(1, len(log_prices)):
        log_price = log_prices[i]
        # Calculate percentage change using log difference (more accurate for percentage changes)
        pct_change = log_price - last_pivot_log_price

        if direction is None:
            if pct_change > np.log(1 + threshold):  # Convert threshold to log space
                direction = 'up'
            elif pct_change < np.log(1 - threshold):
                direction = 'down'

        elif direction == 'up':
            if pct_change < np.log(1 - threshold):
                pivots.append({
                    'date': dates[last_pivot_idx],
                    'price': regular_prices[last_pivot_idx],
                    'log_price': log_prices[last_pivot_idx],
                    'type': 'high',
                    'index': last_pivot_idx
                })
                direction = 'down'
                last_pivot_idx = i
                last_pivot_log_price = log_price
            elif log_price > last_pivot_log_price:
                last_pivot_idx = i
                last_pivot_log_price = log_price

        elif direction == 'down':
            if pct_change > np.log(1 + threshold):
                pivots.append({
                    'date': dates[last_pivot_idx],
                    'price': regular_prices[last_pivot_idx],
                    'log_price': log_prices[last_pivot_idx],
                    'type': 'low',
                    'index': last_pivot_idx
                })
                direction = 'up'
                last_pivot_idx = i
                last_pivot_log_price = log_price
            elif log_price < last_pivot_log_price:
                last_pivot_idx = i
                last_pivot_log_price = log_price

    return pivots


def combine_overlapping_pivots(all_pivots, proximity_threshold=3):
    """Combine pivots that are close to each other with improved logic"""
    if not all_pivots:
        return []

    # Sort by index
    all_pivots.sort(key=lambda x: x['index'])

    combined = []
    i = 0

    while i < len(all_pivots):
        current_pivot = all_pivots[i]
        group = [current_pivot]

        # Look ahead for similar pivots
        j = i + 1
        while j < len(all_pivots):
            next_pivot = all_pivots[j]

            # Same type and within proximity
            if (next_pivot['type'] == current_pivot['type'] and
                abs(next_pivot['index'] - current_pivot['index']) <= proximity_threshold):
                group.append(next_pivot)
                j += 1
            else:
                break

        # Choose the best pivot from the group based on LOG PRICES
        if len(group) == 1:
            combined.append(group[0])
        else:
            # For highs, take the highest LOG price; for lows, take the lowest LOG price
            if current_pivot['type'] == 'high':
                best_pivot = max(group, key=lambda x: x['log_price'])
            else:
                best_pivot = min(group, key=lambda x: x['log_price'])

            # If multiple have same log price, take the one with highest strength
            same_price_group = [p for p in group if abs(p['log_price'] - best_pivot['log_price']) < 1e-6]
            if len(same_price_group) > 1:
                best_pivot = max(same_price_group, key=lambda x: x.get('strength', 1))

            combined.append(best_pivot)

        i = j

    return combined


def get_indices_by_type(pivots, pivot_type):
    """Extract indices for a specific pivot type"""
    return np.array([p['index'] for p in pivots if p['type'] == pivot_type])


def safe_date_format(date_obj):
    """Safely format date object to string"""
    if hasattr(date_obj, 'strftime'):
        return date_obj.strftime('%Y-%m-%d')
    else:
        # Handle numpy datetime64 or other formats
        return pd.to_datetime(date_obj).strftime('%Y-%m-%d')