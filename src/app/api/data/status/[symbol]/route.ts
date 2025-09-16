import { NextRequest, NextResponse } from 'next/server';
import { DataFreshnessService } from '@/lib/services/data-freshness-service';
import { APIResponse, Timeframe } from '@/types';
import fs from 'fs';
import path from 'path';

const freshnessService = new DataFreshnessService();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<NextResponse<APIResponse<any>>> {
  const startTime = Date.now();

  try {
    const { symbol } = await params;

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

    // Get comprehensive data status
    const freshness = await freshnessService.checkDataFreshness(normalizedSymbol, ['1D', '1W', '1M']);
    const priority = await freshnessService.getUpdatePriority(normalizedSymbol);

    // Check trend clouds file status
    const trendCloudsPath = path.resolve(process.cwd(), `results/${normalizedSymbol}_continuous_trend_clouds.json`);
    let trendCloudsInfo = null;

    if (fs.existsSync(trendCloudsPath)) {
      try {
        const stats = fs.statSync(trendCloudsPath);
        const data = JSON.parse(fs.readFileSync(trendCloudsPath, 'utf-8'));

        trendCloudsInfo = {
          exists: true,
          fileSize: stats.size,
          lastModified: stats.mtime,
          cloudCount: data.trend_clouds?.length || 0,
          supportClouds: data.summary?.support_clouds || 0,
          resistanceClouds: data.summary?.resistance_clouds || 0,
          analysisDateRange: {
            start: data.metadata?.analysis_start_date,
            end: data.metadata?.analysis_end_date,
            days: data.metadata?.analysis_period_days
          }
        };
      } catch (error) {
        trendCloudsInfo = {
          exists: true,
          error: 'Failed to read trend clouds file',
          details: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    // Get database health
    const dbStatus = await freshnessService.getDatabaseStatus();

    const status = {
      symbol: normalizedSymbol,
      marketData: freshness.marketData,
      trendClouds: {
        ...freshness.trendClouds,
        fileInfo: trendCloudsInfo
      },
      updateRecommendation: {
        needsUpdate: freshness.needsUpdate,
        priority: priority.priority,
        reasons: priority.reasons,
        estimatedTime: priority.estimatedUpdateTime,
        recommendations: freshness.recommendations
      },
      database: {
        isHealthy: dbStatus.isHealthy,
        totalRecords: dbStatus.totalRecords,
        availableSymbols: dbStatus.availableSymbols.length,
        error: dbStatus.error
      },
      systemHealth: {
        overallStatus: freshness.needsUpdate ? 'needs_update' : 'healthy',
        lastChecked: new Date(),
        issues: [
          ...freshness.recommendations,
          ...(dbStatus.error ? [`Database: ${dbStatus.error}`] : [])
        ]
      }
    };

    return NextResponse.json({
      success: true,
      data: status,
      metadata: {
        timestamp: new Date(),
        version: '1.0.0',
        processingTime: Date.now() - startTime
      }
    });

  } catch (error) {
    const { symbol } = await params;
    console.error(`Data status check error for ${symbol}:`, error);

    return NextResponse.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check data status',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          symbol,
          duration: Date.now() - startTime
        }
      }
    }, { status: 500 });
  }
}