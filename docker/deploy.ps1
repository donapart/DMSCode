# DMSCode Backend Deployment für Windows
# Server: 49.13.150.177 (dano@hetzner)
#
# Verwendung:
#   .\deploy.ps1              # Full deploy
#   .\deploy.ps1 -Action ollama       # Nur Ollama starten
#   .\deploy.ps1 -Action pull-model   # Ollama Modell herunterladen

param(
    [ValidateSet("upload", "ollama", "pull-model", "full", "status", "logs", "stop", "test")]
    [string]$Action = "full",
    [string]$Service = "ollama"
)

$SERVER = "dano@49.13.150.177"
$REMOTE_DIR = "~/dms-backend"
$DOCKER_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "🚀 DMSCode Backend Deployment" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan

switch ($Action) {
    "upload" {
        Write-Host "📦 Uploading files to server..." -ForegroundColor Yellow
        ssh $SERVER "mkdir -p $REMOTE_DIR"
        scp -r "$DOCKER_DIR/*" "${SERVER}:${REMOTE_DIR}/"
        Write-Host "✅ Upload complete" -ForegroundColor Green
    }
    
    "ollama" {
        Write-Host "🦙 Starting Ollama only..." -ForegroundColor Yellow
        ssh $SERVER "cd $REMOTE_DIR && docker-compose up -d ollama"
        Write-Host "⏳ Waiting for Ollama to start..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        ssh $SERVER "docker logs dms-ollama --tail 20"
    }
    
    "pull-model" {
        Write-Host "📥 Pulling Ollama models..." -ForegroundColor Yellow
        ssh $SERVER "docker exec dms-ollama ollama pull llama3.2"
        ssh $SERVER "docker exec dms-ollama ollama pull nomic-embed-text"
        Write-Host "✅ Models downloaded" -ForegroundColor Green
    }
    
    "full" {
        Write-Host "📦 Uploading files..." -ForegroundColor Yellow
        ssh $SERVER "mkdir -p $REMOTE_DIR"
        scp -r "$DOCKER_DIR/*" "${SERVER}:${REMOTE_DIR}/"
        
        Write-Host "🔨 Building and starting services..." -ForegroundColor Yellow
        ssh $SERVER "cd $REMOTE_DIR && docker-compose build"
        ssh $SERVER "cd $REMOTE_DIR && docker-compose up -d"
        
        Write-Host "⏳ Waiting for services..." -ForegroundColor Yellow
        Start-Sleep -Seconds 15
        
        Write-Host "📥 Pulling Ollama model..." -ForegroundColor Yellow
        ssh $SERVER "docker exec dms-ollama ollama pull llama3.2" 2>$null
        
        Write-Host "`n📊 Service Status:" -ForegroundColor Cyan
        ssh $SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
        
        Write-Host "`n✅ Deployment complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Endpoints:" -ForegroundColor Yellow
        Write-Host "  Ollama:  http://49.13.150.177:11434"
        Write-Host "  OCR:     http://49.13.150.177:8511"
        Write-Host "  Search:  http://49.13.150.177:8520"
        Write-Host "  TTS:     http://49.13.150.177:8505"
    }
    
    "status" {
        Write-Host "📊 Service Status:" -ForegroundColor Cyan
        ssh $SERVER "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
    }
    
    "logs" {
        Write-Host "📜 Logs for dms-$Service :" -ForegroundColor Cyan
        ssh $SERVER "docker logs dms-$Service --tail 50 -f"
    }
    
    "stop" {
        Write-Host "🛑 Stopping all services..." -ForegroundColor Yellow
        ssh $SERVER "cd $REMOTE_DIR && docker-compose down"
        Write-Host "✅ Services stopped" -ForegroundColor Green
    }
    
    "test" {
        Write-Host "🧪 Testing endpoints..." -ForegroundColor Yellow
        
        # Ollama Test
        Write-Host "`nTesting Ollama..." -ForegroundColor Cyan
        try {
            $response = Invoke-RestMethod -Uri "http://49.13.150.177:11434/api/tags" -TimeoutSec 5
            Write-Host "✅ Ollama: OK (Models: $($response.models.Count))" -ForegroundColor Green
        } catch {
            Write-Host "❌ Ollama: Not reachable" -ForegroundColor Red
        }
        
        # OCR Test
        Write-Host "Testing OCR..." -ForegroundColor Cyan
        try {
            $response = Invoke-RestMethod -Uri "http://49.13.150.177:8511/health" -TimeoutSec 5
            Write-Host "✅ OCR: OK" -ForegroundColor Green
        } catch {
            Write-Host "❌ OCR: Not reachable" -ForegroundColor Red
        }
        
        # Search Test
        Write-Host "Testing Search..." -ForegroundColor Cyan
        try {
            $response = Invoke-RestMethod -Uri "http://49.13.150.177:8520/health" -TimeoutSec 5
            Write-Host "✅ Search: OK (Index: $($response.index_size) docs)" -ForegroundColor Green
        } catch {
            Write-Host "❌ Search: Not reachable" -ForegroundColor Red
        }
        
        # TTS Test
        Write-Host "Testing TTS..." -ForegroundColor Cyan
        try {
            $response = Invoke-RestMethod -Uri "http://49.13.150.177:8505/health" -TimeoutSec 5
            Write-Host "✅ TTS: OK" -ForegroundColor Green
        } catch {
            Write-Host "⚠️ TTS: Not reachable (optional)" -ForegroundColor Yellow
        }
    }
}
