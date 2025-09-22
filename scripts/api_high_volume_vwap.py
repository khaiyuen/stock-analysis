#!/usr/bin/env python3
"""
API High Volume VWAP Analysis Script

This script provides high volume anchored VWAP analysis for the web API.
It uses the modular high_volume_anchored_vwap.py script and returns JSON formatted results.

Usage:
    python3 api_high_volume_vwap.py SYMBOL TOP_VOLUME_DAYS VOLUME_THRESHOLD START_DATE USE_CACHE

Arguments:
    SYMBOL: Stock symbol (e.g., QQQ)
    TOP_VOLUME_DAYS: Number of highest volume days to analyze (default: 30)
    VOLUME_THRESHOLD: Volume percentile threshold (default: 80)
    START_DATE: Start date for analysis (default: 2023-01-01)
    USE_CACHE: Whether to use cached data (default: true)

Output:
    JSON object with analysis results
"""

import sys
import json
import traceback
from datetime import datetime, timedelta
import pandas as pd

# Add the current directory to the path to import our modules
sys.path.append('/Users/khaiyuenlooi/code/khaiyuen/stock-analysis')

try:
    from scripts.stock_data_loader import load_stock_data_from_db
    from scripts.high_volume_anchored_vwap import run_high_volume_vwap_analysis
except ImportError as e:
    # Fallback error response
    error_response = {
        "success": False,
        "error": {
            "message": f"Failed to import required modules: {str(e)}",
            "code": "IMPORT_ERROR"
        }
    }
    print(json.dumps(error_response))
    sys.exit(1)


def main():
    """Main function to run high volume VWAP analysis and return JSON results."""

    try:
        # Parse command line arguments
        if len(sys.argv) != 6:
            raise ValueError("Expected 5 arguments: SYMBOL, TOP_VOLUME_DAYS, VOLUME_THRESHOLD, START_DATE, USE_CACHE")

        symbol = sys.argv[1].upper()
        top_volume_days = int(sys.argv[2])
        volume_threshold = int(sys.argv[3])
        start_date = sys.argv[4]
        use_cache = sys.argv[5].lower() == 'true'

        # Validate parameters
        if not symbol or len(symbol) > 10:
            raise ValueError("Invalid symbol")

        if top_volume_days < 1 or top_volume_days > 100:
            raise ValueError("top_volume_days must be between 1 and 100")

        if volume_threshold < 50 or volume_threshold > 99:
            raise ValueError("volume_threshold must be between 50 and 99")

        # Parse start date
        try:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        except ValueError:
            raise ValueError("start_date must be in YYYY-MM-DD format")

        print(f"🚀 Starting high volume VWAP analysis for {symbol}...", file=sys.stderr)
        print(f"Parameters: {top_volume_days} days, {volume_threshold}% threshold, from {start_date}", file=sys.stderr)

        # Load stock data
        print(f"📊 Loading stock data for {symbol}...", file=sys.stderr)

        # Load data with sufficient history
        stock_data_full = load_stock_data_from_db(
            symbol=symbol,
            days=1000,  # Get enough data
            timeframe='1D',
            filter_premarket=True
        )

        # Filter to analysis period
        stock_data = stock_data_full[
            stock_data_full['Date'] >= start_dt
        ].copy().reset_index(drop=True)

        if len(stock_data) < 30:
            raise ValueError(f"Insufficient data for {symbol}: only {len(stock_data)} days available")

        print(f"✅ Loaded {len(stock_data)} trading days", file=sys.stderr)

        # Run high volume VWAP analysis
        print(f"🔍 Running high volume VWAP analysis...", file=sys.stderr)

        results = run_high_volume_vwap_analysis(
            stock_data=stock_data,
            symbol=symbol,
            start_date=start_date,
            top_volume_days=top_volume_days,
            volume_percentile_threshold=volume_threshold,
            show_plot=False  # No plotting for API
        )

        print(f"✅ Analysis completed successfully", file=sys.stderr)

        # Format results for API response
        volume_anchors = []
        for anchor in results['volume_anchors']:
            volume_anchors.append({
                'date': anchor['date'].strftime('%Y-%m-%d'),
                'price': float(anchor['price']),
                'volume': int(anchor['volume']),
                'volume_ratio': float(anchor['volume_ratio']),
                'significance_score': float(anchor.get('significance_score', 0)),
                'days_after': int(anchor['days_after'])
            })

        # Format VWAP results
        vwap_results = []
        for i, (anchor_name, vwap_result) in enumerate(results['vwap_results'].items()):
            vwap_data = []
            for vwap_point in vwap_result['vwap_data']:
                vwap_data.append({
                    'date': vwap_point['date'].strftime('%Y-%m-%d'),
                    'vwap': float(vwap_point['vwap']),
                    'price_deviation': float(vwap_point['price_deviation']),
                    'current_price': float(vwap_point['current_price'])
                })

            vwap_results.append({
                'anchor_id': anchor_name,
                'anchor_date': vwap_result['anchor']['date'].strftime('%Y-%m-%d'),
                'vwap_data': vwap_data
            })

        # Format trend analysis
        trend_analysis = results['trend_analysis']
        formatted_trend_analysis = {
            'current_price': float(trend_analysis['current_price']),
            'total_vwaps': int(trend_analysis['total_vwaps']),
            'above_vwap_count': int(trend_analysis['above_vwap_count']),
            'above_vwap_percentage': float(trend_analysis['above_vwap_percentage']),
            'average_deviation': float(trend_analysis['average_deviation']),
            'bullish_trends': int(trend_analysis['bullish_trends']),
            'bearish_trends': int(trend_analysis['bearish_trends']),
            'bullish_percentage': float(trend_analysis['bullish_percentage']),
            'bearish_percentage': float(trend_analysis['bearish_percentage'])
        }

        # Create API response
        api_response = {
            "success": True,
            "data": {
                "symbol": symbol,
                "volume_anchors": volume_anchors,
                "vwap_results": vwap_results,
                "trend_analysis": formatted_trend_analysis,
                "parameters": {
                    "top_volume_days": top_volume_days,
                    "volume_percentile_threshold": volume_threshold,
                    "start_date": start_date
                }
            }
        }

        # Output JSON response
        print(json.dumps(api_response))

    except Exception as e:
        # Log error details to stderr
        print(f"❌ Error in high volume VWAP analysis: {str(e)}", file=sys.stderr)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)

        # Return error response
        error_response = {
            "success": False,
            "error": {
                "message": str(e),
                "code": "ANALYSIS_ERROR"
            }
        }

        print(json.dumps(error_response))
        sys.exit(1)


if __name__ == "__main__":
    main()