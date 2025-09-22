"""
High Volume Anchored VWAP Analysis Module

This module provides functionality to calculate Anchored VWAP from the highest volume trading days,
focusing on institutional activity and smart money positioning.

Key Features:
- AVWAP calculation from top volume days
- Volume-based anchor significance scoring
- Institutional activity analysis
- Clean visualization without bands
- Comprehensive smart money flow analysis

Author: AI Assistant
Created: 2025
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple


class HighVolumeAnchoredVWAP:
    """
    Anchored VWAP calculator for high volume days
    """

    def __init__(self, anchor_date: datetime, anchor_data: Dict[str, Any]):
        """
        Initialize the AVWAP calculator

        Args:
            anchor_date: Date of the high volume anchor
            anchor_data: Dictionary containing anchor day information
        """
        self.anchor_date = anchor_date
        self.anchor_data = anchor_data

    def calculate_vwap_from_anchor(self, stock_data: pd.DataFrame, anchor_index: int) -> List[Dict[str, Any]]:
        """
        Calculate VWAP from high volume anchor point forward

        Args:
            stock_data: DataFrame with OHLCV data
            anchor_index: Index of anchor day in stock_data

        Returns:
            List of dictionaries with VWAP calculations for each day
        """
        vwap_data = []
        cumulative_volume = 0
        cumulative_vt = 0

        for i in range(anchor_index, len(stock_data)):
            row = stock_data.iloc[i]

            # Add current bar to cumulative calculations
            cumulative_volume += row['Volume']
            cumulative_vt += row['VolumeTypical']

            # Calculate VWAP
            if cumulative_volume > 0:
                vwap = cumulative_vt / cumulative_volume
            else:
                vwap = row['TypicalPrice']

            # Calculate deviation of current price from VWAP
            price_deviation = (row['Price'] - vwap) / vwap * 100 if vwap > 0 else 0

            vwap_data.append({
                'date': row['Date'],
                'vwap': vwap,
                'price_deviation': price_deviation,
                'cumulative_volume': cumulative_volume,
                'current_price': row['Price']
            })

        return vwap_data


def identify_high_volume_anchors(
    stock_data: pd.DataFrame,
    top_volume_days: int = 30,
    min_days_after_anchor: int = 5,
    volume_percentile_threshold: int = 80
) -> List[Dict[str, Any]]:
    """
    Identify highest volume days as VWAP anchors

    Args:
        stock_data: DataFrame with OHLCV data
        top_volume_days: Number of highest volume days to use as anchors
        min_days_after_anchor: Minimum days after anchor for meaningful VWAP
        volume_percentile_threshold: Only consider days above this volume percentile

    Returns:
        List of volume anchor dictionaries
    """
    # Calculate volume statistics
    volume_percentile_threshold_value = np.percentile(stock_data['Volume'], volume_percentile_threshold)
    avg_volume = stock_data['Volume'].mean()

    # Filter for high volume days and sort by volume
    high_volume_data = stock_data[stock_data['Volume'] >= volume_percentile_threshold_value].copy()
    high_volume_data = high_volume_data.sort_values('Volume', ascending=False)

    # Select top volume days that have enough data after them for VWAP calculation
    volume_anchors = []
    max_date = stock_data['Date'].max()

    for idx, row in high_volume_data.iterrows():
        # Check if there are enough days after this date for VWAP calculation
        days_after = (max_date - row['Date']).days

        if days_after >= min_days_after_anchor:
            volume_anchors.append({
                'date': row['Date'],
                'price': row['Price'],
                'typical_price': row['TypicalPrice'],
                'volume': row['Volume'],
                'high': row['High'],
                'low': row['Low'],
                'open': row.get('Open', row['Price']),  # Handle missing Open
                'volume_ratio': row['Volume'] / avg_volume,
                'days_after': days_after,
                'index': idx
            })

            if len(volume_anchors) >= top_volume_days:
                break

    return volume_anchors


def analyze_volume_anchor_significance(
    volume_anchors: List[Dict[str, Any]],
    stock_data: pd.DataFrame
) -> List[Dict[str, Any]]:
    """
    Analyze the significance of volume anchor days

    Args:
        volume_anchors: List of volume anchor dictionaries
        stock_data: DataFrame with OHLCV data

    Returns:
        Sorted list of volume anchors with significance scores
    """
    for i, anchor in enumerate(volume_anchors):
        anchor_date = anchor['date']

        # Find price movement on anchor day
        anchor_row = stock_data[stock_data['Date'] == anchor_date]
        if len(anchor_row) > 0:
            anchor_row = anchor_row.iloc[0]
            day_range = ((anchor_row['High'] - anchor_row['Low']) / anchor_row['Price']) * 100

            # Check if it was a gap day (if Open data available)
            if 'Open' in anchor_row and anchor_row['Open'] > 0:
                # Find previous day's close
                prev_data = stock_data[stock_data['Date'] < anchor_date]
                if len(prev_data) > 0:
                    prev_close = prev_data['Price'].iloc[-1]
                    gap_percent = ((anchor_row['Open'] - prev_close) / prev_close) * 100
                else:
                    gap_percent = 0
            else:
                gap_percent = 0

            anchor['day_range_percent'] = day_range
            anchor['gap_percent'] = gap_percent
            anchor['significance_score'] = (
                anchor['volume_ratio'] * 0.4 +  # Volume weight
                abs(gap_percent) * 0.3 +  # Gap significance
                day_range * 0.3  # Intraday volatility
            )

    # Sort by significance score
    volume_anchors.sort(key=lambda x: x.get('significance_score', 0), reverse=True)

    return volume_anchors


def calculate_high_volume_vwaps(
    stock_data: pd.DataFrame,
    volume_anchors: List[Dict[str, Any]],
    min_days_after_anchor: int = 5
) -> Dict[str, Dict[str, Any]]:
    """
    Calculate AVWAP for all high volume anchor days

    Args:
        stock_data: DataFrame with OHLCV data
        volume_anchors: List of volume anchor dictionaries
        min_days_after_anchor: Minimum days after anchor for meaningful VWAP

    Returns:
        Dictionary of VWAP results keyed by anchor name
    """
    volume_vwap_results = {}

    for i, anchor in enumerate(volume_anchors):
        anchor_date = anchor['date']

        # Find anchor index in stock data
        anchor_index = stock_data[stock_data['Date'] == anchor_date].index

        if len(anchor_index) > 0:
            anchor_idx = anchor_index[0]

            # Only calculate if we have enough data points after the anchor
            remaining_days = len(stock_data) - anchor_idx
            if remaining_days > min_days_after_anchor:

                # Create VWAP calculator
                vwap_calc = HighVolumeAnchoredVWAP(anchor_date, anchor)

                # Calculate VWAP data
                vwap_data = vwap_calc.calculate_vwap_from_anchor(stock_data, anchor_idx)

                volume_vwap_results[f"volume_anchor_{i+1}"] = {
                    'anchor': anchor,
                    'anchor_index': anchor_idx,
                    'vwap_data': vwap_data,
                    'calculator': vwap_calc,
                    'remaining_days': remaining_days
                }

    return volume_vwap_results


def plot_high_volume_anchored_vwap(
    stock_data: pd.DataFrame,
    volume_vwap_results: Dict[str, Dict[str, Any]],
    symbol: str = 'SYMBOL',
    start_date: str = '2023-01-01',
    volume_percentile_threshold: int = 80,
    figsize: Tuple[int, int] = (20, 16)
) -> plt.Figure:
    """
    Visualization of AVWAP from high volume anchor days

    Args:
        stock_data: DataFrame with OHLCV data
        volume_vwap_results: Dictionary of VWAP results
        symbol: Stock symbol for chart title
        start_date: Start date for chart title
        volume_percentile_threshold: Volume threshold for chart
        figsize: Figure size tuple

    Returns:
        Matplotlib figure object
    """
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=figsize,
                                   gridspec_kw={'height_ratios': [4, 1]})

    # Main price chart
    ax1.plot(stock_data['Date'], stock_data['Price'], 'k-', linewidth=2,
            label=f'{symbol} Price', alpha=0.9, zorder=5)

    # Extended color palette for 30 anchors
    colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c',
             '#e67e22', '#34495e', '#c0392b', '#2980b9', '#27ae60', '#d35400',
             '#8e44ad', '#16a085', '#f1c40f', '#e91e63', '#795548', '#607d8b',
             '#ff5722', '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4',
             '#8bc34a', '#ffc107', '#673ab7', '#009688', '#ffeb3b', '#3f51b5']

    # Plot all AVWAP lines as context
    all_vwap_items = list(volume_vwap_results.items())

    # First pass: Plot all AVWAPs as thin, faded lines for context
    for i, (vwap_name, result) in enumerate(all_vwap_items):
        vwap_data = result['vwap_data']
        anchor = result['anchor']

        if not vwap_data or len(vwap_data) < 5:
            continue

        color = colors[i % len(colors)]

        # Extract data for plotting
        dates = [d['date'] for d in vwap_data]
        vwap_values = [d['vwap'] for d in vwap_data]

        # Plot as semi-transparent line (thicker than 1.5 since we're showing fewer total lines)
        line_alpha = 0.6 if i < 10 else 0.4  # Top 10 slightly more visible
        line_width = 2.0 if i < 10 else 1.5   # Top 10 slightly thicker

        ax1.plot(dates, vwap_values, color=color, linewidth=line_width,
                alpha=line_alpha, zorder=3)

        # Mark anchor point (small for all, larger for top 10)
        marker_size = 80 if i < 10 else 50
        marker_alpha = 0.8 if i < 10 else 0.6

        ax1.scatter([anchor['date']], [anchor['price']],
                   color=color, s=marker_size, marker='D',
                   alpha=marker_alpha, edgecolors='white', linewidths=1, zorder=8)

        # Add volume labels only for top 10 to avoid clutter
        if i < 10:
            ax1.annotate(f'{i+1}',
                        xy=(anchor['date'], anchor['price']),
                        xytext=(0, 15), textcoords='offset points',
                        fontsize=9, color=color, fontweight='bold',
                        ha='center', va='bottom',
                        bbox=dict(boxstyle='circle,pad=0.2', facecolor='white',
                                 edgecolor=color, alpha=0.9))

    # Second pass: Highlight top 10 with thick lines and labels
    top_10_results = dict(list(volume_vwap_results.items())[:10])

    for i, (vwap_name, result) in enumerate(top_10_results.items()):
        vwap_data = result['vwap_data']
        anchor = result['anchor']

        if not vwap_data:
            continue

        color = colors[i % len(colors)]

        # Extract data for plotting
        dates = [d['date'] for d in vwap_data]
        vwap_values = [d['vwap'] for d in vwap_data]

        # Plot thick VWAP line for top 10 anchors
        line_label = f"Vol AVWAP {i+1} ({anchor['date'].strftime('%m/%d')}, {anchor['volume']:,.0f})"
        ax1.plot(dates, vwap_values, color=color, linewidth=3.5,
                label=line_label, alpha=0.9, zorder=4)

        # Plot prominent anchor point for top 10
        ax1.scatter([anchor['date']], [anchor['price']],
                   color=color, s=200, marker='D',
                   edgecolors='white', linewidths=2, zorder=10)

    # Mark current date
    current_date = stock_data['Date'].iloc[-1]
    ax1.axvline(x=current_date, color='orange', linestyle='-', linewidth=2,
               alpha=0.9, label='Current Date', zorder=10)

    # Formatting for main chart
    ax1.set_title(f'{symbol} Comprehensive High Volume Anchored VWAP Analysis\n'
                 f'ALL {len(volume_vwap_results)} Highest Volume AVWAP Lines + Top 10 Highlighted\n'
                 f'Institutional Activity & Smart Money Anchors from {start_date}',
                 fontsize=16, fontweight='bold', pad=20)
    ax1.set_ylabel('Price ($)', fontsize=12)
    ax1.legend(bbox_to_anchor=(1.05, 1), loc='upper left', fontsize=9)
    ax1.grid(True, alpha=0.3)

    # Enhanced volume chart with all anchor highlighting
    volume_colors = ['red' if close < open_price else 'green'
                    for close, open_price in zip(stock_data['Price'], stock_data.get('Open', stock_data['Price']))]

    # Plot all volume bars
    ax2.bar(stock_data['Date'], stock_data['Volume'],
           color=volume_colors, alpha=0.6, width=1)

    # Highlight all high volume anchor days with markers
    for i, (vwap_name, result) in enumerate(all_vwap_items):
        anchor = result['anchor']
        color = colors[i % len(colors)]

        # Different marker sizes for top 10 vs others
        marker_size = 120 if i < 10 else 60
        marker_alpha = 0.9 if i < 10 else 0.6

        ax2.scatter([anchor['date']], [anchor['volume']],
                   color=color, s=marker_size, marker='D',
                   alpha=marker_alpha, edgecolors='white', linewidths=1, zorder=10)

        # Add rank number only for top 10
        if i < 10:
            ax2.text(anchor['date'], anchor['volume'] + (stock_data['Volume'].max() * 0.03),
                    f'{i+1}', ha='center', va='bottom', fontweight='bold',
                    color=color, fontsize=10,
                    bbox=dict(boxstyle='circle,pad=0.1', facecolor='white',
                             edgecolor=color, alpha=0.9))

    # Add horizontal line for volume percentile threshold
    volume_threshold = np.percentile(stock_data['Volume'], volume_percentile_threshold)
    ax2.axhline(y=volume_threshold, color='red', linestyle='--', alpha=0.7,
               label=f'{volume_percentile_threshold}th Percentile')

    ax2.set_ylabel('Volume', fontsize=12)
    ax2.set_xlabel('Date', fontsize=12)
    ax2.legend(fontsize=9)
    ax2.grid(True, alpha=0.3)

    plt.tight_layout()

    return fig


def analyze_high_volume_vwap_trends(
    volume_vwap_results: Dict[str, Dict[str, Any]],
    stock_data: pd.DataFrame
) -> Dict[str, Any]:
    """
    Analyze trends and patterns across high volume AVWAP calculations

    Args:
        volume_vwap_results: Dictionary of VWAP results
        stock_data: DataFrame with OHLCV data

    Returns:
        Dictionary with analysis results
    """
    current_price = stock_data['Price'].iloc[-1]
    current_date = stock_data['Date'].iloc[-1]

    # Collect data for analysis
    all_current_vwaps = []
    all_deviations = []
    anchor_ages = []
    bullish_trends = 0
    bearish_trends = 0
    neutral_trends = 0

    for vwap_name, result in volume_vwap_results.items():
        vwap_data = result['vwap_data']
        anchor = result['anchor']

        if not vwap_data or len(vwap_data) < 10:
            continue

        current_vwap = vwap_data[-1]['vwap']
        deviation = (current_price - current_vwap) / current_vwap * 100

        all_current_vwaps.append(current_vwap)
        all_deviations.append(deviation)

        # Calculate anchor age
        anchor_age = (current_date - anchor['date']).days
        anchor_ages.append(anchor_age)

        # Analyze VWAP trend direction (slope over last 20 periods)
        if len(vwap_data) >= 20:
            recent_vwaps = [d['vwap'] for d in vwap_data[-20:]]
            vwap_slope = (recent_vwaps[-1] - recent_vwaps[0]) / len(recent_vwaps)

            if vwap_slope > current_vwap * 0.001:  # 0.1% positive slope
                bullish_trends += 1
            elif vwap_slope < -current_vwap * 0.001:  # 0.1% negative slope
                bearish_trends += 1
            else:
                neutral_trends += 1

    # Compile analysis results
    total_trends = bullish_trends + bearish_trends + neutral_trends
    above_count = sum(1 for d in all_deviations if d > 0) if all_deviations else 0
    near_count = sum(1 for d in all_deviations if abs(d) < 1) if all_deviations else 0
    extreme_count = sum(1 for d in all_deviations if abs(d) > 3) if all_deviations else 0

    analysis_results = {
        'current_price': current_price,
        'total_vwaps': len(volume_vwap_results),
        'above_vwap_count': above_count,
        'above_vwap_percentage': (above_count / len(all_deviations) * 100) if all_deviations else 0,
        'near_vwap_count': near_count,
        'near_vwap_percentage': (near_count / len(all_deviations) * 100) if all_deviations else 0,
        'extreme_deviation_count': extreme_count,
        'extreme_deviation_percentage': (extreme_count / len(all_deviations) * 100) if all_deviations else 0,
        'average_deviation': np.mean(all_deviations) if all_deviations else 0,
        'deviation_range': (min(all_deviations), max(all_deviations)) if all_deviations else (0, 0),
        'bullish_trends': bullish_trends,
        'bearish_trends': bearish_trends,
        'neutral_trends': neutral_trends,
        'bullish_percentage': (bullish_trends / total_trends * 100) if total_trends > 0 else 0,
        'bearish_percentage': (bearish_trends / total_trends * 100) if total_trends > 0 else 0,
        'average_anchor_age': np.mean(anchor_ages) if anchor_ages else 0,
        'oldest_anchor_age': max(anchor_ages) if anchor_ages else 0,
        'newest_anchor_age': min(anchor_ages) if anchor_ages else 0
    }

    return analysis_results


def run_high_volume_vwap_analysis(
    stock_data: pd.DataFrame,
    symbol: str = 'SYMBOL',
    start_date: str = '2023-01-01',
    top_volume_days: int = 30,
    min_days_after_anchor: int = 5,
    volume_percentile_threshold: int = 80,
    show_plot: bool = True,
    figsize: Tuple[int, int] = (20, 16)
) -> Dict[str, Any]:
    """
    Complete high volume anchored VWAP analysis workflow

    Args:
        stock_data: DataFrame with OHLCV data (must have 'Date', 'Price', 'High', 'Low', 'Volume')
        symbol: Stock symbol for display
        start_date: Start date for analysis
        top_volume_days: Number of highest volume days to use as anchors
        min_days_after_anchor: Minimum days after anchor for meaningful VWAP
        volume_percentile_threshold: Only consider days above this volume percentile
        show_plot: Whether to display the plot
        figsize: Figure size tuple

    Returns:
        Dictionary containing all analysis results
    """
    # Ensure required columns exist
    if 'TypicalPrice' not in stock_data.columns:
        stock_data['TypicalPrice'] = (stock_data['High'] + stock_data['Low'] + stock_data['Price']) / 3
    if 'VolumeTypical' not in stock_data.columns:
        stock_data['VolumeTypical'] = stock_data['Volume'] * stock_data['TypicalPrice']

    # Step 1: Identify high volume anchors
    volume_anchors = identify_high_volume_anchors(
        stock_data, top_volume_days, min_days_after_anchor, volume_percentile_threshold
    )

    # Step 2: Analyze anchor significance
    volume_anchors = analyze_volume_anchor_significance(volume_anchors, stock_data)

    # Step 3: Calculate VWAPs
    volume_vwap_results = calculate_high_volume_vwaps(
        stock_data, volume_anchors, min_days_after_anchor
    )

    # Step 4: Analyze trends
    trend_analysis = analyze_high_volume_vwap_trends(volume_vwap_results, stock_data)

    # Step 5: Generate plot if requested
    fig = None
    if show_plot and volume_vwap_results:
        fig = plot_high_volume_anchored_vwap(
            stock_data, volume_vwap_results, symbol, start_date,
            volume_percentile_threshold, figsize
        )
        plt.show()

    # Compile complete results
    results = {
        'volume_anchors': volume_anchors,
        'vwap_results': volume_vwap_results,
        'trend_analysis': trend_analysis,
        'figure': fig,
        'parameters': {
            'symbol': symbol,
            'start_date': start_date,
            'top_volume_days': top_volume_days,
            'min_days_after_anchor': min_days_after_anchor,
            'volume_percentile_threshold': volume_percentile_threshold
        }
    }

    return results


# Example usage and testing
if __name__ == "__main__":
    # This would typically be imported and used in a notebook or other script
    print("High Volume Anchored VWAP Analysis Module")
    print("Import this module to use the high volume VWAP analysis functions.")
    print("\nMain function: run_high_volume_vwap_analysis()")
    print("Key classes: HighVolumeAnchoredVWAP")
    print("Key functions: identify_high_volume_anchors, calculate_high_volume_vwaps, plot_high_volume_anchored_vwap")