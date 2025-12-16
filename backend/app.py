from flask import Flask, jsonify, request
from flask_cors import CORS
import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from sklearn.preprocessing import MinMaxScaler
from statsmodels.tsa.arima.model import ARIMA
import warnings
import json
warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)

user_predictions = {}

def calculate_beta(stock_returns, market_returns):
    """计算Beta系数"""
    covariance = np.cov(stock_returns, market_returns)[0][1]
    market_variance = np.var(market_returns)
    if market_variance == 0:
        return 0
    return covariance / market_variance

def calculate_risk_metrics(stock_data, market_data):
    """计算风险指标"""
    stock_returns = stock_data['Close'].pct_change().dropna()
    market_returns = market_data['Close'].pct_change().dropna()
    
    min_len = min(len(stock_returns), len(market_returns))
    stock_returns = stock_returns[-min_len:]
    market_returns = market_returns[-min_len:]
    
    beta = calculate_beta(stock_returns.values, market_returns.values)
    
    volatility = stock_returns.std() * np.sqrt(252) * 100
    
    sharpe_ratio = (stock_returns.mean() * 252) / (stock_returns.std() * np.sqrt(252)) if stock_returns.std() != 0 else 0
    
    negative_returns = stock_returns[stock_returns < 0]
    downside_std = negative_returns.std() * np.sqrt(252) if len(negative_returns) > 0 else 0
    sortino_ratio = (stock_returns.mean() * 252) / downside_std if downside_std != 0 else 0
    
    var_95 = np.percentile(stock_returns, 5) * 100
    
    max_drawdown = calculate_max_drawdown(stock_data['Close'])
    
    alpha = (stock_returns.mean() - 0.02/252 - beta * (market_returns.mean() - 0.02/252)) * 252 * 100
    
    return {
        'beta': round(beta, 4),
        'volatility': round(volatility, 2),
        'sharpe_ratio': round(sharpe_ratio, 4),
        'sortino_ratio': round(sortino_ratio, 4),
        'var_95': round(var_95, 2),
        'max_drawdown': round(max_drawdown, 2),
        'alpha': round(alpha, 4),
        'risk_level': get_risk_level(beta, volatility)
    }

def calculate_max_drawdown(prices):
    """计算最大回撤"""
    peak = prices.expanding(min_periods=1).max()
    drawdown = (prices - peak) / peak
    return drawdown.min() * 100

def get_risk_level(beta, volatility):
    """评估风险等级"""
    score = (abs(beta - 1) * 30) + (volatility / 100 * 70)
    if score < 15:
        return {'level': '低风险', 'color': '#22c55e', 'score': round(score, 1)}
    elif score < 30:
        return {'level': '中低风险', 'color': '#84cc16', 'score': round(score, 1)}
    elif score < 50:
        return {'level': '中等风险', 'color': '#eab308', 'score': round(score, 1)}
    elif score < 70:
        return {'level': '中高风险', 'color': '#f97316', 'score': round(score, 1)}
    else:
        return {'level': '高风险', 'color': '#ef4444', 'score': round(score, 1)}

def arima_predict(data, periods=30):
    """ARIMA时间序列预测"""
    try:
        prices = data['Close'].values
        model = ARIMA(prices, order=(5, 1, 0))
        model_fit = model.fit()
        forecast = model_fit.forecast(steps=periods)
        
        conf_int = model_fit.get_forecast(steps=periods).conf_int()
        
        return {
            'predictions': forecast.tolist(),
            'lower_bound': conf_int.iloc[:, 0].tolist(),
            'upper_bound': conf_int.iloc[:, 1].tolist()
        }
    except Exception as e:
        print(f"ARIMA预测错误: {e}")
        return None

def lstm_predict(data, periods=30):
    """LSTM神经网络预测"""
    try:
        from tensorflow.keras.models import Sequential
        from tensorflow.keras.layers import LSTM, Dense, Dropout
        
        prices = data['Close'].values.reshape(-1, 1)
        scaler = MinMaxScaler(feature_range=(0, 1))
        scaled_data = scaler.fit_transform(prices)
        
        look_back = 60
        X, y = [], []
        for i in range(look_back, len(scaled_data)):
            X.append(scaled_data[i-look_back:i, 0])
            y.append(scaled_data[i, 0])
        
        X, y = np.array(X), np.array(y)
        X = np.reshape(X, (X.shape[0], X.shape[1], 1))
        
        model = Sequential([
            LSTM(50, return_sequences=True, input_shape=(look_back, 1)),
            Dropout(0.2),
            LSTM(50, return_sequences=False),
            Dropout(0.2),
            Dense(25),
            Dense(1)
        ])
        
        model.compile(optimizer='adam', loss='mean_squared_error')
        model.fit(X, y, batch_size=32, epochs=10, verbose=0)
        
        predictions = []
        last_sequence = scaled_data[-look_back:].reshape(1, look_back, 1)
        
        for _ in range(periods):
            pred = model.predict(last_sequence, verbose=0)
            predictions.append(pred[0, 0])
            last_sequence = np.roll(last_sequence, -1, axis=1)
            last_sequence[0, -1, 0] = pred[0, 0]
        
        predictions = scaler.inverse_transform(np.array(predictions).reshape(-1, 1)).flatten()
        
        volatility = data['Close'].pct_change().std()
        lower_bound = predictions * (1 - 2 * volatility * np.sqrt(np.arange(1, periods + 1)))
        upper_bound = predictions * (1 + 2 * volatility * np.sqrt(np.arange(1, periods + 1)))
        
        return {
            'predictions': predictions.tolist(),
            'lower_bound': lower_bound.tolist(),
            'upper_bound': upper_bound.tolist()
        }
    except Exception as e:
        print(f"LSTM预测错误: {e}")
        return None

@app.route('/api/stock/<symbol>', methods=['GET'])
def get_stock_data(symbol):
    """获取股票数据"""
    try:
        period = request.args.get('period', '1y')
        stock = yf.Ticker(symbol)
        data = stock.history(period=period)
        
        if data.empty:
            return jsonify({'error': '无法获取股票数据，请检查股票代码'}), 404
        
        info = stock.info
        
        chart_data = []
        for date, row in data.iterrows():
            chart_data.append({
                'date': date.strftime('%Y-%m-%d'),
                'open': round(row['Open'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2),
                'close': round(row['Close'], 2),
                'volume': int(row['Volume'])
            })
        
        return jsonify({
            'symbol': symbol.upper(),
            'name': info.get('longName', symbol),
            'currency': info.get('currency', 'USD'),
            'exchange': info.get('exchange', 'N/A'),
            'sector': info.get('sector', 'N/A'),
            'industry': info.get('industry', 'N/A'),
            'market_cap': info.get('marketCap', 0),
            'pe_ratio': info.get('trailingPE', 0),
            'dividend_yield': info.get('dividendYield', 0),
            'fifty_two_week_high': info.get('fiftyTwoWeekHigh', 0),
            'fifty_two_week_low': info.get('fiftyTwoWeekLow', 0),
            'current_price': round(data['Close'].iloc[-1], 2),
            'price_change': round(data['Close'].iloc[-1] - data['Close'].iloc[-2], 2),
            'price_change_percent': round((data['Close'].iloc[-1] - data['Close'].iloc[-2]) / data['Close'].iloc[-2] * 100, 2),
            'chart_data': chart_data
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/<symbol>', methods=['GET'])
def get_risk_analysis(symbol):
    """获取风险分析"""
    try:
        period = request.args.get('period', '1y')
        benchmark = request.args.get('benchmark', 'SPY')
        
        stock = yf.Ticker(symbol)
        stock_data = stock.history(period=period)
        
        market = yf.Ticker(benchmark)
        market_data = market.history(period=period)
        
        if stock_data.empty:
            return jsonify({'error': '无法获取股票数据'}), 404
        
        risk_metrics = calculate_risk_metrics(stock_data, market_data)
        
        returns = stock_data['Close'].pct_change().dropna()
        returns_distribution = {
            'values': returns.values.tolist()[-252:],
            'mean': round(returns.mean() * 100, 4),
            'std': round(returns.std() * 100, 4),
            'skew': round(returns.skew(), 4),
            'kurtosis': round(returns.kurtosis(), 4)
        }
        
        rolling_beta = []
        window = 30
        stock_returns = stock_data['Close'].pct_change().dropna()
        market_returns = market_data['Close'].pct_change().dropna()
        
        min_len = min(len(stock_returns), len(market_returns))
        stock_returns = stock_returns[-min_len:]
        market_returns = market_returns[-min_len:]
        
        for i in range(window, len(stock_returns)):
            beta = calculate_beta(
                stock_returns.iloc[i-window:i].values,
                market_returns.iloc[i-window:i].values
            )
            rolling_beta.append({
                'date': stock_returns.index[i].strftime('%Y-%m-%d'),
                'beta': round(beta, 4)
            })
        
        return jsonify({
            'symbol': symbol.upper(),
            'benchmark': benchmark,
            'metrics': risk_metrics,
            'returns_distribution': returns_distribution,
            'rolling_beta': rolling_beta
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/predict/<symbol>', methods=['GET'])
def get_predictions(symbol):
    """获取预测数据"""
    try:
        periods = int(request.args.get('periods', 30))
        method = request.args.get('method', 'both')
        
        stock = yf.Ticker(symbol)
        data = stock.history(period='2y')
        
        if data.empty:
            return jsonify({'error': '无法获取股票数据'}), 404
        
        result = {
            'symbol': symbol.upper(),
            'last_price': round(data['Close'].iloc[-1], 2),
            'last_date': data.index[-1].strftime('%Y-%m-%d'),
            'prediction_dates': [(data.index[-1] + timedelta(days=i+1)).strftime('%Y-%m-%d') for i in range(periods)]
        }
        
        if method in ['arima', 'both']:
            arima_result = arima_predict(data, periods)
            if arima_result:
                result['arima'] = arima_result
        
        if method in ['lstm', 'both']:
            lstm_result = lstm_predict(data, periods)
            if lstm_result:
                result['lstm'] = lstm_result
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/compare', methods=['POST'])
def compare_stocks():
    """比较多个股票"""
    try:
        data = request.json
        symbols = data.get('symbols', [])
        period = data.get('period', '1y')
        benchmark = data.get('benchmark', 'SPY')
        
        market = yf.Ticker(benchmark)
        market_data = market.history(period=period)
        
        results = []
        for symbol in symbols[:10]:
            try:
                stock = yf.Ticker(symbol)
                stock_data = stock.history(period=period)
                
                if not stock_data.empty:
                    risk_metrics = calculate_risk_metrics(stock_data, market_data)
                    info = stock.info
                    
                    results.append({
                        'symbol': symbol.upper(),
                        'name': info.get('longName', symbol),
                        'current_price': round(stock_data['Close'].iloc[-1], 2),
                        'metrics': risk_metrics
                    })
            except:
                continue
        
        return jsonify({'comparison': results, 'benchmark': benchmark})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search/<query>', methods=['GET'])
def search_stocks(query):
    """搜索股票"""
    try:
        ticker = yf.Ticker(query)
        info = ticker.info
        
        if 'symbol' in info:
            return jsonify({
                'results': [{
                    'symbol': info.get('symbol', query),
                    'name': info.get('longName', query),
                    'exchange': info.get('exchange', 'N/A'),
                    'type': info.get('quoteType', 'N/A')
                }]
            })
        return jsonify({'results': []})
    except:
        return jsonify({'results': []})

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查"""
    return jsonify({'status': 'ok', 'timestamp': datetime.now().isoformat()})

@app.route('/api/kline/<symbol>', methods=['GET'])
def get_kline_data(symbol):
    """获取多周期K线数据"""
    try:
        interval = request.args.get('interval', '1d')
        period = request.args.get('period', '3mo')
        
        interval_map = {
            '1h': ('5d', '1h'),
            '1d': (period, '1d'),
            '1wk': ('2y', '1wk'),
            '1mo': ('5y', '1mo')
        }
        
        if interval not in interval_map:
            interval = '1d'
        
        actual_period, actual_interval = interval_map[interval]
        if interval == '1d':
            actual_period = period
        
        stock = yf.Ticker(symbol)
        data = stock.history(period=actual_period, interval=actual_interval)
        
        if data.empty:
            return jsonify({'error': '无法获取K线数据'}), 404
        
        candle_data = []
        for dt, row in data.iterrows():
            time_format = '%Y-%m-%d %H:%M' if interval == '1h' else '%Y-%m-%d'
            candle_data.append({
                'time': dt.strftime(time_format),
                'open': round(row['Open'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2),
                'close': round(row['Close'], 2),
                'volume': int(row['Volume']),
                'change': round((row['Close'] - row['Open']) / row['Open'] * 100, 2) if row['Open'] > 0 else 0
            })
        
        return jsonify({
            'symbol': symbol.upper(),
            'interval': interval,
            'period': actual_period,
            'data': candle_data,
            'last_price': round(data['Close'].iloc[-1], 2)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/quantitative/<symbol>', methods=['GET'])
def get_quantitative_analysis(symbol):
    """获取量化细致分析"""
    try:
        stock = yf.Ticker(symbol)
        data = stock.history(period='1y')
        
        if data.empty or len(data) < 30:
            return jsonify({'error': '数据不足'}), 404
        
        closes = data['Close']
        returns = closes.pct_change().dropna()
        
        ma5 = closes.rolling(5).mean().iloc[-1]
        ma10 = closes.rolling(10).mean().iloc[-1]
        ma20 = closes.rolling(20).mean().iloc[-1]
        ma60 = closes.rolling(60).mean().iloc[-1] if len(closes) >= 60 else None
        
        delta = closes.diff()
        gain = (delta.where(delta > 0, 0)).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs)).iloc[-1]
        
        ema12 = closes.ewm(span=12).mean()
        ema26 = closes.ewm(span=26).mean()
        macd = ema12 - ema26
        signal = macd.ewm(span=9).mean()
        macd_hist = macd - signal
        
        bb_ma = closes.rolling(20).mean()
        bb_std = closes.rolling(20).std()
        bb_upper = bb_ma + 2 * bb_std
        bb_lower = bb_ma - 2 * bb_std
        
        lowest_14 = closes.rolling(14).min()
        highest_14 = closes.rolling(14).max()
        k = 100 * (closes - lowest_14) / (highest_14 - lowest_14)
        d = k.rolling(3).mean()
        
        skewness = returns.skew()
        kurtosis = returns.kurtosis()
        
        current_price = closes.iloc[-1]
        
        signals = []
        if current_price > ma5.item() if hasattr(ma5, 'item') else ma5:
            signals.append({'type': 'bullish', 'indicator': 'MA5', 'desc': '价格在5日均线上方'})
        else:
            signals.append({'type': 'bearish', 'indicator': 'MA5', 'desc': '价格在5日均线下方'})
        
        rsi_val = rsi.item() if hasattr(rsi, 'item') else rsi
        if rsi_val > 70:
            signals.append({'type': 'bearish', 'indicator': 'RSI', 'desc': f'RSI={rsi_val:.1f} 超买区域'})
        elif rsi_val < 30:
            signals.append({'type': 'bullish', 'indicator': 'RSI', 'desc': f'RSI={rsi_val:.1f} 超卖区域'})
        else:
            signals.append({'type': 'neutral', 'indicator': 'RSI', 'desc': f'RSI={rsi_val:.1f} 中性区域'})
        
        macd_val = macd.iloc[-1]
        signal_val = signal.iloc[-1]
        if macd_val > signal_val:
            signals.append({'type': 'bullish', 'indicator': 'MACD', 'desc': 'MACD金叉，看多信号'})
        else:
            signals.append({'type': 'bearish', 'indicator': 'MACD', 'desc': 'MACD死叉，看空信号'})
        
        return jsonify({
            'symbol': symbol.upper(),
            'current_price': round(current_price, 2),
            'moving_averages': {
                'ma5': round(ma5, 2),
                'ma10': round(ma10, 2),
                'ma20': round(ma20, 2),
                'ma60': round(ma60, 2) if ma60 else None
            },
            'indicators': {
                'rsi': round(rsi_val, 2),
                'macd': round(macd.iloc[-1], 4),
                'macd_signal': round(signal.iloc[-1], 4),
                'macd_hist': round(macd_hist.iloc[-1], 4),
                'kdj_k': round(k.iloc[-1], 2),
                'kdj_d': round(d.iloc[-1], 2)
            },
            'bollinger': {
                'upper': round(bb_upper.iloc[-1], 2),
                'middle': round(bb_ma.iloc[-1], 2),
                'lower': round(bb_lower.iloc[-1], 2)
            },
            'statistics': {
                'skewness': round(skewness, 4),
                'kurtosis': round(kurtosis, 4),
                'daily_volatility': round(returns.std() * 100, 2),
                'annual_volatility': round(returns.std() * np.sqrt(252) * 100, 2),
                'avg_daily_return': round(returns.mean() * 100, 4),
                'cumulative_return': round((closes.iloc[-1] / closes.iloc[0] - 1) * 100, 2)
            },
            'signals': signals,
            'trend': 'bullish' if len([s for s in signals if s['type'] == 'bullish']) > len([s for s in signals if s['type'] == 'bearish']) else 'bearish'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/daily-kline/<symbol>', methods=['GET'])
def get_daily_kline(symbol):
    """获取日K线数据"""
    try:
        period = request.args.get('period', '3mo')
        stock = yf.Ticker(symbol)
        data = stock.history(period=period, interval='1d')
        
        if data.empty:
            return jsonify({'error': '无法获取日K线数据'}), 404
        
        candle_data = []
        for dt, row in data.iterrows():
            candle_data.append({
                'time': dt.strftime('%Y-%m-%d'),
                'open': round(row['Open'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2),
                'close': round(row['Close'], 2),
                'volume': int(row['Volume']),
                'change': round((row['Close'] - row['Open']) / row['Open'] * 100, 2)
            })
        
        return jsonify({
            'symbol': symbol.upper(),
            'interval': '1d',
            'period': period,
            'data': candle_data,
            'last_price': round(data['Close'].iloc[-1], 2)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/hourly/<symbol>', methods=['GET'])
def get_hourly_data(symbol):
    """获取小时级K线数据"""
    try:
        stock = yf.Ticker(symbol)
        data = stock.history(period='5d', interval='1h')
        
        if data.empty:
            return jsonify({'error': '无法获取小时数据'}), 404
        
        candle_data = []
        for dt, row in data.iterrows():
            candle_data.append({
                'time': dt.strftime('%Y-%m-%d %H:%M'),
                'open': round(row['Open'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2),
                'close': round(row['Close'], 2),
                'volume': int(row['Volume'])
            })
        
        return jsonify({
            'symbol': symbol.upper(),
            'interval': '1h',
            'data': candle_data,
            'last_price': round(data['Close'].iloc[-1], 2),
            'last_time': data.index[-1].strftime('%Y-%m-%d %H:%M')
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/hourly-predict/<symbol>', methods=['GET'])
def get_hourly_predictions(symbol):
    """获取未来5小时AI预测"""
    try:
        stock = yf.Ticker(symbol)
        data = stock.history(period='1mo', interval='1h')
        
        if data.empty or len(data) < 30:
            return jsonify({'error': '数据不足，无法预测'}), 404
        
        prices = data['Close'].values
        
        try:
            model = ARIMA(prices, order=(3, 1, 0))
            model_fit = model.fit()
            forecast = model_fit.forecast(steps=5)
            conf_int = model_fit.get_forecast(steps=5).conf_int()
            
            last_time = data.index[-1]
            prediction_times = []
            for i in range(1, 6):
                next_time = last_time + timedelta(hours=i)
                prediction_times.append(next_time.strftime('%Y-%m-%d %H:%M'))
            
            last_close = prices[-1]
            ai_predictions = []
            for i, pred in enumerate(forecast):
                high_est = max(pred, last_close) * 1.005
                low_est = min(pred, last_close) * 0.995
                ai_predictions.append({
                    'time': prediction_times[i],
                    'hour': i + 1,
                    'open': round(last_close if i == 0 else forecast[i-1], 2),
                    'close': round(pred, 2),
                    'high': round(high_est, 2),
                    'low': round(low_est, 2),
                    'upper_bound': round(conf_int.iloc[i, 1], 2),
                    'lower_bound': round(conf_int.iloc[i, 0], 2)
                })
                last_close = pred
            
            return jsonify({
                'symbol': symbol.upper(),
                'last_price': round(prices[-1], 2),
                'last_time': data.index[-1].strftime('%Y-%m-%d %H:%M'),
                'predictions': ai_predictions
            })
        except Exception as e:
            print(f"ARIMA小时预测错误: {e}")
            return jsonify({'error': f'预测模型错误: {str(e)}'}), 500
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/user-predict/<symbol>', methods=['POST'])
def save_user_prediction(symbol):
    """保存用户预测"""
    try:
        data = request.json
        predictions = data.get('predictions', [])
        
        if len(predictions) != 5:
            return jsonify({'error': '需要5个小时的预测数据'}), 400
        
        stock = yf.Ticker(symbol)
        current_data = stock.history(period='1d', interval='1h')
        
        if current_data.empty:
            return jsonify({'error': '无法获取当前价格'}), 404
        
        last_time = current_data.index[-1]
        last_price = current_data['Close'].iloc[-1]
        
        user_pred_data = {
            'symbol': symbol.upper(),
            'created_at': datetime.now().isoformat(),
            'base_price': round(last_price, 2),
            'base_time': last_time.strftime('%Y-%m-%d %H:%M'),
            'predictions': []
        }
        
        for i, pred in enumerate(predictions):
            next_time = last_time + timedelta(hours=i+1)
            user_pred_data['predictions'].append({
                'time': next_time.strftime('%Y-%m-%d %H:%M'),
                'hour': i + 1,
                'open': float(pred.get('open', 0)),
                'high': float(pred.get('high', 0)),
                'low': float(pred.get('low', 0)),
                'close': float(pred.get('close', 0))
            })
        
        key = f"{symbol.upper()}_{datetime.now().strftime('%Y%m%d%H')}"
        user_predictions[key] = user_pred_data
        
        return jsonify({
            'success': True,
            'prediction_id': key,
            'data': user_pred_data
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/user-predict/<symbol>', methods=['GET'])
def get_user_prediction(symbol):
    """获取用户预测"""
    try:
        symbol = symbol.upper()
        user_preds = [v for k, v in user_predictions.items() if k.startswith(symbol)]
        
        if not user_preds:
            return jsonify({'predictions': []})
        
        latest = sorted(user_preds, key=lambda x: x['created_at'], reverse=True)[0]
        return jsonify(latest)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/compare-predictions/<symbol>', methods=['GET'])
def compare_predictions(symbol):
    """对比用户预测、AI预测和实际走势"""
    try:
        symbol = symbol.upper()
        
        user_preds = [v for k, v in user_predictions.items() if k.startswith(symbol)]
        user_pred = sorted(user_preds, key=lambda x: x['created_at'], reverse=True)[0] if user_preds else None
        
        stock = yf.Ticker(symbol)
        hourly_data = stock.history(period='5d', interval='1h')
        
        if hourly_data.empty:
            return jsonify({'error': '无法获取数据'}), 404
        
        actual_data = []
        for dt, row in hourly_data.iterrows():
            actual_data.append({
                'time': dt.strftime('%Y-%m-%d %H:%M'),
                'open': round(row['Open'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2),
                'close': round(row['Close'], 2)
            })
        
        prices = hourly_data['Close'].values
        ai_predictions = []
        try:
            if len(prices) >= 30:
                model = ARIMA(prices[:-5] if len(prices) > 5 else prices, order=(3, 1, 0))
                model_fit = model.fit()
                forecast = model_fit.forecast(steps=5)
                
                start_idx = max(0, len(hourly_data) - 5)
                for i, pred in enumerate(forecast):
                    if start_idx + i < len(hourly_data):
                        ai_predictions.append({
                            'time': hourly_data.index[start_idx + i].strftime('%Y-%m-%d %H:%M'),
                            'close': round(pred, 2)
                        })
        except:
            pass
        
        comparison = {
            'symbol': symbol,
            'actual': actual_data[-24:],
            'ai_prediction': ai_predictions,
            'user_prediction': user_pred['predictions'] if user_pred else [],
            'user_base_time': user_pred['base_time'] if user_pred else None,
            'user_base_price': user_pred['base_price'] if user_pred else None
        }
        
        if user_pred and ai_predictions:
            user_errors = []
            ai_errors = []
            
            for up in user_pred['predictions']:
                for actual in actual_data:
                    if actual['time'] == up['time']:
                        user_errors.append(abs(up['close'] - actual['close']))
                        break
            
            for ap in ai_predictions:
                for actual in actual_data:
                    if actual['time'] == ap['time']:
                        ai_errors.append(abs(ap['close'] - actual['close']))
                        break
            
            if user_errors:
                comparison['user_mae'] = round(sum(user_errors) / len(user_errors), 2)
            if ai_errors:
                comparison['ai_mae'] = round(sum(ai_errors) / len(ai_errors), 2)
        
        return jsonify(comparison)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
