"""
Trading Days Verification Script
Check how many calendar days are needed for 250 trading days
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta


def count_trading_days_in_period(start_date, end_date):
    """Count actual trading days between two dates"""
    # Generate all dates in range
    all_dates = pd.date_range(start=start_date, end=end_date, freq='D')
    
    # Filter to weekdays only (Monday=0 to Friday=4)
    weekdays = [d for d in all_dates if d.weekday() < 5]
    
    # Common US market holidays (approximate)
    holidays_2024 = [
        '2024-01-01',  # New Year's Day
        '2024-01-15',  # MLK Day
        '2024-02-19',  # Presidents Day  
        '2024-03-29',  # Good Friday
        '2024-05-27',  # Memorial Day
        '2024-06-19',  # Juneteenth
        '2024-07-04',  # Independence Day
        '2024-09-02',  # Labor Day
        '2024-11-28',  # Thanksgiving
        '2024-12-25',  # Christmas
    ]
    
    holidays_2023 = [
        '2023-01-02',  # New Year's Day (observed)
        '2023-01-16',  # MLK Day
        '2023-02-20',  # Presidents Day
        '2023-04-07',  # Good Friday
        '2023-05-29',  # Memorial Day
        '2023-06-19',  # Juneteenth
        '2023-07-04',  # Independence Day
        '2023-09-04',  # Labor Day
        '2023-11-23',  # Thanksgiving
        '2023-12-25',  # Christmas
    ]
    
    all_holidays = holidays_2024 + holidays_2023
    holiday_dates = pd.to_datetime(all_holidays)
    
    # Remove holidays from weekdays
    trading_days = [d for d in weekdays if d not in holiday_dates]
    
    return len(trading_days), len(all_dates)


def analyze_250_trading_days():
    """Analyze how many calendar days are needed for 250 trading days"""
    
    print("📅 Trading Days Analysis")
    print("=" * 50)
    
    # Test different periods
    end_date = datetime.now()
    
    # Try different lookback periods
    for calendar_days in [300, 350, 365, 400]:
        start_date = end_date - timedelta(days=calendar_days)
        trading_days, total_days = count_trading_days_in_period(start_date, end_date)
        
        print(f"📊 {calendar_days} calendar days:")
        print(f"   Period: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
        print(f"   Trading days: {trading_days}")
        print(f"   Trading day ratio: {trading_days/calendar_days:.3f}")
        print(f"   Months spanned: {calendar_days/30.4:.1f}")
        print()
    
    # Calculate exact calendar days needed for 250 trading days
    target_trading_days = 250
    estimated_calendar_days = int(target_trading_days / 0.69)  # ~69% of days are trading days
    
    print(f"🎯 For {target_trading_days} trading days:")
    print(f"   Estimated calendar days needed: {estimated_calendar_days}")
    print(f"   Estimated months: {estimated_calendar_days/30.4:.1f}")
    
    # Test the estimate
    start_date = end_date - timedelta(days=estimated_calendar_days)
    actual_trading_days, _ = count_trading_days_in_period(start_date, end_date)
    
    print(f"   Actual trading days with {estimated_calendar_days} calendar days: {actual_trading_days}")
    
    if actual_trading_days < target_trading_days:
        # Need more days
        additional_days = int((target_trading_days - actual_trading_days) / 0.69) + 10
        new_calendar_days = estimated_calendar_days + additional_days
        start_date = end_date - timedelta(days=new_calendar_days)
        actual_trading_days, _ = count_trading_days_in_period(start_date, end_date)
        
        print(f"   Adjusted to {new_calendar_days} calendar days: {actual_trading_days} trading days")


if __name__ == "__main__":
    analyze_250_trading_days()