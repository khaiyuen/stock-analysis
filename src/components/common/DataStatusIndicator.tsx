'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Database, TrendingUp, AlertTriangle } from 'lucide-react';

interface DataStatusProps {
  symbol: string;
  className?: string;
}

interface DataStatus {
  symbol: string;
  updateRecommendation: {
    needsUpdate: boolean;
    priority: 'low' | 'medium' | 'high' | 'critical';
    reasons: string[];
    estimatedTime: string;
  };
  trendClouds: {
    exists: boolean;
    isStale: boolean;
    hoursOld: number;
    fileInfo?: {
      cloudCount: number;
      supportClouds: number;
      resistanceClouds: number;
    };
  };
  database: {
    isHealthy: boolean;
    totalRecords: number;
    availableSymbols: number;
  };
  systemHealth: {
    overallStatus: 'healthy' | 'needs_update' | 'error';
    lastChecked: string;
    issues: string[];
  };
}

export const DataStatusIndicator: React.FC<DataStatusProps> = ({
  symbol,
  className = ''
}) => {
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/data/status/${symbol}`);
      const data = await response.json();

      if (data.success) {
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch data status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [symbol]);

  if (loading && !status) {
    return (
      <div className={`flex items-center gap-2 text-sm text-gray-500 ${className}`}>
        <div className="w-3 h-3 border border-gray-300 border-t-transparent rounded-full animate-spin"></div>
        Checking data status...
      </div>
    );
  }

  if (!status) return null;

  const getStatusColor = (overallStatus: string, priority: string) => {
    if (overallStatus === 'error') return 'text-red-600';
    if (priority === 'critical') return 'text-red-600';
    if (priority === 'high') return 'text-orange-600';
    if (priority === 'medium') return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStatusIcon = (overallStatus: string, priority: string) => {
    if (overallStatus === 'error' || priority === 'critical') {
      return <AlertTriangle className="w-4 h-4" />;
    }
    if (priority === 'high' || priority === 'medium') {
      return <Clock className="w-4 h-4" />;
    }
    return <Database className="w-4 h-4" />;
  };

  const colorClass = getStatusColor(status.systemHealth.overallStatus, status.updateRecommendation.priority);

  return (
    <div className={`${className}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 text-sm transition-colors hover:opacity-80 ${colorClass}`}
      >
        {getStatusIcon(status.systemHealth.overallStatus, status.updateRecommendation.priority)}

        <span>
          {status.updateRecommendation.needsUpdate
            ? `Update needed (${status.updateRecommendation.priority})`
            : 'Data up to date'
          }
        </span>

        {status.trendClouds.exists && (
          <span className="flex items-center gap-1 ml-2">
            <TrendingUp className="w-3 h-3" />
            {status.trendClouds.fileInfo?.cloudCount || 0} clouds
          </span>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="mt-2 p-3 bg-gray-50 rounded-lg border text-xs space-y-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium text-gray-900">Database</h4>
              <p className={status.database.isHealthy ? 'text-green-600' : 'text-red-600'}>
                {status.database.isHealthy ? '✓ Healthy' : '✗ Issues detected'}
              </p>
              <p className="text-gray-600">
                {status.database.totalRecords.toLocaleString()} records, {status.database.availableSymbols} symbols
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-900">Trend Clouds</h4>
              {status.trendClouds.exists ? (
                <div>
                  <p className={status.trendClouds.isStale ? 'text-yellow-600' : 'text-green-600'}>
                    {status.trendClouds.isStale ? '⚠ Stale' : '✓ Fresh'}
                    ({status.trendClouds.hoursOld.toFixed(1)}h old)
                  </p>
                  {status.trendClouds.fileInfo && (
                    <p className="text-gray-600">
                      {status.trendClouds.fileInfo.supportClouds} support, {status.trendClouds.fileInfo.resistanceClouds} resistance
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-red-600">✗ Not generated</p>
              )}
            </div>
          </div>

          {status.updateRecommendation.needsUpdate && (
            <div>
              <h4 className="font-medium text-gray-900">Update Recommendation</h4>
              <p className="text-gray-600">
                Priority: <span className={colorClass}>{status.updateRecommendation.priority}</span>
                {' '}({status.updateRecommendation.estimatedTime})
              </p>
              <ul className="mt-1 space-y-1">
                {status.updateRecommendation.reasons.slice(0, 3).map((reason, index) => (
                  <li key={index} className="text-gray-600">• {reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-gray-500 text-right">
            Last checked: {new Date(status.systemHealth.lastChecked).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};