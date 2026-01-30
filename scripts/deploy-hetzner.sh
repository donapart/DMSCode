#!/bin/bash
# DMSCode Hetzner Deployment Script
# Run on the Hetzner server: ./scripts/deploy-hetzner.sh

set -e

echo "🚀 DMSCode Hetzner Deployment"
echo "=============================="

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Check for .env.hetzner
if [ ! -f ".env.hetzner" ]; then
    echo "⚠️  .env.hetzner not found!"
    echo "   Copy .env.hetzner.example to .env.hetzner and configure it."
    exit 1
fi

# Build and start services
echo "🔨 Building and starting services..."
docker compose -f docker-compose.hetzner.yml --env-file .env.hetzner up -d --build

# Wait for services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Health checks
echo "🏥 Running health checks..."

check_service() {
    local name=$1
    local url=$2
    if curl -sf "$url" > /dev/null 2>&1; then
        echo "  ✅ $name is healthy"
        return 0
    else
        echo "  ❌ $name is not responding"
        return 1
    fi
}

check_service "OCR Service" "http://localhost:8510/health"
check_service "Search Service" "http://localhost:8520/health"
check_service "Graph Service" "http://localhost:8530/health"
check_service "Automation Service" "http://localhost:8540/health"
check_service "Storage Service" "http://localhost:8550/health"
check_service "Web Dashboard" "http://localhost:3000"

echo ""
echo "📊 Container Status:"
docker compose -f docker-compose.hetzner.yml ps

echo ""
echo "🌐 Services available at:"
echo "   - Web Dashboard: http://\$DMS_SERVER_NAME/"
echo "   - API Health: http://\$DMS_SERVER_NAME/health"
echo "   - MinIO Console: http://localhost:9001 (local only)"

echo ""
echo "✅ Deployment complete!"
echo "   View logs: docker compose -f docker-compose.hetzner.yml logs -f"
