# Save trendlines script - run this in the current jupyter session
import pickle
import json
import os
from datetime import datetime

# Create data directory if it doesn't exist
os.makedirs('data', exist_ok=True)

try:
    # Save the trendlines with all necessary data
    trendline_data = {
        'powerful_trendlines': powerful_trendlines,
        'stock_data': stock_data,
        'pivots': pivots,
        'symbol': SYMBOL,
        'projection_days': PROJECTION_DAYS,
        'temperature': TEMPERATURE
    }

    # Save to pickle file
    with open('data/trendlines_data.pkl', 'wb') as f:
        pickle.dump(trendline_data, f)

    print(f"✅ Saved trendline data to data/trendlines_data.pkl")
    print(f"   🎯 {len(powerful_trendlines)} powerful trendlines")
    print(f"   📊 {len(stock_data)} stock data points")
    print(f"   📍 {len(pivots)} pivot points")
    print(f"   💹 Symbol: {SYMBOL}")
    print(f"   📅 Date range: {stock_data['Date'].min().date()} to {stock_data['Date'].max().date()}")
    print(f"   💰 Current price: ${stock_data['Price'].iloc[-1]:.2f}")

    # Also save as JSON for easier inspection
    json_data = {
        'symbol': SYMBOL,
        'projection_days': PROJECTION_DAYS,
        'temperature': TEMPERATURE,
        'current_price': float(stock_data['Price'].iloc[-1]),
        'date_range': {
            'start': stock_data['Date'].min().strftime('%Y-%m-%d'),
            'end': stock_data['Date'].max().strftime('%Y-%m-%d')
        },
        'trendlines': []
    }

    for i, tl in enumerate(powerful_trendlines):
        json_data['trendlines'].append({
            'id': i,
            'strength': int(tl['strength']),
            'slope': float(tl['slope']),
            'intercept': float(tl['intercept']),
            'r_squared': float(tl['r_squared']),
            'iterations': int(tl['iterations']),
            'length_days': int(tl['length_days']),
            'start_date': tl['start_pivot']['date'].strftime('%Y-%m-%d'),
            'start_price': float(tl['start_pivot']['price']),
            'end_date': tl['end_pivot']['date'].strftime('%Y-%m-%d'),
            'end_price': float(tl['end_pivot']['price'])
        })

    with open('data/trendlines_summary.json', 'w') as f:
        json.dump(json_data, f, indent=2)

    print(f"✅ Also saved summary to data/trendlines_summary.json for inspection")
    
    strengths = [tl['strength'] for tl in powerful_trendlines]
    print(f"📋 Quick summary:")
    print(f"   Strength range: {min(strengths)} - {max(strengths)} points")
    print(f"   Average strength: {sum(strengths)/len(strengths):.1f} points")
    print(f"   Ready to load in new notebook!")

except Exception as e:
    print(f"❌ Error saving trendlines: {e}")
    print("Make sure you have run the previous cells to generate the data")