'use client';

interface TrendCloudCluster {
  center_price: number;
  cluster_id: string;
  cluster_type: 'Support' | 'Resistance';
  price_range?: [number, number];
  softmax_weight: number;
  total_strength: number;
  trendline_count: number;
}

interface TrendCloudWindow {
  window_id: string;
  date?: string;
  end_date?: string;
  current_price: number;
  data_points?: number;
  pivots?: number;
  trendlines?: number;
  total_clusters?: number;
  resistance_levels?: number;
  support_levels?: number;
  strongest_cluster_weight?: number;
  strongest_cluster_price?: number;
  strongest_cluster_type?: string;
  consolidated_clusters?: TrendCloudCluster[];
  clusters?: TrendCloudCluster[];
}

interface TrendCloudData {
  symbol?: string;
  timestamp?: string;
  total_windows?: number;
  successful_windows?: number;
  detailed_results?: TrendCloudWindow[];
  summary_results?: TrendCloudWindow[];
  windows?: TrendCloudWindow[];
}

export default function SimpleTrendCloud({ 
  symbol, 
  data 
}: { 
  symbol: string;
  data?: TrendCloudData | null;
}) {
  // Use provided data instead of fetching
  if (!data) return <div className="text-gray-400">No trend cloud data available</div>;
  
  // Extract windows from different possible data structures
  const windows = data.detailed_results || data.summary_results || data.windows || [];
  const totalWindows = data.total_windows || data.successful_windows || windows.length;

  return (
    <div className="bg-gray-900 p-4 rounded-lg">
      <h3 className="text-white text-lg font-semibold mb-4">
        Trend Cloud Analysis - {data.symbol || symbol}
      </h3>
      
      <div className="text-gray-300 text-sm mb-4">
        Total Windows: {totalWindows} | 
        Loaded: {windows.length} windows
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
        {windows.slice(-100).map(window => (
          <div key={window.window_id} className="bg-gray-800 p-3 rounded border-l-4 border-blue-500">
            <div className="text-white font-medium">{window.window_id}</div>
            <div className="text-gray-400 text-sm">
              {(window.date || window.end_date || 'No Date').split('T')[0]}
            </div>
            <div className="text-green-400 text-sm">Price: ${(window.current_price || 0).toFixed(2)}</div>
            <div className="text-blue-400 text-sm">
              Clusters: {(window.consolidated_clusters || window.clusters)?.length || window.total_clusters || 0}
            </div>
            
            {/* Show cluster info - detailed if available, summary otherwise */}
            <div className="mt-2 space-y-1">
              {((window.consolidated_clusters || window.clusters)?.length || 0) > 0 ? (
                // Detailed cluster view
                (window.consolidated_clusters || window.clusters || [])
                  .sort((a, b) => (b.softmax_weight || 0) - (a.softmax_weight || 0))
                  .slice(0, 3)
                  .map(cluster => (
                    <div key={cluster.cluster_id} className="flex justify-between text-xs">
                      <span className={cluster.cluster_type === 'Support' ? 'text-green-400' : 'text-red-400'}>
                        {cluster.cluster_type?.[0] || 'U'}{cluster.cluster_id?.slice(-1) || '?'}
                      </span>
                      <span className="text-gray-300">${(cluster.center_price || 0).toFixed(2)}</span>
                      <span className="text-yellow-400">{((cluster.softmax_weight || 0) * 100).toFixed(1)}%</span>
                    </div>
                  ))
              ) : (
                // Summary cluster view
                <>
                  {window.support_levels && window.support_levels > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-green-400">Support</span>
                      <span className="text-gray-300">{window.support_levels} levels</span>
                    </div>
                  )}
                  {window.resistance_levels && window.resistance_levels > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-red-400">Resistance</span>
                      <span className="text-gray-300">{window.resistance_levels} levels</span>
                    </div>
                  )}
                  {window.strongest_cluster_weight && (
                    <div className="flex justify-between text-xs">
                      <span className={window.strongest_cluster_type === 'Support' ? 'text-green-400' : 'text-red-400'}>
                        Strongest
                      </span>
                      <span className="text-gray-300">${(window.strongest_cluster_price || 0).toFixed(2)}</span>
                      <span className="text-yellow-400">{((window.strongest_cluster_weight || 0) * 100).toFixed(1)}%</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Summary stats */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-green-400 font-semibold">Support Levels</div>
          <div className="text-white text-lg">
            {windows.reduce((sum, w) => {
              const clusters = w.consolidated_clusters || w.clusters;
              if (clusters) {
                return sum + clusters.filter(c => c.cluster_type === 'Support').length;
              }
              return sum + (w.support_levels || 0);
            }, 0)}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-red-400 font-semibold">Resistance Levels</div>
          <div className="text-white text-lg">
            {windows.reduce((sum, w) => {
              const clusters = w.consolidated_clusters || w.clusters;
              if (clusters) {
                return sum + clusters.filter(c => c.cluster_type === 'Resistance').length;
              }
              return sum + (w.resistance_levels || 0);
            }, 0)}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-blue-400 font-semibold">Avg Clusters/Window</div>
          <div className="text-white text-lg">
            {(windows.reduce((sum, w) => {
              const clusters = w.consolidated_clusters || w.clusters;
              if (clusters) {
                return sum + clusters.length;
              }
              return sum + (w.total_clusters || 0);
            }, 0) / windows.length).toFixed(1)}
          </div>
        </div>
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-yellow-400 font-semibold">Strongest Weight</div>
          <div className="text-white text-lg">
            {(() => {
              const weights = windows.flatMap(w => {
                const clusters = w.consolidated_clusters || w.clusters;
                if (clusters) {
                  return clusters.map(c => c.softmax_weight || 0);
                }
                return [w.strongest_cluster_weight || 0];
              });
              return weights.length > 0 ? (Math.max(...weights) * 100).toFixed(1) + '%' : '0%';
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}