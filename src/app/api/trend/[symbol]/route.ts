import { NextRequest, NextResponse } from 'next/server';
import { MultiTimeframeService } from '@/lib/data/multi-timeframe-service';
import { PivotDetector } from '@/lib/analysis/pivot-detector';
import { TrendlineGenerator } from '@/lib/analysis/trendline-generator';
import { ConvergenceAnalyzer } from '@/lib/analysis/convergence-analyzer';
import { TrendAnalysis, Timeframe, APIResponse } from '@/types';

// Initialize services
const dataService = new MultiTimeframeService();
const pivotDetector = new PivotDetector();
const trendlineGenerator = new TrendlineGenerator();
const convergenceAnalyzer = new ConvergenceAnalyzer();

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
): Promise<NextResponse<APIResponse<TrendAnalysis>>> {
  const startTime = Date.now();
  
  try {
    const { symbol } = params;
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const timeframesParam = searchParams.get('timeframes') || '1D,4H,1H';
    const timeframes = timeframesParam.split(',') as Timeframe[];
    const useCache = searchParams.get('useCache') !== 'false';
    const forceRefresh = searchParams.get('forceRefresh') === 'true';

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

    // Validate timeframes
    const validTimeframes: Timeframe[] = ['1M', '1W', '1D', '4H', '1H'];
    const invalidTimeframes = timeframes.filter(tf => !validTimeframes.includes(tf));
    if (invalidTimeframes.length > 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: `Invalid timeframes: ${invalidTimeframes.join(', ')}`
        }
      }, { status: 400 });
    }

    console.log(`Starting trend analysis for ${symbol} with timeframes: ${timeframes.join(', ')}`);

    // Clear cache if force refresh requested
    if (forceRefresh) {
      dataService.clearCache(symbol);
    }

    // Fetch multi-timeframe data
    const multiTimeframeData = await dataService.getMultiTimeframeData(
      symbol,
      timeframes,
      useCache
    );

    // Validate data quality
    const dataQualityIssues: string[] = [];
    for (const [timeframe, data] of Object.entries(multiTimeframeData)) {
      const validation = dataService.validateDataQuality(data, timeframe as Timeframe);
      if (!validation.isValid) {
        dataQualityIssues.push(...validation.issues.map(issue => `${timeframe}: ${issue}`));
      }
    }

    if (dataQualityIssues.length > 0) {
      console.warn(`Data quality issues for ${symbol}:`, dataQualityIssues);
    }

    // Detect pivot points for each timeframe
    const pivotPoints: Record<Timeframe, any[]> = {} as Record<Timeframe, any[]>;
    const trendLines: Record<Timeframe, any[]> = {} as Record<Timeframe, any[]>;
    const dataPoints: Record<Timeframe, number> = {} as Record<Timeframe, number>;
    const lastUpdated: Record<Timeframe, Date> = {} as Record<Timeframe, Date>;

    for (const timeframe of timeframes) {
      const data = multiTimeframeData[timeframe];
      if (!data || data.length === 0) {
        pivotPoints[timeframe] = [];
        trendLines[timeframe] = [];
        dataPoints[timeframe] = 0;
        lastUpdated[timeframe] = new Date();
        continue;
      }

      try {
        // Detect pivot points
        const pivots = pivotDetector.detectPivots(data, timeframe);
        pivotPoints[timeframe] = pivots;

        // Generate trendlines
        const lines = trendlineGenerator.generateTrendlines(pivots, data, timeframe);
        trendLines[timeframe] = lines;

        dataPoints[timeframe] = data.length;
        lastUpdated[timeframe] = data[data.length - 1]?.timestamp || new Date();

        console.log(`${timeframe}: ${pivots.length} pivots, ${lines.length} trendlines`);
      } catch (error) {
        console.error(`Error processing ${timeframe} for ${symbol}:`, error);
        pivotPoints[timeframe] = [];
        trendLines[timeframe] = [];
        dataPoints[timeframe] = data.length;
        lastUpdated[timeframe] = new Date();
      }
    }

    // Combine all trendlines for convergence analysis
    const allTrendlines = Object.values(trendLines).flat();
    const allMarketData = Object.values(multiTimeframeData).flat()
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Identify convergence zones
    let convergenceZones = [];
    try {
      convergenceZones = convergenceAnalyzer.identifyConvergenceZones(
        allTrendlines,
        allMarketData
      );
      console.log(`Identified ${convergenceZones.length} convergence zones`);
    } catch (error) {
      console.error(`Error in convergence analysis for ${symbol}:`, error);
    }

    // Build response
    const analysis: TrendAnalysis = {
      symbol: symbol.toUpperCase(),
      timestamp: new Date(),
      timeframes,
      pivotPoints,
      trendLines,
      convergenceZones,
      marketData: multiTimeframeData, // Include market data for chart rendering
      metadata: {
        analysisTime: Date.now() - startTime,
        dataPoints,
        lastUpdated,
        cacheHits: 0 // TODO: Track cache hits
      }
    };

    return NextResponse.json({
      success: true,
      data: analysis,
      metadata: {
        timestamp: new Date(),
        version: '1.0.0'
      }
    });

  } catch (error) {
    console.error(`Trend analysis error for ${params.symbol}:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to perform trend analysis',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          symbol: params.symbol,
          duration: Date.now() - startTime
        }
      }
    }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { symbol: string } }
): Promise<NextResponse<APIResponse<TrendAnalysis>>> {
  try {
    const body = await request.json();
    const { symbol } = params;

    // Parse request body for custom configuration
    const {
      timeframes = ['1D', '4H', '1H'],
      config = {},
      useCache = true,
      forceRefresh = false
    } = body;

    // Build URL with parameters for GET request
    const url = new URL(`/api/trend/${symbol}`, request.url);
    url.searchParams.set('timeframes', timeframes.join(','));
    url.searchParams.set('useCache', useCache.toString());
    url.searchParams.set('forceRefresh', forceRefresh.toString());

    // Forward to GET handler with modified request
    const getRequest = new NextRequest(url.toString(), {
      method: 'GET',
      headers: request.headers,
    });

    return await GET(getRequest, { params });

  } catch (error) {
    console.error(`POST trend analysis error for ${params.symbol}:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to parse request body'
      }
    }, { status: 400 });
  }
}