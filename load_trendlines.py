# Load trendlines script for the new notebook
import pickle
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def load_saved_trendlines():
    """Load the saved trendlines data from pickle file"""
    try:
        with open('data/trendlines_data.pkl', 'rb') as f:
            data = pickle.load(f)
        
        print(f"✅ Loaded trendline data successfully!")
        print(f"   🎯 {len(data['powerful_trendlines'])} powerful trendlines")
        print(f"   📊 {len(data['stock_data'])} stock data points")
        print(f"   📍 {len(data['pivots'])} pivot points")
        print(f"   💹 Symbol: {data['symbol']}")
        print(f"   💰 Current price: ${data['stock_data']['Price'].iloc[-1]:.2f}")
        
        return data
    except Exception as e:
        print(f"❌ Error loading trendlines: {e}")
        print("Make sure to run save_trendlines.py in the original notebook first")
        return None

# Load the data
trendline_data = load_saved_trendlines()

if trendline_data:
    # Extract variables
    powerful_trendlines = trendline_data['powerful_trendlines']
    stock_data = trendline_data['stock_data']
    pivots = trendline_data['pivots']
    SYMBOL = trendline_data['symbol']
    PROJECTION_DAYS = trendline_data['projection_days']
    TEMPERATURE = trendline_data['temperature']
    
    print(f"📋 Variables loaded:")
    print(f"   powerful_trendlines: {len(powerful_trendlines)} trendlines")
    print(f"   stock_data: {len(stock_data)} data points")
    print(f"   pivots: {len(pivots)} pivot points")
    print(f"   SYMBOL: {SYMBOL}")
    print(f"   PROJECTION_DAYS: {PROJECTION_DAYS}")
    print(f"   TEMPERATURE: {TEMPERATURE}")
    
    # Quick trendline summary
    strengths = [tl['strength'] for tl in powerful_trendlines]
    print(f"\\n📈 Trendline Summary:")
    print(f"   Strength range: {min(strengths)} - {max(strengths)} points")
    print(f"   Average strength: {sum(strengths)/len(strengths):.1f} points")
    print(f"   Ready for trend cloud analysis!")
else:
    print("❌ Failed to load trendline data")