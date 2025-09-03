import { NextRequest, NextResponse } from 'next/server';
import { generateRollingTrendClouds } from '@/lib/trendCloud';
import { TrendCloudStore } from '@/lib/data/trend-cloud-store';
import { HistoricalDataStore } from '@/lib/data/historical-data-store';
import { Timeframe } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      symbol = 'QQQ', 
      timeframe = '1D',
      intervalDays = 5,
      force = false // Force recalculation even if data exists
    } = body;

    console.log(`Starting trend cloud calculation for ${symbol} (${timeframe})`);

    // Initialize database stores
    const dataStore = new HistoricalDataStore();
    const cloudStore = new TrendCloudStore();

    // Get available data range for the symbol
    const ranges = await dataStore.getDataRanges(symbol);
    const range = ranges.find(r => r.timeframe === timeframe);
    
    if (!range || range.recordCount < 500) {
      return NextResponse.json({
        success: false,
        error: {
          message: `Insufficient ${symbol} data for trend cloud calculation. Need at least 500 records, found ${range?.recordCount || 0}`,
          type: 'INSUFFICIENT_DATA'
        }
      }, { status: 400 });
    }

    console.log(`Found data range: ${range.startDate.toISOString()} to ${range.endDate.toISOString()} (${range.recordCount} records)`);

    // Check if we already have trend clouds (unless force is true)
    if (!force) {
      const hasExisting = await cloudStore.hasTrendClouds(
        symbol,
        range.startDate,
        range.endDate,
        timeframe as Timeframe
      );
      
      if (hasExisting) {
        const stats = await cloudStore.getStats(symbol);
        return NextResponse.json({
          success: true,
          message: `Trend clouds already exist for ${symbol}. Use force=true to recalculate.`,
          data: {
            symbol,
            timeframe,
            dataRange: range,
            stats,
            action: 'skipped'
          }
        });
      }
    }

    // Get market data
    console.log(`Retrieving market data for ${symbol}...`);
    const marketData = await dataStore.getMarketData(
      symbol,
      range.startDate,
      range.endDate,
      timeframe as Timeframe
    );

    if (marketData.length < 365) {
      return NextResponse.json({
        success: false,
        error: {
          message: `Need at least 365 days of data for trend cloud calculation. Found ${marketData.length} days.`,
          type: 'INSUFFICIENT_DATA'
        }
      }, { status: 400 });
    }

    // Calculate start date (need 1 year of lookback, so start 1 year after data begins)
    const dataStart = new Date(marketData[0].timestamp);
    const calculationStart = new Date(dataStart);
    calculationStart.setFullYear(calculationStart.getFullYear() + 1); // Start after 1-year lookback

    const calculationEnd = new Date(marketData[marketData.length - 1].timestamp);

    console.log(`Calculating trend clouds from ${calculationStart.toISOString()} to ${calculationEnd.toISOString()}`);

    // Generate rolling trend clouds
    const clouds = await generateRollingTrendClouds(
      symbol,
      marketData,
      calculationStart,
      calculationEnd,
      timeframe as Timeframe,
      intervalDays
    );

    console.log(`Generated ${clouds.length} trend clouds`);

    // Save clouds to database
    let saveCount = 0;
    let errorCount = 0;
    const errors: Array<{ date: string; error: string }> = [];

    console.log('Starting database save...');
    const startTime = Date.now();

    for (let i = 0; i < clouds.length; i++) {
      const cloud = clouds[i];
      try {
        await cloudStore.saveTrendCloud(cloud);
        saveCount++;
        
        // Log progress every 100 saves or 10%
        if (saveCount % 100 === 0 || (i + 1) % Math.max(1, Math.floor(clouds.length / 10)) === 0) {
          const progress = ((i + 1) / clouds.length * 100).toFixed(1);
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = saveCount / elapsed;
          console.log(`Progress: ${progress}% (${i + 1}/${clouds.length}) - Saved: ${saveCount}, Rate: ${rate.toFixed(1)}/sec`);
        }
      } catch (error) {
        errorCount++;
        errors.push({
          date: cloud.calculationDate.toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        if (errors.length <= 10) {
          console.error(`Error saving cloud for ${cloud.calculationDate.toISOString()}:`, error);
        }
      }
    }

    const totalTime = (Date.now() - startTime) / 1000;
    const avgRate = saveCount / totalTime;

    console.log(`Completed: Saved ${saveCount}/${clouds.length} clouds in ${totalTime.toFixed(1)}s (${avgRate.toFixed(1)}/sec)`);

    // Get final stats
    const stats = await cloudStore.getStats(symbol);

    return NextResponse.json({
      success: true,
      message: `Successfully calculated and saved trend clouds for ${symbol}`,
      data: {
        symbol,
        timeframe,
        dataRange: {
          dataStart: dataStart.toISOString(),
          dataEnd: calculationEnd.toISOString(),
          calculationStart: calculationStart.toISOString(),
          calculationEnd: calculationEnd.toISOString(),
          totalDataPoints: marketData.length
        },
        calculation: {
          totalClouds: clouds.length,
          savedClouds: saveCount,
          errorCount,
          successRate: `${((saveCount / clouds.length) * 100).toFixed(1)}%`,
          totalTime: `${totalTime.toFixed(1)}s`,
          avgRate: `${avgRate.toFixed(1)} clouds/sec`
        },
        stats,
        errors: errors.slice(0, 5) // Return first 5 errors
      }
    });

  } catch (error) {
    console.error('Trend cloud calculation error:', error);
    return NextResponse.json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        stack: error instanceof Error ? error.stack?.substring(0, 1000) : 'No stack trace',
        type: 'CALCULATION_ERROR'
      }
    }, { status: 500 });
  }
}

// DELETE endpoint to clear trend cloud data
export async function DELETE(request: NextRequest) {
  try {
    const cloudStore = new TrendCloudStore();
    await cloudStore.clearAll();
    cloudStore.close();
    
    return NextResponse.json({
      success: true,
      message: 'All trend cloud data cleared'
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }, { status: 500 });
  }
}

// GET endpoint to check calculation status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol') || 'QQQ';
    
    const cloudStore = new TrendCloudStore();
    const dataStore = new HistoricalDataStore();
    
    // Get data range info
    const ranges = await dataStore.getDataRanges(symbol);
    const range = ranges.find(r => r.timeframe === '1D');
    
    // Get cloud stats
    const stats = await cloudStore.getStats(symbol);
    
    return NextResponse.json({
      success: true,
      data: {
        symbol,
        dataRange: range ? {
          start: range.startDate.toISOString(),
          end: range.endDate.toISOString(),
          recordCount: range.recordCount
        } : null,
        trendClouds: stats,
        hasData: range && range.recordCount >= 500,
        hasClouds: stats.totalClouds > 0,
        recommendation: stats.totalClouds === 0 ? 'Run POST to calculate trend clouds' : 'Trend clouds available'
      }
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      }
    }, { status: 500 });
  }
}