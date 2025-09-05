import { MarketData } from '@/types';

// Cache for moving averages calculation
interface MACache {
  dataHash: string;
  periods: string;
  result: MovingAverageData[];
}

let maCache: MACache | null = null;

// Simple hash function for data
function hashData(data: MarketData[], periods: number[]): string {
  const dataHash = data.length > 0 ? 
    `${data.length}-${data[0]?.timestamp}-${data[data.length - 1]?.timestamp}-${data[data.length - 1]?.close}` : 
    '0';
  return `${dataHash}-${periods.join(',')}`;
}

export interface MovingAverage {
  period: number;
  value: number;
  color: string;
}

export interface MovingAverageData {
  timestamp: Date | string;
  movingAverages: MovingAverage[];
}

// Moving average periods: 20, 50, then increment by 25 until 250
export const MA_PERIODS = [20, 50, 75, 100, 125, 150, 175, 200, 225, 250];

// Rainbow color palette for different moving averages (10 distinct colors) - Flipped
export const MA_COLORS = [
  '#8000FF', // Purple - MA20
  '#0000FF', // Blue - MA50
  '#0080FF', // Sky Blue - MA75
  '#00FFFF', // Cyan - MA100
  '#00FF80', // Spring Green - MA125
  '#00FF00', // Green - MA150
  '#80FF00', // Lime - MA175
  '#FFFF00', // Yellow - MA200
  '#FF8000', // Orange - MA225
  '#FF0000'  // Red - MA250
];

// Get color for specific MA period
export const getMAColor = (period: number): string => {
  const index = MA_PERIODS.indexOf(period);
  return index !== -1 ? MA_COLORS[index] : '#6B7280'; // Default gray
};

/**
 * Calculate simple moving average for a given period
 * @param data Market data array
 * @param period Moving average period
 * @returns Array of moving average values (null for periods without enough data)
 */
export function calculateSMA(data: MarketData[], period: number): (number | null)[] {
  if (data.length === 0) return [];
  
  const smaValues: (number | null)[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      // Not enough data points for this period
      smaValues.push(null);
    } else {
      // Calculate average of the last 'period' closing prices
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sum += data[j].close;
      }
      smaValues.push(sum / period);
    }
  }
  
  return smaValues;
}

/**
 * Calculate moving averages for viewport-specific data (for performance)
 * @param data Market data array
 * @param startIndex Start index for calculation
 * @param endIndex End index for calculation
 * @param periods Array of periods to calculate
 * @returns Array of MovingAverageData for the specified range
 */
export function calculateMovingAveragesForRange(
  data: MarketData[],
  startIndex: number,
  endIndex: number,
  periods: number[] = MA_PERIODS
): MovingAverageData[] {
  if (data.length === 0) return [];
  
  // Extend range to include data needed for MA calculations
  const maxPeriod = Math.max(...periods);
  const extendedStart = Math.max(0, startIndex - maxPeriod);
  const extendedEnd = Math.min(data.length, endIndex + maxPeriod);
  
  console.log(`📊 MA Range calc: ${extendedStart}-${extendedEnd} (${extendedEnd - extendedStart} points) for viewport ${startIndex}-${endIndex}`);
  
  // Calculate MAs for extended range
  const extendedData = data.slice(extendedStart, extendedEnd);
  const allMAs = calculateAllMovingAverages(extendedData, periods);
  
  // Return only the viewport portion
  const viewportOffset = startIndex - extendedStart;
  const viewportSize = endIndex - startIndex;
  
  return allMAs.slice(viewportOffset, viewportOffset + viewportSize);
}

/**
 * Optimized: Calculate all moving averages for the given market data
 * Uses efficient rolling window calculation to minimize computations
 * @param data Market data array
 * @param periods Array of periods to calculate (defaults to MA_PERIODS)
 * @returns Array of MovingAverageData with timestamps and MA values
 */
export function calculateAllMovingAverages(
  data: MarketData[],
  periods: number[] = MA_PERIODS
): MovingAverageData[] {
  if (data.length === 0) return [];
  
  // Check cache first
  const dataHash = hashData(data, periods);
  if (maCache && maCache.dataHash === dataHash) {
    console.log('🚀 MA Cache hit - returning cached result');
    return maCache.result;
  }
  
  console.log(`📊 Calculating MAs for ${data.length} data points with ${periods.length} periods`);
  const startTime = performance.now();
  
  // Optimize: Use rolling window calculation for better performance
  const result: MovingAverageData[] = [];
  const sortedPeriods = [...periods].sort((a, b) => a - b); // Sort for optimization
  
  // Pre-allocate arrays for better memory usage
  const windowSums: Record<number, number> = {};
  const windowCounts: Record<number, number> = {};
  
  // Initialize window tracking
  for (const period of sortedPeriods) {
    windowSums[period] = 0;
    windowCounts[period] = 0;
  }
  
  for (let i = 0; i < data.length; i++) {
    const currentPrice = data[i].close;
    const movingAverages: MovingAverage[] = [];
    
    for (const period of sortedPeriods) {
      // Add current price to window
      windowSums[period] += currentPrice;
      windowCounts[period]++;
      
      // Remove oldest price if window is full
      if (windowCounts[period] > period) {
        const oldestPrice = data[i - period].close;
        windowSums[period] -= oldestPrice;
        windowCounts[period] = period;
      }
      
      // Calculate MA if we have enough data
      if (windowCounts[period] >= Math.min(period, i + 1)) {
        const maValue = windowSums[period] / windowCounts[period];
        movingAverages.push({
          period,
          value: maValue,
          color: getMAColor(period)
        });
      }
    }
    
    result.push({
      timestamp: data[i].timestamp,
      movingAverages
    });
  }
  
  const endTime = performance.now();
  console.log(`⚡ MA calculation completed in ${(endTime - startTime).toFixed(2)}ms`);
  
  // Cache the result
  maCache = {
    dataHash,
    periods: periods.join(','),
    result
  };
  
  return result;
}

/**
 * Get current moving average values (last data point)
 * @param data Market data array
 * @param periods Array of periods to calculate
 * @returns Object with current MA values
 */
export function getCurrentMovingAverages(
  data: MarketData[],
  periods: number[] = MA_PERIODS
): Record<number, number | null> {
  if (data.length === 0) return {};
  
  const result: Record<number, number | null> = {};
  
  for (const period of periods) {
    const smaValues = calculateSMA(data, period);
    result[period] = smaValues.length > 0 ? smaValues[smaValues.length - 1] : null;
  }
  
  return result;
}

/**
 * Analyze price position relative to moving averages
 * @param currentPrice Current stock price
 * @param currentMAs Current moving average values
 * @returns Analysis object with position info
 */
export function analyzeMAPosition(
  currentPrice: number,
  currentMAs: Record<number, number | null>
) {
  let aboveCount = 0;
  let belowCount = 0;
  let totalMAs = 0;
  
  const analysis: Array<{
    period: number;
    value: number;
    position: 'above' | 'below';
    distance: number;
    distancePercent: number;
  }> = [];
  
  for (const period of MA_PERIODS) {
    const maValue = currentMAs[period];
    if (maValue !== null) {
      totalMAs++;
      const position = currentPrice > maValue ? 'above' : 'below';
      const distance = currentPrice - maValue;
      const distancePercent = (distance / maValue) * 100;
      
      if (position === 'above') {
        aboveCount++;
      } else {
        belowCount++;
      }
      
      analysis.push({
        period,
        value: maValue,
        position,
        distance,
        distancePercent
      });
    }
  }
  
  const bullishPercent = totalMAs > 0 ? (aboveCount / totalMAs) * 100 : 0;
  const overallTrend = bullishPercent > 50 ? 'bullish' : 'bearish';
  
  return {
    analysis,
    aboveCount,
    belowCount,
    totalMAs,
    bullishPercent,
    overallTrend
  };
}