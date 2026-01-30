#!/bin/bash
# SSL Setup Script for DMSCode
# Usage: ./setup-ssl.sh your-domain.com your-email@example.com

set -e

DOMAIN=${1:-""}
EMAIL=${2:-""}

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "❌ Usage: $0 <domain> <email>"
    echo "   Example: $0 dms.example.com admin@example.com"
    exit 1
fi

echo "🔐 Setting up SSL for: $DOMAIN"
echo "📧 Using email: $EMAIL"
echo ""

cd /opt/dmscode

# Create required directories
mkdir -p certs certbot-webroot

# Stop nginx temporarily to free port 80
echo "⏸️  Stopping nginx..."
docker stop dmscode-nginx 2>/dev/null || true

# Get SSL certificate using standalone mode
echo "📜 Obtaining SSL certificate..."
certbot certonly --standalone \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --non-interactive \
    --expand

# Copy certificates to project directory
echo "📋 Copying certificates..."
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /opt/dmscode/certs/
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /opt/dmscode/certs/
chmod 644 /opt/dmscode/certs/*.pem

# Update .env.hetzner with domain
echo "📝 Updating configuration..."
sed -i "s/DMS_SERVER_NAME=.*/DMS_SERVER_NAME=$DOMAIN/" /opt/dmscode/.env.hetzner

# Switch to SSL nginx config
echo "🔄 Switching to SSL configuration..."
cp /opt/dmscode/docker/nginx.ssl.conf.template /opt/dmscode/docker/nginx.hetzner.conf.template

# Start nginx with new config
echo "▶️  Starting nginx with SSL..."
docker compose -f docker-compose.hetzner.yml --env-file .env.hetzner up -d --force-recreate nginx

# Setup auto-renewal cron
echo "⏰ Setting up auto-renewal..."
cat > /etc/cron.d/certbot-dmscode << 'EOF'
# Renew certificates at 3 AM every day
0 3 * * * root certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/*/fullchain.pem /opt/dmscode/certs/ && cp /etc/letsencrypt/live/*/privkey.pem /opt/dmscode/certs/ && docker restart dmscode-nginx"
EOF

echo ""
echo "✅ SSL Setup Complete!"
echo ""
echo "🌐 Your site is now available at: https://$DOMAIN"
echo ""
echo "📋 Certificate Info:"
certbot certificates -d "$DOMAIN" 2>/dev/null || true
echo ""
echo "🔒 Firewall Status:"
ufw status | grep -E "80|443"
