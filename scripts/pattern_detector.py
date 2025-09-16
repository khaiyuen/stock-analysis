"""
Advanced Technical Pattern Detection Module
Comprehensive pattern recognition using pivot points from the trendline analysis system
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import warnings
warnings.filterwarnings('ignore')


class TechnicalPatternDetector:
    """
    Advanced technical pattern detection system using high-quality pivot points
    
    Supported Patterns:
    - Head and Shoulders (bearish reversal)
    - Inverse Head and Shoulders (bullish reversal)
    - Double Top/Bottom (reversal patterns)
    - Triple Top/Bottom (reversal patterns)
    - Cup and Handle (bullish continuation)
    - Triangles (symmetrical, ascending, descending)
    - Wedges (ascending/descending)
    - Rectangle/Range patterns
    - Flag and Pennant patterns
    """
    
    def __init__(self, stock_data: pd.DataFrame, high_pivots: List[Dict], 
                 low_pivots: List[Dict], min_strength: float = 0.6,
                 min_pattern_width: int = 10, max_pattern_width: int = 120):
        """
        Initialize pattern detector with stock data and pivot points
        
        Args:
            stock_data: DataFrame with Date, Price, LogPrice columns
            high_pivots: List of high pivot dictionaries
            low_pivots: List of low pivot dictionaries
            min_strength: Minimum confidence threshold for patterns
            min_pattern_width: Minimum days for pattern formation
            max_pattern_width: Maximum days for pattern formation
        """
        self.stock_data = stock_data
        self.high_pivots = sorted(high_pivots, key=lambda x: x['date'])
        self.low_pivots = sorted(low_pivots, key=lambda x: x['date'])
        self.min_strength = min_strength
        self.min_pattern_width = min_pattern_width
        self.max_pattern_width = max_pattern_width
        self.patterns = []
        
        # Create lookup dictionaries for faster processing
        self.price_by_date = dict(zip(stock_data['Date'], stock_data['Price']))
        self.log_price_by_date = dict(zip(stock_data['Date'], stock_data['LogPrice']))
        
        print(f"🔍 Pattern Detector initialized:")
        print(f"   High pivots: {len(self.high_pivots)}")
        print(f"   Low pivots: {len(self.low_pivots)}")
        print(f"   Min strength: {min_strength}")
        print(f"   Pattern width: {min_pattern_width}-{max_pattern_width} days")
    
    def detect_all_patterns(self) -> List[Dict]:
        """
        Detect all supported technical patterns
        
        Returns:
            List of pattern dictionaries with confidence scores
        """
        print("🔍 Starting comprehensive pattern detection...")
        
        pattern_methods = [
            ('Head and Shoulders', self._detect_head_shoulders),
            ('Inverse Head and Shoulders', self._detect_inverse_head_shoulders),
            ('Double Top', self._detect_double_top),
            ('Double Bottom', self._detect_double_bottom),
            ('Triple Top', self._detect_triple_top),
            ('Triple Bottom', self._detect_triple_bottom),
            ('Cup and Handle', self._detect_cup_handle),
            ('Ascending Triangle', self._detect_ascending_triangle),
            ('Descending Triangle', self._detect_descending_triangle),
            ('Symmetrical Triangle', self._detect_symmetrical_triangle),
            ('Ascending Wedge', self._detect_ascending_wedge),
            ('Descending Wedge', self._detect_descending_wedge),
            ('Rectangle', self._detect_rectangle),
            ('Bull Flag', self._detect_bull_flag),
            ('Bear Flag', self._detect_bear_flag),
            ('Pennant', self._detect_pennant)
        ]
        
        all_patterns = []
        
        for pattern_name, method in pattern_methods:
            try:
                patterns = method()
                if patterns:
                    print(f"   📊 {pattern_name}: {len(patterns)} patterns found")
                    all_patterns.extend(patterns)
                else:
                    print(f"   📊 {pattern_name}: 0 patterns found")
            except Exception as e:
                print(f"   ⚠️ Error detecting {pattern_name}: {str(e)}")
        
        # Filter by minimum strength and remove duplicates
        strong_patterns = [p for p in all_patterns if p['confidence'] >= self.min_strength]
        unique_patterns = self._remove_overlapping_patterns(strong_patterns)
        
        print(f"\\n✅ Pattern Detection Complete:")
        print(f"   Total patterns found: {len(all_patterns)}")
        print(f"   Strong patterns (>={self.min_strength}): {len(strong_patterns)}")
        print(f"   Unique patterns: {len(unique_patterns)}")
        
        self.patterns = unique_patterns
        return unique_patterns
    
    def _detect_head_shoulders(self) -> List[Dict]:
        """Detect Head and Shoulders pattern (bearish reversal)"""
        patterns = []
        
        if len(self.high_pivots) < 3:
            return patterns
        
        for i in range(len(self.high_pivots) - 2):
            left_shoulder = self.high_pivots[i]
            head = self.high_pivots[i + 1]
            right_shoulder = self.high_pivots[i + 2]
            
            # Basic structure: head higher than both shoulders
            if (head['log_price'] > left_shoulder['log_price'] and 
                head['log_price'] > right_shoulder['log_price']):
                
                pattern_width = (right_shoulder['date'] - left_shoulder['date']).days
                if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                    
                    # Calculate pattern metrics
                    shoulder_ratio = min(left_shoulder['log_price'], right_shoulder['log_price']) / \
                                   max(left_shoulder['log_price'], right_shoulder['log_price'])
                    
                    head_prominence = (head['log_price'] - max(left_shoulder['log_price'], 
                                                             right_shoulder['log_price']))
                    
                    # Find supporting low pivots (neckline)
                    neckline_lows = [p for p in self.low_pivots 
                                   if left_shoulder['date'] < p['date'] < right_shoulder['date']]
                    
                    # Volume analysis bonus (if available)
                    volume_bonus = 0.0
                    if 'strength' in head and 'strength' in left_shoulder and 'strength' in right_shoulder:
                        # Higher strength on head = better pattern
                        if head['strength'] > max(left_shoulder['strength'], right_shoulder['strength']):
                            volume_bonus = 0.1
                    
                    # Calculate confidence
                    confidence = (shoulder_ratio * 0.4 + 
                                min(head_prominence * 100, 0.3) + 
                                (0.2 if len(neckline_lows) >= 1 else 0.1) +
                                volume_bonus +
                                0.1)  # Base confidence
                    
                    if confidence >= self.min_strength:
                        patterns.append({
                            'type': 'Head and Shoulders',
                            'direction': 'bearish',
                            'confidence': min(confidence, 1.0),
                            'start_date': left_shoulder['date'],
                            'end_date': right_shoulder['date'],
                            'pattern_width': pattern_width,
                            'pivots': {
                                'left_shoulder': left_shoulder,
                                'head': head,
                                'right_shoulder': right_shoulder,
                                'neckline_lows': neckline_lows
                            },
                            'metrics': {
                                'shoulder_ratio': shoulder_ratio,
                                'head_prominence': head_prominence,
                                'neckline_support': len(neckline_lows)
                            },
                            'target_price': self._calculate_hs_target(left_shoulder, head, right_shoulder, neckline_lows)
                        })
        
        return patterns
    
    def _detect_inverse_head_shoulders(self) -> List[Dict]:
        """Detect Inverse Head and Shoulders pattern (bullish reversal)"""
        patterns = []
        
        if len(self.low_pivots) < 3:
            return patterns
        
        for i in range(len(self.low_pivots) - 2):
            left_shoulder = self.low_pivots[i]
            head = self.low_pivots[i + 1]
            right_shoulder = self.low_pivots[i + 2]
            
            # Basic structure: head lower than both shoulders
            if (head['log_price'] < left_shoulder['log_price'] and 
                head['log_price'] < right_shoulder['log_price']):
                
                pattern_width = (right_shoulder['date'] - left_shoulder['date']).days
                if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                    
                    # Calculate pattern metrics
                    shoulder_ratio = min(left_shoulder['log_price'], right_shoulder['log_price']) / \
                                   max(left_shoulder['log_price'], right_shoulder['log_price'])
                    
                    head_prominence = (min(left_shoulder['log_price'], right_shoulder['log_price']) - 
                                     head['log_price'])
                    
                    # Find neckline highs
                    neckline_highs = [p for p in self.high_pivots 
                                    if left_shoulder['date'] < p['date'] < right_shoulder['date']]
                    
                    # Volume bonus
                    volume_bonus = 0.0
                    if 'strength' in head:
                        volume_bonus = 0.1
                    
                    confidence = (shoulder_ratio * 0.4 + 
                                min(head_prominence * 100, 0.3) + 
                                (0.2 if len(neckline_highs) >= 1 else 0.1) +
                                volume_bonus + 0.1)
                    
                    if confidence >= self.min_strength:
                        patterns.append({
                            'type': 'Inverse Head and Shoulders',
                            'direction': 'bullish',
                            'confidence': min(confidence, 1.0),
                            'start_date': left_shoulder['date'],
                            'end_date': right_shoulder['date'],
                            'pattern_width': pattern_width,
                            'pivots': {
                                'left_shoulder': left_shoulder,
                                'head': head,
                                'right_shoulder': right_shoulder,
                                'neckline_highs': neckline_highs
                            },
                            'metrics': {
                                'shoulder_ratio': shoulder_ratio,
                                'head_prominence': head_prominence
                            },
                            'target_price': self._calculate_ihs_target(left_shoulder, head, right_shoulder, neckline_highs)
                        })
        
        return patterns
    
    def _detect_double_top(self) -> List[Dict]:
        """Detect Double Top pattern (bearish reversal)"""
        patterns = []
        
        if len(self.high_pivots) < 2:
            return patterns
        
        for i in range(len(self.high_pivots) - 1):
            first_top = self.high_pivots[i]
            
            # Look for second top within reasonable distance
            for j in range(i + 1, len(self.high_pivots)):
                second_top = self.high_pivots[j]
                
                pattern_width = (second_top['date'] - first_top['date']).days
                if pattern_width > self.max_pattern_width:
                    break  # Too far apart
                
                if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                    
                    # Height similarity (closer = stronger)
                    height_ratio = min(first_top['log_price'], second_top['log_price']) / \
                                  max(first_top['log_price'], second_top['log_price'])
                    
                    # Must be quite similar for double top
                    if height_ratio >= 0.95:
                        
                        # Find valley between tops
                        valley_lows = [p for p in self.low_pivots 
                                     if first_top['date'] < p['date'] < second_top['date']]
                        
                        if valley_lows:
                            deepest_valley = min(valley_lows, key=lambda x: x['log_price'])
                            valley_depth = (min(first_top['log_price'], second_top['log_price']) - 
                                          deepest_valley['log_price'])
                            
                            # Volume confirmation (second top should have lower volume)
                            volume_bonus = 0.0
                            if ('strength' in first_top and 'strength' in second_top and 
                                first_top['strength'] > second_top['strength']):
                                volume_bonus = 0.1
                            
                            confidence = (height_ratio * 0.5 + 
                                        min(valley_depth * 50, 0.3) + 
                                        volume_bonus + 0.1)
                            
                            if confidence >= self.min_strength:
                                patterns.append({
                                    'type': 'Double Top',
                                    'direction': 'bearish',
                                    'confidence': min(confidence, 1.0),
                                    'start_date': first_top['date'],
                                    'end_date': second_top['date'],
                                    'pattern_width': pattern_width,
                                    'pivots': {
                                        'first_top': first_top,
                                        'second_top': second_top,
                                        'valley': deepest_valley
                                    },
                                    'metrics': {
                                        'height_ratio': height_ratio,
                                        'valley_depth': valley_depth
                                    },
                                    'target_price': self._calculate_double_pattern_target(
                                        first_top, second_top, deepest_valley, 'bearish')
                                })
        
        return patterns
    
    def _detect_double_bottom(self) -> List[Dict]:
        """Detect Double Bottom pattern (bullish reversal)"""
        patterns = []
        
        if len(self.low_pivots) < 2:
            return patterns
        
        for i in range(len(self.low_pivots) - 1):
            first_bottom = self.low_pivots[i]
            
            for j in range(i + 1, len(self.low_pivots)):
                second_bottom = self.low_pivots[j]
                
                pattern_width = (second_bottom['date'] - first_bottom['date']).days
                if pattern_width > self.max_pattern_width:
                    break
                
                if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                    
                    # Height similarity
                    height_ratio = min(first_bottom['log_price'], second_bottom['log_price']) / \
                                  max(first_bottom['log_price'], second_bottom['log_price'])
                    
                    if height_ratio >= 0.95:
                        
                        # Find peak between bottoms
                        peak_highs = [p for p in self.high_pivots 
                                    if first_bottom['date'] < p['date'] < second_bottom['date']]
                        
                        if peak_highs:
                            highest_peak = max(peak_highs, key=lambda x: x['log_price'])
                            peak_height = (highest_peak['log_price'] - 
                                         max(first_bottom['log_price'], second_bottom['log_price']))
                            
                            # Volume confirmation (second bottom should have higher volume)
                            volume_bonus = 0.0
                            if ('strength' in first_bottom and 'strength' in second_bottom and 
                                second_bottom['strength'] > first_bottom['strength']):
                                volume_bonus = 0.1
                            
                            confidence = (height_ratio * 0.5 + 
                                        min(peak_height * 50, 0.3) + 
                                        volume_bonus + 0.1)
                            
                            if confidence >= self.min_strength:
                                patterns.append({
                                    'type': 'Double Bottom',
                                    'direction': 'bullish',
                                    'confidence': min(confidence, 1.0),
                                    'start_date': first_bottom['date'],
                                    'end_date': second_bottom['date'],
                                    'pattern_width': pattern_width,
                                    'pivots': {
                                        'first_bottom': first_bottom,
                                        'second_bottom': second_bottom,
                                        'peak': highest_peak
                                    },
                                    'metrics': {
                                        'height_ratio': height_ratio,
                                        'peak_height': peak_height
                                    },
                                    'target_price': self._calculate_double_pattern_target(
                                        first_bottom, second_bottom, highest_peak, 'bullish')
                                })
        
        return patterns
    
    def _detect_triple_top(self) -> List[Dict]:
        """Detect Triple Top pattern (bearish reversal)"""
        patterns = []
        
        if len(self.high_pivots) < 3:
            return patterns
        
        for i in range(len(self.high_pivots) - 2):
            first = self.high_pivots[i]
            second = self.high_pivots[i + 1]
            third = self.high_pivots[i + 2]
            
            pattern_width = (third['date'] - first['date']).days
            if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                
                # Check height similarity for all three tops
                prices = [first['log_price'], second['log_price'], third['log_price']]
                height_ratio = min(prices) / max(prices)
                
                if height_ratio >= 0.98:  # Very similar heights required
                    
                    # Find supporting valleys
                    valley1 = [p for p in self.low_pivots if first['date'] < p['date'] < second['date']]
                    valley2 = [p for p in self.low_pivots if second['date'] < p['date'] < third['date']]
                    
                    valley_bonus = 0.1 if (valley1 and valley2) else 0.0
                    
                    confidence = height_ratio * 0.7 + valley_bonus + 0.2
                    
                    if confidence >= self.min_strength:
                        patterns.append({
                            'type': 'Triple Top',
                            'direction': 'bearish',
                            'confidence': min(confidence, 1.0),
                            'start_date': first['date'],
                            'end_date': third['date'],
                            'pattern_width': pattern_width,
                            'pivots': {
                                'first': first,
                                'second': second,
                                'third': third,
                                'valley1': valley1[0] if valley1 else None,
                                'valley2': valley2[0] if valley2 else None
                            },
                            'metrics': {
                                'height_ratio': height_ratio
                            }
                        })
        
        return patterns
    
    def _detect_triple_bottom(self) -> List[Dict]:
        """Detect Triple Bottom pattern (bullish reversal)"""
        patterns = []
        
        if len(self.low_pivots) < 3:
            return patterns
        
        for i in range(len(self.low_pivots) - 2):
            first = self.low_pivots[i]
            second = self.low_pivots[i + 1]
            third = self.low_pivots[i + 2]
            
            pattern_width = (third['date'] - first['date']).days
            if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                
                # Check height similarity for all three bottoms
                prices = [first['log_price'], second['log_price'], third['log_price']]
                height_ratio = min(prices) / max(prices)
                
                if height_ratio >= 0.98:
                    
                    # Find supporting peaks
                    peak1 = [p for p in self.high_pivots if first['date'] < p['date'] < second['date']]
                    peak2 = [p for p in self.high_pivots if second['date'] < p['date'] < third['date']]
                    
                    peak_bonus = 0.1 if (peak1 and peak2) else 0.0
                    
                    confidence = height_ratio * 0.7 + peak_bonus + 0.2
                    
                    if confidence >= self.min_strength:
                        patterns.append({
                            'type': 'Triple Bottom',
                            'direction': 'bullish',
                            'confidence': min(confidence, 1.0),
                            'start_date': first['date'],
                            'end_date': third['date'],
                            'pattern_width': pattern_width,
                            'pivots': {
                                'first': first,
                                'second': second,
                                'third': third,
                                'peak1': peak1[0] if peak1 else None,
                                'peak2': peak2[0] if peak2 else None
                            },
                            'metrics': {
                                'height_ratio': height_ratio
                            }
                        })
        
        return patterns
    
    def _detect_cup_handle(self) -> List[Dict]:
        """Detect Cup and Handle pattern (bullish continuation)"""
        patterns = []
        
        if len(self.low_pivots) < 1 or len(self.high_pivots) < 2:
            return patterns
        
        for bottom in self.low_pivots:
            # Find highs before and after the bottom (cup formation)
            left_highs = [p for p in self.high_pivots if p['date'] < bottom['date']]
            right_highs = [p for p in self.high_pivots if p['date'] > bottom['date']]
            
            if left_highs and right_highs:
                left_rim = left_highs[-1]  # Most recent high before bottom
                
                # Find right rim that forms good cup
                for right_rim in right_highs[:3]:  # Check first few highs after bottom
                    
                    pattern_width = (right_rim['date'] - left_rim['date']).days
                    if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                        
                        # Cup symmetry (similar rim heights)
                        rim_ratio = min(left_rim['log_price'], right_rim['log_price']) / \
                                   max(left_rim['log_price'], right_rim['log_price'])
                        
                        if rim_ratio >= 0.95:  # Good cup symmetry
                            
                            # Cup depth (should be significant)
                            cup_depth = (min(left_rim['log_price'], right_rim['log_price']) - 
                                       bottom['log_price'])
                            
                            # Look for handle formation (small pullback after right rim)
                            handle_window = timedelta(days=30)
                            handle_pivots = [p for p in self.low_pivots 
                                           if right_rim['date'] < p['date'] < right_rim['date'] + handle_window]
                            
                            handle_bonus = 0.15 if handle_pivots else 0.05
                            
                            # Cup should be U-shaped, not V-shaped (check for intermediate pivots)
                            intermediate_lows = [p for p in self.low_pivots 
                                               if left_rim['date'] < p['date'] < right_rim['date'] 
                                               and p != bottom]
                            
                            u_shape_bonus = 0.1 if len(intermediate_lows) >= 1 else 0.0
                            
                            confidence = (rim_ratio * 0.4 + 
                                        min(cup_depth * 20, 0.3) + 
                                        handle_bonus + 
                                        u_shape_bonus + 0.1)
                            
                            if confidence >= self.min_strength:
                                patterns.append({
                                    'type': 'Cup and Handle',
                                    'direction': 'bullish',
                                    'confidence': min(confidence, 1.0),
                                    'start_date': left_rim['date'],
                                    'end_date': handle_pivots[0]['date'] if handle_pivots else right_rim['date'],
                                    'pattern_width': pattern_width,
                                    'pivots': {
                                        'left_rim': left_rim,
                                        'cup_bottom': bottom,
                                        'right_rim': right_rim,
                                        'handle': handle_pivots[0] if handle_pivots else None
                                    },
                                    'metrics': {
                                        'rim_ratio': rim_ratio,
                                        'cup_depth': cup_depth,
                                        'has_handle': len(handle_pivots) > 0
                                    },
                                    'target_price': self._calculate_cup_handle_target(left_rim, bottom, right_rim)
                                })
                            break  # Found good cup, don't check other right rims
        
        return patterns
    
    # Triangle Patterns
    def _detect_ascending_triangle(self) -> List[Dict]:
        """Detect Ascending Triangle pattern (usually bullish)"""
        patterns = []
        
        if len(self.high_pivots) < 2 or len(self.low_pivots) < 2:
            return patterns
        
        # Look for horizontal resistance with ascending support
        for i in range(len(self.high_pivots) - 1):
            for j in range(i + 1, min(i + 4, len(self.high_pivots))):  # Check next 3 highs
                high1 = self.high_pivots[i]
                high2 = self.high_pivots[j]
                
                # Check if highs are at similar levels (horizontal resistance)
                height_similarity = min(high1['log_price'], high2['log_price']) / \
                                  max(high1['log_price'], high2['log_price'])
                
                if height_similarity >= 0.98:  # Very horizontal resistance
                    
                    # Find lows between these highs
                    pattern_lows = [p for p in self.low_pivots 
                                  if high1['date'] < p['date'] < high2['date']]
                    
                    if len(pattern_lows) >= 2:
                        # Check if lows are ascending
                        pattern_lows.sort(key=lambda x: x['date'])
                        
                        ascending = True
                        for k in range(len(pattern_lows) - 1):
                            if pattern_lows[k + 1]['log_price'] <= pattern_lows[k]['log_price']:
                                ascending = False
                                break
                        
                        if ascending:
                            pattern_width = (high2['date'] - high1['date']).days
                            
                            if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                                
                                # Calculate ascending trend strength
                                low_range = pattern_lows[-1]['log_price'] - pattern_lows[0]['log_price']
                                
                                confidence = (height_similarity * 0.4 + 
                                            min(low_range * 20, 0.3) + 
                                            len(pattern_lows) * 0.05 + 0.2)
                                
                                if confidence >= self.min_strength:
                                    patterns.append({
                                        'type': 'Ascending Triangle',
                                        'direction': 'bullish',
                                        'confidence': min(confidence, 1.0),
                                        'start_date': high1['date'],
                                        'end_date': high2['date'],
                                        'pattern_width': pattern_width,
                                        'pivots': {
                                            'resistance_highs': [high1, high2],
                                            'ascending_lows': pattern_lows
                                        },
                                        'metrics': {
                                            'resistance_level': (high1['log_price'] + high2['log_price']) / 2,
                                            'low_progression': low_range
                                        }
                                    })
        
        return patterns
    
    def _detect_descending_triangle(self) -> List[Dict]:
        """Detect Descending Triangle pattern (usually bearish)"""
        patterns = []
        
        if len(self.high_pivots) < 2 or len(self.low_pivots) < 2:
            return patterns
        
        # Look for horizontal support with descending resistance
        for i in range(len(self.low_pivots) - 1):
            for j in range(i + 1, min(i + 4, len(self.low_pivots))):
                low1 = self.low_pivots[i]
                low2 = self.low_pivots[j]
                
                # Check if lows are at similar levels (horizontal support)
                height_similarity = min(low1['log_price'], low2['log_price']) / \
                                  max(low1['log_price'], low2['log_price'])
                
                if height_similarity >= 0.98:
                    
                    # Find highs between these lows
                    pattern_highs = [p for p in self.high_pivots 
                                   if low1['date'] < p['date'] < low2['date']]
                    
                    if len(pattern_highs) >= 2:
                        # Check if highs are descending
                        pattern_highs.sort(key=lambda x: x['date'])
                        
                        descending = True
                        for k in range(len(pattern_highs) - 1):
                            if pattern_highs[k + 1]['log_price'] >= pattern_highs[k]['log_price']:
                                descending = False
                                break
                        
                        if descending:
                            pattern_width = (low2['date'] - low1['date']).days
                            
                            if self.min_pattern_width <= pattern_width <= self.max_pattern_width:
                                
                                high_range = pattern_highs[0]['log_price'] - pattern_highs[-1]['log_price']
                                
                                confidence = (height_similarity * 0.4 + 
                                            min(high_range * 20, 0.3) + 
                                            len(pattern_highs) * 0.05 + 0.2)
                                
                                if confidence >= self.min_strength:
                                    patterns.append({
                                        'type': 'Descending Triangle',
                                        'direction': 'bearish',
                                        'confidence': min(confidence, 1.0),
                                        'start_date': low1['date'],
                                        'end_date': low2['date'],
                                        'pattern_width': pattern_width,
                                        'pivots': {
                                            'support_lows': [low1, low2],
                                            'descending_highs': pattern_highs
                                        },
                                        'metrics': {
                                            'support_level': (low1['log_price'] + low2['log_price']) / 2,
                                            'high_progression': high_range
                                        }
                                    })
        
        return patterns
    
    def _detect_symmetrical_triangle(self) -> List[Dict]:
        """Detect Symmetrical Triangle pattern (continuation)"""
        patterns = []
        
        # This would require more complex analysis of converging trendlines
        # Implementation would analyze both ascending lows and descending highs
        return patterns
    
    # Wedge Patterns
    def _detect_ascending_wedge(self) -> List[Dict]:
        """Detect Ascending Wedge pattern (usually bearish)"""
        patterns = []
        
        # Implementation would look for both highs and lows trending upward
        # but with the rate of ascent slowing (converging lines)
        return patterns
    
    def _detect_descending_wedge(self) -> List[Dict]:
        """Detect Descending Wedge pattern (usually bullish)"""
        patterns = []
        
        # Implementation would look for both highs and lows trending downward
        # but with the rate of descent slowing (converging lines)
        return patterns
    
    # Continuation Patterns
    def _detect_rectangle(self) -> List[Dict]:
        """Detect Rectangle/Range pattern (continuation)"""
        patterns = []
        
        # Implementation would look for horizontal support and resistance levels
        # with price oscillating between them
        return patterns
    
    def _detect_bull_flag(self) -> List[Dict]:
        """Detect Bull Flag pattern (bullish continuation)"""
        patterns = []
        
        # Implementation would look for strong upward move followed by
        # brief consolidation/pullback
        return patterns
    
    def _detect_bear_flag(self) -> List[Dict]:
        """Detect Bear Flag pattern (bearish continuation)"""
        patterns = []
        
        # Implementation would look for strong downward move followed by
        # brief consolidation/bounce
        return patterns
    
    def _detect_pennant(self) -> List[Dict]:
        """Detect Pennant pattern (continuation)"""
        patterns = []
        
        # Implementation would look for triangular consolidation after
        # strong directional move
        return patterns
    
    # Helper Methods
    def _calculate_hs_target(self, left_shoulder: Dict, head: Dict, 
                            right_shoulder: Dict, neckline_lows: List[Dict]) -> Optional[float]:
        """Calculate price target for Head and Shoulders pattern"""
        if not neckline_lows:
            return None
        
        # Target = Neckline - (Head - Neckline)
        neckline_level = np.mean([p['log_price'] for p in neckline_lows])
        head_height = head['log_price'] - neckline_level
        target_log = neckline_level - head_height
        
        return np.exp(target_log)  # Convert back from log price
    
    def _calculate_ihs_target(self, left_shoulder: Dict, head: Dict, 
                             right_shoulder: Dict, neckline_highs: List[Dict]) -> Optional[float]:
        """Calculate price target for Inverse Head and Shoulders pattern"""
        if not neckline_highs:
            return None
        
        # Target = Neckline + (Neckline - Head)
        neckline_level = np.mean([p['log_price'] for p in neckline_highs])
        head_depth = neckline_level - head['log_price']
        target_log = neckline_level + head_depth
        
        return np.exp(target_log)
    
    def _calculate_double_pattern_target(self, first: Dict, second: Dict, 
                                       middle: Dict, direction: str) -> float:
        """Calculate price target for double top/bottom patterns"""
        if direction == 'bearish':
            # Double top: target = valley - (top - valley)
            top_level = max(first['log_price'], second['log_price'])
            valley_level = middle['log_price']
            target_log = valley_level - (top_level - valley_level)
        else:
            # Double bottom: target = peak + (peak - bottom)
            bottom_level = min(first['log_price'], second['log_price'])
            peak_level = middle['log_price']
            target_log = peak_level + (peak_level - bottom_level)
        
        return np.exp(target_log)
    
    def _calculate_cup_handle_target(self, left_rim: Dict, bottom: Dict, right_rim: Dict) -> float:
        """Calculate price target for Cup and Handle pattern"""
        # Target = Right rim + Cup depth
        cup_depth = ((left_rim['log_price'] + right_rim['log_price']) / 2) - bottom['log_price']
        target_log = right_rim['log_price'] + cup_depth
        
        return np.exp(target_log)
    
    def _remove_overlapping_patterns(self, patterns: List[Dict]) -> List[Dict]:
        """Remove overlapping patterns, keeping the ones with higher confidence"""
        if not patterns:
            return patterns
        
        # Sort by confidence (highest first)
        sorted_patterns = sorted(patterns, key=lambda x: x['confidence'], reverse=True)
        unique_patterns = []
        
        for pattern in sorted_patterns:
            overlap_found = False
            
            for existing in unique_patterns:
                # Check for date overlap
                if (pattern['start_date'] <= existing['end_date'] and 
                    pattern['end_date'] >= existing['start_date']):
                    
                    # Calculate overlap percentage
                    overlap_start = max(pattern['start_date'], existing['start_date'])
                    overlap_end = min(pattern['end_date'], existing['end_date'])
                    overlap_days = (overlap_end - overlap_start).days
                    
                    pattern_days = (pattern['end_date'] - pattern['start_date']).days
                    overlap_pct = overlap_days / max(pattern_days, 1)
                    
                    if overlap_pct > 0.3:  # More than 30% overlap
                        overlap_found = True
                        break
            
            if not overlap_found:
                unique_patterns.append(pattern)
        
        return unique_patterns
    
    def get_pattern_summary(self) -> Dict:
        """Get summary statistics of detected patterns"""
        if not self.patterns:
            return {'total_patterns': 0}
        
        pattern_counts = {}
        directions = {'bullish': 0, 'bearish': 0, 'neutral': 0}
        confidences = []
        
        for pattern in self.patterns:
            # Count by type
            ptype = pattern['type']
            pattern_counts[ptype] = pattern_counts.get(ptype, 0) + 1
            
            # Count by direction
            direction = pattern.get('direction', 'neutral')
            directions[direction] += 1
            
            # Collect confidence scores
            confidences.append(pattern['confidence'])
        
        return {
            'total_patterns': len(self.patterns),
            'pattern_counts': pattern_counts,
            'directions': directions,
            'avg_confidence': np.mean(confidences) if confidences else 0,
            'confidence_range': [min(confidences), max(confidences)] if confidences else [0, 0],
            'strongest_pattern': max(self.patterns, key=lambda x: x['confidence']) if self.patterns else None
        }


def detect_patterns_for_symbol(symbol: str, lookback_days: int = 365, 
                              min_strength: float = 0.6) -> Tuple[List[Dict], Dict]:
    """
    Convenience function to detect patterns for a given symbol
    
    Args:
        symbol: Stock symbol to analyze
        lookback_days: Number of days to look back
        min_strength: Minimum pattern confidence threshold
    
    Returns:
        Tuple of (detected_patterns, summary_stats)
    """
    try:
        from scripts.trendline_extractor import TrendlineExtractor
        
        # Load data and detect pivots
        extractor = TrendlineExtractor(symbol=symbol, lookback_days=lookback_days)
        stock_data = extractor.load_data()
        pivots, swing_highs, swing_lows = extractor.detect_pivots()
        
        # Separate pivot types
        high_pivots = [p for p in pivots if p['type'] == 'high']
        low_pivots = [p for p in pivots if p['type'] == 'low']
        
        # Initialize pattern detector
        detector = TechnicalPatternDetector(
            stock_data=stock_data,
            high_pivots=high_pivots,
            low_pivots=low_pivots,
            min_strength=min_strength
        )
        
        # Detect patterns
        patterns = detector.detect_all_patterns()
        summary = detector.get_pattern_summary()
        
        return patterns, summary
        
    except Exception as e:
        print(f"❌ Error detecting patterns for {symbol}: {str(e)}")
        return [], {'total_patterns': 0, 'error': str(e)}


if __name__ == "__main__":
    # Example usage
    print("🔍 Technical Pattern Detection System")
    print("=" * 50)
    
    # Test with QQQ
    patterns, summary = detect_patterns_for_symbol('QQQ', lookback_days=365, min_strength=0.6)
    
    print(f"\\n📊 Pattern Detection Results for QQQ:")
    print(f"   Total patterns: {summary['total_patterns']}")
    
    if patterns:
        print(f"   Average confidence: {summary['avg_confidence']:.3f}")
        print(f"   Strongest pattern: {summary['strongest_pattern']['type']} ({summary['strongest_pattern']['confidence']:.3f})")
        
        print(f"\\n🎯 Pattern Breakdown:")
        for pattern_type, count in summary['pattern_counts'].items():
            print(f"   {pattern_type}: {count}")
        
        print(f"\\n📈 Direction Analysis:")
        for direction, count in summary['directions'].items():
            if count > 0:
                print(f"   {direction.title()}: {count}")