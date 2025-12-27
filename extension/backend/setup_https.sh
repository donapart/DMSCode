#!/bin/bash

# Konfiguration
DOMAIN="api.dmscode.frey.plus"
EMAIL="admin@dmscode.frey.plus"

echo "=== DMSCode HTTPS Setup ==="
echo "Domain: $DOMAIN"

# 1. Certbot installieren
if ! command -v certbot &> /dev/null; then
    echo "Installiere Certbot..."
    apt-get update
    apt-get install -y certbot
fi

# 2. Nginx stoppen (für Standalone-Modus)
echo "Stoppe Nginx Proxy..."
docker stop dmscode-proxy || true

# 3. Zertifikat anfordern
echo "Fordere Zertifikat an..."
certbot certonly --standalone \
    -d $DOMAIN \
    --non-interactive \
    --agree-tos \
    -m $EMAIL

# 4. Prüfen ob erfolgreich
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "✅ Zertifikat erfolgreich erstellt!"
    
    # 5. Nginx Konfiguration anpassen
    echo "Aktiviere HTTPS..."
    
    # Backup der originalen Configs
    cp /root/dms/nginx.conf /root/dms/nginx.conf.bak
    cp /root/dms/docker-compose.yml /root/dms/docker-compose.yml.bak
    
    # HTTPS Config aktivieren
    if [ -f "/root/dms/nginx.https.conf" ]; then
        cp /root/dms/nginx.https.conf /root/dms/nginx.conf
        echo "nginx.https.conf aktiviert."
    else
        echo "⚠️ nginx.https.conf nicht gefunden! Überspringe Config-Update."
    fi
    
    # docker-compose.yml anpassen (Ports und Volumes)
    # Uncomment 443 port
    sed -i 's/# - "443:443"/- "443:443"/g' /root/dms/docker-compose.yml
    
    # Uncomment and update SSL volume
    # Wir suchen nach der Zeile mit dem SSL Volume und ersetzen sie komplett
    sed -i 's|# - ./ssl:/etc/nginx/ssl:ro|- /etc/letsencrypt/live/'$DOMAIN':/etc/nginx/ssl:ro|g' /root/dms/docker-compose.yml
    
    echo "Konfiguration aktualisiert."
    
else
    echo "❌ Zertifikat konnte nicht erstellt werden. Vermutlich ist DNS noch nicht propagiert."
    echo "Bitte warten Sie, bis 'nslookup $DOMAIN' auf die Server-IP zeigt."
fi

# 6. Nginx neu starten
echo "Starte Services neu..."
cd /root/dms
docker compose up -d --remove-orphans --force-recreate

echo "Setup abgeschlossen."
