#!/bin/bash
# DMSCode Backend Deployment Script für Hetzner Server
# Server: 49.13.150.177 (dano@hetzner)
#
# Verwendung:
#   ./deploy.sh              # Full deploy
#   ./deploy.sh ollama       # Nur Ollama starten
#   ./deploy.sh pull-model   # Ollama Modell herunterladen

set -e

SERVER="dano@49.13.150.177"
REMOTE_DIR="~/dms-backend"

echo "🚀 DMSCode Backend Deployment"
echo "=============================="

case "${1:-full}" in
    "upload")
        echo "📦 Uploading files to server..."
        ssh $SERVER "mkdir -p $REMOTE_DIR"
        scp -r ./* $SERVER:$REMOTE_DIR/
        echo "✅ Upload complete"
        ;;
        
    "ollama")
        echo "🦙 Starting Ollama only..."
        ssh $SERVER "cd $REMOTE_DIR && docker-compose up -d ollama"
        echo "⏳ Waiting for Ollama to start..."
        sleep 10
        ssh $SERVER "docker logs dms-ollama --tail 20"
        ;;
        
    "pull-model")
        echo "📥 Pulling Ollama models..."
        ssh $SERVER "docker exec dms-ollama ollama pull llama3.2"
        ssh $SERVER "docker exec dms-ollama ollama pull nomic-embed-text"
        echo "✅ Models downloaded"
        ;;
        
    "full")
        echo "📦 Uploading files..."
        ssh $SERVER "mkdir -p $REMOTE_DIR"
        scp -r ./* $SERVER:$REMOTE_DIR/
        
        echo "🔨 Building and starting services..."
        ssh $SERVER "cd $REMOTE_DIR && docker-compose build"
        ssh $SERVER "cd $REMOTE_DIR && docker-compose up -d"
        
        echo "⏳ Waiting for services..."
        sleep 15
        
        echo "📥 Pulling Ollama model..."
        ssh $SERVER "docker exec dms-ollama ollama pull llama3.2" || true
        
        echo "📊 Service Status:"
        ssh $SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
        
        echo ""
        echo "✅ Deployment complete!"
        echo ""
        echo "Endpoints:"
        echo "  Ollama:  http://49.13.150.177:11434"
        echo "  OCR:     http://49.13.150.177:8510"
        echo "  Search:  http://49.13.150.177:8520"
        echo "  TTS:     http://49.13.150.177:8505"
        ;;
        
    "status")
        echo "📊 Service Status:"
        ssh $SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
        ;;
        
    "logs")
        SERVICE="${2:-ollama}"
        echo "📜 Logs for dms-$SERVICE:"
        ssh $SERVER "docker logs dms-$SERVICE --tail 50 -f"
        ;;
        
    "stop")
        echo "🛑 Stopping all services..."
        ssh $SERVER "cd $REMOTE_DIR && docker-compose down"
        echo "✅ Services stopped"
        ;;
        
    *)
        echo "Usage: $0 [upload|ollama|pull-model|full|status|logs|stop]"
        exit 1
        ;;
esac
