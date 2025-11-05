#!/bin/bash

# Nexus Development Setup Script
# This script sets up the entire development environment

set -e

echo "🚀 Nexus Development Setup"
echo "=========================="

# Check prerequisites
echo ""
echo "📋 Checking prerequisites..."

if ! command -v go &> /dev/null; then
    echo "❌ Go is not installed"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    exit 1
fi

echo "✅ All prerequisites installed"

# Setup Backend
echo ""
echo "🔧 Setting up Backend..."
cd backend
cp -n .env.example .env || echo "⚠️  .env already exists"
go mod download
go mod tidy
echo "✅ Backend setup complete"

# Setup Frontend
echo ""
echo "📱 Setting up Frontend..."
cd ../frontend
if [ ! -d "node_modules" ]; then
    pnpm install
else
    echo "⚠️  Dependencies already installed"
fi
echo "✅ Frontend setup complete"

# Setup Infrastructure
echo ""
echo "🐳 Starting Docker containers..."
cd ..
docker-compose up -d
echo "✅ Docker containers started"

# Wait for services
echo ""
echo "⏳ Waiting for services to be ready..."
sleep 30

# Initialize Cassandra
echo "🗄️  Initializing Cassandra..."
docker exec nexus-cassandra cqlsh -f /docker-entrypoint-initdb.d/init.cql 2>/dev/null || echo "⚠️  Cassandra initialization skipped"

echo ""
echo "✅ Nexus development environment is ready!"
echo ""
echo "📚 Next steps:"
echo "   1. Backend: cd backend && ./bin/nexus-api"
echo "   2. WebSocket: cd backend && ./bin/nexus-ws"
echo "   3. Frontend: cd frontend && pnpm start"
echo ""
echo "🌐 Services:"
echo "   API: http://localhost:8000"
echo "   WebSocket: ws://localhost:8080"
echo "   Cassandra: localhost:9042"
echo "   NATS: localhost:4222"
echo "   Redis: localhost:6379"
echo "   PostgreSQL: localhost:5432"
echo ""
