import { NextRequest, NextResponse } from 'next/server';
import { MultiTimeframeService } from '@/lib/data/multi-timeframe-service';
import { PivotDetector } from '@/lib/analysis/pivot-detector';
import { TrendlineGenerator } from '@/lib/analysis/trendline-generator';
import { Timeframe, TrendLine, APIResponse } from '@/types';

const dataService = new MultiTimeframeService();
const pivotDetector = new PivotDetector();
const trendlineGenerator = new TrendlineGenerator();

export async function GET(
  request: NextRequest,
  { params }: { params: { symbol: string } }
): Promise<NextResponse<APIResponse<Record<Timeframe, TrendLine[]>>>> {
  const startTime = Date.now();

  try {
    const { symbol } = params;
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const timeframe = searchParams.get('timeframe') as Timeframe || '1D';
    const minStrength = parseFloat(searchParams.get('minStrength') || '0');
    const type = searchParams.get('type') as 'SUPPORT' | 'RESISTANCE' | undefined;
    const useCache = searchParams.get('useCache') !== 'false';

    // Validate inputs
    const validTimeframes: Timeframe[] = ['1M', '1W', '1D', '4H', '1H'];
    if (!validTimeframes.includes(timeframe)) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INVALID_PARAMETER',
          message: `Invalid timeframe: ${timeframe}`
        }
      }, { status: 400 });
    }

    console.log(`Generating trendlines for ${symbol} ${timeframe}`);

    // Fetch data for the specified timeframe
    const marketData = await dataService.getTimeframeData(symbol, timeframe, useCache);

    if (!marketData || marketData.length === 0) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'DATA_UNAVAILABLE',
          message: `No data available for ${symbol} ${timeframe}`
        }
      }, { status: 404 });
    }

    // Detect pivot points first
    const pivots = pivotDetector.detectPivots(marketData, timeframe);

    if (pivots.length < 2) {
      return NextResponse.json({
        success: false,
        error: {
          code: 'INSUFFICIENT_DATA',
          message: `Insufficient pivot points for trendline generation: ${pivots.length}`
        }
      }, { status: 400 });
    }

    // Generate trendlines
    let trendlines = trendlineGenerator.generateTrendlines(pivots, marketData, timeframe);

    // Filter by type if specified
    if (type) {
      trendlines = trendlines.filter(line => line.type === type);
    }

    // Filter by minimum strength if specified
    if (minStrength > 0) {
      trendlines = trendlines.filter(line => line.strength >= minStrength);
    }

    // Get trendline statistics
    const stats = trendlineGenerator.getLineStatistics(trendlines);

    const result: Record<Timeframe, TrendLine[]> = {} as Record<Timeframe, TrendLine[]>;
    result[timeframe] = trendlines;

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date(),
        version: '1.0.0',
        stats,
        processingTime: Date.now() - startTime,
        dataPoints: marketData.length,
        pivotCount: pivots.length
      }
    });

  } catch (error) {
    console.error(`Trendline generation error for ${params.symbol}:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to generate trendlines',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }, { status: 500 });
  }
}