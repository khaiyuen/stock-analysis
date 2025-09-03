# Machine Learning Training Guide

## Overview
Comprehensive guide for training neural networks to predict stock movements using technical, sentiment, seasonal, and macroeconomic indicators.

## Neural Network Architecture

### Model Design Philosophy
- **Multi-Modal Input**: Technical + Sentiment + Seasonal + Macro features
- **Temporal Patterns**: LSTM/GRU for time-series dependencies
- **Attention Mechanism**: Focus on most relevant indicators
- **Ensemble Methods**: Multiple models for robust predictions
- **Risk-Aware**: Uncertainty quantification in predictions

### Primary Architecture: Multi-Modal LSTM
```python
import tensorflow as tf
from tensorflow.keras import layers, Model

class StockPredictionModel:
    def __init__(self, config):
        self.config = config
        self.model = self._build_model()
    
    def _build_model(self):
        # Technical indicators input (sequence)
        technical_input = layers.Input(
            shape=(self.config['sequence_length'], self.config['technical_features']),
            name='technical_indicators'
        )
        
        # Sentiment indicators input (sequence)
        sentiment_input = layers.Input(
            shape=(self.config['sequence_length'], self.config['sentiment_features']),
            name='sentiment_indicators'
        )
        
        # Seasonal features input (static)
        seasonal_input = layers.Input(
            shape=(self.config['seasonal_features'],),
            name='seasonal_features'
        )
        
        # Macro features input (sequence)
        macro_input = layers.Input(
            shape=(self.config['sequence_length'], self.config['macro_features']),
            name='macro_indicators'
        )
        
        # Process each input stream
        technical_lstm = layers.LSTM(64, return_sequences=True)(technical_input)
        technical_attention = layers.Attention()([technical_lstm, technical_lstm])
        technical_pooled = layers.GlobalAveragePooling1D()(technical_attention)
        
        sentiment_lstm = layers.LSTM(32, return_sequences=True)(sentiment_input)
        sentiment_pooled = layers.GlobalAveragePooling1D()(sentiment_lstm)
        
        macro_lstm = layers.LSTM(32, return_sequences=True)(macro_input)
        macro_pooled = layers.GlobalAveragePooling1D()(macro_lstm)
        
        # Combine all features
        combined = layers.concatenate([
            technical_pooled,
            sentiment_pooled,
            seasonal_input,
            macro_pooled
        ])
        
        # Final prediction layers
        dense1 = layers.Dense(128, activation='relu')(combined)
        dropout1 = layers.Dropout(0.3)(dense1)
        dense2 = layers.Dense(64, activation='relu')(dropout1)
        dropout2 = layers.Dropout(0.2)(dense2)
        
        # Multi-output: direction, magnitude, confidence
        direction_output = layers.Dense(3, activation='softmax', name='direction')(dropout2)  # Buy/Hold/Sell
        magnitude_output = layers.Dense(1, activation='linear', name='magnitude')(dropout2)   # Expected return
        confidence_output = layers.Dense(1, activation='sigmoid', name='confidence')(dropout2) # Prediction confidence
        
        model = Model(
            inputs=[technical_input, sentiment_input, seasonal_input, macro_input],
            outputs=[direction_output, magnitude_output, confidence_output]
        )
        
        return model
```

### Alternative Architecture: Transformer-Based
```python
class TransformerStockModel:
    def __init__(self, config):
        self.config = config
        self.model = self._build_transformer_model()
    
    def _build_transformer_model(self):
        # Multi-head attention for capturing complex relationships
        input_layer = layers.Input(shape=(self.config['sequence_length'], self.config['total_features']))
        
        # Positional encoding
        positions = tf.range(start=0, limit=self.config['sequence_length'], delta=1)
        positions = layers.Embedding(self.config['sequence_length'], self.config['total_features'])(positions)
        x = input_layer + positions
        
        # Multi-head attention layers
        for _ in range(self.config['num_attention_layers']):
            attention_output = layers.MultiHeadAttention(
                num_heads=8, 
                key_dim=64
            )(x, x)
            x = layers.Add()([x, attention_output])
            x = layers.LayerNormalization()(x)
            
            # Feed forward network
            ffn = layers.Dense(256, activation='relu')(x)
            ffn = layers.Dense(self.config['total_features'])(ffn)
            x = layers.Add()([x, ffn])
            x = layers.LayerNormalization()(x)
        
        # Global pooling and prediction
        pooled = layers.GlobalAveragePooling1D()(x)
        output = layers.Dense(3, activation='softmax')(pooled)
        
        return Model(inputs=input_layer, outputs=output)
```

## Feature Engineering

### Technical Features (40-50 features)
```python
def extract_technical_features(df):
    features = {}
    
    # Price-based features
    features['sma_20'] = df['close'].rolling(20).mean()
    features['sma_50'] = df['close'].rolling(50).mean()
    features['ema_12'] = df['close'].ewm(span=12).mean()
    features['ema_26'] = df['close'].ewm(span=26).mean()
    
    # Momentum indicators
    features['rsi'] = calculate_rsi(df['close'])
    features['macd'] = features['ema_12'] - features['ema_26']
    features['macd_signal'] = features['macd'].ewm(span=9).mean()
    features['macd_histogram'] = features['macd'] - features['macd_signal']
    
    # Volatility features
    features['bb_upper'], features['bb_middle'], features['bb_lower'] = calculate_bollinger_bands(df['close'])
    features['bb_position'] = (df['close'] - features['bb_lower']) / (features['bb_upper'] - features['bb_lower'])
    
    # Volume features
    features['volume_sma'] = df['volume'].rolling(20).mean()
    features['volume_ratio'] = df['volume'] / features['volume_sma']
    features['vwap'] = calculate_vwap(df)
    
    # Price action features
    features['price_change'] = df['close'].pct_change()
    features['high_low_ratio'] = df['high'] / df['low']
    features['close_position'] = (df['close'] - df['low']) / (df['high'] - df['low'])
    
    return pd.DataFrame(features)
```

### Sentiment Features (10-15 features)
```python
def extract_sentiment_features(df):
    features = {}
    
    # Fear/Greed indicators
    features['vix'] = get_vix_data(df.index)
    features['vix_ma'] = features['vix'].rolling(20).mean()
    features['vix_percentile'] = features['vix'].rolling(252).rank(pct=True)
    
    # Put/Call ratios
    features['put_call_ratio'] = get_put_call_ratio(df.index)
    features['put_call_ma'] = features['put_call_ratio'].rolling(10).mean()
    
    # Market breadth
    features['advance_decline'] = get_advance_decline_line(df.index)
    features['new_highs_lows'] = get_new_highs_lows_ratio(df.index)
    features['mcclellan_oscillator'] = calculate_mcclellan_oscillator(df.index)
    
    # AAII Sentiment (weekly data, forward-filled)
    aaii_data = get_aaii_sentiment(df.index)
    features['aaii_bullish'] = aaii_data['bullish'].fillna(method='ffill')
    features['aaii_bearish'] = aaii_data['bearish'].fillna(method='ffill')
    features['aaii_neutral'] = aaii_data['neutral'].fillna(method='ffill')
    
    return pd.DataFrame(features)
```

### Seasonal Features (8-12 features)
```python
def extract_seasonal_features(df):
    features = {}
    
    # Calendar effects
    features['month'] = df.index.month
    features['day_of_week'] = df.index.dayofweek
    features['day_of_month'] = df.index.day
    features['quarter'] = df.index.quarter
    
    # Presidential cycle
    features['presidential_year'] = calculate_presidential_cycle_year(df.index)
    
    # Seasonal strength indicators
    features['january_effect'] = (df.index.month == 1).astype(int)
    features['sell_in_may'] = ((df.index.month >= 5) & (df.index.month <= 10)).astype(int)
    features['santa_rally'] = ((df.index.month == 12) & (df.index.day >= 15)).astype(int)
    
    # Holiday effects
    features['days_to_holiday'] = calculate_days_to_next_holiday(df.index)
    features['days_from_holiday'] = calculate_days_from_last_holiday(df.index)
    
    # Earnings season
    features['earnings_season'] = calculate_earnings_season_indicator(df.index)
    
    return pd.DataFrame(features)
```

### Macroeconomic Features (15-20 features)
```python
def extract_macro_features(df):
    features = {}
    
    # Interest rates
    fed_funds = get_fred_data('FEDFUNDS', df.index)
    features['fed_funds_rate'] = fed_funds.fillna(method='ffill')
    features['fed_funds_change'] = features['fed_funds_rate'].diff()
    
    # Yield curve
    ten_year = get_fred_data('DGS10', df.index)
    two_year = get_fred_data('DGS2', df.index)
    features['yield_10y'] = ten_year.fillna(method='ffill')
    features['yield_2y'] = two_year.fillna(method='ffill')
    features['yield_spread'] = features['yield_10y'] - features['yield_2y']
    
    # Inflation
    cpi = get_fred_data('CPIAUCSL', df.index)
    features['inflation_rate'] = cpi.pct_change(periods=12).fillna(method='ffill')
    
    # Employment
    unemployment = get_fred_data('UNRATE', df.index)
    features['unemployment_rate'] = unemployment.fillna(method='ffill')
    
    # Economic growth
    gdp = get_fred_data('GDP', df.index)
    features['gdp_growth'] = gdp.pct_change(periods=4).fillna(method='ffill')
    
    # Dollar strength
    dxy = get_market_data('DX-Y.NYB', df.index)['close']
    features['dollar_index'] = dxy.fillna(method='ffill')
    features['dollar_change'] = features['dollar_index'].pct_change()
    
    # Commodities
    gold = get_market_data('GC=F', df.index)['close']
    oil = get_market_data('CL=F', df.index)['close']
    features['gold_price'] = gold.fillna(method='ffill')
    features['oil_price'] = oil.fillna(method='ffill')
    features['gold_change'] = features['gold_price'].pct_change()
    features['oil_change'] = features['oil_price'].pct_change()
    
    return pd.DataFrame(features)
```

## Training Pipeline

### Data Preparation
```python
class DataPipeline:
    def __init__(self, config):
        self.config = config
        self.scaler_dict = {}
    
    def prepare_training_data(self, symbols, start_date, end_date):
        all_data = []
        
        for symbol in symbols:
            # Fetch raw data
            market_data = self.fetch_market_data(symbol, start_date, end_date)
            
            # Extract features
            technical_features = extract_technical_features(market_data)
            sentiment_features = extract_sentiment_features(market_data)
            seasonal_features = extract_seasonal_features(market_data)
            macro_features = extract_macro_features(market_data)
            
            # Create target variables
            targets = self.create_targets(market_data)
            
            # Combine all features
            features = pd.concat([
                technical_features,
                sentiment_features,
                seasonal_features,
                macro_features
            ], axis=1)
            
            # Handle missing values
            features = features.fillna(method='ffill').fillna(method='bfill')
            
            # Create sequences
            sequences = self.create_sequences(features, targets)
            all_data.extend(sequences)
        
        return self.normalize_data(all_data)
    
    def create_targets(self, market_data):
        """Create target variables for training"""
        targets = {}
        
        # Future returns (1, 5, 20 days)
        for days in [1, 5, 20]:
            targets[f'return_{days}d'] = market_data['close'].pct_change(periods=days).shift(-days)
        
        # Direction (classification target)
        targets['direction'] = np.where(targets['return_1d'] > 0.02, 2,  # Strong Buy
                               np.where(targets['return_1d'] > 0.005, 1,  # Buy
                               np.where(targets['return_1d'] < -0.02, 0,  # Sell
                               np.where(targets['return_1d'] < -0.005, 1, 1))))  # Hold
        
        # Magnitude (regression target)
        targets['magnitude'] = targets['return_5d']
        
        return pd.DataFrame(targets)
    
    def create_sequences(self, features, targets, sequence_length=60):
        """Create sequences for time-series training"""
        sequences = []
        
        for i in range(sequence_length, len(features)):
            sequence_features = features.iloc[i-sequence_length:i].values
            sequence_targets = targets.iloc[i].values
            
            if not np.isnan(sequence_targets).any():
                sequences.append((sequence_features, sequence_targets))
        
        return sequences
```

### Training Configuration
```python
training_config = {
    'model': {
        'sequence_length': 60,
        'technical_features': 45,
        'sentiment_features': 12,
        'seasonal_features': 10,
        'macro_features': 18,
        'lstm_units': [64, 32],
        'dense_units': [128, 64],
        'dropout_rate': 0.3,
        'attention': True
    },
    'training': {
        'batch_size': 64,
        'epochs': 100,
        'learning_rate': 0.001,
        'early_stopping_patience': 10,
        'reduce_lr_patience': 5,
        'validation_split': 0.2,
        'test_split': 0.1
    },
    'optimization': {
        'optimizer': 'adam',
        'loss_weights': {
            'direction': 1.0,
            'magnitude': 0.5,
            'confidence': 0.3
        },
        'metrics': ['accuracy', 'mse', 'mae']
    }
}
```

### Training Loop
```python
class ModelTrainer:
    def __init__(self, config):
        self.config = config
        self.model = None
        self.history = None
    
    def train_model(self, train_data, val_data):
        # Build model
        self.model = StockPredictionModel(self.config['model'])
        
        # Compile model
        self.model.compile(
            optimizer=tf.keras.optimizers.Adam(self.config['training']['learning_rate']),
            loss={
                'direction': 'sparse_categorical_crossentropy',
                'magnitude': 'mse',
                'confidence': 'binary_crossentropy'
            },
            loss_weights=self.config['optimization']['loss_weights'],
            metrics=['accuracy', 'mse']
        )
        
        # Callbacks
        callbacks = [
            tf.keras.callbacks.EarlyStopping(
                patience=self.config['training']['early_stopping_patience'],
                restore_best_weights=True
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                patience=self.config['training']['reduce_lr_patience'],
                factor=0.5
            ),
            tf.keras.callbacks.ModelCheckpoint(
                'best_model.h5',
                save_best_only=True
            )
        ]
        
        # Train model
        self.history = self.model.fit(
            train_data,
            validation_data=val_data,
            epochs=self.config['training']['epochs'],
            batch_size=self.config['training']['batch_size'],
            callbacks=callbacks
        )
        
        return self.history
```

## Backtesting Framework

### Walk-Forward Analysis
```python
class WalkForwardBacktest:
    def __init__(self, model, config):
        self.model = model
        self.config = config
        self.results = []
    
    def run_backtest(self, data, symbols, start_date, end_date):
        # Split data into windows
        train_window = self.config['train_window_days']
        test_window = self.config['test_window_days']
        
        current_date = start_date
        while current_date < end_date:
            # Define training and testing periods
            train_start = current_date - timedelta(days=train_window)
            train_end = current_date
            test_start = current_date
            test_end = current_date + timedelta(days=test_window)
            
            # Prepare data
            train_data = self.prepare_data(data, symbols, train_start, train_end)
            test_data = self.prepare_data(data, symbols, test_start, test_end)
            
            # Train model
            self.model.fit(train_data)
            
            # Make predictions
            predictions = self.model.predict(test_data)
            
            # Evaluate performance
            performance = self.evaluate_performance(predictions, test_data)
            self.results.append(performance)
            
            # Move to next window
            current_date = test_end
        
        return self.aggregate_results()
    
    def evaluate_performance(self, predictions, actual_data):
        """Evaluate model performance on test data"""
        metrics = {}
        
        # Classification accuracy
        direction_predictions = np.argmax(predictions['direction'], axis=1)
        direction_actual = actual_data['direction']
        metrics['accuracy'] = accuracy_score(direction_actual, direction_predictions)
        metrics['precision'] = precision_score(direction_actual, direction_predictions, average='weighted')
        metrics['recall'] = recall_score(direction_actual, direction_predictions, average='weighted')
        
        # Regression metrics
        magnitude_predictions = predictions['magnitude'].flatten()
        magnitude_actual = actual_data['magnitude']
        metrics['mse'] = mean_squared_error(magnitude_actual, magnitude_predictions)
        metrics['mae'] = mean_absolute_error(magnitude_actual, magnitude_predictions)
        
        # Financial metrics
        returns = self.calculate_strategy_returns(predictions, actual_data)
        metrics['total_return'] = returns.sum()
        metrics['sharpe_ratio'] = self.calculate_sharpe_ratio(returns)
        metrics['max_drawdown'] = self.calculate_max_drawdown(returns)
        
        return metrics
```

### Performance Metrics
```python
def calculate_financial_metrics(returns):
    """Calculate comprehensive performance metrics"""
    
    # Basic return metrics
    total_return = (1 + returns).prod() - 1
    annualized_return = (1 + returns).prod() ** (252 / len(returns)) - 1
    volatility = returns.std() * np.sqrt(252)
    
    # Risk-adjusted metrics
    risk_free_rate = 0.02  # 2% risk-free rate
    excess_returns = returns - risk_free_rate / 252
    sharpe_ratio = excess_returns.mean() / returns.std() * np.sqrt(252)
    
    # Downside metrics
    negative_returns = returns[returns < 0]
    downside_deviation = negative_returns.std() * np.sqrt(252)
    sortino_ratio = excess_returns.mean() / downside_deviation
    
    # Drawdown analysis
    cumulative_returns = (1 + returns).cumprod()
    running_max = cumulative_returns.expanding().max()
    drawdown = (cumulative_returns - running_max) / running_max
    max_drawdown = drawdown.min()
    
    # Win/Loss analysis
    win_rate = (returns > 0).mean()
    avg_win = returns[returns > 0].mean() if (returns > 0).any() else 0
    avg_loss = returns[returns < 0].mean() if (returns < 0).any() else 0
    profit_factor = abs(avg_win / avg_loss) if avg_loss != 0 else np.inf
    
    return {
        'total_return': total_return,
        'annualized_return': annualized_return,
        'volatility': volatility,
        'sharpe_ratio': sharpe_ratio,
        'sortino_ratio': sortino_ratio,
        'max_drawdown': max_drawdown,
        'win_rate': win_rate,
        'profit_factor': profit_factor
    }
```

## Model Deployment and Monitoring

### Model Serving
```python
class ModelServer:
    def __init__(self, model_path):
        self.model = tf.keras.models.load_model(model_path)
        self.feature_pipeline = DataPipeline(training_config)
    
    def predict(self, symbol, current_date):
        # Fetch recent data
        end_date = current_date
        start_date = current_date - timedelta(days=100)  # Enough for feature calculation
        
        # Prepare features
        features = self.feature_pipeline.prepare_inference_data(symbol, start_date, end_date)
        
        # Make prediction
        prediction = self.model.predict(features)
        
        return {
            'symbol': symbol,
            'date': current_date,
            'direction_probabilities': prediction['direction'][0],
            'expected_return': prediction['magnitude'][0][0],
            'confidence': prediction['confidence'][0][0],
            'recommendation': self.interpret_prediction(prediction)
        }
    
    def interpret_prediction(self, prediction):
        direction_probs = prediction['direction'][0]
        confidence = prediction['confidence'][0][0]
        expected_return = prediction['magnitude'][0][0]
        
        # Map probabilities to recommendations
        max_prob_idx = np.argmax(direction_probs)
        max_prob = direction_probs[max_prob_idx]
        
        if confidence < 0.6:
            return 'HOLD'  # Low confidence
        elif max_prob_idx == 2 and max_prob > 0.6:  # Strong buy
            return 'BUY'
        elif max_prob_idx == 1 and max_prob > 0.5:  # Buy
            return 'BUY'
        elif max_prob_idx == 0 and max_prob > 0.6:  # Sell
            return 'SELL'
        else:
            return 'HOLD'
```

### Model Monitoring and Retraining
```python
class ModelMonitor:
    def __init__(self, model_server, threshold_config):
        self.model_server = model_server
        self.thresholds = threshold_config
        self.performance_history = []
    
    def monitor_performance(self, predictions, actual_outcomes):
        # Calculate recent performance
        recent_accuracy = self.calculate_recent_accuracy(predictions, actual_outcomes)
        recent_returns = self.calculate_recent_returns(predictions, actual_outcomes)
        
        # Check for performance degradation
        if recent_accuracy < self.thresholds['min_accuracy']:
            self.trigger_retrain('accuracy_degradation')
        
        if recent_returns < self.thresholds['min_returns']:
            self.trigger_retrain('return_degradation')
        
        # Check for data drift
        if self.detect_data_drift():
            self.trigger_retrain('data_drift')
    
    def trigger_retrain(self, reason):
        # Log retraining trigger
        print(f"Triggering model retraining due to: {reason}")
        
        # Retrain model with recent data
        # This would integrate with the training pipeline
        self.retrain_model()
    
    def retrain_model(self):
        # Implementation for automated retraining
        pass
```

## Hyperparameter Optimization

### Bayesian Optimization Setup
```python
import optuna

def objective(trial):
    # Define hyperparameters to optimize
    config = {
        'lstm_units_1': trial.suggest_int('lstm_units_1', 32, 128),
        'lstm_units_2': trial.suggest_int('lstm_units_2', 16, 64),
        'dense_units_1': trial.suggest_int('dense_units_1', 64, 256),
        'dense_units_2': trial.suggest_int('dense_units_2', 32, 128),
        'dropout_rate': trial.suggest_float('dropout_rate', 0.1, 0.5),
        'learning_rate': trial.suggest_loguniform('learning_rate', 1e-5, 1e-2),
        'batch_size': trial.suggest_categorical('batch_size', [32, 64, 128]),
    }
    
    # Train model with suggested hyperparameters
    model = StockPredictionModel(config)
    history = train_model(model, train_data, val_data, config)
    
    # Return objective to minimize (negative Sharpe ratio)
    val_performance = evaluate_model(model, val_data)
    return -val_performance['sharpe_ratio']

# Run optimization
study = optuna.create_study(direction='minimize')
study.optimize(objective, n_trials=100)
```

This comprehensive ML training guide provides the foundation for building, training, and deploying neural networks for stock prediction using multiple indicator categories.