#!/bin/bash

echo "=== DMSCode HTTPS Setup (IONOS Zertifikat) ==="

SSL_DIR="/root/dms/ssl"
CRT_FILE="$SSL_DIR/server.crt"
KEY_FILE="$SSL_DIR/server.key"

# 1. Prüfen ob Zertifikate vorhanden sind
if [ ! -f "$CRT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "❌ Zertifikate nicht gefunden!"
    echo "Bitte laden Sie Ihre IONOS Zertifikate hoch:"
    echo "1. Erstellen Sie den Ordner: mkdir -p $SSL_DIR"
    echo "2. Laden Sie das Zertifikat als 'server.crt' in diesen Ordner."
    echo "3. Laden Sie den privaten Schlüssel als 'server.key' in diesen Ordner."
    exit 1
fi

echo "✅ Zertifikate gefunden."

# 2. Nginx Konfiguration anpassen
echo "Aktiviere HTTPS Konfiguration..."

# Backup
cp /root/dms/nginx.conf /root/dms/nginx.conf.bak
cp /root/dms/docker-compose.yml /root/dms/docker-compose.yml.bak

# HTTPS Config aktivieren
if [ -f "/root/dms/nginx.https.conf" ]; then
    cp /root/dms/nginx.https.conf /root/dms/nginx.conf
else
    echo "❌ nginx.https.conf fehlt!"
    exit 1
fi

# 3. docker-compose.yml anpassen
# Port 443 aktivieren
sed -i 's/# - "443:443"/- "443:443"/g' /root/dms/docker-compose.yml

# SSL Volume aktivieren (lokaler Ordner ./ssl)
# Wir suchen nach dem auskommentierten Standard-Eintrag
sed -i 's|# - ./ssl:/etc/nginx/ssl:ro|- ./ssl:/etc/nginx/ssl:ro|g' /root/dms/docker-compose.yml

echo "Konfiguration aktualisiert."

# 4. Neustart
echo "Starte Services neu..."
cd /root/dms
docker compose up -d --remove-orphans --force-recreate

echo "✅ HTTPS Setup abgeschlossen!"
