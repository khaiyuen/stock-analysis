import { NextRequest, NextResponse } from 'next/server';
import { APIResponse } from '@/types';
import fs from 'fs';
import path from 'path';

interface TrendCloud {
  calculation_date: string;
  projection_start: string;
  projection_end: string;
  center_price: number;
  price_range: [number, number];
  cloud_type: 'Support' | 'Resistance';
  cloud_id: string;
  unique_trendlines: number;
  total_weighted_strength: number;
  softmax_weight: number;
  merged_from: number;
  current_price: number;
}

interface ContinuousTrendCloudsData {
  metadata: {
    symbol: string;
    generation_date: string;
    analysis_start_date: string;
    analysis_end_date: string;
    analysis_period_days: number;
    window_size: number;
    step_size: number;
    successful_calculations: number;
    total_calculation_points: number;
    total_trend_clouds: number;
    parameters: {
      max_trendlines: number;
      projection_days: number;
      half_life_days: number;
      min_pivot_weight: number;
      weight_factor: number;
      min_convergence_trendlines: number;
      convergence_tolerance: number;
      merge_threshold: number;
      max_trend_clouds: number;
      temperature: number;
    };
  };
  trend_clouds: TrendCloud[];
  summary: {
    resistance_clouds: number;
    support_clouds: number;
    avg_strength: number;
    avg_trendlines_per_cloud: number;
    merged_cloud_count: number;
    merge_rate_percent: number;
  };
}

interface DetailedCluster {
  cluster_type: 'Support' | 'Resistance';
  center_price: number;
  price_range: [number, number];
  softmax_weight: number;
  total_strength: number;
  unique_trendlines: number;
  cloud_id: string;
  projection_start: string;
  projection_end: string;
}

interface DetailedResult {
  window_id: string;
  date: string;
  current_price: number;
  pivots: number;
  consolidated_clusters: DetailedCluster[];
}

interface FullAnalysisWindow {
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

interface FullAnalysisCluster {
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

interface CompactWindow {
  id: number;
  d: number;
  p: number;
  pv: number;
  t?: unknown[];
  c: CompactCluster[];
}

interface CompactCluster {
  t: number;
  p: number;
  s: number;
  r: number;
  w: number;
}

interface TrendCloudAnalysis {
  symbol: string;
  timestamp: Date;
  metadata: {
    generation_date: string;
    analysis_start_date: string;
    analysis_end_date: string;
    analysis_period_days: number;
    parameters: {
      max_trendlines: number;
      projection_days: number;
      half_life_days: number;
      min_pivot_weight: number;
      weight_factor: number;
      min_convergence_trendlines: number;
      convergence_tolerance: number;
      merge_threshold: number;
      max_trend_clouds: number;
      temperature: number;
    };
  };
  trend_clouds: TrendCloud[];
  current_signals: {
    strongest_support: TrendCloud | null;
    strongest_resistance: TrendCloud | null;
    all_support_clouds: TrendCloud[];
    all_resistance_clouds: TrendCloud[];
    confidence_score: number;
  };
  summary: {
    resistance_clouds: number;
    support_clouds: number;
    avg_strength: number;
    avg_trendlines_per_cloud: number;
    merged_cloud_count: number;
    merge_rate_percent: number;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<NextResponse<APIResponse<TrendCloudAnalysis>>> {
  const startTime = Date.now();
  
  try {
    console.log(`🔍 API CALL: trend-cloud/${request.url}`);
    const { symbol } = await params;
    console.log(`🔍 Symbol: ${symbol}`);
    const { searchParams } = new URL(request.url);
    console.log(`🔍 Search params: ${searchParams.toString()}`);
    
    // Validate symbol
    if (!symbol || symbol.length > 10) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_SYMBOL',
          message: 'Invalid symbol provided'
        }
      }, { status: 400 });
    }

    // Load continuous trend clouds data
    const continuousTrendCloudsPath = path.resolve(process.cwd(), `results/${symbol.toUpperCase()}_continuous_trend_clouds.json`);
    
    let trendCloudsData: ContinuousTrendCloudsData;

    try {
      if (!fs.existsSync(continuousTrendCloudsPath)) {
        throw new Error(`Continuous trend clouds file not found: ${continuousTrendCloudsPath}`);
      }

      console.log(`📊 Loading continuous trend clouds from: ${continuousTrendCloudsPath}`);
      trendCloudsData = JSON.parse(fs.readFileSync(continuousTrendCloudsPath, 'utf-8'));
      console.log(`📊 Loaded ${trendCloudsData.trend_clouds.length} trend clouds for ${symbol}`);

    } catch (error) {
      console.error(`Error loading trend clouds for ${symbol}:`, error);
      throw new Error(`Trend clouds data not found for ${symbol}. Please generate the continuous trend clouds first.`);
    }

    if (trendCloudsData.trend_clouds.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'NO_DATA',
          message: `No trend clouds found for ${symbol}. Please generate the analysis first.`
        }
      }, { status: 404 });
    }

    // Process current signals
    const supportClouds = trendCloudsData.trend_clouds.filter(cloud => cloud.cloud_type === 'Support');
    const resistanceClouds = trendCloudsData.trend_clouds.filter(cloud => cloud.cloud_type === 'Resistance');

    const strongest_support = supportClouds.length > 0 
      ? supportClouds.reduce((max, cloud) => cloud.softmax_weight > max.softmax_weight ? cloud : max)
      : null;

    const strongest_resistance = resistanceClouds.length > 0 
      ? resistanceClouds.reduce((max, cloud) => cloud.softmax_weight > max.softmax_weight ? cloud : max)
      : null;

    // Calculate confidence score based on the strongest cloud weight
    const confidence_score = Math.max(
      ...trendCloudsData.trend_clouds.map(cloud => cloud.softmax_weight)
    );

    // Build analysis response
    const analysis: TrendCloudAnalysis = {
      symbol: symbol.toUpperCase(),
      timestamp: new Date(),
      metadata: trendCloudsData.metadata,
      trend_clouds: trendCloudsData.trend_clouds,
      current_signals: {
        strongest_support,
        strongest_resistance,
        all_support_clouds: supportClouds,
        all_resistance_clouds: resistanceClouds,
        confidence_score
      },
      summary: trendCloudsData.summary
    };

    console.log(`✅ Loaded continuous trend clouds: ${trendCloudsData.trend_clouds.length} clouds, confidence: ${confidence_score.toFixed(3)}`);

    return NextResponse.json({
      success: true,
      data: analysis,
      metadata: {
        timestamp: new Date(),
        version: '2.0.0',
        processing_time: Date.now() - startTime,
        data_info: {
          total_clouds: trendCloudsData.trend_clouds.length,
          support_clouds: trendCloudsData.summary.support_clouds,
          resistance_clouds: trendCloudsData.summary.resistance_clouds,
          analysis_period_days: trendCloudsData.metadata.analysis_period_days
        }
      }
    });

  } catch (error) {
    const { symbol } = await params;
    console.error(`Trend cloud analysis error for ${symbol}:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to load trend cloud analysis',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          symbol,
          duration: Date.now() - startTime
        }
      }
    }, { status: 500 });
  }
}