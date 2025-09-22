import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

interface HighVolumeVWAPResponse {
  success: boolean;
  data?: {
    symbol: string;
    volume_anchors: Array<{
      date: string;
      price: number;
      volume: number;
      volume_ratio: number;
      significance_score: number;
      days_after: number;
    }>;
    vwap_results: Array<{
      anchor_id: string;
      anchor_date: string;
      vwap_data: Array<{
        date: string;
        vwap: number;
        price_deviation: number;
        current_price: number;
      }>;
    }>;
    trend_analysis: {
      current_price: number;
      total_vwaps: number;
      above_vwap_count: number;
      above_vwap_percentage: number;
      average_deviation: number;
      bullish_trends: number;
      bearish_trends: number;
      bullish_percentage: number;
      bearish_percentage: number;
    };
    parameters: {
      top_volume_days: number;
      volume_percentile_threshold: number;
      start_date: string;
    };
  };
  error?: {
    message: string;
    code?: string;
  };
  metadata?: {
    generated_at: string;
    processing_time_ms: number;
    cache_hit: boolean;
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const startTime = Date.now();
  const { symbol } = await params;

  if (!symbol) {
    return NextResponse.json({
      success: false,
      error: { message: 'Symbol is required', code: 'MISSING_SYMBOL' }
    }, { status: 400 });
  }

  // Get query parameters
  const searchParams = request.nextUrl.searchParams;
  const topVolumeDays = parseInt(searchParams.get('top_volume_days') || '30');
  const volumeThreshold = parseInt(searchParams.get('volume_threshold') || '80');
  const startDate = searchParams.get('start_date') || '2023-01-01';
  const useCache = searchParams.get('use_cache') !== 'false';

  try {
    // Validate parameters
    if (topVolumeDays < 1 || topVolumeDays > 100) {
      return NextResponse.json({
        success: false,
        error: { message: 'top_volume_days must be between 1 and 100', code: 'INVALID_PARAMETER' }
      }, { status: 400 });
    }

    if (volumeThreshold < 50 || volumeThreshold > 99) {
      return NextResponse.json({
        success: false,
        error: { message: 'volume_threshold must be between 50 and 99', code: 'INVALID_PARAMETER' }
      }, { status: 400 });
    }

    // Call Python script for high volume VWAP analysis
    const pythonScriptPath = path.join(process.cwd(), 'scripts', 'api_high_volume_vwap.py');

    const pythonArgs = [
      pythonScriptPath,
      symbol.toUpperCase(),
      topVolumeDays.toString(),
      volumeThreshold.toString(),
      startDate,
      useCache.toString()
    ];

    console.log(`🚀 Starting high volume VWAP analysis for ${symbol}...`);
    console.log(`Parameters: ${topVolumeDays} days, ${volumeThreshold}% threshold, from ${startDate}`);

    const result = await new Promise<HighVolumeVWAPResponse>((resolve, reject) => {
      const pythonProcess = spawn('python3', pythonArgs);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`Python process exited with code ${code}`);
          console.error(`stderr: ${stderr}`);
          reject(new Error(`Python analysis failed with code ${code}: ${stderr}`));
        } else {
          try {
            const result = JSON.parse(stdout) as HighVolumeVWAPResponse;
            resolve(result);
          } catch (parseError) {
            console.error('Failed to parse Python output:', parseError);
            console.error('stdout:', stdout);
            console.error('stderr:', stderr);
            reject(new Error(`Failed to parse analysis results: ${parseError}`));
          }
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('Failed to start Python process:', error);
        reject(new Error(`Failed to start analysis process: ${error.message}`));
      });
    });

    // Add metadata
    const processingTime = Date.now() - startTime;

    const response: HighVolumeVWAPResponse = {
      ...result,
      metadata: {
        generated_at: new Date().toISOString(),
        processing_time_ms: processingTime,
        cache_hit: false // Python script will handle cache logic
      }
    };

    console.log(`✅ High volume VWAP analysis completed for ${symbol} in ${processingTime}ms`);

    return NextResponse.json(response);

  } catch (error) {
    console.error(`❌ High volume VWAP analysis failed for ${symbol}:`, error);

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        code: 'ANALYSIS_FAILED'
      },
      metadata: {
        generated_at: new Date().toISOString(),
        processing_time_ms: processingTime,
        cache_hit: false
      }
    }, { status: 500 });
  }
}

// Optional: Add POST method for more complex analysis requests
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params;

  try {
    const body = await request.json();

    // Forward to GET with query parameters
    const searchParams = new URLSearchParams({
      top_volume_days: body.topVolumeDays?.toString() || '30',
      volume_threshold: body.volumeThreshold?.toString() || '80',
      start_date: body.startDate || '2023-01-01',
      use_cache: body.useCache?.toString() || 'true'
    });

    const url = new URL(request.url);
    url.search = searchParams.toString();

    return GET(
      new NextRequest(url, { method: 'GET' }),
      { params: Promise.resolve({ symbol }) }
    );

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: {
        message: 'Invalid request body',
        code: 'INVALID_REQUEST'
      }
    }, { status: 400 });
  }
}