/**
 * High Volume Anchored VWAP Calculator - Frontend Implementation
 *
 * Converted from Python implementation for client-side performance.
 * Calculates Volume Weighted Average Price from high volume anchor days.
 */

interface CandleData {
  timestamp: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface VolumeAnchor {
  date: string;
  price: number;
  typicalPrice: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  volumeRatio: number;
  daysAfter: number;
  index: number;
  dayRangePercent?: number;
  gapPercent?: number;
  significanceScore?: number;
}

interface VWAPPoint {
  date: string;
  vwap: number;
  priceDeviation: number;
  cumulativeVolume: number;
  currentPrice: number;
}

interface VWAPResult {
  anchorId: string;
  anchorDate: string;
  anchor: VolumeAnchor;
  vwapData: VWAPPoint[];
}

interface TrendAnalysis {
  currentPrice: number;
  totalVwaps: number;
  aboveVwapCount: number;
  aboveVwapPercentage: number;
  averageDeviation: number;
  bullishTrends: number;
  bearishTrends: number;
  bullishPercentage: number;
  bearishPercentage: number;
}

interface HighVolumeVWAPResponse {
  volumeAnchors: VolumeAnchor[];
  vwapResults: VWAPResult[];
  trendAnalysis: TrendAnalysis;
  parameters: {
    topVolumeDays: number;
    volumePercentileThreshold: number;
    startDate: string;
  };
}

/**
 * Calculate percentile value from array
 */
function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (upper >= sorted.length) return sorted[sorted.length - 1];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Identify highest volume days as VWAP anchors
 */
function identifyHighVolumeAnchors(
  candleData: CandleData[],
  topVolumeDays: number = 30,
  minDaysAfterAnchor: number = 5,
  volumePercentileThreshold: number = 80
): VolumeAnchor[] {
  // Calculate volume statistics
  const volumes = candleData.map(candle => candle.volume);
  const volumeThreshold = percentile(volumes, volumePercentileThreshold);
  const avgVolume = volumes.reduce((sum, vol) => sum + vol, 0) / volumes.length;

  // Filter for high volume days
  const highVolumeDays = candleData
    .map((candle, index) => ({
      ...candle,
      index,
      typicalPrice: (candle.high + candle.low + candle.close) / 3
    }))
    .filter(candle => candle.volume >= volumeThreshold)
    .sort((a, b) => b.volume - a.volume);

  // Select top volume days with enough data after them
  const volumeAnchors: VolumeAnchor[] = [];

  // Guard against empty candleData array
  if (candleData.length === 0) {
    return volumeAnchors;
  }

  const maxDate = new Date(candleData[candleData.length - 1].date);

  for (const candle of highVolumeDays) {
    const anchorDate = new Date(candle.date);
    const daysAfter = Math.floor((maxDate.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysAfter >= minDaysAfterAnchor) {
      volumeAnchors.push({
        date: candle.date,
        price: candle.close,
        typicalPrice: candle.typicalPrice,
        volume: candle.volume,
        high: candle.high,
        low: candle.low,
        open: candle.open,
        volumeRatio: candle.volume / avgVolume,
        daysAfter,
        index: candle.index
      });

      if (volumeAnchors.length >= topVolumeDays) {
        break;
      }
    }
  }

  return volumeAnchors;
}

/**
 * Analyze significance of volume anchor days
 */
function analyzeVolumeAnchorSignificance(
  volumeAnchors: VolumeAnchor[],
  candleData: CandleData[]
): VolumeAnchor[] {
  for (const anchor of volumeAnchors) {
    const anchorCandle = candleData.find(candle => candle.date === anchor.date);

    if (anchorCandle) {
      // Calculate day range percentage
      const dayRangePercent = ((anchorCandle.high - anchorCandle.low) / anchorCandle.close) * 100;

      // Calculate gap percentage if previous day data available
      let gapPercent = 0;
      const anchorIndex = candleData.findIndex(candle => candle.date === anchor.date);
      if (anchorIndex > 0 && anchorCandle.open > 0) {
        const prevClose = candleData[anchorIndex - 1].close;
        gapPercent = ((anchorCandle.open - prevClose) / prevClose) * 100;
      }

      // Calculate significance score
      const significanceScore = (
        anchor.volumeRatio * 0.4 +  // Volume weight
        Math.abs(gapPercent) * 0.3 + // Gap significance
        dayRangePercent * 0.3        // Intraday volatility
      );

      anchor.dayRangePercent = dayRangePercent;
      anchor.gapPercent = gapPercent;
      anchor.significanceScore = significanceScore;
    }
  }

  // Sort by significance score
  return volumeAnchors.sort((a, b) => (b.significanceScore || 0) - (a.significanceScore || 0));
}

/**
 * Calculate VWAP from anchor point forward
 */
function calculateVWAPFromAnchor(
  candleData: CandleData[],
  anchorIndex: number
): VWAPPoint[] {
  const vwapData: VWAPPoint[] = [];
  let cumulativeVolume = 0;
  let cumulativeVolumeWeighted = 0;

  for (let i = anchorIndex; i < candleData.length; i++) {
    const candle = candleData[i];

    // Use closing price for daily VWAP calculations (more standard for daily timeframes)
    const price = candle.close;

    // Add current bar to cumulative calculations
    cumulativeVolume += candle.volume;
    cumulativeVolumeWeighted += candle.volume * price;

    // Calculate VWAP
    const vwap = cumulativeVolume > 0 ? cumulativeVolumeWeighted / cumulativeVolume : price;

    // Calculate price deviation
    const priceDeviation = vwap > 0 ? ((candle.close - vwap) / vwap) * 100 : 0;

    vwapData.push({
      date: candle.date,
      vwap,
      priceDeviation,
      cumulativeVolume,
      currentPrice: candle.close
    });
  }

  return vwapData;
}

/**
 * Calculate high volume VWAPs for all anchors
 */
function calculateHighVolumeVWAPs(
  candleData: CandleData[],
  volumeAnchors: VolumeAnchor[],
  minDaysAfterAnchor: number = 5
): VWAPResult[] {
  const vwapResults: VWAPResult[] = [];

  for (let i = 0; i < volumeAnchors.length; i++) {
    const anchor = volumeAnchors[i];
    const anchorIndex = candleData.findIndex(candle => candle.date === anchor.date);

    if (anchorIndex >= 0) {
      const remainingDays = candleData.length - anchorIndex;

      if (remainingDays > minDaysAfterAnchor) {
        const vwapData = calculateVWAPFromAnchor(candleData, anchorIndex);

        vwapResults.push({
          anchorId: `volume_anchor_${i + 1}`,
          anchorDate: anchor.date,
          anchor,
          vwapData
        });
      }
    }
  }

  return vwapResults;
}

/**
 * Analyze trends across VWAP calculations
 */
function analyzeHighVolumeVWAPTrends(
  vwapResults: VWAPResult[],
  candleData: CandleData[]
): TrendAnalysis {
  const currentPrice = candleData[candleData.length - 1].close;

  const allDeviations: number[] = [];
  let bullishTrends = 0;
  let bearishTrends = 0;

  for (const result of vwapResults) {
    const { vwapData } = result;

    if (vwapData.length < 10) continue;

    const currentVwap = vwapData[vwapData.length - 1].vwap;
    const deviation = ((currentPrice - currentVwap) / currentVwap) * 100;
    allDeviations.push(deviation);

    // Analyze VWAP trend direction (slope over last 20 periods)
    if (vwapData.length >= 20) {
      const recentVwaps = vwapData.slice(-20).map(d => d.vwap);
      const vwapSlope = (recentVwaps[recentVwaps.length - 1] - recentVwaps[0]) / recentVwaps.length;

      if (vwapSlope > currentVwap * 0.001) {
        bullishTrends++;
      } else if (vwapSlope < -currentVwap * 0.001) {
        bearishTrends++;
      }
    }
  }

  const aboveVwapCount = allDeviations.filter(d => d > 0).length;
  const totalTrends = bullishTrends + bearishTrends;

  return {
    currentPrice,
    totalVwaps: vwapResults.length,
    aboveVwapCount,
    aboveVwapPercentage: allDeviations.length > 0 ? (aboveVwapCount / allDeviations.length) * 100 : 0,
    averageDeviation: allDeviations.length > 0 ? allDeviations.reduce((sum, d) => sum + d, 0) / allDeviations.length : 0,
    bullishTrends,
    bearishTrends,
    bullishPercentage: totalTrends > 0 ? (bullishTrends / totalTrends) * 100 : 0,
    bearishPercentage: totalTrends > 0 ? (bearishTrends / totalTrends) * 100 : 0
  };
}

/**
 * Main function to run complete high volume VWAP analysis
 */
export function calculateHighVolumeVWAP(
  candleData: CandleData[],
  options: {
    topVolumeDays?: number;
    volumePercentileThreshold?: number;
    minDaysAfterAnchor?: number;
    startDate?: string;
    endDate?: string;
  } = {}
): HighVolumeVWAPResponse {
  const {
    topVolumeDays = 30,
    volumePercentileThreshold = 80,
    minDaysAfterAnchor = 5,
    startDate,
    endDate
  } = options;

  // Filter data by date range if provided
  // This allows for focused analysis on specific time periods
  let filteredData = candleData;
  if (startDate || endDate) {
    filteredData = candleData.filter(candle => {
      const candleTime = new Date(candle.date).getTime();
      let include = true;

      if (startDate) {
        const startDateTime = new Date(startDate).getTime();
        include = include && candleTime >= startDateTime;
      }

      if (endDate) {
        const endDateTime = new Date(endDate).getTime();
        include = include && candleTime <= endDateTime;
      }

      return include;
    });
  }

  // Guard against empty filtered data
  if (filteredData.length === 0) {
    return {
      volumeAnchors: [],
      vwapResults: [],
      trendAnalysis: {
        currentPrice: 0,
        totalVwaps: 0,
        aboveVwapCount: 0,
        aboveVwapPercentage: 0,
        averageDeviation: 0,
        bullishTrends: 0,
        bearishTrends: 0,
        bullishPercentage: 0,
        bearishPercentage: 0
      },
      parameters: {
        topVolumeDays,
        volumePercentileThreshold,
        startDate: startDate || 'all-time',
        endDate: endDate || 'all-time'
      }
    };
  }

  // Step 1: Identify high volume anchors
  let volumeAnchors = identifyHighVolumeAnchors(
    filteredData,
    topVolumeDays,
    minDaysAfterAnchor,
    volumePercentileThreshold
  );

  // Step 2: Analyze anchor significance
  volumeAnchors = analyzeVolumeAnchorSignificance(volumeAnchors, filteredData);

  // Step 3: Calculate VWAPs
  const vwapResults = calculateHighVolumeVWAPs(filteredData, volumeAnchors, minDaysAfterAnchor);

  // Step 4: Analyze trends
  const trendAnalysis = analyzeHighVolumeVWAPTrends(vwapResults, filteredData);

  return {
    volumeAnchors,
    vwapResults,
    trendAnalysis,
    parameters: {
      topVolumeDays,
      volumePercentileThreshold,
      startDate: startDate || 'all-time',
      endDate: endDate || 'all-time'
    }
  };
}

/**
 * Convert candle data format for compatibility
 */
export function convertCandleDataFormat(candles: any[]): CandleData[] {
  return candles.map(candle => ({
    timestamp: candle.timestamp,
    date: new Date(candle.timestamp).toISOString().split('T')[0],
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume
  }));
}