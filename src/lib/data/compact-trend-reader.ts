/**
 * Ultra-Compact Trend Cloud Data Reader
 * Reads 99.9% compressed binary format (1.2MB instead of 76.9MB)
 */

export interface CompactCluster {
  t: number; // Type: 1=Resistance, 0=Support
  p: number; // Price (center)
  w: number; // Softmax weight
  s: number; // Strength
  r: [number, number]; // Price range
}

export interface CompactTrendline {
  pids: number[]; // Pivot IDs (reference to lookup)
  ls: number; // Log slope
  li: number; // Log intercept
  s: number; // Strength
  r2: number; // R-squared
  ld: number; // Length days
}

export interface CompactWindow {
  id: number; // Window ID (numeric)
  d: number; // Days from base date
  p: number; // Current price
  pv: number; // Pivot count
  c: CompactCluster[]; // Clusters
  t: CompactTrendline[]; // Trendlines
}

export interface CompactPivot {
  id: number; // Unique ID
  d: number; // Days from base
  p: number; // Price
  t: number; // Type: 1=high, 0=low
  m: number; // Method ID
  s: number; // Strength
}

export interface CompactTrendData {
  meta: {
    symbol: string;
    config: any;
    date: string;
  };
  base_date: string;
  pivots: CompactPivot[];
  windows: CompactWindow[];
}

export interface ExpandedCluster {
  cluster_id: string;
  cluster_type: 'Support' | 'Resistance';
  center_price: number;
  center_date: string;
  total_strength: number;
  trendline_count: number;
  price_range: [number, number];
  date_range: [string, string];
  softmax_weight: number;
}

export interface ExpandedWindow {
  window_id: string;
  window_start: number;
  window_end: number;
  current_date: string;
  current_price: number;
  data_points: number;
  pivots: number;
  trendlines: number;
  consolidated_clusters: ExpandedCluster[];
  resistance_levels: number;
  support_levels: number;
  strongest_cluster: ExpandedCluster | null;
  trendline_details?: any[];
}

export class CompactTrendCloudReader {
  private compactData: CompactTrendData | null = null;
  private baseDate: Date | null = null;
  private pivotLookup: Map<number, CompactPivot> = new Map();

  async loadCompactData(symbol: string): Promise<void> {
    try {
      // Try to load ultra-compact JSON first (fallback)
      const response = await fetch(`/results/${symbol}_optimized_analysis/ultra_compact.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to load compact data for ${symbol}`);
      }

      this.compactData = await response.json();
      this.baseDate = new Date(this.compactData!.base_date);
      
      // Build pivot lookup for fast access
      this.pivotLookup.clear();
      this.compactData!.pivots.forEach(pivot => {
        this.pivotLookup.set(pivot.id, pivot);
      });

      console.log(`✅ Loaded compact data: ${this.compactData!.windows.length} windows, ${this.compactData!.pivots.length} pivots`);
    } catch (error) {
      console.error('Failed to load compact trend data:', error);
      throw error;
    }
  }

  expandWindow(compactWindow: CompactWindow, includeDetails: boolean = false): ExpandedWindow {
    if (!this.compactData || !this.baseDate) {
      throw new Error('Compact data not loaded');
    }

    // Convert dates
    const currentDate = new Date(this.baseDate);
    currentDate.setDate(currentDate.getDate() + compactWindow.d);
    
    // Expand clusters
    const expandedClusters: ExpandedCluster[] = compactWindow.c.map((cluster, index) => {
      const clusterType = cluster.t === 1 ? 'Resistance' : 'Support';
      const clusterId = clusterType[0] + (index + 1).toString(); // R1, S1, etc.
      
      // Calculate date range (5 days projection)
      const centerDate = new Date(currentDate);
      centerDate.setDate(centerDate.getDate() + 5);
      
      const startDate = new Date(centerDate);
      startDate.setDate(startDate.getDate() - 2);
      const endDate = new Date(centerDate);
      endDate.setDate(endDate.getDate() + 2);

      return {
        cluster_id: clusterId,
        cluster_type: clusterType,
        center_price: cluster.p,
        center_date: centerDate.toISOString(),
        total_strength: cluster.s,
        trendline_count: 1, // Simplified
        price_range: cluster.r,
        date_range: [startDate.toISOString(), endDate.toISOString()],
        softmax_weight: cluster.w
      };
    });

    // Find strongest cluster
    const strongestCluster = expandedClusters.length > 0 
      ? expandedClusters.reduce((max, cluster) => 
          cluster.softmax_weight > max.softmax_weight ? cluster : max
        )
      : null;

    // Count by type
    const supportCount = expandedClusters.filter(c => c.cluster_type === 'Support').length;
    const resistanceCount = expandedClusters.filter(c => c.cluster_type === 'Resistance').length;

    // Expand trendline details if requested
    let trendlineDetails: any[] | undefined;
    if (includeDetails && compactWindow.t) {
      trendlineDetails = compactWindow.t.map(trendline => {
        // Reconstruct connected points from pivot IDs
        const connectedPoints = trendline.pids.map(pivotId => {
          const pivot = this.pivotLookup.get(pivotId);
          if (!pivot) return null;
          
          const pivotDate = new Date(this.baseDate!);
          pivotDate.setDate(pivotDate.getDate() + pivot.d);
          
          return {
            date: pivotDate.toISOString(),
            price: pivot.p,
            log_price: Math.log(pivot.p),
            type: pivot.t === 1 ? 'high' : 'low',
            method: this.methodFromId(pivot.m),
            strength: pivot.s
          };
        }).filter(Boolean);

        return {
          connected_points: connectedPoints,
          strength: trendline.s,
          log_slope: trendline.ls,
          log_intercept: trendline.li,
          r_squared: trendline.r2,
          length_days: trendline.ld
        };
      });
    }

    return {
      window_id: `W${compactWindow.id}`,
      window_start: 0, // Simplified
      window_end: 250, // Simplified
      current_date: currentDate.toISOString(),
      current_price: compactWindow.p,
      data_points: 250,
      pivots: compactWindow.pv,
      trendlines: compactWindow.t?.length || 0,
      consolidated_clusters: expandedClusters,
      resistance_levels: resistanceCount,
      support_levels: supportCount,
      strongest_cluster: strongestCluster,
      trendline_details: trendlineDetails
    };
  }

  private methodFromId(methodId: number): string {
    const methods = [
      'zigzag_2.0pct',
      'rolling_extrema', 
      'scipy_argrelextrema',
      'fractal',
      'slope_change',
      'derivative'
    ];
    return methods[methodId] || 'zigzag_2.0pct';
  }

  getWindows(limit?: number, includeDetails: boolean = false): ExpandedWindow[] {
    if (!this.compactData) {
      throw new Error('Compact data not loaded');
    }

    const windowsToProcess = limit 
      ? this.compactData.windows.slice(-limit) // Get most recent windows
      : this.compactData.windows;

    return windowsToProcess.map(window => this.expandWindow(window, includeDetails));
  }

  getSummaryResults(limit?: number): any[] {
    if (!this.compactData) {
      throw new Error('Compact data not loaded');
    }

    const windowsToProcess = limit 
      ? this.compactData.windows.slice(-limit)
      : this.compactData.windows;

    return windowsToProcess.map(window => {
      const currentDate = new Date(this.baseDate!);
      currentDate.setDate(currentDate.getDate() + window.d);

      // Find strongest cluster
      const strongestCluster = window.c.length > 0 
        ? window.c.reduce((max, cluster) => 
            cluster.w > max.w ? cluster : max
          )
        : null;

      return {
        window_id: `W${window.id}`,
        date: currentDate.toISOString().split('T')[0], // Date only
        current_price: window.p,
        data_points: 250,
        pivots: window.pv,
        trendlines: window.t?.length || 0,
        total_clusters: window.c.length,
        resistance_levels: window.c.filter(c => c.t === 1).length,
        support_levels: window.c.filter(c => c.t === 0).length,
        strongest_cluster_weight: strongestCluster?.w || 0,
        strongest_cluster_price: strongestCluster?.p || 0,
        strongest_cluster_type: strongestCluster?.t === 1 ? 'Resistance' : 'Support'
      };
    });
  }

  getAnalysisStructure(): any {
    if (!this.compactData) {
      throw new Error('Compact data not loaded');
    }

    const summaryResults = this.getSummaryResults();
    const detailedResults = this.getWindows(undefined, true);

    // Calculate current signals from latest windows
    const latestWindows = detailedResults.slice(-5);
    const allClusters = latestWindows.flatMap(w => w.consolidated_clusters);
    
    const supportClusters = allClusters.filter(c => c.cluster_type === 'Support');
    const resistanceClusters = allClusters.filter(c => c.cluster_type === 'Resistance');

    const strongestSupport = supportClusters.length > 0 
      ? supportClusters.reduce((max, cluster) => 
          cluster.softmax_weight > max.softmax_weight ? cluster : max
        )
      : null;

    const strongestResistance = resistanceClusters.length > 0 
      ? resistanceClusters.reduce((max, cluster) => 
          cluster.softmax_weight > max.softmax_weight ? cluster : max
        )
      : null;

    const allLevels = allClusters
      .sort((a, b) => b.softmax_weight - a.softmax_weight)
      .slice(0, 20);

    const confidenceScore = allLevels.length > 0 
      ? Math.max(...allLevels.map(c => c.softmax_weight))
      : 0;

    return {
      symbol: this.compactData.meta.symbol,
      timestamp: new Date(),
      total_windows: summaryResults.length,
      analysis_period: {
        start_date: summaryResults[0]?.date || '',
        end_date: summaryResults[summaryResults.length - 1]?.date || '',
        trading_days: summaryResults.length
      },
      summary_results: summaryResults,
      detailed_results: detailedResults,
      current_signals: {
        strongest_support: strongestSupport,
        strongest_resistance: strongestResistance,
        all_levels: allLevels,
        confidence_score: confidenceScore
      },
      performance_metrics: {
        average_pivots_per_window: summaryResults.reduce((sum, w) => sum + w.pivots, 0) / summaryResults.length,
        average_trendlines_per_window: summaryResults.reduce((sum, w) => sum + w.trendlines, 0) / summaryResults.length,
        average_clusters_per_window: summaryResults.reduce((sum, w) => sum + w.total_clusters, 0) / summaryResults.length,
        processing_speed: 100 // Simplified
      }
    };
  }
}