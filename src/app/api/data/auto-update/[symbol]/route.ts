import { NextRequest, NextResponse } from 'next/server';
import { DataFreshnessService } from '@/lib/services/data-freshness-service';
import { MultiTimeframeService } from '@/lib/data/multi-timeframe-service';
import { APIResponse, Timeframe } from '@/types';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const freshnessService = new DataFreshnessService();
const multiTimeframeService = new MultiTimeframeService();

interface UpdateProgress {
  stage: 'checking' | 'fetching_data' | 'generating_trends' | 'completed' | 'error';
  message: string;
  progress: number; // 0-100
  startTime: Date;
  currentTime: Date;
  estimatedCompletion?: Date;
  errors?: string[];
  results?: {
    dataUpdated: boolean;
    trendsGenerated: boolean;
    recordsFetched: number;
    trendCloudsCount: number;
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
): Promise<NextResponse<APIResponse<UpdateProgress>>> {
  const startTime = Date.now();
  const updateStartTime = new Date();

  try {
    const { symbol } = await params;
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));

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

    // Parse options
    const forceUpdate = searchParams.get('force') === 'true' || body.force === true;
    const timeframesParam = searchParams.get('timeframes') || body.timeframes || '1D,1W,1M';
    const timeframes = timeframesParam.split(',') as Timeframe[];
    const generateTrends = searchParams.get('trends') !== 'false' && body.generateTrends !== false;

    console.log(`🚀 Starting auto-update for ${normalizedSymbol}:`, {
      force: forceUpdate,
      timeframes,
      generateTrends
    });

    const progress: UpdateProgress = {
      stage: 'checking',
      message: 'Checking data freshness...',
      progress: 5,
      startTime: updateStartTime,
      currentTime: new Date()
    };

    // Stage 1: Check if update is needed
    let needsUpdate = forceUpdate;
    let freshnessCheck;

    try {
      freshnessCheck = await freshnessService.checkDataFreshness(normalizedSymbol, timeframes);

      if (!forceUpdate) {
        needsUpdate = freshnessCheck.needsUpdate;
      }

      progress.message = needsUpdate
        ? `Update needed: ${freshnessCheck.recommendations.join(', ')}`
        : 'Data is up to date';
      progress.progress = 15;

      if (!needsUpdate && !forceUpdate) {
        progress.stage = 'completed';
        progress.message = 'All data is up to date - no update needed';
        progress.progress = 100;
        progress.results = {
          dataUpdated: false,
          trendsGenerated: false,
          recordsFetched: 0,
          trendCloudsCount: 0
        };

        return NextResponse.json({
          success: true,
          data: progress,
          metadata: {
            timestamp: new Date(),
            processingTime: Date.now() - startTime
          }
        });
      }

    } catch (error) {
      console.error(`Freshness check failed for ${normalizedSymbol}:`, error);
      progress.stage = 'error';
      progress.message = 'Failed to check data freshness';
      progress.errors = [error instanceof Error ? error.message : 'Unknown error'];

      return NextResponse.json({
        success: false,
        data: progress,
        error: {
          code: 'FRESHNESS_CHECK_FAILED',
          message: progress.message
        }
      }, { status: 500 });
    }

    let totalRecordsFetched = 0;
    let dataUpdated = false;

    // Stage 2: Update market data if needed
    if (needsUpdate) {
      progress.stage = 'fetching_data';
      progress.message = 'Fetching latest market data...';
      progress.progress = 25;
      progress.currentTime = new Date();

      try {
        console.log(`📊 Fetching missing data for ${normalizedSymbol} timeframes: ${timeframes.join(', ')}`);

        // Import SmartDataManager for gap-filling capability
        const { SmartDataManager } = await import('@/lib/data/smart-data-manager');
        const smartDataManager = new SmartDataManager();

        // Fetch data for each timeframe using smart gap-filling
        for (let i = 0; i < timeframes.length; i++) {
          const timeframe = timeframes[i];
          progress.message = `Filling gaps in ${timeframe} data...`;
          progress.progress = 25 + (i / timeframes.length) * 30;

          // Get required data points for this timeframe
          const requiredPoints = multiTimeframeService['dataPoints'][timeframe] || 1000;

          // Use smart data manager with gap filling enabled
          const result = await smartDataManager.getMarketData(
            normalizedSymbol,
            timeframe,
            requiredPoints,
            {
              forceRefresh: forceUpdate,
              maxAge: timeframe === '1D' ? 6 : timeframe === '1W' ? 24 : 72, // Hours
              fillGaps: true
            }
          );

          totalRecordsFetched += result.fetched; // Only count newly fetched records
          console.log(`✅ ${timeframe}: ${result.data.length} total records, ${result.fetched} newly fetched, ${result.cached} from cache`);
          if (result.errors) {
            console.warn(`   ⚠️ Errors: ${result.errors.join(', ')}`);
          }
        }

        // Clear MultiTimeframeService cache so it picks up the newly fetched data
        multiTimeframeService.clearCache(normalizedSymbol);

        dataUpdated = true;
        console.log(`📈 Total records fetched: ${totalRecordsFetched}`);

      } catch (error) {
        console.error(`Data fetch failed for ${normalizedSymbol}:`, error);
        progress.stage = 'error';
        progress.message = 'Failed to fetch market data';
        progress.errors = [error instanceof Error ? error.message : 'Unknown error'];

        return NextResponse.json({
          success: false,
          data: progress,
          error: {
            code: 'DATA_FETCH_FAILED',
            message: progress.message
          }
        }, { status: 500 });
      }
    }

    let trendCloudsGenerated = false;
    let trendCloudsCount = 0;

    // Stage 3: Generate trend clouds if needed
    if (generateTrends && (needsUpdate || forceUpdate || !freshnessCheck?.trendClouds.exists)) {
      progress.stage = 'generating_trends';
      progress.message = 'Generating trend cloud analysis...';
      progress.progress = 60;
      progress.currentTime = new Date();

      try {
        console.log(`🔄 Generating trend clouds for ${normalizedSymbol}...`);

        const trendResult = await generateTrendClouds(normalizedSymbol);

        if (trendResult.success) {
          trendCloudsGenerated = true;
          trendCloudsCount = trendResult.cloudCount;
          console.log(`✅ Generated ${trendCloudsCount} trend clouds for ${normalizedSymbol}`);
        } else {
          throw new Error(trendResult.error || 'Trend cloud generation failed');
        }

      } catch (error) {
        console.error(`Trend cloud generation failed for ${normalizedSymbol}:`, error);
        // Don't fail the entire request if trend clouds fail - data update might still be valuable
        progress.errors = progress.errors || [];
        progress.errors.push(`Trend cloud generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.warn('Continuing despite trend cloud generation failure...');
      }
    }

    // Stage 4: Completion
    progress.stage = 'completed';
    progress.message = `Update completed successfully for ${normalizedSymbol}`;
    progress.progress = 100;
    progress.currentTime = new Date();
    progress.results = {
      dataUpdated,
      trendsGenerated: trendCloudsGenerated,
      recordsFetched: totalRecordsFetched,
      trendCloudsCount
    };

    console.log(`🎉 Auto-update completed for ${normalizedSymbol}:`, progress.results);

    return NextResponse.json({
      success: true,
      data: progress,
      metadata: {
        timestamp: new Date(),
        processingTime: Date.now() - startTime,
        totalDuration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`
      }
    });

  } catch (error) {
    const { symbol } = await params;
    console.error(`Auto-update error for ${symbol}:`, error);

    const errorProgress: UpdateProgress = {
      stage: 'error',
      message: 'Auto-update failed',
      progress: 0,
      startTime: updateStartTime,
      currentTime: new Date(),
      errors: [error instanceof Error ? error.message : 'Unknown error']
    };

    return NextResponse.json({
      success: false,
      data: errorProgress,
      error: {
        code: 'AUTO_UPDATE_FAILED',
        message: 'Auto-update process failed',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          symbol,
          duration: Date.now() - startTime
        }
      }
    }, { status: 500 });
  }
}

/**
 * Generate trend clouds using Python script
 */
async function generateTrendClouds(symbol: string): Promise<{
  success: boolean;
  cloudCount: number;
  error?: string;
}> {
  return new Promise((resolve) => {
    const projectRoot = process.cwd();
    const scriptPath = path.join(projectRoot, 'generate_trend_clouds.py'); // Assuming this script exists

    // Check if Python script exists
    if (!fs.existsSync(scriptPath)) {
      resolve({
        success: false,
        cloudCount: 0,
        error: `Trend cloud generation script not found at ${scriptPath}`
      });
      return;
    }

    console.log(`🐍 Running Python trend cloud generation: python ${scriptPath} ${symbol}`);

    const pythonProcess = spawn('python', [scriptPath, symbol], {
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`📊 Python stdout: ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.warn(`⚠️ Python stderr: ${data.toString().trim()}`);
    });

    pythonProcess.on('close', (code) => {
      console.log(`🐍 Python process exited with code ${code}`);

      if (code === 0) {
        // Try to read the generated file to count clouds
        const resultsPath = path.join(projectRoot, 'results', `${symbol}_continuous_trend_clouds.json`);

        try {
          if (fs.existsSync(resultsPath)) {
            const data = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
            const cloudCount = data.trend_clouds?.length || 0;

            resolve({
              success: true,
              cloudCount,
            });
          } else {
            resolve({
              success: false,
              cloudCount: 0,
              error: 'Trend clouds file was not generated'
            });
          }
        } catch (error) {
          resolve({
            success: false,
            cloudCount: 0,
            error: `Failed to read generated trend clouds: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      } else {
        resolve({
          success: false,
          cloudCount: 0,
          error: `Python script failed with exit code ${code}. Error: ${stderr || 'No error message'}`
        });
      }
    });

    pythonProcess.on('error', (error) => {
      console.error('🐍 Python process error:', error);
      resolve({
        success: false,
        cloudCount: 0,
        error: `Failed to start Python process: ${error.message}`
      });
    });

    // Set timeout to prevent hanging
    setTimeout(() => {
      if (!pythonProcess.killed) {
        pythonProcess.kill();
        resolve({
          success: false,
          cloudCount: 0,
          error: 'Python script timed out after 5 minutes'
        });
      }
    }, 5 * 60 * 1000); // 5 minutes timeout
  });
}