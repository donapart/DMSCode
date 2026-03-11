# IONOS DNS Record Creator für dms.frey.plus
# Benötigt: IONOS API Key in Umgebungsvariable IONOS_API_KEY

param(
    [string]$Domain = "frey.plus",
    [string]$Subdomain = "dms",
    [string]$IP = "49.13.150.177",
    [int]$TTL = 3600
)

$ApiKey = $env:IONOS_API_KEY

if (-not $ApiKey) {
    Write-Host "❌ Fehler: IONOS_API_KEY Umgebungsvariable nicht gesetzt" -ForegroundColor Red
    Write-Host ""
    Write-Host "Bitte setzen Sie den API Key:" -ForegroundColor Yellow
    Write-Host '  $env:IONOS_API_KEY = "Ihr-API-Key"' -ForegroundColor Cyan
    Write-Host ""
    Write-Host "IONOS API Key finden:" -ForegroundColor Yellow
    Write-Host "  1. https://my.ionos.com" -ForegroundColor Cyan
    Write-Host "  2. Account → API → API Keys" -ForegroundColor Cyan
    exit 1
}

Write-Host "🌐 Erstelle DNS A-Record..." -ForegroundColor Green
Write-Host "   Domain: $Subdomain.$Domain" -ForegroundColor Gray
Write-Host "   IP: $IP" -ForegroundColor Gray
Write-Host "   TTL: $TTL" -ForegroundColor Gray
Write-Host ""

$headers = @{
    "X-API-Key" = $ApiKey
    "Content-Type" = "application/json"
}

$body = @{
    name = $Subdomain
    type = "A"
    content = $IP
    ttl = $TTL
    priority = 0
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.hosting.ionos.com/dns/v1/zones/$Domain/records" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop
    
    Write-Host "✅ DNS-Eintrag erfolgreich erstellt!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Details:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 3
    Write-Host ""
    Write-Host "⏳ Warte auf DNS-Propagation (5-10 Minuten)..." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Teste mit: nslookup $Subdomain.$Domain" -ForegroundColor Gray
    
} catch {
    Write-Host "❌ Fehler beim Erstellen des DNS-Eintrags:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "💡 Tipp: API Key ungültig. Bitte prüfen Sie:" -ForegroundColor Yellow
        Write-Host "   https://my.ionos.com → Account → API" -ForegroundColor Cyan
    }
}
