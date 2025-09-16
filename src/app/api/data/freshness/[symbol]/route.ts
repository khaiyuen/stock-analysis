import { NextRequest, NextResponse } from 'next/server';
import { DataFreshnessService } from '@/lib/services/data-freshness-service';
import { APIResponse, Timeframe } from '@/types';

const freshnessService = new DataFreshnessService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<NextResponse<APIResponse<any>>> {
  const startTime = Date.now();

  try {
    const { symbol } = await params;
    const { searchParams } = new URL(request.url);

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

    // Parse timeframes
    const timeframesParam = searchParams.get('timeframes') || '1D,1W,1M';
    const timeframes = timeframesParam.split(',') as Timeframe[];

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

    console.log(`🔍 Checking data freshness for ${symbol} with timeframes: ${timeframes.join(', ')}`);

    // Check data freshness
    const freshness = await freshnessService.checkDataFreshness(symbol, timeframes);
    const priority = await freshnessService.getUpdatePriority(symbol);

    console.log(`📊 Freshness check complete for ${symbol}:`, {
      needsUpdate: freshness.needsUpdate,
      priority: priority.priority,
      recommendations: freshness.recommendations.length
    });

    return NextResponse.json({
      success: true,
      data: {
        ...freshness,
        updatePriority: priority
      },
      metadata: {
        timestamp: new Date(),
        version: '1.0.0',
        processingTime: Date.now() - startTime
      }
    });

  } catch (error) {
    const { symbol } = await params;
    console.error(`Data freshness check error for ${symbol}:`, error);

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check data freshness',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          symbol,
          duration: Date.now() - startTime
        }
      }
    }, { status: 500 });
  }
}

// Get database status
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<NextResponse<APIResponse<any>>> {
  try {
    const { symbol } = await params;

    if (symbol === 'database-status') {
      const status = await freshnessService.getDatabaseStatus();

      return NextResponse.json({
        success: true,
        data: status,
        metadata: {
          timestamp: new Date(),
          version: '1.0.0'
        }
      });
    }

    return NextResponse.json({
      success: false,
      error: {
        code: 'INVALID_ENDPOINT',
        message: 'Use GET for symbol freshness check or POST to database-status for database status'
      }
    }, { status: 400 });

  } catch (error) {
    console.error('Database status check error:', error);

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check database status'
      }
    }, { status: 500 });
  }
}