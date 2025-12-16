#!/bin/bash

echo "🚀 启动 FinRisk Pro 金融风险分析平台..."
echo ""

# 检查Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 Python3，请先安装 Python"
    exit 1
fi

# 检查Node.js
if ! command -v npm &> /dev/null; then
    echo "❌ 未找到 npm，请先安装 Node.js"
    exit 1
fi

# 安装后端依赖
echo "📦 安装后端依赖..."
cd backend
pip3 install -r requirements.txt

# 启动后端
echo "🔧 启动后端服务..."
python3 app.py &
BACKEND_PID=$!

# 等待后端启动
sleep 3

# 安装前端依赖
echo "📦 安装前端依赖..."
cd ../frontend
npm install

# 启动前端
echo "🎨 启动前端应用..."
npm start &
FRONTEND_PID=$!

echo ""
echo "✅ 应用已启动!"
echo "   后端: http://localhost:5000"
echo "   前端: http://localhost:3000"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
wait
