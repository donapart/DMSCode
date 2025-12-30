#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# DMSCode Backend Deployment für Hetzner
# ═══════════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

# ═══════════════════════════════════════════════════════════════════════════════
# KONFIGURATION - Bitte anpassen!
# ═══════════════════════════════════════════════════════════════════════════════
HETZNER_IP="${HETZNER_IP:-49.13.150.177}"
HETZNER_USER="${HETZNER_USER:-root}"
SSH_KEY="${SSH_KEY:-~/.ssh/id_rsa}"
DEPLOY_DIR="/opt/dmscode"

# Hetzner deployment uses a dedicated compose file + optional env file.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.hetzner.yml}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-.env.hetzner}"

# ═══════════════════════════════════════════════════════════════════════════════
# Farben für Output
# ═══════════════════════════════════════════════════════════════════════════════
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ═══════════════════════════════════════════════════════════════════════════════
# Voraussetzungen prüfen
# ═══════════════════════════════════════════════════════════════════════════════
check_prerequisites() {
    log_info "Prüfe Voraussetzungen..."
    
    if ! command -v ssh &> /dev/null; then
        log_error "SSH nicht gefunden. Bitte installieren."
        exit 1
    fi
    
    if ! command -v scp &> /dev/null; then
        log_error "SCP nicht gefunden. Bitte installieren."
        exit 1
    fi
    
    if [ ! -f "$SSH_KEY" ]; then
        log_error "SSH Key nicht gefunden: $SSH_KEY"
        log_info "Setze SSH_KEY Umgebungsvariable oder verwende ssh-keygen"
        exit 1
    fi
    
    log_info "✓ Voraussetzungen erfüllt"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Server vorbereiten
# ═══════════════════════════════════════════════════════════════════════════════
prepare_server() {
    log_info "Bereite Server vor..."
    
    ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" << 'ENDSSH'
        set -e
        
        # Docker installieren falls nicht vorhanden
        if ! command -v docker &> /dev/null; then
            echo "Installiere Docker..."
            curl -fsSL https://get.docker.com | sh
            systemctl enable docker
            systemctl start docker
        fi
        
        # Docker Compose installieren falls nicht vorhanden
        if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
            echo "Installiere Docker Compose..."
            apt-get update
            apt-get install -y docker-compose-plugin
        fi
        
        # Verzeichnisse erstellen
        mkdir -p /opt/dmscode/backend
        mkdir -p /opt/dmscode/docker
        
        echo "✓ Server bereit"
ENDSSH
    
    log_info "✓ Server vorbereitet"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Dateien übertragen
# ═══════════════════════════════════════════════════════════════════════════════
upload_files() {
    log_info "Übertrage Dateien..."

    if [ ! -f "$COMPOSE_FILE" ]; then
        log_error "Compose Datei nicht gefunden: $COMPOSE_FILE"
        exit 1
    fi

    # Hetzner compose
    scp -i "$SSH_KEY" "$COMPOSE_FILE" "$HETZNER_USER@$HETZNER_IP:$DEPLOY_DIR/"

    # nginx template
    if [ ! -f "docker/nginx.hetzner.conf.template" ]; then
        log_error "Nginx template nicht gefunden: docker/nginx.hetzner.conf.template"
        exit 1
    fi
    scp -i "$SSH_KEY" docker/nginx.hetzner.conf.template "$HETZNER_USER@$HETZNER_IP:$DEPLOY_DIR/docker/"

    # Backend Services (FastAPI apps)
    scp -i "$SSH_KEY" -r backend/* "$HETZNER_USER@$HETZNER_IP:$DEPLOY_DIR/backend/"

    # Optional env file
    if [ -f "$LOCAL_ENV_FILE" ]; then
        scp -i "$SSH_KEY" "$LOCAL_ENV_FILE" "$HETZNER_USER@$HETZNER_IP:$DEPLOY_DIR/.env.hetzner"
        log_info "✓ Env übertragen: $LOCAL_ENV_FILE"
    else
        log_warn "Keine $LOCAL_ENV_FILE gefunden. Auf dem Server wird eine Default-.env.hetzner angelegt (ohne API-Key)."
        ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" << ENDSSH
          set -e
          cat > "$DEPLOY_DIR/.env.hetzner" << 'ENVFILE'
DMS_SERVER_NAME=$HETZNER_IP
DMS_API_KEY=
EMBEDDING_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
DEFAULT_VOICE=de_DE-thorsten-low
ENVFILE
ENDSSH
    fi
    
    log_info "✓ Dateien übertragen"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Services starten
# ═══════════════════════════════════════════════════════════════════════════════
start_services() {
    log_info "Starte Services..."
    
    ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" << ENDSSH
        set -e
        cd $DEPLOY_DIR
        
        # Alte Container stoppen
    docker compose -f $COMPOSE_FILE --env-file .env.hetzner down || true
        
        # Neue Container starten
    docker compose -f $COMPOSE_FILE --env-file .env.hetzner up -d
        
        # Warte auf Start
        sleep 10
        
        # Status prüfen
    docker compose -f $COMPOSE_FILE --env-file .env.hetzner ps
        
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
    echo "Services gestartet (Hetzner Compose)!"
        echo "═══════════════════════════════════════════════════════════════"
ENDSSH
    
    log_info "✓ Services gestartet"
}

# ═══════════════════════════════════════════════════════════════════════════════
# LLM Modell herunterladen
# ═══════════════════════════════════════════════════════════════════════════════
download_llm() {
    log_info "Lade LLM Modell herunter (kann einige Minuten dauern)..."
    
    ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" << 'ENDSSH'
        # Warte bis Ollama bereit ist
        sleep 5
        
        # Modell herunterladen
        docker exec dmscode-ollama ollama pull llama3.2
        
        echo "✓ LLM Modell geladen"
ENDSSH
    
    log_info "✓ LLM Modell bereit"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Health Check
# ═══════════════════════════════════════════════════════════════════════════════
health_check() {
    log_info "Führe Health Check durch..."
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  Service Health Check"
    echo "═══════════════════════════════════════════════════════════════════════"
    
    # Determine base URL + optional API key from local env file (if present)
    BASE_HOST="$HETZNER_IP"
    API_KEY=""
    if [ -f "$LOCAL_ENV_FILE" ]; then
        BASE_HOST="$(grep -E '^DMS_SERVER_NAME=' "$LOCAL_ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '\r' | tr -d '"')"
        API_KEY="$(grep -E '^DMS_API_KEY=' "$LOCAL_ENV_FILE" | head -n 1 | cut -d '=' -f2- | tr -d '\r' | tr -d '"')"
    fi

    BASE_URL="http://$BASE_HOST"
    CURL_HEADERS=()
    if [ -n "$API_KEY" ]; then
        CURL_HEADERS+=( -H "X-API-KEY: $API_KEY" )
    fi

    # Proxy Health
    if curl -s -o /dev/null -w "%{http_code}" "${CURL_HEADERS[@]}" "$BASE_URL/health" | grep -q "200"; then
        echo "  ✅ Proxy Health    : $BASE_URL/health"
    else
        echo "  ❌ Proxy Health    : NICHT ERREICHBAR"
    fi

    # OCR Service
    if curl -s -o /dev/null -w "%{http_code}" "${CURL_HEADERS[@]}" "$BASE_URL/ocr/health" | grep -q "200"; then
        echo "  ✅ OCR Service     : $BASE_URL/ocr/health"
    else
        echo "  ❌ OCR Service     : NICHT ERREICHBAR"
    fi

    # Search Service
    if curl -s -o /dev/null -w "%{http_code}" "${CURL_HEADERS[@]}" "$BASE_URL/search/health" | grep -q "200"; then
        echo "  ✅ Search Service  : $BASE_URL/search/health"
    else
        echo "  ❌ Search Service  : NICHT ERREICHBAR"
    fi

    # TTS Service
    if curl -s -o /dev/null -w "%{http_code}" "${CURL_HEADERS[@]}" "$BASE_URL/tts/health" | grep -q "200"; then
        echo "  ✅ TTS Service     : $BASE_URL/tts/health"
    else
        echo "  ❌ TTS Service     : NICHT ERREICHBAR"
    fi

    # Ollama LLM
    if curl -s -o /dev/null -w "%{http_code}" "${CURL_HEADERS[@]}" "$BASE_URL/api/tags" | grep -q "200"; then
        echo "  ✅ Ollama LLM      : $BASE_URL/api/tags"
    else
        echo "  ❌ Ollama LLM      : NICHT ERREICHBAR"
    fi
    
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
}

# ═══════════════════════════════════════════════════════════════════════════════
# Nginx Reverse Proxy (legacy, deprecated)
# ═══════════════════════════════════════════════════════════════════════════════
setup_nginx() {
    log_warn "Host-Nginx Setup ist deprecated. Das Hetzner Deployment nutzt jetzt nginx als Docker-Container."
    log_info "Wenn du unbedingt Host-Nginx willst, nutze docker/nginx*.conf als Vorlage."
    return 0
    
    ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" << 'ENDSSH'
        set -e
        
        # Nginx installieren
        apt-get update
        apt-get install -y nginx
        
        # Konfiguration erstellen
        cat > /etc/nginx/sites-available/dmscode << 'NGINX'
server {
    listen 80;
    server_name _;
    
    # OCR
    location /ocr {
        proxy_pass http://127.0.0.1:8510;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Search
    location /search {
        proxy_pass http://127.0.0.1:8520;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # TTS
    location /tts {
        proxy_pass http://127.0.0.1:8505;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Ollama (LLM)
    location / {
        proxy_pass http://127.0.0.1:11434;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
NGINX
        
        # Aktivieren
        ln -sf /etc/nginx/sites-available/dmscode /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default
        
        # Testen und neustarten
        nginx -t
        systemctl restart nginx
        systemctl enable nginx
        
        echo "✓ Nginx konfiguriert"
ENDSSH
    
    log_info "✓ Nginx Reverse Proxy eingerichtet"
}

# ═══════════════════════════════════════════════════════════════════════════════
# Hauptprogramm
# ═══════════════════════════════════════════════════════════════════════════════
main() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════════════"
    echo "  DMSCode Backend Deployment für Hetzner"
    echo "  Server: $HETZNER_IP"
    echo "═══════════════════════════════════════════════════════════════════════"
    echo ""
    
    case "${1:-deploy}" in
        deploy)
            check_prerequisites
            prepare_server
            upload_files
            start_services
            download_llm
            health_check
            ;;
        upload)
            check_prerequisites
            upload_files
            ;;
        start)
            start_services
            ;;
        stop)
            ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" "cd $DEPLOY_DIR && docker compose down"
            ;;
        restart)
            ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" "cd $DEPLOY_DIR && docker compose restart"
            ;;
        logs)
            ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" "cd $DEPLOY_DIR && docker compose logs -f ${2:-}"
            ;;
        status)
            ssh -i "$SSH_KEY" "$HETZNER_USER@$HETZNER_IP" "cd $DEPLOY_DIR && docker compose ps"
            health_check
            ;;
        nginx)
            setup_nginx
            ;;
        llm)
            download_llm
            ;;
        *)
            echo "Usage: $0 {deploy|upload|start|stop|restart|logs|status|nginx|llm}"
            echo ""
            echo "Commands:"
            echo "  deploy  - Vollständiges Deployment (Standard)"
            echo "  upload  - Nur Dateien übertragen"
            echo "  start   - Services starten"
            echo "  stop    - Services stoppen"
            echo "  restart - Services neustarten"
            echo "  logs    - Logs anzeigen (optional: Service-Name)"
            echo "  status  - Status und Health Check"
            echo "  nginx   - Nginx Reverse Proxy einrichten"
            echo "  llm     - LLM Modell herunterladen"
            exit 1
            ;;
    esac
    
    echo ""
    log_info "Fertig! 🚀"
}

main "$@"
