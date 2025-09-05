"""
Trend Cloud Detection Module

This module provides enhanced trend cloud detection capabilities by finding convergence points
where multiple trendlines project to similar price levels, with zone merging for stronger clusters.

Key Features:
- Time-weighted trendline convergence detection
- Zone merging for nearby convergence points
- Strength-based ranking of trend clouds
- Support/Resistance classification
"""

import numpy as np
import pandas as pd
from datetime import timedelta
from typing import List, Dict, Any, Optional


class TrendCloudDetector:
    """
    Enhanced trend cloud detector that finds convergence zones where multiple trendlines
    project to similar price levels, with automatic zone merging for stronger clusters.
    """
    
    def __init__(self, 
                 projection_days: int = 5,
                 convergence_tolerance: float = 2.5,
                 merge_threshold: float = 4.0,
                 min_trendlines: int = 3,
                 max_clouds: int = 6,
                 temperature: float = 2.0):
        """
        Initialize the trend cloud detector.
        
        Args:
            projection_days: Number of days to project trendlines forward
            convergence_tolerance: Price tolerance for trendline convergence ($)
            merge_threshold: Distance threshold for merging nearby zones ($)
            min_trendlines: Minimum trendlines required for a convergence zone
            max_clouds: Maximum number of final trend clouds to return
            temperature: Softmax temperature for weighting calculation
        """
        self.projection_days = projection_days
        self.convergence_tolerance = convergence_tolerance
        self.merge_threshold = merge_threshold
        self.min_trendlines = min_trendlines
        self.max_clouds = max_clouds
        self.temperature = temperature
    
    def find_convergence_points(self, 
                               trendlines: List[Dict[str, Any]], 
                               stock_data: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Find points where multiple trendlines converge with proper strength summation and zone merging.
        
        Args:
            trendlines: List of time-weighted trendlines with strength data
            stock_data: Stock price data DataFrame
            
        Returns:
            List of convergence zones with merged nearby zones
        """
        if not trendlines or len(trendlines) == 0:
            return []
            
        current_date = stock_data['Date'].iloc[-1]
        current_price = stock_data['Price'].iloc[-1]

        # Calculate projection points for each trendline
        trendline_projections = self._generate_projections(
            trendlines, stock_data, current_date, current_price
        )

        if len(trendline_projections) < self.min_trendlines:
            return []

        # Step 1: Find initial convergence zones
        initial_zones = self._find_initial_convergence_zones(
            trendline_projections, current_price
        )

        # Step 2: Merge nearby zones that are too close together
        merged_zones = self._merge_nearby_zones(initial_zones)

        return merged_zones
    
    def _generate_projections(self, 
                             trendlines: List[Dict[str, Any]], 
                             stock_data: pd.DataFrame,
                             current_date: pd.Timestamp,
                             current_price: float) -> List[Dict[str, Any]]:
        """Generate projection points for all trendlines."""
        projections = []

        for tl_idx, trendline in enumerate(trendlines):
            # Extract time-weighted strength from each trendline
            weighted_strength = trendline.get('weighted_strength', 0)
            average_weight = trendline.get('average_weight', 0)
            
            for day in range(1, self.projection_days + 1):
                future_date = current_date + timedelta(days=day)
                x_future = (future_date - stock_data['Date'].iloc[0]).days

                # Project using log scale
                projected_log_price = trendline['log_slope'] * x_future + trendline['log_intercept']
                projected_price = np.exp(projected_log_price)

                # Only consider reasonable projections (±30% of current price)
                if 0.7 * current_price <= projected_price <= 1.3 * current_price:
                    projections.append({
                        'trendline_idx': tl_idx,
                        'trendline': trendline,
                        'date': future_date,
                        'days_ahead': day,
                        'projected_price': projected_price,
                        'weighted_strength': weighted_strength,
                        'average_weight': average_weight
                    })

        return projections
    
    def _find_initial_convergence_zones(self, 
                                       trendline_projections: List[Dict[str, Any]],
                                       current_price: float) -> List[Dict[str, Any]]:
        """Find initial convergence zones before merging."""
        initial_zones = []
        used_projections = set()

        # Sort projections by price to find nearby clusters
        sorted_projections = sorted(enumerate(trendline_projections), 
                                   key=lambda x: x[1]['projected_price'])

        for i, (orig_idx, proj1) in enumerate(sorted_projections):
            if orig_idx in used_projections:
                continue

            # Find all projections within tolerance of this one
            converging_projections = [proj1]
            converging_indices = {orig_idx}

            for j, (other_idx, proj2) in enumerate(sorted_projections[i+1:], i+1):
                if other_idx in used_projections:
                    continue

                # Check if projections are close in price and from different trendlines
                price_diff = abs(proj1['projected_price'] - proj2['projected_price'])
                different_trendlines = proj1['trendline_idx'] != proj2['trendline_idx']

                if price_diff <= self.convergence_tolerance and different_trendlines:
                    converging_projections.append(proj2)
                    converging_indices.add(other_idx)
                elif price_diff > self.convergence_tolerance:
                    # Since we're sorted by price, no more matches possible
                    break

            # Only keep convergence zones with enough unique trendlines
            unique_trendlines = set(p['trendline_idx'] for p in converging_projections)
            
            if len(unique_trendlines) >= self.min_trendlines:
                zone = self._create_convergence_zone(
                    converging_projections, unique_trendlines, current_price
                )
                initial_zones.append(zone)
                used_projections.update(converging_indices)

        return initial_zones
    
    def _create_convergence_zone(self, 
                                converging_projections: List[Dict[str, Any]],
                                unique_trendlines: set,
                                current_price: float) -> Dict[str, Any]:
        """Create a single convergence zone from projections."""
        # Calculate convergence zone statistics
        prices = [p['projected_price'] for p in converging_projections]
        center_price = np.mean(prices)
        price_std = np.std(prices) if len(prices) > 1 else 0.1

        # Sum time-weighted strengths from UNIQUE trendlines only
        unique_projections = {}
        for p in converging_projections:
            tl_idx = p['trendline_idx']
            if tl_idx not in unique_projections:
                unique_projections[tl_idx] = p
        
        # Sum the weighted strengths (time-decayed pivot points) for unique trendlines
        total_weighted_strength = sum(p['weighted_strength'] for p in unique_projections.values())
        avg_weight = np.mean([p['average_weight'] for p in unique_projections.values()])
        
        # Count of unique trendlines contributing to convergence
        num_unique_trendlines = len(unique_projections)

        # Convergence quality: combine tightness, trendline count, and total strength
        tightness_score = 1.0 / (1.0 + price_std)
        convergence_quality = (tightness_score * 
                             num_unique_trendlines * 
                             (total_weighted_strength / num_unique_trendlines))

        return {
            'center_price': center_price,
            'price_std': price_std,
            'price_range': [min(prices), max(prices)],
            'unique_trendlines': num_unique_trendlines,
            'total_projections': len(converging_projections),
            'total_weighted_strength': total_weighted_strength,
            'avg_weight': avg_weight,
            'tightness_score': tightness_score,
            'convergence_quality': convergence_quality,
            'projections': converging_projections,
            'unique_trendline_data': unique_projections,
            'cloud_type': 'Resistance' if center_price > current_price else 'Support'
        }
    
    def _merge_nearby_zones(self, initial_zones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Merge nearby zones that are too close together."""
        if not initial_zones:
            return []
            
        # Sort by price for easier merging
        initial_zones.sort(key=lambda x: x['center_price'])
        
        merged_zones = []
        skip_indices = set()
        
        for i, zone1 in enumerate(initial_zones):
            if i in skip_indices:
                continue
                
            # Find all zones to merge with this one
            zones_to_merge = [zone1]
            merge_indices = {i}
            
            for j, zone2 in enumerate(initial_zones[i+1:], i+1):
                if j in skip_indices:
                    continue
                    
                price_diff = abs(zone1['center_price'] - zone2['center_price'])
                same_type = zone1['cloud_type'] == zone2['cloud_type']
                
                if price_diff <= self.merge_threshold and same_type:
                    zones_to_merge.append(zone2)
                    merge_indices.add(j)
            
            # If we found zones to merge, create a combined zone
            if len(zones_to_merge) > 1:
                merged_zone = self._create_merged_zone(zones_to_merge)
                merged_zones.append(merged_zone)
                skip_indices.update(merge_indices)
            else:
                # No merging needed, keep original zone
                merged_zones.append(zone1)
                skip_indices.add(i)

        # Sort by total weighted strength first, then convergence quality
        merged_zones.sort(key=lambda x: (x['total_weighted_strength'], x['convergence_quality']), 
                         reverse=True)

        return merged_zones
    
    def _create_merged_zone(self, zones_to_merge: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Create a merged zone from multiple zones."""
        # Combine all projections and unique trendline data
        all_projections = []
        all_unique_trendlines = {}
        
        for zone in zones_to_merge:
            all_projections.extend(zone['projections'])
            all_unique_trendlines.update(zone['unique_trendline_data'])
        
        # Recalculate merged statistics
        all_prices = [p['projected_price'] for p in all_projections]
        merged_center_price = np.mean(all_prices)
        merged_price_std = np.std(all_prices) if len(all_prices) > 1 else 0.1
        
        # Sum strengths from all unique trendlines
        merged_total_strength = sum(p['weighted_strength'] for p in all_unique_trendlines.values())
        merged_avg_weight = np.mean([p['average_weight'] for p in all_unique_trendlines.values()])
        merged_unique_count = len(all_unique_trendlines)
        
        # Recalculate quality
        merged_tightness = 1.0 / (1.0 + merged_price_std)
        merged_quality = (merged_tightness * 
                        merged_unique_count * 
                        (merged_total_strength / merged_unique_count))
        
        return {
            'center_price': merged_center_price,
            'price_std': merged_price_std,
            'price_range': [min(all_prices), max(all_prices)],
            'unique_trendlines': merged_unique_count,
            'total_projections': len(all_projections),
            'total_weighted_strength': merged_total_strength,
            'avg_weight': merged_avg_weight,
            'tightness_score': merged_tightness,
            'convergence_quality': merged_quality,
            'projections': all_projections,
            'unique_trendline_data': all_unique_trendlines,
            'cloud_type': zones_to_merge[0]['cloud_type'],  # Same type since we checked
            'merged_from': len(zones_to_merge)  # Track how many zones were merged
        }
    
    def create_final_trend_clouds(self, convergence_zones: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Create final trend clouds from convergence zones with softmax weighting.
        
        Args:
            convergence_zones: List of convergence zones (already sorted by strength)
            
        Returns:
            List of final trend clouds with softmax weights and cloud IDs
        """
        if not convergence_zones:
            return []

        # Take the top convergence zones (already sorted by total_weighted_strength)
        top_zones = convergence_zones[:self.max_clouds]

        # Apply softmax weighting based on total weighted strength
        if len(top_zones) > 1:
            strengths = np.array([zone['total_weighted_strength'] for zone in top_zones])
            if np.max(strengths) > 0:
                # Normalize strengths for softmax
                normalized_strengths = strengths / np.max(strengths)
                softmax_logits = normalized_strengths / self.temperature

                exp_logits = np.exp(softmax_logits - np.max(softmax_logits))
                softmax_weights = exp_logits / np.sum(exp_logits)

                for i, zone in enumerate(top_zones):
                    zone['softmax_weight'] = softmax_weights[i]
            else:
                for zone in top_zones:
                    zone['softmax_weight'] = 1.0 / len(top_zones)
        else:
            if top_zones:
                top_zones[0]['softmax_weight'] = 1.0

        # Add cloud IDs
        for i, zone in enumerate(top_zones):
            zone_type = zone['cloud_type'][0]  # 'R' or 'S'
            zone['cloud_id'] = f"{zone_type}{i}"

        return top_zones


def detect_trend_clouds(trendlines: List[Dict[str, Any]], 
                       stock_data: pd.DataFrame,
                       projection_days: int = 5,
                       convergence_tolerance: float = 2.5,
                       merge_threshold: float = 4.0,
                       min_trendlines: int = 3,
                       max_clouds: int = 6,
                       temperature: float = 2.0) -> List[Dict[str, Any]]:
    """
    Convenience function to detect trend clouds from trendlines.
    
    Args:
        trendlines: List of time-weighted trendlines
        stock_data: Stock price data DataFrame
        projection_days: Number of days to project forward
        convergence_tolerance: Price tolerance for convergence ($)
        merge_threshold: Distance threshold for merging zones ($)
        min_trendlines: Minimum trendlines required for convergence
        max_clouds: Maximum number of final clouds
        temperature: Softmax temperature for weighting
        
    Returns:
        List of final trend clouds with IDs and weights
    """
    detector = TrendCloudDetector(
        projection_days=projection_days,
        convergence_tolerance=convergence_tolerance,
        merge_threshold=merge_threshold,
        min_trendlines=min_trendlines,
        max_clouds=max_clouds,
        temperature=temperature
    )
    
    # Find convergence zones
    convergence_zones = detector.find_convergence_points(trendlines, stock_data)
    
    # Create final trend clouds
    final_clouds = detector.create_final_trend_clouds(convergence_zones)
    
    return final_clouds


def analyze_trend_cloud_metrics(trend_clouds: List[Dict[str, Any]], 
                               current_price: float) -> Dict[str, Any]:
    """
    Analyze metrics for a set of trend clouds.
    
    Args:
        trend_clouds: List of trend cloud dictionaries
        current_price: Current stock price
        
    Returns:
        Dictionary with trend cloud analysis metrics
    """
    if not trend_clouds:
        return {
            'total_clouds': 0,
            'resistance_clouds': 0,
            'support_clouds': 0,
            'total_strength': 0.0,
            'avg_strength': 0.0,
            'avg_trendlines_per_cloud': 0.0
        }
    
    resistance_clouds = [c for c in trend_clouds if c['center_price'] > current_price]
    support_clouds = [c for c in trend_clouds if c['center_price'] <= current_price]
    
    total_strength = sum(cloud['total_weighted_strength'] for cloud in trend_clouds)
    avg_strength = total_strength / len(trend_clouds)
    avg_trendlines = np.mean([cloud['unique_trendlines'] for cloud in trend_clouds])
    
    return {
        'total_clouds': len(trend_clouds),
        'resistance_clouds': len(resistance_clouds),
        'support_clouds': len(support_clouds),
        'total_strength': total_strength,
        'avg_strength': avg_strength,
        'avg_trendlines_per_cloud': avg_trendlines,
        'resistance_list': resistance_clouds,
        'support_list': support_clouds
    }