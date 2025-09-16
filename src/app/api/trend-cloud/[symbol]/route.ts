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

    // Parse query parameters
    const autoUpdate = searchParams.get('autoUpdate') !== 'false'; // Default to true
    const forceUpdate = searchParams.get('forceUpdate') === 'true';

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

    const normalizedSymbol = symbol.toUpperCase();
    const continuousTrendCloudsPath = path.resolve(process.cwd(), `results/${normalizedSymbol}_continuous_trend_clouds.json`);

    let trendCloudsData: ContinuousTrendCloudsData;
    let dataWasUpdated = false;

    // Auto-update logic: Check data freshness and update if needed
    if (autoUpdate || forceUpdate) {
      try {
        const { DataFreshnessService } = await import('@/lib/services/data-freshness-service');
        const freshnessService = new DataFreshnessService();

        console.log(`🔍 Checking data freshness for ${normalizedSymbol}...`);
        const freshness = await freshnessService.checkDataFreshness(normalizedSymbol, ['1D', '1W', '1M']);

        const needsUpdate = forceUpdate || freshness.needsUpdate || !fs.existsSync(continuousTrendCloudsPath);

        if (needsUpdate) {
          console.log(`🔄 Auto-updating data for ${normalizedSymbol}...`, {
            reasons: freshness.recommendations,
            force: forceUpdate
          });

          // Trigger auto-update
          const autoUpdateUrl = new URL(request.url);
          autoUpdateUrl.pathname = `/api/data/auto-update/${normalizedSymbol}`;
          autoUpdateUrl.search = forceUpdate ? '?force=true' : '';

          const updateRequest = new NextRequest(autoUpdateUrl.toString(), {
            method: 'POST',
            headers: request.headers,
            body: JSON.stringify({
              force: forceUpdate,
              timeframes: '1D,1W,1M',
              generateTrends: true
            })
          });

          // Import and call the auto-update function
          const { POST: autoUpdatePost } = await import('@/app/api/data/auto-update/[symbol]/route');
          const updateResponse = await autoUpdatePost(updateRequest, { params: Promise.resolve({ symbol: normalizedSymbol }) });
          const updateResult = await updateResponse.json();

          if (updateResult.success && updateResult.data.stage === 'completed') {
            dataWasUpdated = true;
            console.log(`✅ Auto-update completed for ${normalizedSymbol}:`, updateResult.data.results);
          } else {
            console.warn(`⚠️ Auto-update had issues for ${normalizedSymbol}:`, updateResult.data.errors || 'Unknown error');
            // Continue anyway - might still have usable cached data
          }
        } else {
          console.log(`✅ Data is up to date for ${normalizedSymbol}`);
        }

      } catch (error) {
        console.warn(`⚠️ Auto-update failed for ${normalizedSymbol}:`, error);
        // Continue with existing data if auto-update fails
      }
    }

    // Load continuous trend clouds data
    try {
      if (!fs.existsSync(continuousTrendCloudsPath)) {
        return NextResponse.json({
          success: false,
          error: {
            code: 'NO_DATA',
            message: `Trend clouds data not found for ${normalizedSymbol}. ${autoUpdate ? 'Auto-update may have failed.' : 'Try with ?autoUpdate=true to generate the data.'}`
          }
        }, { status: 404 });
      }

      console.log(`📊 Loading continuous trend clouds from: ${continuousTrendCloudsPath}`);
      trendCloudsData = JSON.parse(fs.readFileSync(continuousTrendCloudsPath, 'utf-8'));
      console.log(`📊 Loaded ${trendCloudsData.trend_clouds.length} trend clouds for ${normalizedSymbol}`);

    } catch (error) {
      console.error(`Error loading trend clouds for ${normalizedSymbol}:`, error);
      return NextResponse.json({
        success: false,
        error: {
          code: 'FILE_READ_ERROR',
          message: `Failed to read trend clouds data for ${normalizedSymbol}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      }, { status: 500 });
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
        auto_update: {
          enabled: autoUpdate,
          data_was_updated: dataWasUpdated,
          force_update_requested: forceUpdate
        },
        data_info: {
          total_clouds: trendCloudsData.trend_clouds.length,
          support_clouds: trendCloudsData.summary.support_clouds,
          resistance_clouds: trendCloudsData.summary.resistance_clouds,
          analysis_period_days: trendCloudsData.metadata.analysis_period_days,
          file_path: continuousTrendCloudsPath
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