import { NextRequest, NextResponse } from 'next/server';
import { generateRollingTrendClouds } from '@/lib/trendCloud';
import { TrendCloudStore } from '@/lib/data/trend-cloud-store';
import { HistoricalDataStore } from '@/lib/data/historical-data-store';
import { Timeframe } from '@/types';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const symbol = searchParams.get('symbol') || 'QQQ';
  const startDate = searchParams.get('startDate') || '2025-07-01';
  const endDate = searchParams.get('endDate') || '2025-08-31';
  const timeframe = searchParams.get('timeframe') || '1D';
  const useCache = searchParams.get('useCache') !== 'false';
  const forceRefresh = searchParams.get('forceRefresh') === 'true';
  
  try {
    console.log('Trend cloud API called:', { symbol, startDate, endDate, useCache, forceRefresh });
    
    const cloudStore = new TrendCloudStore();
    const dataStore = new HistoricalDataStore();
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Check if we have cached data (unless force refresh)
    if (useCache && !forceRefresh) {
      console.log('Checking for cached trend clouds...');
      const cachedClouds = await cloudStore.getTrendClouds(
        symbol,
        start,
        end,
        timeframe as Timeframe
      );
      
      if (cachedClouds.length > 0) {
        console.log(`Found ${cachedClouds.length} cached trend clouds`);
        
        // Calculate summary statistics
        const stats = {
          totalClouds: cachedClouds.length,
          avgConfidence: cachedClouds.length > 0 ? cachedClouds.reduce((sum, c) => sum + c.summary.confidenceScore, 0) / cachedClouds.length : 0,
          avgWeight: cachedClouds.length > 0 ? cachedClouds.reduce((sum, c) => sum + c.summary.totalWeight, 0) / cachedClouds.length : 0,
          totalPoints: cachedClouds.reduce((sum, c) => sum + c.cloudPoints.length, 0),
          dateRange: {
            start: cachedClouds.length > 0 ? cachedClouds[0].calculationDate : null,
            end: cachedClouds.length > 0 ? cachedClouds[cachedClouds.length - 1].calculationDate : null
          }
        };
        
        cloudStore.close();
        dataStore.close();
        
        return NextResponse.json({
          success: true,
          cached: true,
          data: {
            clouds: cachedClouds,
            stats
          }
        });
      }
    }
    
    // No cached data or force refresh - calculate new clouds
    console.log('No cached data found or force refresh requested. Calculating new trend clouds...');
    
    // Get available data range
    const ranges = await dataStore.getDataRanges(symbol);
    const range = ranges.find(r => r.timeframe === timeframe);
    
    if (!range || range.recordCount < 500) {
      cloudStore.close();
      dataStore.close();
      return NextResponse.json({
        success: false,
        error: {
          message: `Insufficient ${symbol} data for trend cloud calculation. Need at least 500 records, found ${range?.recordCount || 0}`,
          type: 'INSUFFICIENT_DATA'
        }
      }, { status: 400 });
    }
    
    // Calculate lookback start (1 year before requested start date)
    const lookbackStart = new Date(start);
    lookbackStart.setFullYear(lookbackStart.getFullYear() - 1);
    
    // Ensure we have enough historical data
    if (range.startDate > lookbackStart) {
      lookbackStart.setTime(range.startDate.getTime());
    }
    
    // Get market data including lookback period
    const marketData = await dataStore.getMarketData(
      symbol,
      lookbackStart,
      end,
      timeframe as Timeframe
    );
    
    if (marketData.length < 365) {
      cloudStore.close();
      dataStore.close();
      return NextResponse.json({
        success: false,
        error: {
          message: `Need at least 365 days of data for trend cloud calculation. Found ${marketData.length} days.`,
          type: 'INSUFFICIENT_DATA'
        }
      }, { status: 400 });
    }
    
    console.log(`Using ${marketData.length} market data points for calculation`);
    
    // Generate rolling trend clouds
    const clouds = await generateRollingTrendClouds(
      symbol,
      marketData,
      start,
      end,
      timeframe as Timeframe,
      5 // intervalDays
    );
    
    console.log(`Generated ${clouds.length} trend clouds`);
    
    // Save to cache
    let savedCount = 0;
    for (const cloud of clouds) {
      try {
        await cloudStore.saveTrendCloud(cloud);
        savedCount++;
      } catch (error) {
        console.error('Error saving cloud to cache:', error);
      }
    }
    
    console.log(`Saved ${savedCount}/${clouds.length} clouds to cache`);
    
    // Calculate summary statistics
    const stats = {
      totalClouds: clouds.length,
      avgConfidence: clouds.length > 0 ? clouds.reduce((sum, c) => sum + c.summary.confidenceScore, 0) / clouds.length : 0,
      avgWeight: clouds.length > 0 ? clouds.reduce((sum, c) => sum + c.summary.totalWeight, 0) / clouds.length : 0,
      totalPoints: clouds.reduce((sum, c) => sum + c.cloudPoints.length, 0),
      dateRange: {
        start: clouds.length > 0 ? clouds[0].calculationDate : null,
        end: clouds.length > 0 ? clouds[clouds.length - 1].calculationDate : null
      }
    };
    
    cloudStore.close();
    dataStore.close();
    
    return NextResponse.json({
      success: true,
      cached: false,
      data: {
        clouds,
        stats
      }
    });
    
  } catch (error) {
    console.error('Trend cloud calculation error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack?.substring(0, 1000) : 'No stack trace available';
    
    return NextResponse.json({
      success: false,
      error: {
        message: errorMessage,
        stack: errorStack,
        type: 'CALCULATION_ERROR'
      }
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, startDate, endDate, timeframe = '1D', intervalDays = 5, force = false } = body;
    
    if (!symbol || !startDate || !endDate) {
      return NextResponse.json({
        success: false,
        error: { message: 'Missing required parameters: symbol, startDate, endDate' }
      }, { status: 400 });
    }
    
    console.log('POST trend cloud calculation:', { symbol, startDate, endDate, force });
    
    const cloudStore = new TrendCloudStore();
    const dataStore = new HistoricalDataStore();
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Check if we already have data (unless force is true)
    if (!force) {
      const existingClouds = await cloudStore.getTrendClouds(
        symbol,
        start,
        end,
        timeframe as Timeframe
      );
      
      if (existingClouds.length > 0) {
        cloudStore.close();
        dataStore.close();
        return NextResponse.json({
          success: true,
          message: `Trend clouds already exist for ${symbol} in specified range. Use force=true to recalculate.`,
          data: {
            symbol,
            totalClouds: existingClouds.length,
            dateRange: { startDate, endDate },
            action: 'skipped'
          }
        });
      }
    }
    
    // Get available data range
    const ranges = await dataStore.getDataRanges(symbol);
    const range = ranges.find(r => r.timeframe === timeframe);
    
    if (!range || range.recordCount < 500) {
      cloudStore.close();
      dataStore.close();
      return NextResponse.json({
        success: false,
        error: {
          message: `Insufficient ${symbol} data for trend cloud calculation. Need at least 500 records, found ${range?.recordCount || 0}`,
          type: 'INSUFFICIENT_DATA'
        }
      }, { status: 400 });
    }
    
    // Calculate lookback start (1 year before requested start date)
    const lookbackStart = new Date(start);
    lookbackStart.setFullYear(lookbackStart.getFullYear() - 1);
    
    // Ensure we have enough historical data
    if (range.startDate > lookbackStart) {
      lookbackStart.setTime(range.startDate.getTime());
    }
    
    // Get market data including lookback period
    const marketData = await dataStore.getMarketData(
      symbol,
      lookbackStart,
      end,
      timeframe as Timeframe
    );
    
    if (marketData.length < 365) {
      cloudStore.close();
      dataStore.close();
      return NextResponse.json({
        success: false,
        error: {
          message: `Need at least 365 days of data for trend cloud calculation. Found ${marketData.length} days.`,
          type: 'INSUFFICIENT_DATA'
        }
      }, { status: 400 });
    }
    
    // Generate and save trend clouds
    const clouds = await generateRollingTrendClouds(
      symbol,
      marketData,
      start,
      end,
      timeframe as Timeframe,
      intervalDays
    );
    
    // Save to database
    let saveCount = 0;
    const errors = [];
    
    for (const cloud of clouds) {
      try {
        await cloudStore.saveTrendCloud(cloud);
        saveCount++;
      } catch (error) {
        errors.push({
          date: cloud.calculationDate.toISOString(),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const stats = await cloudStore.getStats(symbol);
    
    cloudStore.close();
    dataStore.close();
    
    return NextResponse.json({
      success: true,
      message: `Processed ${clouds.length} trend clouds, saved ${saveCount} to database`,
      data: {
        symbol,
        totalClouds: clouds.length,
        savedClouds: saveCount,
        dateRange: { startDate, endDate },
        stats,
        errors: errors.slice(0, 5) // Return first 5 errors
      }
    });
    
  } catch (error) {
    console.error('POST trend cloud error:', error);
    return NextResponse.json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        stack: error instanceof Error ? error.stack?.substring(0, 1000) : 'No stack trace available'
      }
    }, { status: 500 });
  }
}