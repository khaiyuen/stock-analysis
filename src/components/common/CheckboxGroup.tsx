'use client';

import React from 'react';

export interface CheckboxOption {
  id: string;
  label: string;
  description?: string;
  enabled?: boolean;
  badge?: string;
  color?: 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'indigo';
}

export interface CheckboxGroupProps {
  title: string;
  options: CheckboxOption[];
  values: Record<string, boolean>;
  onChange: (id: string, checked: boolean) => void;
  className?: string;
  layout?: 'vertical' | 'horizontal' | 'grid';
  disabled?: boolean;
}

export const CheckboxGroup: React.FC<CheckboxGroupProps> = ({
  title,
  options,
  values,
  onChange,
  className = '',
  layout = 'vertical',
  disabled = false
}) => {
  const getLayoutClasses = () => {
    switch (layout) {
      case 'horizontal':
        return 'flex flex-wrap gap-4';
      case 'grid':
        return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2';
      default:
        return 'space-y-2';
    }
  };

  const getBadgeClasses = (color: string) => {
    const colorClasses = {
      blue: 'bg-blue-100 text-blue-800',
      green: 'bg-green-100 text-green-800',
      purple: 'bg-purple-100 text-purple-800',
      amber: 'bg-amber-100 text-amber-800',
      red: 'bg-red-100 text-red-800',
      indigo: 'bg-indigo-100 text-indigo-800'
    };
    return colorClasses[color as keyof typeof colorClasses] || colorClasses.blue;
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-3">
        {title}
      </label>
      <div className={getLayoutClasses()}>
        {options.map((option) => (
          <div key={option.id} className="flex items-start">
            <div className="flex items-center h-5">
              <input
                id={option.id}
                type="checkbox"
                checked={values[option.id] || false}
                onChange={(e) => onChange(option.id, e.target.checked)}
                disabled={disabled || option.enabled === false}
                className={`rounded border-gray-300 focus:ring-2 focus:ring-blue-500 ${
                  option.enabled === false ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
            </div>
            <div className="ml-3 text-sm">
              <label 
                htmlFor={option.id}
                className={`flex items-center gap-2 cursor-pointer ${
                  option.enabled === false ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700'
                }`}
              >
                <span>{option.label}</span>
                {option.badge && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getBadgeClasses(option.color || 'blue')}`}>
                    {option.badge}
                  </span>
                )}
              </label>
              {option.description && (
                <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Preset configurations for common checkbox groups
export const createDisplayOptionsConfig = (): CheckboxOption[] => [
  {
    id: 'showCandles',
    label: 'Candlesticks',
    description: 'Display OHLC candlestick chart',
    color: 'green'
  },
  {
    id: 'showPivots',
    label: 'Pivot Points',
    description: 'Show detected swing highs and lows',
    color: 'blue'
  },
  {
    id: 'showTrendlines',
    label: 'Powerful Trendlines',
    description: 'Historical trendlines across all data',
    color: 'purple'
  },
  {
    id: 'showDynamicTrendlines',
    label: 'Dynamic Trendlines',
    description: 'Trendlines for visible time period only',
    color: 'indigo'
  },
  {
    id: 'showLocalTopBottom',
    label: 'Swing Highs/Lows',
    description: 'Local extremes and reversal points',
    color: 'red'
  },
  {
    id: 'showPivotLevels',
    label: 'Daily Pivot Levels',
    description: 'Traditional support/resistance levels',
    color: 'blue'
  },
  {
    id: 'showTrendCloud',
    label: 'Trend Cloud',
    description: 'Rolling 5-day price predictions',
    badge: 'NEW',
    color: 'purple'
  }
];

export const createAdvancedOptionsConfig = (): CheckboxOption[] => [
  {
    id: 'useCache',
    label: 'Use Cached Data',
    description: 'Load from cache for faster performance'
  },
  {
    id: 'enableRealtime',
    label: 'Real-time Updates',
    description: 'Auto-refresh data every 30 seconds',
    enabled: false
  },
  {
    id: 'showDebugInfo',
    label: 'Debug Information',
    description: 'Display calculation metrics and timing'
  }
];

export default CheckboxGroup;