import { NextRequest, NextResponse } from 'next/server';
import { MultiTimeframeService } from '@/lib/data/multi-timeframe-service';
import { PivotDetector } from '@/lib/analysis/pivot-detector';
import { Timeframe, PivotPoint, APIResponse } from '@/types';

const dataService = new MultiTimeframeService();
const pivotDetector = new PivotDetector();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<NextResponse<APIResponse<Record<Timeframe, PivotPoint[]>>>> {
  const startTime = Date.now();

  try {
    const { symbol } = await params;
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const timeframe = searchParams.get('timeframe') as Timeframe || '1D';
    const minStrength = parseFloat(searchParams.get('minStrength') || '0');
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

    console.log(`Fetching pivots for ${symbol} ${timeframe}`);

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

    // Detect pivot points
    let pivots = pivotDetector.detectPivots(marketData, timeframe);

    // Filter by minimum strength if specified
    if (minStrength > 0) {
      pivots = pivots.filter(pivot => pivot.strength >= minStrength);
    }

    // Validate pivots
    const { valid: validPivots, rejected } = pivotDetector.validatePivots(pivots, marketData);
    
    if (rejected.length > 0) {
      console.warn(`Rejected ${rejected.length} invalid pivots for ${symbol} ${timeframe}`);
    }

    // Get detection statistics
    const stats = pivotDetector.getDetectionStats(validPivots, marketData);

    const result: Record<Timeframe, PivotPoint[]> = {} as Record<Timeframe, PivotPoint[]>;
    result[timeframe] = validPivots;

    return NextResponse.json({
      success: true,
      data: result,
      metadata: {
        timestamp: new Date(),
        version: '1.0.0',
        stats,
        processingTime: Date.now() - startTime,
        dataPoints: marketData.length,
        rejectedPivots: rejected.length
      }
    });

  } catch (error) {
    const { symbol: errorSymbol } = await params;
    console.error(`Pivot detection error for ${errorSymbol}:`, error);
    
    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to detect pivot points',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }, { status: 500 });
  }
}