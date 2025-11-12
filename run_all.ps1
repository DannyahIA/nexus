# Script para iniciar todos os serviços do Nexus
# Execute: .\run_all.ps1

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Iniciando Nexus Application" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está rodando
Write-Host "[1/5] Verificando Docker..." -ForegroundColor Yellow
$dockerRunning = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker não está rodando! Inicie o Docker Desktop primeiro." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Docker está rodando" -ForegroundColor Green
Write-Host ""

# Verificar containers
Write-Host "[2/5] Verificando containers..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}" | Select-String -Pattern "nexus"
if ($containers) {
    Write-Host "✓ Containers encontrados:" -ForegroundColor Green
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | Select-String -Pattern "nexus"
} else {
    Write-Host "⚠️  Nenhum container rodando. Iniciando..." -ForegroundColor Yellow
    docker-compose up -d
    Start-Sleep -Seconds 5
}
Write-Host ""

# Compilar e iniciar Backend API
Write-Host "[3/5] Iniciando Backend API (port 8000)..." -ForegroundColor Yellow
Set-Location backend
if (!(Test-Path "api.exe")) {
    Write-Host "Compilando api.exe..." -ForegroundColor Cyan
    go build -o api.exe .\cmd\api\main.go
}
Start-Process -FilePath ".\api.exe" -NoNewWindow
Write-Host "✓ Backend API iniciado" -ForegroundColor Green
Write-Host ""

# Compilar e iniciar WebSocket Server
Write-Host "[4/5] Iniciando WebSocket Server (port 8080)..." -ForegroundColor Yellow
if (!(Test-Path "ws.exe")) {
    Write-Host "Compilando ws.exe..." -ForegroundColor Cyan
    go build -o ws.exe .\cmd\ws\main.go
}
Start-Process -FilePath ".\ws.exe" -NoNewWindow
Write-Host "✓ WebSocket Server iniciado" -ForegroundColor Green
Write-Host ""

# Iniciar Frontend Web
Write-Host "[5/5] Iniciando Frontend Web (port 3000)..." -ForegroundColor Yellow
Set-Location ..\frontend-web
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
Write-Host "✓ Frontend Web iniciando..." -ForegroundColor Green
Write-Host ""

Set-Location ..

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  ✅ Todos os serviços iniciados!" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Serviços disponíveis:" -ForegroundColor White
Write-Host "  • Frontend Web:      http://localhost:3000" -ForegroundColor Cyan
Write-Host "  • Backend API:       http://localhost:8000" -ForegroundColor Cyan
Write-Host "  • WebSocket Server:  ws://localhost:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Banco de dados:" -ForegroundColor White
Write-Host "  • Cassandra:         localhost:9042" -ForegroundColor Cyan
Write-Host "  • PostgreSQL:        localhost:5432" -ForegroundColor Cyan
Write-Host "  • Redis:             localhost:6379" -ForegroundColor Cyan
Write-Host "  • NATS:              localhost:4222" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para parar os serviços, feche as janelas ou use Ctrl+C" -ForegroundColor Yellow
Write-Host ""

# Aguardar entrada do usuário
Read-Host "Pressione Enter para sair"
