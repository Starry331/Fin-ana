import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, ReferenceLine, Cell
} from 'recharts';
import {
  Search, TrendingUp, Shield, Brain, BarChart3, Activity,
  AlertTriangle, ChevronUp, ChevronDown, RefreshCw, Plus, X,
  Loader2, PieChart, Target, Zap, Clock, Edit3, Eye, Star
} from 'lucide-react';
import axios from 'axios';

const API_BASE = 'http://localhost:5001/api';

const CandlestickBar = (props) => {
  const { x, y, width, height, open, close, high, low, fill } = props;
  const isUp = close >= open;
  const color = isUp ? '#22c55e' : '#ef4444';
  const bodyHeight = Math.abs(close - open);
  const bodyY = isUp ? close : open;
  const wickHigh = high;
  const wickLow = low;
  
  return (
    <g>
      <line
        x1={x + width / 2}
        y1={y}
        x2={x + width / 2}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
      />
      <rect
        x={x + 2}
        y={y + (height * 0.3)}
        width={width - 4}
        height={height * 0.4}
        fill={color}
        rx={2}
      />
    </g>
  );
};

const formatNumber = (num) => {
  if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num?.toFixed(2) || '0';
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="tooltip-custom" style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: '8px',
        padding: '12px'
      }}>
        <p style={{ color: '#94a3b8', marginBottom: '8px' }}>{label}</p>
        {payload.map((item, idx) => (
          <p key={idx} style={{ color: item.color, fontSize: '14px' }}>
            {item.name}: {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchSymbol, setSearchSymbol] = useState('');
  const [stockData, setStockData] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [predictionLoading, setPredictionLoading] = useState(false);
  const [period, setPeriod] = useState('1y');
  const [predictionMethod, setPredictionMethod] = useState('both');
  const [compareSymbols, setCompareSymbols] = useState([]);
  const [comparisonData, setComparisonData] = useState(null);
  const [error, setError] = useState(null);
  const [hourlyData, setHourlyData] = useState(null);
  const [aiHourlyPrediction, setAiHourlyPrediction] = useState(null);
  const [userPredictions, setUserPredictions] = useState([
    { hour: 1, open: '', high: '', low: '', close: '' },
    { hour: 2, open: '', high: '', low: '', close: '' },
    { hour: 3, open: '', high: '', low: '', close: '' },
    { hour: 4, open: '', high: '', low: '', close: '' },
    { hour: 5, open: '', high: '', low: '', close: '' }
  ]);
  const [hourlyLoading, setHourlyLoading] = useState(false);
  const [predictionComparison, setPredictionComparison] = useState(null);
  const [userPredictionSaved, setUserPredictionSaved] = useState(false);
  const [watchlist, setWatchlist] = useState(() => {
    const saved = localStorage.getItem('finrisk_watchlist');
    return saved ? JSON.parse(saved) : [];
  });

  const addToWatchlist = () => {
    if (!stockData) return;
    const exists = watchlist.find(s => s.symbol === stockData.symbol);
    if (!exists) {
      const newWatchlist = [...watchlist, {
        symbol: stockData.symbol,
        name: stockData.name,
        price: stockData.current_price,
        change: stockData.price_change_percent,
        addedAt: new Date().toISOString()
      }];
      setWatchlist(newWatchlist);
      localStorage.setItem('finrisk_watchlist', JSON.stringify(newWatchlist));
    }
  };

  const removeFromWatchlist = (symbol) => {
    const newWatchlist = watchlist.filter(s => s.symbol !== symbol);
    setWatchlist(newWatchlist);
    localStorage.setItem('finrisk_watchlist', JSON.stringify(newWatchlist));
  };

  const isInWatchlist = stockData ? watchlist.some(s => s.symbol === stockData.symbol) : false;

  const fetchStockData = useCallback(async (symbol) => {
    if (!symbol) return;
    setLoading(true);
    setError(null);
    try {
      const stockRes = await axios.get(`${API_BASE}/stock/${symbol}?period=${period}`, { timeout: 30000 });
      setStockData(stockRes.data);
      
      try {
        const riskRes = await axios.get(`${API_BASE}/risk/${symbol}?period=${period}`, { timeout: 30000 });
        setRiskData(riskRes.data);
      } catch (riskErr) {
        console.error('风险数据获取失败:', riskErr);
        setRiskData(null);
      }
      
      setPredictionData(null);
    } catch (err) {
      console.error('API错误:', err);
      const errorMsg = err.response?.data?.error || err.message || '获取数据失败，请检查网络连接';
      setError(errorMsg);
      setStockData(null);
      setRiskData(null);
    }
    setLoading(false);
  }, [period]);

  const fetchPrediction = async () => {
    if (!stockData) return;
    setPredictionLoading(true);
    try {
      const res = await axios.get(
        `${API_BASE}/predict/${stockData.symbol}?periods=30&method=${predictionMethod}`
      );
      setPredictionData(res.data);
    } catch (err) {
      console.error('预测失败:', err);
    }
    setPredictionLoading(false);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchSymbol.trim()) {
      fetchStockData(searchSymbol.trim().toUpperCase());
    }
  };

  const addCompareSymbol = () => {
    if (searchSymbol && !compareSymbols.includes(searchSymbol.toUpperCase())) {
      setCompareSymbols([...compareSymbols, searchSymbol.toUpperCase()]);
    }
  };

  const removeCompareSymbol = (symbol) => {
    setCompareSymbols(compareSymbols.filter(s => s !== symbol));
  };

  const fetchComparison = async () => {
    if (compareSymbols.length === 0) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/compare`, {
        symbols: compareSymbols,
        period: period
      });
      setComparisonData(res.data);
    } catch (err) {
      console.error('比较失败:', err);
    }
    setLoading(false);
  };

  const fetchHourlyData = async (symbol) => {
    if (!symbol) return;
    setHourlyLoading(true);
    try {
      const [hourlyRes, aiPredRes] = await Promise.all([
        axios.get(`${API_BASE}/hourly/${symbol}`),
        axios.get(`${API_BASE}/hourly-predict/${symbol}`)
      ]);
      setHourlyData(hourlyRes.data);
      setAiHourlyPrediction(aiPredRes.data);
      
      const lastPrice = hourlyRes.data.last_price;
      setUserPredictions([
        { hour: 1, open: lastPrice.toFixed(2), high: '', low: '', close: '' },
        { hour: 2, open: '', high: '', low: '', close: '' },
        { hour: 3, open: '', high: '', low: '', close: '' },
        { hour: 4, open: '', high: '', low: '', close: '' },
        { hour: 5, open: '', high: '', low: '', close: '' }
      ]);
      setUserPredictionSaved(false);
    } catch (err) {
      console.error('获取小时数据失败:', err);
    }
    setHourlyLoading(false);
  };

  const updateUserPrediction = (index, field, value) => {
    const newPredictions = [...userPredictions];
    newPredictions[index][field] = value;
    
    if (field === 'close' && index < 4 && value) {
      newPredictions[index + 1].open = value;
    }
    
    setUserPredictions(newPredictions);
    setUserPredictionSaved(false);
  };

  const saveUserPrediction = async () => {
    if (!stockData) return;
    
    const isValid = userPredictions.every(p => 
      p.open && p.high && p.low && p.close &&
      parseFloat(p.high) >= parseFloat(p.open) &&
      parseFloat(p.high) >= parseFloat(p.close) &&
      parseFloat(p.low) <= parseFloat(p.open) &&
      parseFloat(p.low) <= parseFloat(p.close)
    );
    
    if (!isValid) {
      alert('请填写完整的预测数据，并确保最高价>=开/收盘价，最低价<=开/收盘价');
      return;
    }
    
    try {
      const predictions = userPredictions.map(p => ({
        open: parseFloat(p.open),
        high: parseFloat(p.high),
        low: parseFloat(p.low),
        close: parseFloat(p.close)
      }));
      
      await axios.post(`${API_BASE}/user-predict/${stockData.symbol}`, { predictions });
      setUserPredictionSaved(true);
      
      const compRes = await axios.get(`${API_BASE}/compare-predictions/${stockData.symbol}`);
      setPredictionComparison(compRes.data);
    } catch (err) {
      console.error('保存预测失败:', err);
    }
  };

  const fetchPredictionComparison = async () => {
    if (!stockData) return;
    try {
      const res = await axios.get(`${API_BASE}/compare-predictions/${stockData.symbol}`);
      setPredictionComparison(res.data);
    } catch (err) {
      console.error('获取对比数据失败:', err);
    }
  };

  const renderOverview = () => {
    if (!stockData) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">
            <TrendingUp size={40} color="#64748b" />
          </div>
          <h3 className="empty-state-title">开始分析股票风险</h3>
          <p className="empty-state-text">
            输入股票代码（如 AAPL, GOOGL, MSFT）开始进行Beta系数风险分析和AI预测
          </p>
        </div>
      );
    }

    const priceData = stockData.chart_data.slice(-60);

    return (
      <>
        <div className="stock-header">
          <div className="stock-icon">
            {stockData.symbol.slice(0, 2)}
          </div>
          <div className="stock-info">
            <div className="stock-symbol">{stockData.symbol}</div>
            <div className="stock-name">{stockData.name}</div>
            <div className="stock-meta">
              <span>{stockData.exchange}</span>
              <span>•</span>
              <span>{stockData.sector}</span>
              <span>•</span>
              <span>{stockData.currency}</span>
            </div>
          </div>
          <div className="stock-price-container">
            <div className="stock-price">${stockData.current_price}</div>
            <div className={`stock-change ${stockData.price_change >= 0 ? 'positive' : 'negative'}`}>
              {stockData.price_change >= 0 ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              ${Math.abs(stockData.price_change)} ({stockData.price_change_percent}%)
            </div>
          </div>
          <button 
            className={`btn ${isInWatchlist ? 'btn-secondary' : 'btn-primary'}`}
            onClick={isInWatchlist ? () => removeFromWatchlist(stockData.symbol) : addToWatchlist}
            style={{ marginLeft: '1rem' }}
          >
            {isInWatchlist ? <><X size={16} /> 移除自选</> : <><Star size={16} /> 加入自选</>}
          </button>
        </div>

        {watchlist.length > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-header">
              <div className="card-title">
                <Star size={18} /> 自选股票 ({watchlist.length})
              </div>
            </div>
            <div className="card-body" style={{ padding: '0.5rem 1rem' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {watchlist.map(stock => (
                  <div 
                    key={stock.symbol}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.5rem 1rem',
                      background: stock.symbol === stockData?.symbol ? 'rgba(59, 130, 246, 0.2)' : '#1e293b',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: stock.symbol === stockData?.symbol ? '1px solid #3b82f6' : '1px solid transparent'
                    }}
                    onClick={() => { setSearchSymbol(stock.symbol); fetchStockData(stock.symbol); }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{stock.symbol}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{stock.name?.slice(0, 15)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.85rem' }}>${stock.price}</div>
                      <div style={{ fontSize: '0.75rem', color: stock.change >= 0 ? '#22c55e' : '#ef4444' }}>
                        {stock.change >= 0 ? '+' : ''}{stock.change}%
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeFromWatchlist(stock.symbol); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer',
                        padding: '0.25rem'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="dashboard-grid">
          <div className="metric-card">
            <div className="metric-label">
              <Target size={16} /> Beta系数
            </div>
            <div className="metric-value" style={{ color: '#3b82f6' }}>
              {riskData?.metrics?.beta || '-'}
            </div>
            <div className="metric-change">
              相对市场波动性
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">
              <Activity size={16} /> 年化波动率
            </div>
            <div className="metric-value" style={{ color: '#f97316' }}>
              {riskData?.metrics?.volatility || '-'}%
            </div>
            <div className="metric-change">
              价格波动程度
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">
              <Zap size={16} /> 夏普比率
            </div>
            <div className="metric-value" style={{ color: '#22c55e' }}>
              {riskData?.metrics?.sharpe_ratio || '-'}
            </div>
            <div className="metric-change">
              风险调整后收益
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">
              <AlertTriangle size={16} /> VaR (95%)
            </div>
            <div className="metric-value" style={{ color: '#ef4444' }}>
              {riskData?.metrics?.var_95 || '-'}%
            </div>
            <div className="metric-change">
              日风险价值
            </div>
          </div>
        </div>

        <div className="content-grid">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <BarChart3 size={18} /> 价格走势
              </div>
              <div className="period-selector">
                {['1mo', '3mo', '6mo', '1y', '2y'].map(p => (
                  <button
                    key={p}
                    className={`period-btn ${period === p ? 'active' : ''}`}
                    onClick={() => { setPeriod(p); fetchStockData(stockData.symbol); }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-body">
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={priceData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#64748b"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(val) => val.slice(5)}
                    />
                    <YAxis 
                      stroke="#64748b"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      domain={['dataMin - 5', 'dataMax + 5']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="close" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      fill="url(#colorPrice)"
                      name="收盘价"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Shield size={18} /> 风险评估
              </div>
            </div>
            <div className="card-body">
              <div className="risk-gauge">
                <div 
                  className="gauge-circle"
                  style={{
                    '--gauge-percent': `${Math.min(riskData?.metrics?.risk_level?.score || 0, 100)}%`,
                    '--gauge-color': riskData?.metrics?.risk_level?.color || '#3b82f6'
                  }}
                >
                  <div className="gauge-value">
                    <div className="gauge-number">{riskData?.metrics?.risk_level?.score || 0}</div>
                    <div className="gauge-label">风险分数</div>
                  </div>
                </div>
                <div 
                  className="risk-level-badge"
                  style={{ 
                    background: riskData?.metrics?.risk_level?.color || '#3b82f6',
                    color: 'white'
                  }}
                >
                  {riskData?.metrics?.risk_level?.level || '未知'}
                </div>
                <div className="risk-metrics-list">
                  <div className="risk-metric-item">
                    <span className="risk-metric-label">Alpha</span>
                    <span className="risk-metric-value">{riskData?.metrics?.alpha}%</span>
                  </div>
                  <div className="risk-metric-item">
                    <span className="risk-metric-label">索提诺比率</span>
                    <span className="risk-metric-value">{riskData?.metrics?.sortino_ratio}</span>
                  </div>
                  <div className="risk-metric-item">
                    <span className="risk-metric-label">最大回撤</span>
                    <span className="risk-metric-value" style={{ color: '#ef4444' }}>
                      {riskData?.metrics?.max_drawdown}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {riskData?.rolling_beta && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header">
              <div className="card-title">
                <Activity size={18} /> 滚动Beta趋势 (30日窗口)
              </div>
            </div>
            <div className="card-body">
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={riskData.rolling_beta.slice(-90)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      dataKey="date" 
                      stroke="#64748b"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      tickFormatter={(val) => val.slice(5)}
                    />
                    <YAxis 
                      stroke="#64748b"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine y={1} stroke="#ef4444" strokeDasharray="5 5" label={{ value: 'β=1', fill: '#ef4444' }} />
                    <Line 
                      type="monotone" 
                      dataKey="beta" 
                      stroke="#06b6d4" 
                      strokeWidth={2}
                      dot={false}
                      name="Beta"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <div className="card-title">
              <Target size={18} /> Beta系数计算详细过程
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <h4 style={{ color: '#3b82f6', marginBottom: '1rem', fontSize: '1rem' }}>📐 计算公式</h4>
                <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', color: '#22c55e', textAlign: 'center' }}>
                    β = Cov(Rᵢ, Rₘ) / Var(Rₘ)
                  </div>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.8 }}>
                  <p><strong style={{ color: '#f8fafc' }}>其中：</strong></p>
                  <p>• <strong>Rᵢ</strong> = 股票的日收益率</p>
                  <p>• <strong>Rₘ</strong> = 市场基准(SPY)的日收益率</p>
                  <p>• <strong>Cov</strong> = 协方差，衡量两者共同变动</p>
                  <p>• <strong>Var</strong> = 方差，衡量市场波动程度</p>
                </div>
              </div>
              
              <div>
                <h4 style={{ color: '#a855f7', marginBottom: '1rem', fontSize: '1rem' }}>📊 计算步骤</h4>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 2 }}>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ background: '#3b82f6', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>1</span>
                    <span>获取股票和市场基准(SPY)的历史价格数据</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ background: '#3b82f6', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>2</span>
                    <span>计算每日收益率: Rₜ = (Pₜ - Pₜ₋₁) / Pₜ₋₁</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ background: '#3b82f6', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>3</span>
                    <span>计算股票与市场收益率的协方差 Cov(Rᵢ, Rₘ)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <span style={{ background: '#3b82f6', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>4</span>
                    <span>计算市场收益率的方差 Var(Rₘ)</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ background: '#22c55e', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', flexShrink: 0 }}>5</span>
                    <span>Beta = 协方差 ÷ 方差，得出最终系数</span>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#1e293b', borderRadius: '8px' }}>
              <h4 style={{ color: '#eab308', marginBottom: '1rem', fontSize: '1rem' }}>🎯 当前股票Beta解读</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div style={{ textAlign: 'center', padding: '1rem', background: riskData?.metrics?.beta > 1 ? 'rgba(239, 68, 68, 0.1)' : riskData?.metrics?.beta < 1 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{riskData?.metrics?.beta || '-'}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>当前Beta值</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: riskData?.metrics?.beta > 1 ? '#ef4444' : '#22c55e' }}>
                    {riskData?.metrics?.beta > 1 ? '高于市场' : riskData?.metrics?.beta < 1 ? '低于市场' : '等于市场'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>波动性对比</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#a855f7' }}>
                    {riskData?.metrics?.beta ? (riskData.metrics.beta * 100).toFixed(0) : '-'}%
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>相对市场波动</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(6, 182, 212, 0.1)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#06b6d4' }}>SPY</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>基准指数</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ color: '#06b6d4', marginBottom: '1rem', fontSize: '1rem' }}>📖 Beta值含义速查</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', borderRadius: '8px', borderLeft: '3px solid #22c55e' }}>
                  <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: '0.5rem' }}>β &lt; 1 (防御型)</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>波动小于市场，风险较低。适合保守投资者，熊市时表现相对较好。</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(234, 179, 8, 0.1)', borderRadius: '8px', borderLeft: '3px solid #eab308' }}>
                  <div style={{ fontWeight: 600, color: '#eab308', marginBottom: '0.5rem' }}>β ≈ 1 (中性型)</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>与市场同步波动，风险中等。走势基本跟随大盘，适合平衡型投资。</div>
                </div>
                <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
                  <div style={{ fontWeight: 600, color: '#ef4444', marginBottom: '0.5rem' }}>β &gt; 1 (进攻型)</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>波动大于市场，风险较高。牛市收益更大，但熊市亏损也更多。</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)', borderRadius: '8px' }}>
              <h4 style={{ color: '#f8fafc', marginBottom: '0.75rem', fontSize: '1rem' }}>💡 其他风险指标计算方法</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                <div>
                  <strong style={{ color: '#f97316' }}>年化波动率:</strong> σ = 日收益率标准差 × √252
                </div>
                <div>
                  <strong style={{ color: '#22c55e' }}>夏普比率:</strong> (年化收益 - 无风险利率) ÷ 年化波动率
                </div>
                <div>
                  <strong style={{ color: '#ef4444' }}>VaR(95%):</strong> 收益率分布的第5百分位数
                </div>
                <div>
                  <strong style={{ color: '#a855f7' }}>Alpha:</strong> 实际收益 - (无风险利率 + β × 市场超额收益)
                </div>
                <div>
                  <strong style={{ color: '#06b6d4' }}>索提诺比率:</strong> 年化收益 ÷ 下行波动率 (只计算负收益)
                </div>
                <div>
                  <strong style={{ color: '#ec4899' }}>最大回撤:</strong> (谷值 - 峰值) ÷ 峰值 × 100%
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderPrediction = () => {
    if (!stockData) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Brain size={40} color="#64748b" />
          </div>
          <h3 className="empty-state-title">AI预测分析</h3>
          <p className="empty-state-text">
            请先搜索一只股票，然后进行时间序列预测和AI神经网络预测
          </p>
        </div>
      );
    }

    const preparePredictionChart = () => {
      if (!predictionData) return [];
      
      const historicalData = stockData.chart_data.slice(-30).map(d => ({
        date: d.date,
        actual: d.close,
        type: 'historical'
      }));

      const predictionChart = [];
      
      if (predictionData.arima) {
        predictionData.prediction_dates.forEach((date, i) => {
          predictionChart.push({
            date,
            arima: predictionData.arima.predictions[i],
            arima_upper: predictionData.arima.upper_bound[i],
            arima_lower: predictionData.arima.lower_bound[i],
            lstm: predictionData.lstm?.predictions[i],
            lstm_upper: predictionData.lstm?.upper_bound[i],
            lstm_lower: predictionData.lstm?.lower_bound[i],
            type: 'prediction'
          });
        });
      }

      return [...historicalData, ...predictionChart];
    };

    const chartData = preparePredictionChart();

    return (
      <>
        <div className="stock-header">
          <div className="stock-icon" style={{ background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)' }}>
            <Brain size={28} />
          </div>
          <div className="stock-info">
            <div className="stock-symbol">{stockData.symbol} 价格预测</div>
            <div className="stock-name">基于时间序列和神经网络的智能预测</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Zap size={18} /> 预测设置
            </div>
          </div>
          <div className="card-body">
            <div className="prediction-header">
              <button
                className={`prediction-btn ${predictionMethod === 'arima' ? 'active' : ''}`}
                onClick={() => setPredictionMethod('arima')}
              >
                ARIMA时序预测
              </button>
              <button
                className={`prediction-btn ${predictionMethod === 'lstm' ? 'active' : ''}`}
                onClick={() => setPredictionMethod('lstm')}
              >
                LSTM神经网络
              </button>
              <button
                className={`prediction-btn ${predictionMethod === 'both' ? 'active' : ''}`}
                onClick={() => setPredictionMethod('both')}
              >
                综合对比
              </button>
              <button
                className="btn btn-primary"
                onClick={fetchPrediction}
                disabled={predictionLoading}
                style={{ marginLeft: 'auto' }}
              >
                {predictionLoading ? (
                  <>
                    <Loader2 size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                    预测中...
                  </>
                ) : (
                  <>
                    <Brain size={16} />
                    开始预测
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {predictionLoading && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="loading-overlay">
              <div className="spinner"></div>
              <p>AI模型正在分析数据并生成预测...</p>
              <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
                {predictionMethod === 'lstm' || predictionMethod === 'both' 
                  ? 'LSTM神经网络训练中，请稍候...' 
                  : 'ARIMA模型拟合中...'}
              </p>
            </div>
          </div>
        )}

        {predictionData && !predictionLoading && (
          <>
            <div className="dashboard-grid" style={{ marginTop: '1.5rem' }}>
              {predictionData.arima && (
                <div className="metric-card">
                  <div className="metric-label">
                    <TrendingUp size={16} /> ARIMA 30日预测
                  </div>
                  <div className="metric-value" style={{ color: '#22c55e' }}>
                    ${predictionData.arima.predictions[29]?.toFixed(2)}
                  </div>
                  <div className={`metric-change ${
                    predictionData.arima.predictions[29] > predictionData.last_price ? 'positive' : 'negative'
                  }`}>
                    {predictionData.arima.predictions[29] > predictionData.last_price ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {((predictionData.arima.predictions[29] - predictionData.last_price) / predictionData.last_price * 100).toFixed(2)}%
                  </div>
                </div>
              )}
              {predictionData.lstm && (
                <div className="metric-card">
                  <div className="metric-label">
                    <Brain size={16} /> LSTM 30日预测
                  </div>
                  <div className="metric-value" style={{ color: '#a855f7' }}>
                    ${predictionData.lstm.predictions[29]?.toFixed(2)}
                  </div>
                  <div className={`metric-change ${
                    predictionData.lstm.predictions[29] > predictionData.last_price ? 'positive' : 'negative'
                  }`}>
                    {predictionData.lstm.predictions[29] > predictionData.last_price ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {((predictionData.lstm.predictions[29] - predictionData.last_price) / predictionData.last_price * 100).toFixed(2)}%
                  </div>
                </div>
              )}
              <div className="metric-card">
                <div className="metric-label">
                  <PieChart size={16} /> 当前价格
                </div>
                <div className="metric-value">
                  ${predictionData.last_price}
                </div>
                <div className="metric-change">
                  {predictionData.last_date}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-label">
                  <Target size={16} /> 预测周期
                </div>
                <div className="metric-value">
                  30天
                </div>
                <div className="metric-change">
                  交易日预测
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <div className="card-title">
                  <BarChart3 size={18} /> 预测结果可视化
                </div>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '400px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#64748b"
                        tick={{ fill: '#64748b', fontSize: 11 }}
                        tickFormatter={(val) => val.slice(5)}
                      />
                      <YAxis 
                        stroke="#64748b"
                        tick={{ fill: '#64748b', fontSize: 12 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="actual" 
                        stroke="#3b82f6" 
                        strokeWidth={2}
                        dot={false}
                        name="实际价格"
                      />
                      {predictionData.arima && (
                        <>
                          <Line 
                            type="monotone" 
                            dataKey="arima" 
                            stroke="#22c55e" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="ARIMA预测"
                          />
                          <Area
                            type="monotone"
                            dataKey="arima_upper"
                            stroke="none"
                            fill="#22c55e"
                            fillOpacity={0.1}
                            name="ARIMA上界"
                          />
                        </>
                      )}
                      {predictionData.lstm && (
                        <>
                          <Line 
                            type="monotone" 
                            dataKey="lstm" 
                            stroke="#a855f7" 
                            strokeWidth={2}
                            strokeDasharray="5 5"
                            dot={false}
                            name="LSTM预测"
                          />
                          <Area
                            type="monotone"
                            dataKey="lstm_upper"
                            stroke="none"
                            fill="#a855f7"
                            fillOpacity={0.1}
                            name="LSTM上界"
                          />
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <div className="card-title">
                  <AlertTriangle size={18} /> 风险提示
                </div>
              </div>
              <div className="card-body">
                <p style={{ color: '#94a3b8', lineHeight: 1.8 }}>
                  ⚠️ 本预测仅供参考，不构成投资建议。模型基于历史数据训练，无法预测突发事件对市场的影响。
                  投资有风险，入市需谨慎。建议结合基本面分析、技术分析和市场情绪进行综合判断。
                </p>
              </div>
            </div>
          </>
        )}
      </>
    );
  };

  const renderComparison = () => {
    return (
      <>
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <BarChart3 size={18} /> 多股票风险比较
            </div>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <input
                type="text"
                className="search-input"
                placeholder="输入股票代码添加..."
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                style={{ flex: 1 }}
              />
              <button className="btn btn-secondary" onClick={addCompareSymbol}>
                <Plus size={16} /> 添加
              </button>
              <button 
                className="btn btn-primary" 
                onClick={fetchComparison}
                disabled={compareSymbols.length === 0 || loading}
              >
                <RefreshCw size={16} /> 比较分析
              </button>
            </div>
            
            <div className="compare-list">
              {compareSymbols.map(symbol => (
                <div key={symbol} className="compare-tag">
                  <span>{symbol}</span>
                  <button onClick={() => removeCompareSymbol(symbol)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {loading && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="loading-overlay">
              <div className="spinner"></div>
              <p>正在获取和分析数据...</p>
            </div>
          </div>
        )}

        {comparisonData && !loading && (
          <>
            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <div className="card-title">
                  <Target size={18} /> Beta系数对比
                </div>
              </div>
              <div className="card-body">
                <div className="chart-container" style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonData.comparison}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis dataKey="symbol" stroke="#64748b" tick={{ fill: '#64748b' }} />
                      <YAxis stroke="#64748b" tick={{ fill: '#64748b' }} />
                      <Tooltip content={<CustomTooltip />} />
                      <ReferenceLine y={1} stroke="#ef4444" strokeDasharray="5 5" />
                      <Bar 
                        dataKey="metrics.beta" 
                        fill="#3b82f6" 
                        name="Beta"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: '1.5rem' }}>
              <div className="card-header">
                <div className="card-title">
                  <Activity size={18} /> 详细指标对比
                </div>
              </div>
              <div className="card-body" style={{ overflowX: 'auto' }}>
                <table className="comparison-table">
                  <thead>
                    <tr>
                      <th>股票</th>
                      <th>当前价格</th>
                      <th>Beta</th>
                      <th>波动率</th>
                      <th>夏普比率</th>
                      <th>VaR(95%)</th>
                      <th>最大回撤</th>
                      <th>风险等级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonData.comparison.map(stock => (
                      <tr key={stock.symbol}>
                        <td>
                          <strong>{stock.symbol}</strong>
                          <div style={{ fontSize: '0.8rem', color: '#64748b' }}>{stock.name}</div>
                        </td>
                        <td>${stock.current_price}</td>
                        <td style={{ color: stock.metrics.beta > 1 ? '#f97316' : '#22c55e' }}>
                          {stock.metrics.beta}
                        </td>
                        <td>{stock.metrics.volatility}%</td>
                        <td style={{ color: stock.metrics.sharpe_ratio > 0 ? '#22c55e' : '#ef4444' }}>
                          {stock.metrics.sharpe_ratio}
                        </td>
                        <td style={{ color: '#ef4444' }}>{stock.metrics.var_95}%</td>
                        <td style={{ color: '#ef4444' }}>{stock.metrics.max_drawdown}%</td>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '12px',
                            background: stock.metrics.risk_level.color,
                            color: 'white',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}>
                            {stock.metrics.risk_level.level}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </>
    );
  };

  const renderHourlyPrediction = () => {
    if (!stockData) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Clock size={40} color="#64748b" />
          </div>
          <h3 className="empty-state-title">5小时K线预测</h3>
          <p className="empty-state-text">
            请先搜索一只股票，然后输入您对未来5小时的K线预测，与AI预测和实际走势进行对比
          </p>
        </div>
      );
    }

    if (hourlyLoading) {
      return (
        <div className="loading-overlay" style={{ minHeight: '400px' }}>
          <div className="spinner"></div>
          <p>正在获取小时级数据...</p>
        </div>
      );
    }

    const prepareComparisonChart = () => {
      if (!hourlyData) return [];
      
      const recentData = hourlyData.data.slice(-12).map(d => ({
        time: d.time.slice(11, 16),
        actual: d.close,
        type: 'actual'
      }));

      if (aiHourlyPrediction?.predictions) {
        aiHourlyPrediction.predictions.forEach(p => {
          recentData.push({
            time: p.time.slice(11, 16),
            ai: p.close,
            aiHigh: p.upper_bound,
            aiLow: p.lower_bound,
            type: 'prediction'
          });
        });
      }

      if (userPredictionSaved) {
        userPredictions.forEach((p, i) => {
          const idx = recentData.findIndex(d => d.type === 'prediction');
          if (idx !== -1 && recentData[idx + i]) {
            recentData[idx + i].user = parseFloat(p.close);
          }
        });
      }

      return recentData;
    };

    const chartData = prepareComparisonChart();

    const prepareCandleData = () => {
      if (!hourlyData) return [];
      
      const recent = hourlyData.data.slice(-8).map(d => ({
        ...d,
        time: d.time.slice(11, 16),
        type: 'actual'
      }));

      if (aiHourlyPrediction?.predictions) {
        aiHourlyPrediction.predictions.forEach(p => {
          recent.push({
            time: p.time.slice(11, 16),
            open: p.open,
            high: p.high,
            low: p.low,
            close: p.close,
            type: 'ai'
          });
        });
      }

      return recent;
    };

    const candleData = prepareCandleData();

    return (
      <>
        <div className="stock-header">
          <div className="stock-icon" style={{ background: 'linear-gradient(135deg, #f97316 0%, #eab308 100%)' }}>
            <Clock size={28} />
          </div>
          <div className="stock-info">
            <div className="stock-symbol">{stockData.symbol} 5小时预测</div>
            <div className="stock-name">输入您的预测，与AI和实际走势对比</div>
            {hourlyData && (
              <div className="stock-meta">
                <span>当前价格: ${hourlyData.last_price}</span>
                <span>•</span>
                <span>最后更新: {hourlyData.last_time}</span>
              </div>
            )}
          </div>
          <button 
            className="btn btn-secondary" 
            onClick={() => fetchHourlyData(stockData.symbol)}
          >
            <RefreshCw size={16} /> 刷新数据
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Edit3 size={18} /> 输入您的5小时预测
              </div>
            </div>
            <div className="card-body">
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.5rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.8rem' }}>小时</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>开盘</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>最高</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>最低</th>
                      <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>收盘</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userPredictions.map((pred, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>+{pred.hour}h</td>
                        <td style={{ padding: '0.25rem' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={pred.open}
                            onChange={(e) => updateUserPrediction(idx, 'open', e.target.value)}
                            disabled={idx > 0}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              background: idx > 0 ? '#1e293b' : '#334155',
                              border: '1px solid #475569',
                              borderRadius: '4px',
                              color: 'white',
                              textAlign: 'center'
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.25rem' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={pred.high}
                            onChange={(e) => updateUserPrediction(idx, 'high', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              background: '#334155',
                              border: '1px solid #475569',
                              borderRadius: '4px',
                              color: '#22c55e',
                              textAlign: 'center'
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.25rem' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={pred.low}
                            onChange={(e) => updateUserPrediction(idx, 'low', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              background: '#334155',
                              border: '1px solid #475569',
                              borderRadius: '4px',
                              color: '#ef4444',
                              textAlign: 'center'
                            }}
                          />
                        </td>
                        <td style={{ padding: '0.25rem' }}>
                          <input
                            type="number"
                            step="0.01"
                            value={pred.close}
                            onChange={(e) => updateUserPrediction(idx, 'close', e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.5rem',
                              background: '#334155',
                              border: '1px solid #475569',
                              borderRadius: '4px',
                              color: '#3b82f6',
                              textAlign: 'center'
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                className="btn btn-primary"
                onClick={saveUserPrediction}
                style={{ width: '100%', marginTop: '1rem', justifyContent: 'center' }}
              >
                {userPredictionSaved ? (
                  <><Eye size={16} /> 已保存 - 查看对比</>
                ) : (
                  <><Target size={16} /> 保存预测并对比</>
                )}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Brain size={18} /> AI预测 (ARIMA)
              </div>
            </div>
            <div className="card-body">
              {aiHourlyPrediction?.predictions ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '0.5rem', textAlign: 'left', color: '#94a3b8', fontSize: '0.8rem' }}>小时</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>开盘</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>最高</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>最低</th>
                        <th style={{ padding: '0.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>收盘</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aiHourlyPrediction.predictions.map((pred, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>+{pred.hour}h</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center' }}>${pred.open}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', color: '#22c55e' }}>${pred.high}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', color: '#ef4444' }}>${pred.low}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'center', color: '#a855f7', fontWeight: 600 }}>${pred.close}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#1e293b', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ color: '#94a3b8' }}>5小时预测变化</span>
                      <span style={{ 
                        color: aiHourlyPrediction.predictions[4].close > aiHourlyPrediction.last_price ? '#22c55e' : '#ef4444',
                        fontWeight: 600
                      }}>
                        {((aiHourlyPrediction.predictions[4].close - aiHourlyPrediction.last_price) / aiHourlyPrediction.last_price * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
                  暂无AI预测数据
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <div className="card-title">
              <BarChart3 size={18} /> K线走势与预测对比
            </div>
          </div>
          <div className="card-body">
            <div className="chart-container" style={{ height: '400px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                  />
                  <YAxis 
                    stroke="#64748b"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="actual" 
                    stroke="#3b82f6" 
                    strokeWidth={2}
                    dot={{ fill: '#3b82f6', r: 4 }}
                    name="实际价格"
                    connectNulls={false}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="ai" 
                    stroke="#a855f7" 
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: '#a855f7', r: 4 }}
                    name="AI预测"
                    connectNulls={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="aiHigh"
                    stroke="none"
                    fill="#a855f7"
                    fillOpacity={0.1}
                    name="AI上界"
                  />
                  {userPredictionSaved && (
                    <Line 
                      type="monotone" 
                      dataKey="user" 
                      stroke="#f97316" 
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={{ fill: '#f97316', r: 4 }}
                      name="用户预测"
                      connectNulls={false}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {predictionComparison && (
          <div className="card" style={{ marginTop: '1.5rem' }}>
            <div className="card-header">
              <div className="card-title">
                <Target size={18} /> 预测准确度对比
              </div>
              <button className="btn btn-secondary" onClick={fetchPredictionComparison}>
                <RefreshCw size={14} /> 刷新对比
              </button>
            </div>
            <div className="card-body">
              <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="metric-card">
                  <div className="metric-label">用户预测MAE</div>
                  <div className="metric-value" style={{ color: '#f97316' }}>
                    ${predictionComparison.user_mae || '-'}
                  </div>
                  <div className="metric-change">平均绝对误差</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">AI预测MAE</div>
                  <div className="metric-value" style={{ color: '#a855f7' }}>
                    ${predictionComparison.ai_mae || '-'}
                  </div>
                  <div className="metric-change">平均绝对误差</div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">预测结果</div>
                  <div className="metric-value" style={{ 
                    color: predictionComparison.user_mae && predictionComparison.ai_mae 
                      ? (predictionComparison.user_mae < predictionComparison.ai_mae ? '#22c55e' : '#ef4444')
                      : '#64748b'
                  }}>
                    {predictionComparison.user_mae && predictionComparison.ai_mae 
                      ? (predictionComparison.user_mae < predictionComparison.ai_mae ? '你赢了!' : 'AI更准')
                      : '待验证'}
                  </div>
                  <div className="metric-change">等待实际数据验证</div>
                </div>
              </div>

              {predictionComparison.actual && predictionComparison.actual.length > 0 && (
                <div style={{ marginTop: '1.5rem' }}>
                  <h4 style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '1rem' }}>最近实际K线数据</h4>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="comparison-table">
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>开盘</th>
                          <th>最高</th>
                          <th>最低</th>
                          <th>收盘</th>
                        </tr>
                      </thead>
                      <tbody>
                        {predictionComparison.actual.slice(-5).map((item, idx) => (
                          <tr key={idx}>
                            <td>{item.time}</td>
                            <td>${item.open}</td>
                            <td style={{ color: '#22c55e' }}>${item.high}</td>
                            <td style={{ color: '#ef4444' }}>${item.low}</td>
                            <td style={{ fontWeight: 600 }}>${item.close}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="card-header">
            <div className="card-title">
              <AlertTriangle size={18} /> 使用说明
            </div>
          </div>
          <div className="card-body">
            <div style={{ color: '#94a3b8', lineHeight: 1.8, fontSize: '0.9rem' }}>
              <p><strong>1. 输入预测:</strong> 在左侧表格中输入您对未来5小时的K线预测（开盘、最高、最低、收盘价）</p>
              <p><strong>2. 自动填充:</strong> 每小时的收盘价会自动成为下一小时的开盘价</p>
              <p><strong>3. 保存对比:</strong> 点击"保存预测并对比"查看您的预测与AI预测的对比</p>
              <p><strong>4. 验证准确度:</strong> 等待实际数据更新后，系统会计算预测误差（MAE）进行对比</p>
              <p style={{ marginTop: '1rem', color: '#eab308' }}>
                ⚠️ 注意：预测仅供娱乐和学习，不构成投资建议。市场有风险，投资需谨慎。
              </p>
            </div>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="app">
      <header className="header">
        <div className="logo">
          <div className="logo-icon">FR</div>
          <span className="logo-text">FinRisk Pro</span>
        </div>
        
        <form className="search-container" onSubmit={handleSearch}>
          <input
            type="text"
            className="search-input"
            placeholder="输入股票代码 (如 AAPL, GOOGL, TSLA)..."
            value={searchSymbol}
            onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Loader2 size={16} className="spinner" /> : <Search size={16} />}
            分析
          </button>
        </form>

        <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'right' }}>
          <div>数据来源: Yahoo Finance</div>
          <div style={{ color: '#a855f7', fontWeight: 500 }}>Designed by Starry</div>
        </div>
      </header>

      <main className="main-content">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <TrendingUp size={16} /> 风险总览
          </button>
          <button
            className={`tab ${activeTab === 'prediction' ? 'active' : ''}`}
            onClick={() => setActiveTab('prediction')}
          >
            <Brain size={16} /> AI预测
          </button>
          <button
            className={`tab ${activeTab === 'comparison' ? 'active' : ''}`}
            onClick={() => setActiveTab('comparison')}
          >
            <BarChart3 size={16} /> 对比分析
          </button>
          <button
            className={`tab ${activeTab === 'hourly' ? 'active' : ''}`}
            onClick={() => { setActiveTab('hourly'); if (stockData) fetchHourlyData(stockData.symbol); }}
          >
            <Clock size={16} /> 5小时预测
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            color: '#ef4444'
          }}>
            <AlertTriangle size={16} style={{ display: 'inline', marginRight: '0.5rem' }} />
            {error}
          </div>
        )}

        {loading && !comparisonData ? (
          <div className="loading-overlay" style={{ minHeight: '400px' }}>
            <div className="spinner"></div>
            <p>正在获取股票数据...</p>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && renderOverview()}
            {activeTab === 'prediction' && renderPrediction()}
            {activeTab === 'comparison' && renderComparison()}
            {activeTab === 'hourly' && renderHourlyPrediction()}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
