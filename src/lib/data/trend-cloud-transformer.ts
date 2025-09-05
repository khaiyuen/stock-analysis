/**
 * Trend Cloud Data Transformer
 * 
 * Utilities to transform between different trend cloud analysis formats:
 * - Full Rolling Analysis (new format with exact notebook clustering)
 * - Optimized V2 Format (legacy)
 * - Ultra-compact Format (legacy) 
 * - Original CSV Format (legacy)
 */

export interface FullAnalysisCluster {
  cluster_id: string;
  cluster_type: 'Support' | 'Resistance';
  center_price: number;
  price_distance_pct: number;
  total_strength: number;
  trendline_count: number;
  unique_trendline_count: number;
  quality_score: number;
  softmax_weight: number;
  avg_recency_boost: number;
  price_spread: number;
}

export interface FullAnalysisWindow {
  window_id: string;
  window_num: number;
  start_date: string;
  end_date: string;
  current_price: number;
  total_trendlines: number;
  total_pivots: number;
  cluster_count: number;
  clusters: FullAnalysisCluster[];
}

export interface LegacyTrendCloudResult {
  window_id: string;
  date: string;
  current_price: number;
  data_points: number;
  pivots: number;
  trendlines: number;
  total_clusters: number;
  resistance_levels: number;
  support_levels: number;
  strongest_cluster_weight: number;
  strongest_cluster_price: number;
  strongest_cluster_type: 'Support' | 'Resistance';
}

export interface LegacyDetailedCluster {
  cluster_type: 'Support' | 'Resistance';
  center_price: number;
  softmax_weight: number;
  total_strength: number;
  trendlines: Array<{
    slope: number;
    intercept: number;
    strength: number;
    connected_points: any[];
  }>;
}

export interface LegacyDetailedResult {
  window_id: string;
  date: string;
  current_price: number;
  pivots: number;
  consolidated_clusters: LegacyDetailedCluster[];
}

/**
 * Transform full analysis window to legacy trend cloud result format
 */
export function transformFullAnalysisToLegacy(window: FullAnalysisWindow): LegacyTrendCloudResult {
  const strongestCluster = window.clusters.length > 0 
    ? window.clusters.reduce((max, cluster) => cluster.softmax_weight > max.softmax_weight ? cluster : max)
    : null;

  return {
    window_id: window.window_id,
    date: window.end_date.split('T')[0], // Use end_date as the analysis date
    current_price: window.current_price,
    data_points: 250, // Standard window size used in full analysis
    pivots: window.total_pivots,
    trendlines: window.total_trendlines,
    total_clusters: window.cluster_count,
    resistance_levels: window.clusters.filter(c => c.cluster_type === 'Resistance').length,
    support_levels: window.clusters.filter(c => c.cluster_type === 'Support').length,
    strongest_cluster_weight: strongestCluster?.softmax_weight || 0,
    strongest_cluster_price: strongestCluster?.center_price || 0,
    strongest_cluster_type: strongestCluster?.cluster_type || 'Support'
  };
}

/**
 * Transform full analysis window to legacy detailed result format
 */
export function transformFullAnalysisToDetailedLegacy(window: FullAnalysisWindow): LegacyDetailedResult {
  return {
    window_id: window.window_id,
    date: window.end_date.split('T')[0],
    current_price: window.current_price,
    pivots: window.total_pivots,
    consolidated_clusters: window.clusters.map(cluster => ({
      cluster_type: cluster.cluster_type,
      center_price: cluster.center_price,
      softmax_weight: cluster.softmax_weight,
      total_strength: cluster.total_strength,
      trendlines: [] // Trendline details not included in full analysis format
    }))
  };
}

/**
 * Calculate performance metrics from full analysis data
 */
export function calculateFullAnalysisMetrics(windows: FullAnalysisWindow[]) {
  if (windows.length === 0) {
    return {
      average_pivots_per_window: 0,
      average_trendlines_per_window: 0,
      average_clusters_per_window: 0,
      total_windows_processed: 0
    };
  }

  return {
    average_pivots_per_window: windows.reduce((sum, w) => sum + w.total_pivots, 0) / windows.length,
    average_trendlines_per_window: windows.reduce((sum, w) => sum + w.total_trendlines, 0) / windows.length,
    average_clusters_per_window: windows.reduce((sum, w) => sum + w.cluster_count, 0) / windows.length,
    total_windows_processed: windows.length
  };
}

/**
 * Get cluster statistics from full analysis data
 */
export function getClusterStatistics(windows: FullAnalysisWindow[]) {
  const totalClusters = windows.reduce((sum, w) => sum + w.cluster_count, 0);
  const clusterCounts = windows.map(w => w.cluster_count);
  const clusterDistribution: Record<number, number> = {};
  
  clusterCounts.forEach(count => {
    clusterDistribution[count] = (clusterDistribution[count] || 0) + 1;
  });
  
  const fiveClusterWindows = windows.filter(w => w.cluster_count === 5).length;
  const fiveClusterSuccessRate = windows.length > 0 ? (fiveClusterWindows / windows.length) * 100 : 0;

  return {
    total_clusters: totalClusters,
    avg_clusters_per_window: windows.length > 0 ? totalClusters / windows.length : 0,
    cluster_distribution: clusterDistribution,
    five_cluster_success_rate: fiveClusterSuccessRate,
    five_cluster_windows: fiveClusterWindows
  };
}

/**
 * Extract latest signals from recent windows
 */
export function extractLatestSignals(windows: FullAnalysisWindow[], windowCount: number = 5) {
  if (windows.length === 0) {
    return {
      current_price: 0,
      strongest_support: null,
      strongest_resistance: null,
      all_recent_levels: []
    };
  }

  const latestWindow = windows[windows.length - 1];
  const recentWindows = windows.slice(-windowCount);
  
  // Collect all clusters from recent windows
  const allRecentClusters: FullAnalysisCluster[] = [];
  recentWindows.forEach(window => {
    window.clusters.forEach(cluster => {
      allRecentClusters.push(cluster);
    });
  });
  
  // Find strongest support and resistance
  const supportClusters = allRecentClusters.filter(c => c.cluster_type === 'Support');
  const resistanceClusters = allRecentClusters.filter(c => c.cluster_type === 'Resistance');
  
  const strongestSupport = supportClusters.length > 0 
    ? supportClusters.reduce((max, cluster) => cluster.softmax_weight > max.softmax_weight ? cluster : max)
    : null;
    
  const strongestResistance = resistanceClusters.length > 0
    ? resistanceClusters.reduce((max, cluster) => cluster.softmax_weight > max.softmax_weight ? cluster : max)  
    : null;
  
  // Get top levels by weight
  const allRecentLevels = allRecentClusters
    .sort((a, b) => b.softmax_weight - a.softmax_weight)
    .slice(0, 10); // Top 10 levels

  return {
    current_price: latestWindow.current_price,
    strongest_support: strongestSupport,
    strongest_resistance: strongestResistance,
    all_recent_levels: allRecentLevels
  };
}

/**
 * Apply date range filter to windows
 */
export function filterWindowsByDateRange(windows: FullAnalysisWindow[], dateRange?: string) {
  if (!dateRange) return windows;

  if (dateRange.startsWith('last-')) {
    // Handle "last-N-years" format
    const yearsMatch = dateRange.match(/last-(\d+)-years?/);
    if (yearsMatch) {
      const years = parseInt(yearsMatch[1]);
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - years);
      const cutoffString = cutoffDate.toISOString().split('T')[0];
      
      return windows.filter(w => w.end_date >= cutoffString);
    }
  } else if (dateRange.includes('-')) {
    // Handle "YYYY-YYYY" format
    const [startYear, endYear] = dateRange.split('-');
    if (startYear && endYear) {
      return windows.filter(w => {
        const year = parseInt(w.end_date.split('-')[0]);
        return year >= parseInt(startYear) && year <= parseInt(endYear);
      });
    }
  }

  return windows;
}

/**
 * Quality score analysis for full analysis clusters
 */
export function calculateQualityMetrics(windows: FullAnalysisWindow[]) {
  let totalQualitySum = 0;
  let totalClusterCount = 0;
  let maxQuality = 0;
  let minQuality = Infinity;

  windows.forEach(w => {
    w.clusters.forEach(c => {
      totalQualitySum += c.quality_score;
      totalClusterCount += 1;
      maxQuality = Math.max(maxQuality, c.quality_score);
      minQuality = Math.min(minQuality, c.quality_score);
    });
  });

  return {
    avg_quality_score: totalClusterCount > 0 ? totalQualitySum / totalClusterCount : 0,
    max_quality_score: totalClusterCount > 0 ? maxQuality : 0,
    min_quality_score: totalClusterCount > 0 ? minQuality : 0,
    total_clusters_analyzed: totalClusterCount
  };
}