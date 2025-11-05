# Script para rodar os servidores em desenvolvimento

$backendPath = Join-Path $PSScriptRoot "backend"

Write-Host "🚀 Iniciando NEXUS Development Servers" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Configurar variáveis de ambiente
$env:CASS_HOSTS = "localhost:9042"
$env:NATS_URL = "nats://localhost:4222"
$env:WS_ADDR = "0.0.0.0:8080"
$env:API_ADDR = "0.0.0.0:8000"
$env:MEDIA_ADDR = "0.0.0.0:7880"
$env:JWT_SECRET = "dev-secret-key-change-in-production"
$env:LOG_LEVEL = "debug"

Write-Host "📝 Environment Variables:" -ForegroundColor Cyan
Write-Host "  CASS_HOSTS: $env:CASS_HOSTS"
Write-Host "  NATS_URL: $env:NATS_URL"
Write-Host "  API_ADDR: $env:API_ADDR"
Write-Host "  WS_ADDR: $env:WS_ADDR"
Write-Host "  MEDIA_ADDR: $env:MEDIA_ADDR"
Write-Host ""

Write-Host "⚠️  Note: Docker containers need to be running for full functionality" -ForegroundColor Yellow
Write-Host "   Run: docker-compose up -d" -ForegroundColor Yellow
Write-Host ""

$processes = @()

# Helper function to start server
function Start-Server {
    param(
        [string]$Name,
        [string]$Executable,
        [string]$Port
    )
    
    Write-Host "🔨 Starting $Name on port $Port..." -ForegroundColor Green
    
    $process = Start-Process -FilePath (Join-Path $backendPath $Executable) `
        -NoNewWindow `
        -PassThru `
        -WorkingDirectory $backendPath
    
    $processes += $process
    Write-Host "   ✅ $Name started (PID: $($process.Id))" -ForegroundColor Green
    
    Start-Sleep -Seconds 1
}

# Start all servers
Start-Server "REST API" "api.exe" "8000"
Start-Server "WebSocket Server" "ws.exe" "8080"
Start-Server "Media Server" "media.exe" "7880"

Write-Host ""
Write-Host "✨ All servers started!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Services running at:" -ForegroundColor Cyan
Write-Host "   API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "   WebSocket: ws://localhost:8080" -ForegroundColor Cyan
Write-Host "   Media: udp://localhost:7880" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Processes:" -ForegroundColor Cyan
foreach ($proc in $processes) {
    Write-Host "   - $($proc.ProcessName) (PID: $($proc.Id))" -ForegroundColor Cyan
}
Write-Host ""
Write-Host "💡 Press Ctrl+C to stop all servers" -ForegroundColor Yellow
Write-Host ""

# Wait for Ctrl+C
try {
    while ($true) {
        Start-Sleep -Seconds 1
        
        # Check if any process has exited
        $processes = $processes | Where-Object { !$_.HasExited }
        
        if ($processes.Count -eq 0) {
            Write-Host "❌ All servers have exited" -ForegroundColor Red
            break
        }
    }
}
finally {
    Write-Host ""
    Write-Host "🛑 Stopping all servers..." -ForegroundColor Yellow
    
    foreach ($proc in $processes) {
        if (-not $proc.HasExited) {
            $proc.Kill()
            $proc.WaitForExit(5000)
            Write-Host "   ✅ $($proc.ProcessName) stopped" -ForegroundColor Green
        }
    }
    
    Write-Host ""
    Write-Host "👋 Goodbye!" -ForegroundColor Cyan
}
