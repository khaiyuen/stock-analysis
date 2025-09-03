import { NextRequest, NextResponse } from 'next/server';
import { SmartDataManager } from '@/lib/data/smart-data-manager';
import { Timeframe } from '@/types';

interface SetupProgress {
  timeframe: Timeframe;
  progress: number;
  status: string;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { 
      symbol = 'QQQ', 
      timeframes = ['1D', '4H', '1H'],
      force = false 
    } = body;

    console.log(`📊 Starting data setup for ${symbol} with timeframes: ${timeframes.join(', ')}`);

    const dataManager = new SmartDataManager();
    const progressLog: SetupProgress[] = [];

    // Initial setup with progress tracking
    const result = await dataManager.initialDataSetup(
      symbol, 
      timeframes,
      (progress) => {
        console.log(`📈 ${progress.timeframe}: ${progress.progress}% - ${progress.status}`);
        progressLog.push(progress);
      }
    );

    // Get final storage statistics
    const stats = dataManager.getStorageStats();
    
    dataManager.close();

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: result.success,
      data: {
        symbol,
        timeframes,
        results: result.results,
        progress: progressLog,
        stats: {
          totalRecords: stats.totalRecords,
          dbSize: `${(stats.dbSize / 1024 / 1024).toFixed(2)} MB`,
          oldestRecord: stats.oldestRecord,
          newestRecord: stats.newestRecord,
          timeframeBreakdown: stats.timeframes
        },
        processingTime: `${(processingTime / 1000).toFixed(1)}s`
      },
      errors: result.errors.length > 0 ? result.errors : undefined,
      metadata: {
        timestamp: new Date(),
        version: '1.0.0'
      }
    });

  } catch (error) {
    console.error('Data setup error:', error);

    return NextResponse.json({
      success: false,
      error: {
        code: 'SETUP_ERROR',
        message: 'Failed to setup historical data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const dataManager = new SmartDataManager();
    const stats = dataManager.getStorageStats();
    dataManager.close();

    return NextResponse.json({
      success: true,
      data: {
        totalRecords: stats.totalRecords,
        uniqueSymbols: stats.uniqueSymbols,
        dbSize: `${(stats.dbSize / 1024 / 1024).toFixed(2)} MB`,
        oldestRecord: stats.oldestRecord,
        newestRecord: stats.newestRecord,
        timeframes: stats.timeframes
      }
    });

  } catch (error) {
    console.error('Stats error:', error);

    return NextResponse.json({
      success: false,
      error: {
        code: 'STATS_ERROR',
        message: 'Failed to get storage stats'
      }
    }, { status: 500 });
  }
}