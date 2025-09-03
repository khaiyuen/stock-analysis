// Machine Learning Types

// Model prediction results
export interface MLPrediction {
  symbol: string;
  timestamp: Date;
  timeHorizon: '1d' | '5d' | '20d' | '60d';
  prediction: {
    direction: {
      sell: number;      // Probability of sell signal (0-1)
      hold: number;      // Probability of hold signal (0-1)
      buy: number;       // Probability of buy signal (0-1)
    };
    expectedReturn: number;    // Expected return percentage
    confidence: number;        // Model confidence (0-1)
    riskScore: number;        // Risk assessment (0-1)
  };
  features: {
    technical: Record<string, number>;
    sentiment: Record<string, number>;
    seasonal: Record<string, number>;
    macro: Record<string, number>;
  };
  featureImportance: Record<string, number>;
}

// Model configuration
export interface ModelConfig {
  modelType: 'LSTM' | 'GRU' | 'TRANSFORMER' | 'ENSEMBLE';
  architecture: {
    sequenceLength: number;
    features: {
      technical: number;
      sentiment: number;
      seasonal: number;
      macro: number;
    };
    layers: Array<{
      type: 'LSTM' | 'GRU' | 'DENSE' | 'DROPOUT' | 'ATTENTION';
      units?: number;
      activation?: string;
      dropoutRate?: number;
    }>;
  };
  training: {
    batchSize: number;
    epochs: number;
    learningRate: number;
    validationSplit: number;
    earlyStoppingPatience: number;
  };
  optimization: {
    optimizer: 'adam' | 'rmsprop' | 'sgd';
    lossWeights: {
      direction: number;
      magnitude: number;
      confidence: number;
    };
  };
}

// Feature engineering configuration
export interface FeatureConfig {
  technical: {
    indicators: Array<{
      type: string;
      period?: number;
      enabled: boolean;
      weight?: number;
    }>;
    priceFeatures: {
      returns: boolean;
      logReturns: boolean;
      volatility: boolean;
      gaps: boolean;
    };
    volumeFeatures: {
      volumeRatio: boolean;
      volumeProfile: boolean;
      volumePriceAnalysis: boolean;
    };
  };
  sentiment: {
    vix: boolean;
    putCallRatio: boolean;
    breadthIndicators: boolean;
    surveyData: boolean;
  };
  seasonal: {
    calendarEffects: boolean;
    presidentialCycle: boolean;
    earningsSeasons: boolean;
    holidayEffects: boolean;
  };
  macro: {
    interestRates: boolean;
    inflation: boolean;
    employment: boolean;
    economicGrowth: boolean;
    currencies: boolean;
    commodities: boolean;
  };
}

// Training data structure
export interface TrainingData {
  features: {
    technical: number[][];
    sentiment: number[][];
    seasonal: number[][];
    macro: number[][];
  };
  targets: {
    direction: number[];      // 0=sell, 1=hold, 2=buy
    magnitude: number[];      // Expected return
    confidence: number[];     // Target confidence
  };
  metadata: {
    symbols: string[];
    timestamps: Date[];
    sequenceLength: number;
    normalization: {
      mean: Record<string, number>;
      std: Record<string, number>;
    };
  };
}

// Model performance metrics
export interface ModelPerformance {
  modelVersion: string;
  evaluationPeriod: {
    start: Date;
    end: Date;
  };
  classification: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
    confusionMatrix: number[][];
  };
  regression: {
    mse: number;
    mae: number;
    r2Score: number;
    correlationCoeff: number;
  };
  financial: {
    totalReturn: number;
    annualizedReturn: number;
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    calmarRatio: number;
  };
  byTimeHorizon: Record<string, Partial<ModelPerformance>>;
  featureAnalysis: {
    importance: Record<string, number>;
    stability: Record<string, number>;
    correlation: Record<string, Record<string, number>>;
  };
}

// Backtesting results
export interface BacktestResult {
  strategy: string;
  period: {
    start: Date;
    end: Date;
  };
  returns: {
    total: number;
    annualized: number;
    volatility: number;
    sharpeRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
  };
  trades: Array<{
    symbol: string;
    entryDate: Date;
    exitDate: Date;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    return: number;
    returnPercent: number;
    holdingPeriod: number;
    signal: {
      strength: number;
      confidence: number;
      indicators: Record<string, any>;
    };
  }>;
  monthlyReturns: Array<{
    date: Date;
    return: number;
    benchmark: number;
    outperformance: number;
  }>;
  drawdownPeriods: Array<{
    start: Date;
    end: Date;
    depth: number;
    recovery: number;
  }>;
  statistics: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    expectancy: number;
  };
}

// Walk-forward analysis
export interface WalkForwardAnalysis {
  strategy: string;
  config: {
    trainWindow: number;    // Days
    testWindow: number;     // Days
    stepSize: number;       // Days
    rebalanceFrequency: number; // Days
  };
  periods: Array<{
    trainStart: Date;
    trainEnd: Date;
    testStart: Date;
    testEnd: Date;
    performance: ModelPerformance;
    trades: BacktestResult['trades'];
  }>;
  summary: {
    avgReturn: number;
    avgSharpe: number;
    consistencyRatio: number; // Percentage of profitable periods
    worstPeriod: {
      period: string;
      return: number;
    };
    bestPeriod: {
      period: string;
      return: number;
    };
  };
}

// Ensemble model configuration
export interface EnsembleConfig {
  models: Array<{
    name: string;
    weight: number;
    config: ModelConfig;
  }>;
  aggregation: {
    method: 'AVERAGE' | 'WEIGHTED_AVERAGE' | 'VOTING' | 'STACKING';
    votingThreshold?: number;
    stackingModel?: {
      type: 'LINEAR' | 'LOGISTIC' | 'RANDOM_FOREST' | 'XGB';
      parameters: Record<string, any>;
    };
  };
}

// Real-time prediction pipeline
export interface PredictionPipeline {
  id: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR';
  config: {
    symbols: string[];
    updateFrequency: number; // Minutes
    models: string[];        // Model versions to use
    thresholds: {
      minConfidence: number;
      maxRisk: number;
    };
  };
  lastRun: {
    timestamp: Date;
    predictions: number;
    errors: number;
    avgProcessingTime: number;
  };
  metrics: {
    uptime: number;
    accuracy: number;
    latency: number;
  };
}

// Model deployment configuration
export interface ModelDeployment {
  modelVersion: string;
  deploymentDate: Date;
  status: 'DEPLOYED' | 'STAGED' | 'DEPRECATED';
  environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  config: {
    scalingConfig: {
      minInstances: number;
      maxInstances: number;
      cpuUtilization: number;
      memoryUtilization: number;
    };
    monitoring: {
      alertThresholds: {
        accuracy: number;
        latency: number;
        errorRate: number;
      };
      dashboardUrl?: string;
    };
  };
  rollbackConfig: {
    previousVersion?: string;
    rollbackTriggers: {
      accuracyThreshold: number;
      errorRateThreshold: number;
      latencyThreshold: number;
    };
  };
}

// Feature drift detection
export interface FeatureDrift {
  feature: string;
  metric: 'KL_DIVERGENCE' | 'JS_DIVERGENCE' | 'PSI' | 'WASSERSTEIN';
  value: number;
  threshold: number;
  status: 'STABLE' | 'WARNING' | 'DRIFT';
  period: {
    baseline: {
      start: Date;
      end: Date;
    };
    current: {
      start: Date;
      end: Date;
    };
  };
  recommendation: string;
}

// A/B testing for model versions
export interface ModelABTest {
  testId: string;
  name: string;
  status: 'RUNNING' | 'COMPLETED' | 'PAUSED';
  config: {
    models: Array<{
      version: string;
      trafficPercentage: number;
    }>;
    duration: number; // Days
    metrics: string[];
    successCriteria: {
      metric: string;
      threshold: number;
      improvement: number; // Required improvement %
    };
  };
  results: {
    participants: number;
    conversions: Record<string, number>;
    metrics: Record<string, Record<string, number>>;
    significance: number;
    winner?: string;
  };
}

// Hyperparameter optimization
export interface HyperparameterOptimization {
  optimizationId: string;
  algorithm: 'BAYESIAN' | 'GRID_SEARCH' | 'RANDOM_SEARCH' | 'OPTUNA';
  objective: {
    metric: string;
    direction: 'MAXIMIZE' | 'MINIMIZE';
  };
  searchSpace: Record<string, {
    type: 'FLOAT' | 'INT' | 'CATEGORICAL';
    bounds?: [number, number];
    choices?: any[];
    log?: boolean;
  }>;
  trials: Array<{
    trialId: string;
    parameters: Record<string, any>;
    value: number;
    duration: number;
    status: 'COMPLETED' | 'FAILED' | 'PRUNED';
  }>;
  bestTrial: {
    parameters: Record<string, any>;
    value: number;
    crossValidationScore?: number;
  };
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
}