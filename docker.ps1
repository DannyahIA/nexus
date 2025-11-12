# Nexus Docker Manager
# Script para gerenciar containers Docker no Windows

param(
    [Parameter(Position=0)]
    [ValidateSet('up', 'down', 'restart', 'logs', 'build', 'clean', 'status')]
    [string]$Command = 'status'
)

function Show-Help {
    Write-Host "Nexus Docker Manager" -ForegroundColor Cyan
    Write-Host "===================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Comandos disponíveis:" -ForegroundColor Yellow
    Write-Host "  up       - Inicia todos os serviços (build + run)"
    Write-Host "  down     - Para todos os containers"
    Write-Host "  restart  - Reinicia todos os containers"
    Write-Host "  logs     - Mostra logs dos containers"
    Write-Host "  build    - Reconstrói as imagens Docker"
    Write-Host "  clean    - Para containers e remove volumes"
    Write-Host "  status   - Mostra status dos containers"
    Write-Host ""
    Write-Host "Uso: .\docker.ps1 <comando>" -ForegroundColor Green
}

function Start-Services {
    Write-Host "🚀 Iniciando todos os serviços..." -ForegroundColor Green
    docker-compose up -d --build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Serviços iniciados com sucesso!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Serviços disponíveis:" -ForegroundColor Cyan
        Write-Host "  - API:       http://localhost:8000" -ForegroundColor White
        Write-Host "  - WebSocket: http://localhost:8080" -ForegroundColor White
        Write-Host "  - Cassandra: localhost:9042" -ForegroundColor White
        Write-Host "  - NATS:      localhost:4222" -ForegroundColor White
        Write-Host "  - Redis:     localhost:6379" -ForegroundColor White
    } else {
        Write-Host "❌ Erro ao iniciar serviços" -ForegroundColor Red
    }
}

function Stop-Services {
    Write-Host "🛑 Parando todos os containers..." -ForegroundColor Yellow
    docker-compose down
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Containers parados com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao parar containers" -ForegroundColor Red
    }
}

function Restart-Services {
    Write-Host "🔄 Reiniciando containers..." -ForegroundColor Yellow
    docker-compose restart
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Containers reiniciados com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao reiniciar containers" -ForegroundColor Red
    }
}

function Show-Logs {
    Write-Host "📋 Mostrando logs dos containers..." -ForegroundColor Cyan
    docker-compose logs -f
}

function Build-Images {
    Write-Host "🔨 Construindo imagens Docker..." -ForegroundColor Yellow
    docker-compose build
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Imagens construídas com sucesso!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro ao construir imagens" -ForegroundColor Red
    }
}

function Clean-All {
    Write-Host "🧹 Limpando containers e volumes..." -ForegroundColor Yellow
    docker-compose down -v
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Limpeza concluída!" -ForegroundColor Green
    } else {
        Write-Host "❌ Erro durante limpeza" -ForegroundColor Red
    }
}

function Show-Status {
    Write-Host "📊 Status dos containers:" -ForegroundColor Cyan
    Write-Host ""
    docker-compose ps
}

# Main
switch ($Command) {
    'up'      { Start-Services }
    'down'    { Stop-Services }
    'restart' { Restart-Services }
    'logs'    { Show-Logs }
    'build'   { Build-Images }
    'clean'   { Clean-All }
    'status'  { Show-Status }
    default   { Show-Help }
}
