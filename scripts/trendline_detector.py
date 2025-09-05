"""
Trendline Detection Module
Extracts trendline detection functionality from the trend cloud notebook
"""

import numpy as np
import pandas as pd
from scipy import stats


def find_iterative_trendline_log(pivot1, pivot2, all_pivots, stock_data, tolerance_percent=2.0):
    """
    Iteratively refine trendline using LOG SCALE by:
    1. Start with 2 points
    2. Find best-fit line using LOG PRICES
    3. Find other points within tolerance
    4. Add them and recalculate best-fit line
    5. Repeat until no new points found within tolerance
    """
    # Start with the initial two points
    current_points = [pivot1, pivot2]

    # Convert to numerical format for calculations using LOG SCALE
    def points_to_xy_log(points):
        x_vals = [(p['date'] - stock_data['Date'].iloc[0]).days for p in points]
        y_vals = [p['log_price'] for p in points]  # Use log prices for trendline fitting
        return x_vals, y_vals

    # Convert percentage to log tolerance
    log_tolerance = np.log(1 + tolerance_percent/100)

    max_iterations = 100
    iteration = 0

    while iteration < max_iterations:
        iteration += 1

        # Calculate current best-fit line using LOG PRICES
        x_vals, y_vals = points_to_xy_log(current_points)

        if len(x_vals) < 2:
            break

        # Use scipy.stats.linregress for best-fit line on LOG SCALE
        slope, intercept, r_value, p_value, std_err = stats.linregress(x_vals, y_vals)

        # Find additional points within tolerance of this best-fit line
        new_points = []
        for pivot in all_pivots:
            # Skip if already in current_points
            if pivot in current_points:
                continue

            x_pivot = (pivot['date'] - stock_data['Date'].iloc[0]).days
            expected_log_y = slope * x_pivot + intercept  # Expected LOG price
            actual_log_y = pivot['log_price']             # Actual LOG price

            # Proper log tolerance: Convert percentage tolerance to log space
            log_difference = abs(expected_log_y - actual_log_y)
            if log_difference <= log_tolerance:
                new_points.append(pivot)

        # If no new points found, we're done
        if not new_points:
            break

        # Add new points and continue iteration
        current_points.extend(new_points)

    # Final calculation with all points using LOG SCALE
    if len(current_points) >= 2:
        x_vals, y_vals = points_to_xy_log(current_points)
        slope, intercept, r_value, p_value, std_err = stats.linregress(x_vals, y_vals)
        r_squared = r_value ** 2

        # Calculate percentage growth rate from log slope
        daily_growth_rate = (np.exp(slope) - 1) * 100

        return {
            'connected_points': current_points,
            'strength': len(current_points),
            'log_slope': slope,
            'log_intercept': intercept,
            'daily_growth_rate': daily_growth_rate,
            'r_squared': r_squared,
            'iterations': iteration
        }
    else:
        return None


def detect_powerful_trendlines_log(pivots, stock_data, max_lines=30):
    """Find powerful LOG SCALE trendlines using iterative best-fit refinement with smart pair removal"""
    trendlines = []
    used_trendline_pairs = set()

    print(f"🔍 LOG SCALE iterative trendline detection with proper 2% tolerance...")

    # Create list of all possible pairs first
    all_pairs = []
    for i, pivot1 in enumerate(pivots):
        for j, pivot2 in enumerate(pivots[i+1:], i+1):
            all_pairs.append((i, j, pivot1, pivot2))

    print(f"   Created {len(all_pairs)} potential trendline pairs (no time constraints)")

    # Sort pairs by time distance to prefer longer trendlines first
    all_pairs.sort(key=lambda x: abs((x[3]['date'] - x[2]['date']).days), reverse=True)

    processed_pairs = 0
    skipped_pairs = 0

    for i, j, pivot1, pivot2 in all_pairs:
        processed_pairs += 1

        # Smart pair removal: Skip only if BOTH points are in the same existing trendline
        pair_key = tuple(sorted([i, j]))
        if pair_key in used_trendline_pairs:
            skipped_pairs += 1
            continue

        # Find iterative trendline starting with this pair using LOG SCALE
        result = find_iterative_trendline_log(pivot1, pivot2, pivots, stock_data, tolerance_percent=2.0)

        if result and result['strength'] >= 2:
            trendline = {
                'start_pivot': pivot1,
                'end_pivot': pivot2,
                'connected_points': result['connected_points'],
                'strength': result['strength'],
                'log_slope': result['log_slope'],
                'log_intercept': result['log_intercept'],
                'daily_growth_rate': result['daily_growth_rate'],
                'r_squared': result['r_squared'],
                'iterations': result['iterations'],
                'length_days': abs((pivot2['date'] - pivot1['date']).days)
            }

            trendlines.append(trendline)

            # Smart pair removal: Only remove pairs where BOTH points are in this trendline
            connected_indices = []
            for point in result['connected_points']:
                try:
                    idx = next(idx for idx, p in enumerate(pivots) if p == point)
                    connected_indices.append(idx)
                except StopIteration:
                    continue

            # Remove pairs that use ANY TWO points from this trendline's connected points
            new_removed_pairs = 0
            for pi in range(len(connected_indices)):
                for pj in range(pi + 1, len(connected_indices)):
                    pair_to_remove = tuple(sorted([connected_indices[pi], connected_indices[pj]]))
                    if pair_to_remove not in used_trendline_pairs:
                        used_trendline_pairs.add(pair_to_remove)
                        new_removed_pairs += 1

            if len(trendlines) <= 10:
                print(f"   Found LOG trendline #{len(trendlines)}: {result['strength']} points, R²={result['r_squared']:.3f}, growth={result['daily_growth_rate']:.4f}%/day, {result['iterations']} iterations")
                print(f"      Removed {new_removed_pairs} internal pairs from future searches")

            # Stop if we have enough trendlines
            if len(trendlines) >= max_lines:
                break

    # Sort by strength and R-squared
    trendlines.sort(key=lambda x: (x['strength'], x['r_squared']), reverse=True)

    # Take top max_lines
    top_trendlines = trendlines[:max_lines]

    print(f"✅ Found {len(trendlines)} valid LOG SCALE trendlines using iterative refinement")
    print(f"   Processed {processed_pairs} pairs, skipped {skipped_pairs} internal pairs")
    print(f"   Final selection: {len(top_trendlines)} trendlines")

    if top_trendlines:
        strengths = [tl['strength'] for tl in top_trendlines]
        growth_rates = [tl['daily_growth_rate'] for tl in top_trendlines]
        iterations = [tl['iterations'] for tl in top_trendlines]

        print(f"   Strength range: {min(strengths)} - {max(strengths)} connected points")
        print(f"   Average strength: {np.mean(strengths):.1f} connected points")
        print(f"   Growth rate range: {min(growth_rates):.4f}% - {max(growth_rates):.4f}% per day")
        print(f"   Average growth rate: {np.mean(growth_rates):.4f}% per day")
        print(f"   Average iterations: {np.mean(iterations):.1f}")

    return top_trendlines


def calculate_trendline_strength_log(pivot1, pivot2, all_pivots, stock_data, tolerance_percent=2.0):
    """Wrapper for backwards compatibility"""
    result = find_iterative_trendline_log(pivot1, pivot2, all_pivots, stock_data, tolerance_percent)
    if result:
        return result['strength'], result['connected_points']
    else:
        return 0, []


# Time-Weighted Trendline Analysis Functions

def calculate_time_weight(pivot_date, reference_date, half_life_days=80, min_weight=0.1):
    """
    Calculate time-based weight for a pivot point using exponential decay.
    
    Args:
        pivot_date: Date of the pivot point
        reference_date: Reference date (typically the most recent date)
        half_life_days: Number of days for weight to decay to 50%
        min_weight: Minimum weight for very old pivots
    
    Returns:
        Weight between min_weight and 1.0
    """
    days_ago = (reference_date - pivot_date).days
    
    # Exponential decay: weight = 0.5^(days_ago / half_life_days)
    decay_factor = np.exp(-days_ago * np.log(2) / half_life_days)
    
    # Ensure minimum weight
    weight = max(decay_factor, min_weight)
    
    return weight


def apply_time_weights_to_pivots(pivots, stock_data, half_life_days=80, min_weight=0.1):
    """
    Apply time-based weights to pivot points.
    
    Returns:
        List of pivots with added 'time_weight' field
    """
    if not pivots:
        return []
    
    # Use the most recent date as reference
    reference_date = stock_data['Date'].iloc[-1]
    
    weighted_pivots = []
    for pivot in pivots:
        weight = calculate_time_weight(
            pivot['date'], 
            reference_date, 
            half_life_days, 
            min_weight
        )
        
        # Create new pivot with weight
        weighted_pivot = pivot.copy()
        weighted_pivot['time_weight'] = weight
        weighted_pivots.append(weighted_pivot)
    
    return weighted_pivots


def find_weighted_iterative_trendline_log(pivot1, pivot2, all_pivots, stock_data, 
                                        tolerance_percent=2.0, weight_factor=2.0):
    """
    Enhanced version of find_iterative_trendline_log with time weighting.
    
    Args:
        weight_factor: How much to amplify the effect of time weights (2.0 = double impact)
    """
    # Start with the initial two points
    current_points = [pivot1, pivot2]
    
    # Convert to numerical format for calculations using LOG SCALE
    def points_to_xy_log_weighted(points):
        x_vals = [(p['date'] - stock_data['Date'].iloc[0]).days for p in points]
        y_vals = [p['log_price'] for p in points]
        weights = [p.get('time_weight', 1.0) ** weight_factor for p in points]
        return x_vals, y_vals, weights
    
    # Convert percentage to log tolerance
    log_tolerance = np.log(1 + tolerance_percent/100)
    
    max_iterations = 100
    iteration = 0
    
    while iteration < max_iterations:
        iteration += 1
        
        # Calculate weighted best-fit line using LOG PRICES
        x_vals, y_vals, weights = points_to_xy_log_weighted(current_points)
        
        if len(x_vals) < 2:
            break
        
        # Use weighted linear regression
        try:
            # Calculate weighted least squares manually
            weights = np.array(weights)
            x_vals = np.array(x_vals)
            y_vals = np.array(y_vals)
            
            # Weighted means
            sum_w = np.sum(weights)
            mean_x = np.sum(weights * x_vals) / sum_w
            mean_y = np.sum(weights * y_vals) / sum_w
            
            # Weighted slope and intercept
            numerator = np.sum(weights * (x_vals - mean_x) * (y_vals - mean_y))
            denominator = np.sum(weights * (x_vals - mean_x) ** 2)
            
            if denominator == 0:
                break
                
            slope = numerator / denominator
            intercept = mean_y - slope * mean_x
            
            # Calculate weighted R-squared
            y_pred = slope * x_vals + intercept
            ss_res = np.sum(weights * (y_vals - y_pred) ** 2)
            ss_tot = np.sum(weights * (y_vals - mean_y) ** 2)
            r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            
        except:
            # Fallback to unweighted if weighted calculation fails
            slope, intercept, r_value, p_value, std_err = stats.linregress(x_vals, y_vals)
            r_squared = r_value ** 2
        
        # Find additional points within tolerance of this best-fit line
        new_points = []
        for pivot in all_pivots:
            # Skip if already in current_points
            if pivot in current_points:
                continue
            
            x_pivot = (pivot['date'] - stock_data['Date'].iloc[0]).days
            expected_log_y = slope * x_pivot + intercept
            actual_log_y = pivot['log_price']
            
            # Apply time weighting to tolerance - more recent points get stricter tolerance
            pivot_weight = pivot.get('time_weight', 1.0)
            adjusted_tolerance = log_tolerance * (2.0 - pivot_weight)  # Recent points: tighter tolerance
            
            log_difference = abs(expected_log_y - actual_log_y)
            if log_difference <= adjusted_tolerance:
                new_points.append(pivot)
        
        # If no new points found, we're done
        if not new_points:
            break
        
        # Add new points and continue iteration
        current_points.extend(new_points)
    
    # Final weighted calculation with all points
    if len(current_points) >= 2:
        x_vals, y_vals, weights = points_to_xy_log_weighted(current_points)
        
        try:
            # Final weighted calculation
            weights = np.array(weights)
            x_vals = np.array(x_vals)
            y_vals = np.array(y_vals)
            
            sum_w = np.sum(weights)
            mean_x = np.sum(weights * x_vals) / sum_w
            mean_y = np.sum(weights * y_vals) / sum_w
            
            numerator = np.sum(weights * (x_vals - mean_x) * (y_vals - mean_y))
            denominator = np.sum(weights * (x_vals - mean_x) ** 2)
            
            slope = numerator / denominator
            intercept = mean_y - slope * mean_x
            
            # Calculate R-squared
            y_pred = slope * x_vals + intercept
            ss_res = np.sum(weights * (y_vals - y_pred) ** 2)
            ss_tot = np.sum(weights * (y_vals - mean_y) ** 2)
            r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0
            
        except:
            slope, intercept, r_value, p_value, std_err = stats.linregress(x_vals, y_vals)
            r_squared = r_value ** 2
        
        # Calculate percentage growth rate from log slope
        daily_growth_rate = (np.exp(slope) - 1) * 100
        
        # Calculate weighted strength (sum of weights instead of count)
        weighted_strength = sum([p.get('time_weight', 1.0) for p in current_points])
        
        return {
            'connected_points': current_points,
            'strength': len(current_points),  # Traditional strength
            'weighted_strength': weighted_strength,  # Time-weighted strength
            'log_slope': slope,
            'log_intercept': intercept,
            'daily_growth_rate': daily_growth_rate,
            'r_squared': r_squared,
            'iterations': iteration,
            'average_weight': weighted_strength / len(current_points)  # Average time weight
        }
    else:
        return None


def detect_time_weighted_trendlines_log(pivots, stock_data, max_lines=30, 
                                      half_life_days=80, min_weight=0.1, weight_factor=2.0):
    """Enhanced trendline detection with time weighting and recent pivot prioritization"""
    
    # Apply time weights to pivots
    weighted_pivots = apply_time_weights_to_pivots(pivots, stock_data, half_life_days, min_weight)
    
    trendlines = []
    used_trendline_pairs = set()
    
    print(f"🔍 Time-weighted LOG SCALE trendline detection...")
    print(f"   Half-life: {half_life_days} days, weight factor: {weight_factor:.1f}x")
    
    # Create list of all possible pairs
    all_pairs = []
    for i, pivot1 in enumerate(weighted_pivots):
        for j, pivot2 in enumerate(weighted_pivots[i+1:], i+1):
            # Calculate pair priority based on:
            # 1. Combined time weight (favor recent pivots)
            # 2. Time span (favor longer trendlines)
            combined_weight = (pivot1.get('time_weight', 1.0) + pivot2.get('time_weight', 1.0)) / 2
            time_span = abs((pivot2['date'] - pivot1['date']).days)
            
            # Priority score: combine weight and time span
            priority_score = combined_weight * 0.7 + (time_span / 365) * 0.3
            
            all_pairs.append((i, j, pivot1, pivot2, priority_score))
    
    print(f"   Created {len(all_pairs)} potential trendline pairs")
    
    # Sort pairs by priority score (high weight + long span first)
    all_pairs.sort(key=lambda x: x[4], reverse=True)
    
    processed_pairs = 0
    skipped_pairs = 0
    
    for i, j, pivot1, pivot2, priority_score in all_pairs:
        processed_pairs += 1
        
        # Smart pair removal: Skip if both points already used
        pair_key = tuple(sorted([i, j]))
        if pair_key in used_trendline_pairs:
            skipped_pairs += 1
            continue
        
        # Find weighted iterative trendline
        result = find_weighted_iterative_trendline_log(
            pivot1, pivot2, weighted_pivots, stock_data, 
            tolerance_percent=2.0, weight_factor=weight_factor
        )
        
        if result and result['strength'] >= 2:
            trendline = {
                'start_pivot': pivot1,
                'end_pivot': pivot2,
                'connected_points': result['connected_points'],
                'strength': result['strength'],
                'weighted_strength': result['weighted_strength'],
                'average_weight': result['average_weight'],
                'log_slope': result['log_slope'],
                'log_intercept': result['log_intercept'],
                'daily_growth_rate': result['daily_growth_rate'],
                'r_squared': result['r_squared'],
                'iterations': result['iterations'],
                'length_days': abs((pivot2['date'] - pivot1['date']).days),
                'priority_score': priority_score
            }
            
            trendlines.append(trendline)
            
            # Remove used pairs
            connected_indices = []
            for point in result['connected_points']:
                try:
                    idx = next(idx for idx, p in enumerate(weighted_pivots) if p == point)
                    connected_indices.append(idx)
                except StopIteration:
                    continue
            
            new_removed_pairs = 0
            for pi in range(len(connected_indices)):
                for pj in range(pi + 1, len(connected_indices)):
                    pair_to_remove = tuple(sorted([connected_indices[pi], connected_indices[pj]]))
                    if pair_to_remove not in used_trendline_pairs:
                        used_trendline_pairs.add(pair_to_remove)
                        new_removed_pairs += 1
            
            if len(trendlines) <= 10:
                print(f"   Found weighted trendline #{len(trendlines)}: {result['strength']} points, "
                      f"weighted_strength={result['weighted_strength']:.2f}, "
                      f"avg_weight={result['average_weight']:.3f}, "
                      f"growth={result['daily_growth_rate']:.4f}%/day")
            
            # Stop if we have enough trendlines
            if len(trendlines) >= max_lines:
                break
    
    # Sort by weighted strength and R-squared
    trendlines.sort(key=lambda x: (x['weighted_strength'], x['r_squared']), reverse=True)
    
    # Take top trendlines
    top_trendlines = trendlines[:max_lines]
    
    print(f"\n✅ Found {len(trendlines)} valid time-weighted trendlines")
    print(f"   Processed {processed_pairs} pairs, skipped {skipped_pairs} used pairs")
    print(f"   Final selection: {len(top_trendlines)} trendlines")
    
    if top_trendlines:
        strengths = [tl['strength'] for tl in top_trendlines]
        weighted_strengths = [tl['weighted_strength'] for tl in top_trendlines]
        avg_weights = [tl['average_weight'] for tl in top_trendlines]
        growth_rates = [tl['daily_growth_rate'] for tl in top_trendlines]
        
        print(f"\n📊 Time-Weighted Results:")
        print(f"   Traditional strength: {min(strengths)} - {max(strengths)} points")
        print(f"   Weighted strength: {min(weighted_strengths):.2f} - {max(weighted_strengths):.2f}")
        print(f"   Average pivot weight: {min(avg_weights):.3f} - {max(avg_weights):.3f}")
        print(f"   Growth rate range: {min(growth_rates):.4f}% - {max(growth_rates):.4f}% per day")
    
    return top_trendlines