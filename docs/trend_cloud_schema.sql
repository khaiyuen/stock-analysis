-- Trend Cloud Database Schema
-- Stores rolling trend cloud calculations for future price predictions

-- Main trend cloud calculations table
CREATE TABLE trend_clouds (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    calculation_date DATE NOT NULL,
    target_date DATE NOT NULL,
    timeframe VARCHAR(5) NOT NULL, -- '1D', '1W', '1M', etc.
    total_weight DECIMAL(12,4) NOT NULL,
    peak_price DECIMAL(12,4) NOT NULL,
    peak_weight DECIMAL(12,4) NOT NULL,
    price_range_min DECIMAL(12,4) NOT NULL,
    price_range_max DECIMAL(12,4) NOT NULL,
    confidence_score DECIMAL(4,3) NOT NULL, -- 0.000 to 1.000
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite index for efficient queries
    UNIQUE(symbol, calculation_date, target_date, timeframe)
);

-- Individual cloud points (price levels with weights)
CREATE TABLE trend_cloud_points (
    id SERIAL PRIMARY KEY,
    trend_cloud_id INTEGER NOT NULL REFERENCES trend_clouds(id) ON DELETE CASCADE,
    price_level DECIMAL(12,4) NOT NULL,
    weight DECIMAL(12,4) NOT NULL,
    trendline_count INTEGER NOT NULL,
    confidence DECIMAL(4,3) NOT NULL,
    
    -- Metadata
    lookback_days INTEGER NOT NULL,
    total_trendlines INTEGER NOT NULL,
    avg_trendline_strength DECIMAL(6,3) NOT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trend cloud calculation metadata
CREATE TABLE trend_cloud_metadata (
    id SERIAL PRIMARY KEY,
    trend_cloud_id INTEGER NOT NULL REFERENCES trend_clouds(id) ON DELETE CASCADE,
    calculation_duration_ms INTEGER,
    data_points_used INTEGER,
    pivot_points_detected INTEGER,
    trendlines_detected INTEGER,
    processing_version VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_trend_clouds_symbol_date ON trend_clouds(symbol, calculation_date);
CREATE INDEX idx_trend_clouds_target_date ON trend_clouds(target_date);
CREATE INDEX idx_trend_cloud_points_cloud_id ON trend_cloud_points(trend_cloud_id);
CREATE INDEX idx_trend_cloud_points_price ON trend_cloud_points(price_level);
CREATE INDEX idx_trend_cloud_points_weight ON trend_cloud_points(weight DESC);

-- Historical accuracy tracking (for validation)
CREATE TABLE trend_cloud_accuracy (
    id SERIAL PRIMARY KEY,
    trend_cloud_id INTEGER NOT NULL REFERENCES trend_clouds(id),
    actual_price DECIMAL(12,4), -- Actual price on target_date
    predicted_price DECIMAL(12,4), -- Peak price from cloud
    price_deviation DECIMAL(12,4), -- abs(actual - predicted)
    hit_cloud BOOLEAN, -- Did actual price fall within cloud range?
    accuracy_score DECIMAL(4,3), -- Accuracy metric
    validation_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_accuracy_validation ON trend_cloud_accuracy(validation_date);
CREATE INDEX idx_accuracy_symbol ON trend_cloud_accuracy(trend_cloud_id);

-- Views for easy querying
CREATE VIEW v_trend_cloud_summary AS
SELECT 
    tc.symbol,
    tc.calculation_date,
    tc.target_date,
    tc.timeframe,
    tc.peak_price,
    tc.confidence_score,
    COUNT(tcp.id) as cloud_point_count,
    MAX(tcp.weight) as max_point_weight,
    tcm.trendlines_detected,
    tca.actual_price,
    tca.accuracy_score
FROM trend_clouds tc
LEFT JOIN trend_cloud_points tcp ON tc.id = tcp.trend_cloud_id
LEFT JOIN trend_cloud_metadata tcm ON tc.id = tcm.trend_cloud_id
LEFT JOIN trend_cloud_accuracy tca ON tc.id = tca.trend_cloud_id
GROUP BY tc.id, tc.symbol, tc.calculation_date, tc.target_date, 
         tc.timeframe, tc.peak_price, tc.confidence_score,
         tcm.trendlines_detected, tca.actual_price, tca.accuracy_score;

-- Function to get trend cloud for specific date range
CREATE OR REPLACE FUNCTION get_trend_clouds_for_range(
    p_symbol VARCHAR(10),
    p_start_date DATE,
    p_end_date DATE,
    p_timeframe VARCHAR(5) DEFAULT '1D'
)
RETURNS TABLE (
    calculation_date DATE,
    target_date DATE,
    peak_price DECIMAL(12,4),
    confidence_score DECIMAL(4,3),
    cloud_points JSON
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        tc.calculation_date,
        tc.target_date,
        tc.peak_price,
        tc.confidence_score,
        json_agg(
            json_build_object(
                'price_level', tcp.price_level,
                'weight', tcp.weight,
                'confidence', tcp.confidence,
                'trendline_count', tcp.trendline_count
            ) ORDER BY tcp.weight DESC
        ) as cloud_points
    FROM trend_clouds tc
    JOIN trend_cloud_points tcp ON tc.id = tcp.trend_cloud_id
    WHERE tc.symbol = p_symbol
      AND tc.timeframe = p_timeframe
      AND tc.calculation_date BETWEEN p_start_date AND p_end_date
    GROUP BY tc.id, tc.calculation_date, tc.target_date, tc.peak_price, tc.confidence_score
    ORDER BY tc.calculation_date;
END;
$$ LANGUAGE plpgsql;