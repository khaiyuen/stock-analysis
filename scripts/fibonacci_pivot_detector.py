#!/usr/bin/env python3
"""
Fibonacci Pivot Detection Module

Advanced pivot detection specifically designed for Fibonacci analysis with maximum sensitivity.
Ensures proper alternating high-low sequences for accurate Fibonacci retracement calculations.

Features:
- Maximum-sensitivity detection (5-day lookback, 0.05% strength threshold)
- Price validation rules for proper alternating sequences
- Relaxed tolerance for edge cases
- Professional chart visualization with enhanced labeling

Author: Claude Code
Created: September 2025
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')


def detect_fibonacci_pivots(stock_data, lookback_window=5, min_strength=0.0005, trend_confirmation=1):
    """
    MAXIMUM-SENSITIVITY Fibonacci pivot detection to capture every significant turning point.

    Key Features:
    1. Ensures proper alternating high-low sequences with price validation
    2. Next low must be lower than current high (and vice versa) with tolerance
    3. Captures ALL significant turning points for comprehensive Fibonacci analysis
    4. Maximum-sensitivity parameters for complete detection

    Args:
        stock_data (DataFrame): DataFrame with Date, Price, Volume columns
        lookback_window (int): Days to look back/forward for local extremes (default: 5)
        min_strength (float): Minimum strength score for pivot validation (default: 0.0005)
        trend_confirmation (int): Days needed to confirm trend change (default: 1)

    Returns:
        list: List of alternating pivot dictionaries with price validation
    """

    if len(stock_data) < lookback_window * 2:
        return []

    prices = stock_data['Price'].values
    dates = stock_data['Date'].values
    volumes = stock_data['Volume'].values
    indices = stock_data.index.values

    # Step 1: Identify potential pivot points using maximum-sensitivity rolling extremes
    potential_pivots = []

    for i in range(lookback_window, len(prices) - lookback_window):
        current_price = prices[i]
        current_date = dates[i]
        current_volume = volumes[i]
        current_index = indices[i]

        # Maximum-sensitivity lookback and forward windows
        lookback_prices = prices[i-lookback_window:i]
        forward_prices = prices[i+1:i+lookback_window+1]

        # Maximum-sensitivity local extreme detection - even for tiny moves
        is_high = (current_price >= np.max(lookback_prices) and
                  current_price >= np.max(forward_prices))

        is_low = (current_price <= np.min(lookback_prices) and
                 current_price <= np.min(forward_prices))

        if is_high or is_low:
            # Calculate pivot strength based on price dominance
            if is_high:
                strength = (current_price - np.min(lookback_prices)) / current_price
                pivot_type = 'high'
            else:
                strength = (np.max(lookback_prices) - current_price) / current_price
                pivot_type = 'low'

            # Maximum-lenient strength requirement to catch every pivot
            if strength >= min_strength:
                potential_pivots.append({
                    'index': current_index,
                    'date': current_date,
                    'price': current_price,
                    'volume': current_volume,
                    'type': pivot_type,
                    'strength': strength,
                    'log_price': np.log(current_price)
                })

    if len(potential_pivots) < 2:
        return potential_pivots

    # Step 2: Filter for alternating high-low sequences with relaxed price validation
    fibonacci_pivots = []
    last_pivot_type = None

    # Sort by date
    potential_pivots.sort(key=lambda x: x['date'])

    for pivot in potential_pivots:
        # Ensure alternating sequence
        if last_pivot_type is None or pivot['type'] != last_pivot_type:

            # Relaxed price validation rule (to catch more edge cases)
            if len(fibonacci_pivots) > 0:
                last_pivot = fibonacci_pivots[-1]
                
                # Handle datetime differences safely
                time_diff = pivot['date'] - last_pivot['date']
                if hasattr(time_diff, 'days'):
                    days_between = time_diff.days
                else:
                    days_between = int(time_diff / pd.Timedelta(days=1))

                # Apply relaxed price rules (allow small violations for edge cases)
                price_rule_valid = True
                price_tolerance = 0.001  # Allow 0.1% tolerance for near-equal prices
                
                if last_pivot['type'] == 'high' and pivot['type'] == 'low':
                    # Next low should be lower than current high (with small tolerance)
                    if pivot['price'] > last_pivot['price'] * (1 + price_tolerance):
                        price_rule_valid = False
                elif last_pivot['type'] == 'low' and pivot['type'] == 'high':
                    # Next high should be higher than current low (with small tolerance)
                    if pivot['price'] < last_pivot['price'] * (1 - price_tolerance):
                        price_rule_valid = False

                # Maximum-lenient time requirement AND relaxed price validation
                if days_between >= trend_confirmation and price_rule_valid:
                    fibonacci_pivots.append(pivot)
                    last_pivot_type = pivot['type']
                elif not price_rule_valid and pivot['strength'] > 0.01:  # Allow strong pivots even with price violations
                    fibonacci_pivots.append(pivot)
                    last_pivot_type = pivot['type']
                else:
                    # Replace last pivot if this one is stronger
                    if pivot['strength'] > fibonacci_pivots[-1]['strength'] * 0.9:  # Very lenient replacement
                        fibonacci_pivots[-1] = pivot
            else:
                # First pivot - always accept
                fibonacci_pivots.append(pivot)
                last_pivot_type = pivot['type']

    # Step 3: Minimal cleanup - only remove very obvious duplicates
    cleaned_pivots = []

    for i, pivot in enumerate(fibonacci_pivots):
        should_keep = True

        # Look for nearby pivots of the same type within a very small window
        for j, other_pivot in enumerate(fibonacci_pivots):
            if (i != j and
                pivot['type'] == other_pivot['type']):
                
                # Handle datetime differences safely
                time_diff = pivot['date'] - other_pivot['date']
                if hasattr(time_diff, 'days'):
                    days_diff = abs(time_diff.days)
                else:
                    days_diff = abs(int(time_diff / pd.Timedelta(days=1)))
                
                # Only remove if very close in time (within 3 days) and clearly inferior
                if days_diff <= 3:
                    # Keep the stronger pivot, or if strengths are similar, keep the more extreme price
                    if pivot['type'] == 'high':
                        if (other_pivot['strength'] > pivot['strength'] * 1.3 or
                            (abs(other_pivot['strength'] - pivot['strength']) < 0.0003 and other_pivot['price'] > pivot['price'] * 1.005)):
                            should_keep = False
                            break
                    else:  # low
                        if (other_pivot['strength'] > pivot['strength'] * 1.3 or
                            (abs(other_pivot['strength'] - pivot['strength']) < 0.0003 and other_pivot['price'] < pivot['price'] * 0.995)):
                            should_keep = False
                            break

        if should_keep:
            cleaned_pivots.append(pivot)

    # Step 4: Final alternating sequence with very relaxed price validation
    final_pivots = []
    last_type = None
    last_price = None

    for pivot in sorted(cleaned_pivots, key=lambda x: x['date']):
        if last_type is None or pivot['type'] != last_type:
            
            # Very relaxed final price validation check
            valid_sequence = True
            if last_type is not None and last_price is not None:
                tolerance = 0.002  # 0.2% tolerance for final validation
                
                if last_type == 'high' and pivot['type'] == 'low':
                    # Low should be lower than previous high (with tolerance)
                    if pivot['price'] > last_price * (1 + tolerance):
                        # Still add if it's a strong pivot
                        if pivot['strength'] < 0.005:  # Only reject if very weak
                            valid_sequence = False
                elif last_type == 'low' and pivot['type'] == 'high':
                    # High should be higher than previous low (with tolerance)
                    if pivot['price'] < last_price * (1 - tolerance):
                        # Still add if it's a strong pivot
                        if pivot['strength'] < 0.005:  # Only reject if very weak
                            valid_sequence = False
            
            if valid_sequence:
                final_pivots.append(pivot)
                last_type = pivot['type']
                last_price = pivot['price']

    return final_pivots


def create_fibonacci_swings(fibonacci_pivots):
    """
    Create swing analysis from Fibonacci pivots for trend analysis.
    Ensures proper alternating high-low sequences for Fibonacci calculations.
    
    Args:
        fibonacci_pivots (list): List of pivot dictionaries from detect_fibonacci_pivots
        
    Returns:
        list: List of swing dictionaries ready for Fibonacci analysis
    """
    if len(fibonacci_pivots) < 2:
        return []

    swings = []

    for i in range(len(fibonacci_pivots) - 1):
        start_pivot = fibonacci_pivots[i]
        end_pivot = fibonacci_pivots[i + 1]

        # Verify we have proper alternating sequence
        if ((start_pivot['type'] == 'high' and end_pivot['type'] == 'low') or
            (start_pivot['type'] == 'low' and end_pivot['type'] == 'high')):

            # Calculate swing metrics
            price_move = end_pivot['price'] - start_pivot['price']
            log_price_move = end_pivot['log_price'] - start_pivot['log_price']
            percentage_move = (np.exp(log_price_move) - 1) * 100
            
            # Handle datetime differences safely
            time_diff = end_pivot['date'] - start_pivot['date']
            if hasattr(time_diff, 'days'):
                duration_days = time_diff.days
            else:
                duration_days = int(time_diff / pd.Timedelta(days=1))

            # Determine swing type
            if start_pivot['type'] == 'high' and end_pivot['type'] == 'low':
                swing_type = 'downtrend'
            else:
                swing_type = 'uptrend'

            # Calculate swing strength (combination of price move and pivot strengths)
            strength = (abs(percentage_move) / 100) * np.sqrt(start_pivot['strength'] + end_pivot['strength'])

            swing = {
                'swing_id': i + 1,
                'start_pivot': start_pivot,
                'end_pivot': end_pivot,
                'swing_type': swing_type,
                'price_move': price_move,
                'percentage_move': percentage_move,
                'duration_days': duration_days,
                'start_date': start_pivot['date'],
                'end_date': end_pivot['date'],
                'strength': strength,
                'fibonacci_ready': True  # Mark as ready for Fibonacci analysis
            }

            swings.append(swing)

    return swings


def plot_fibonacci_pivots(stock_data, fibonacci_pivots, fibonacci_swings, symbol='STOCK', figsize=(20, 16)):
    """
    Create professional Fibonacci pivot verification chart with crystal clear labeling.
    
    Args:
        stock_data (DataFrame): Stock price data with Date, Price, Volume columns
        fibonacci_pivots (list): List of pivot dictionaries
        fibonacci_swings (list): List of swing dictionaries
        symbol (str): Stock symbol for chart title
        figsize (tuple): Figure size (width, height)
        
    Returns:
        matplotlib.figure.Figure: The created figure
    """
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=figsize,
                                   gridspec_kw={'height_ratios': [3, 1], 'hspace': 0.1})

    # Main price chart
    dates = stock_data['Date']
    prices = stock_data['Price']

    # Plot price line
    ax1.plot(dates, prices, 'k-', linewidth=1.8, alpha=0.8, label=f'{symbol} Price', zorder=2)

    # Plot Fibonacci pivots with enhanced visibility
    if fibonacci_pivots:
        highs = [p for p in fibonacci_pivots if p['type'] == 'high']
        lows = [p for p in fibonacci_pivots if p['type'] == 'low']

        if highs:
            high_dates = [p['date'] for p in highs]
            high_prices = [p['price'] for p in highs]
            high_strengths = [p['strength'] for p in highs]

            # Larger, more visible markers
            high_sizes = [120 + s * 400 for s in high_strengths]

            ax1.scatter(high_dates, high_prices,
                       c='darkred', marker='^', s=high_sizes,
                       alpha=0.95, edgecolors='red', linewidth=3,
                       label=f'Fibonacci Highs ({len(highs)})', zorder=6)

            # Enhanced labels with better positioning and styling
            for i, (date, price, strength) in enumerate(zip(high_dates, high_prices, high_strengths)):
                # Find the position in the full sequence
                pivot_index = next(j for j, p in enumerate(fibonacci_pivots) if p['date'] == date and p['price'] == price)
                
                # Enhanced label with better contrast and positioning
                label_text = f'P{pivot_index+1}\n{strength*100:.1f}%'
                
                ax1.annotate(label_text, (date, price), 
                           xytext=(0, 25), textcoords='offset points', 
                           fontsize=9, fontweight='bold', ha='center',
                           color='white', zorder=8,
                           bbox=dict(boxstyle='round,pad=0.4', facecolor='darkred', 
                                   alpha=0.85, edgecolor='white', linewidth=1))

        if lows:
            low_dates = [p['date'] for p in lows]
            low_prices = [p['price'] for p in lows]
            low_strengths = [p['strength'] for p in lows]

            # Larger, more visible markers
            low_sizes = [120 + s * 400 for s in low_strengths]

            ax1.scatter(low_dates, low_prices,
                       c='darkgreen', marker='v', s=low_sizes,
                       alpha=0.95, edgecolors='green', linewidth=3,
                       label=f'Fibonacci Lows ({len(lows)})', zorder=6)

            # Enhanced labels with better positioning and styling
            for i, (date, price, strength) in enumerate(zip(low_dates, low_prices, low_strengths)):
                # Find the position in the full sequence
                pivot_index = next(j for j, p in enumerate(fibonacci_pivots) if p['date'] == date and p['price'] == price)
                
                # Enhanced label with better contrast and positioning
                label_text = f'P{pivot_index+1}\n{strength*100:.1f}%'
                
                ax1.annotate(label_text, (date, price), 
                           xytext=(0, -30), textcoords='offset points', 
                           fontsize=9, fontweight='bold', ha='center',
                           color='white', zorder=8,
                           bbox=dict(boxstyle='round,pad=0.4', facecolor='darkgreen', 
                                   alpha=0.85, edgecolor='white', linewidth=1))

    # Draw Fibonacci swing lines with cleaner styling
    if fibonacci_swings:
        for swing in fibonacci_swings:
            start_date = swing['start_date']
            end_date = swing['end_date']
            start_price = swing['start_pivot']['price']
            end_price = swing['end_pivot']['price']

            # Enhanced swing line styling
            if swing['swing_type'] == 'uptrend':
                color = 'blue'
                alpha = 0.7
            else:
                color = 'orange'
                alpha = 0.7

            # Dynamic line width based on swing strength
            line_width = max(2.5, min(5, 2.5 + swing['strength'] * 2))

            ax1.plot([start_date, end_date], [start_price, end_price],
                    color=color, linewidth=line_width, alpha=alpha,
                    linestyle='-', zorder=4)

            # Enhanced swing labels with better positioning
            mid_date = start_date + (end_date - start_date) / 2
            mid_price = (start_price + end_price) / 2
            move_pct = swing['percentage_move']
            
            # More readable swing labels with better contrast
            swing_label = f"S{swing['swing_id']}\n{move_pct:+.1f}%\n{swing['duration_days']}d"

            ax1.annotate(swing_label, (mid_date, mid_price),
                       bbox=dict(boxstyle='round,pad=0.5', facecolor=color, alpha=0.85,
                               edgecolor='white', linewidth=1.5),
                       fontsize=8, fontweight='bold', ha='center',
                       color='white', zorder=7)

    # Current price line with enhanced visibility
    current_price = prices.iloc[-1]
    ax1.axhline(y=current_price, color='purple', linewidth=2.5, alpha=0.9,
               linestyle='--', label=f'Current: ${current_price:.2f}', zorder=3)

    # Enhanced title with comprehensive information
    swing_count = len(fibonacci_swings) if fibonacci_swings else 0
    pivot_count = len(fibonacci_pivots) if fibonacci_pivots else 0

    # Check sequence quality
    if fibonacci_pivots:
        sequence = [p['type'][0].upper() for p in fibonacci_pivots]
        is_alternating = all(sequence[i] != sequence[i+1] for i in range(len(sequence)-1))
        sequence_status = "✅ Perfect Alternating" if is_alternating else "⚠️ Non-alternating"
        sequence_preview = ''.join(sequence[:20]) + ('...' if len(sequence) > 20 else '')
    else:
        sequence_status = ""
        sequence_preview = ""

    ax1.set_title(f'{symbol} MAXIMUM-SENSITIVITY Fibonacci Pivot Detection\n'
                  f'🎯 {pivot_count} Fibonacci Pivots → {swing_count} Swings | {sequence_status}\n'
                  f'Sequence: {sequence_preview} | 5d lookback, 0.05% strength, 1d confirmation',
                  fontsize=14, fontweight='bold', pad=30, color='black')

    ax1.set_ylabel('Price ($)', fontsize=13, fontweight='bold')
    ax1.legend(bbox_to_anchor=(1.02, 1), loc='upper left', fontsize=10)
    ax1.grid(True, alpha=0.3, linestyle='-', linewidth=0.5)
    
    # Enhanced axis formatting
    ax1.tick_params(axis='both', which='major', labelsize=10)

    # Enhanced volume chart with better pivot highlighting
    ax2.bar(dates, stock_data['Volume'], alpha=0.6, color='gray', width=1)

    # Highlight volume at Fibonacci pivots with enhanced visibility
    if fibonacci_pivots:
        for pivot in fibonacci_pivots:
            pivot_idx = pivot['index']
            if pivot_idx < len(stock_data):
                pivot_date = pivot['date']
                pivot_volume = pivot['volume']
                pivot_strength = pivot['strength']

                # Enhanced color intensity based on pivot strength
                if pivot['type'] == 'high':
                    bar_color = 'red'
                    bar_alpha = min(0.95, 0.6 + pivot_strength * 3)
                else:
                    bar_color = 'green'
                    bar_alpha = min(0.95, 0.6 + pivot_strength * 3)

                ax2.bar(pivot_date, pivot_volume, color=bar_color, alpha=bar_alpha, width=1)

    ax2.set_ylabel('Volume', fontsize=11, fontweight='bold')
    ax2.set_xlabel('Date', fontsize=13, fontweight='bold')
    ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x/1e6:.1f}M'))

    # Synchronize x-axis
    ax1.sharex(ax2)

    # Enhanced date formatting
    ax2.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m'))
    ax2.xaxis.set_major_locator(mdates.MonthLocator(interval=2))
    plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45, fontsize=10)

    plt.tight_layout()
    return fig


def validate_pivot_sequence(fibonacci_pivots, tolerance=0.002):
    """
    Validate the price rules and alternating sequence of detected pivots.
    
    Args:
        fibonacci_pivots (list): List of pivot dictionaries
        tolerance (float): Price tolerance for validation (default: 0.2%)
        
    Returns:
        dict: Validation results with statistics
    """
    if len(fibonacci_pivots) < 2:
        return {'valid': True, 'violations': 0, 'alternating': True}
    
    # Check alternating sequence
    sequence = [p['type'][0].upper() for p in fibonacci_pivots]
    is_alternating = all(sequence[i] != sequence[i+1] for i in range(len(sequence)-1))
    
    # Check price validation rules with tolerance
    price_violations = 0
    for i in range(1, len(fibonacci_pivots)):
        prev_pivot = fibonacci_pivots[i-1]
        curr_pivot = fibonacci_pivots[i]
        
        if prev_pivot['type'] == 'high' and curr_pivot['type'] == 'low':
            if curr_pivot['price'] > prev_pivot['price'] * (1 + tolerance):
                price_violations += 1
        elif prev_pivot['type'] == 'low' and curr_pivot['type'] == 'high':
            if curr_pivot['price'] < prev_pivot['price'] * (1 - tolerance):
                price_violations += 1
    
    return {
        'valid': price_violations == 0,
        'violations': price_violations,
        'alternating': is_alternating,
        'sequence': ''.join(sequence),
        'total_pivots': len(fibonacci_pivots),
        'validation_rate': (len(fibonacci_pivots) - price_violations) / len(fibonacci_pivots) * 100
    }


def calculate_time_weight(pivot_date, reference_date, half_life_days=80, min_weight=0.1):
    """
    Calculate time-based weight for a pivot point using exponential decay.
    Useful for time-weighted Fibonacci analysis.
    
    Args:
        pivot_date: Date of the pivot point
        reference_date: Reference date (usually current date)
        half_life_days (int): Half-life for exponential decay (default: 80)
        min_weight (float): Minimum weight threshold (default: 0.1)
        
    Returns:
        float: Weight value between min_weight and 1.0
    """
    # Handle datetime differences safely
    time_diff = reference_date - pivot_date
    if hasattr(time_diff, 'days'):
        days_ago = time_diff.days
    else:
        days_ago = int(time_diff / pd.Timedelta(days=1))
    
    decay_factor = np.exp(-days_ago * np.log(2) / half_life_days)
    weight = max(decay_factor, min_weight)
    return weight


def analyze_fibonacci_pivots(stock_data, **kwargs):
    """
    Complete Fibonacci pivot analysis workflow.
    
    Args:
        stock_data (DataFrame): Stock data with Date, Price, Volume columns
        **kwargs: Additional parameters for detect_fibonacci_pivots
        
    Returns:
        dict: Complete analysis results
    """
    # Ensure LogPrice column exists
    if 'LogPrice' not in stock_data.columns:
        stock_data = stock_data.copy()
        stock_data['LogPrice'] = np.log(stock_data['Price'])
    
    # Detect pivots
    pivots = detect_fibonacci_pivots(stock_data, **kwargs)
    
    # Create swings
    swings = create_fibonacci_swings(pivots)
    
    # Validate sequence
    validation = validate_pivot_sequence(pivots)
    
    # Calculate statistics
    if pivots:
        strengths = [p['strength'] for p in pivots]
        highs = [p for p in pivots if p['type'] == 'high']
        lows = [p for p in pivots if p['type'] == 'low']
        
        stats = {
            'total_pivots': len(pivots),
            'highs': len(highs),
            'lows': len(lows),
            'total_swings': len(swings),
            'avg_strength': np.mean(strengths),
            'strength_range': (min(strengths), max(strengths)),
            'date_range': (pivots[0]['date'], pivots[-1]['date'])
        }
    else:
        stats = {
            'total_pivots': 0,
            'highs': 0,
            'lows': 0,
            'total_swings': 0,
            'avg_strength': 0,
            'strength_range': (0, 0),
            'date_range': (None, None)
        }
    
    return {
        'pivots': pivots,
        'swings': swings,
        'validation': validation,
        'statistics': stats
    }


if __name__ == "__main__":
    print("📈 Fibonacci Pivot Detection Module")
    print("=" * 50)
    print("Maximum-sensitivity pivot detection for Fibonacci analysis")
    print("\nKey Functions:")
    print("- detect_fibonacci_pivots(): Core pivot detection algorithm")
    print("- create_fibonacci_swings(): Generate swing analysis")
    print("- plot_fibonacci_pivots(): Professional chart visualization")
    print("- analyze_fibonacci_pivots(): Complete analysis workflow")
    print("- validate_pivot_sequence(): Sequence validation")