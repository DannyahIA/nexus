# Nexus Development Setup Script for Windows
# This script sets up the entire development environment

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "🚀 Nexus Development Setup (Windows)" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Colors for output
$SuccessColor = "Green"
$ErrorColor = "Red"
$WarningColor = "Yellow"
$InfoColor = "Cyan"

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor $InfoColor

$prerequisites = @(
    @{
        Name = "Go"
        Command = "go"
        TestArgs = "version"
        MinVersion = "1.22"
    },
    @{
        Name = "Node.js"
        Command = "node"
        TestArgs = "--version"
        MinVersion = "18"
    },
    @{
        Name = "npm"
        Command = "npm"
        TestArgs = "--version"
        MinVersion = "7"
    },
    @{
        Name = "Docker"
        Command = "docker"
        TestArgs = "--version"
        MinVersion = ""
    },
    @{
        Name = "Docker Compose"
        Command = "docker-compose"
        TestArgs = "--version"
        MinVersion = ""
    }
)

$allFound = $true

foreach ($prereq in $prerequisites) {
    try {
        $result = & $prereq.Command $prereq.TestArgs 2>&1
        Write-Host "✅ $($prereq.Name) is installed" -ForegroundColor $SuccessColor
    }
    catch {
        Write-Host "❌ $($prereq.Name) is not installed" -ForegroundColor $ErrorColor
        $allFound = $false
    }
}

if (-not $allFound) {
    Write-Host ""
    Write-Host "⚠️  Some prerequisites are missing. Please install them first:" -ForegroundColor $WarningColor
    Write-Host "   - Go 1.22+ (https://golang.org/dl/)" -ForegroundColor $WarningColor
    Write-Host "   - Node.js 18+ (https://nodejs.org/)" -ForegroundColor $WarningColor
    Write-Host "   - Docker Desktop (https://www.docker.com/products/docker-desktop)" -ForegroundColor $WarningColor
    exit 1
}

Write-Host "✅ All prerequisites are installed" -ForegroundColor $SuccessColor

# Setup Backend
Write-Host ""
Write-Host "🔧 Setting up Backend..." -ForegroundColor $InfoColor

$backendPath = Join-Path $PSScriptRoot "backend"

if (Test-Path "$backendPath\.env") {
    Write-Host "⚠️  .env already exists, skipping" -ForegroundColor $WarningColor
}
else {
    Copy-Item "$backendPath\.env.example" "$backendPath\.env" -Force
    Write-Host "✅ Created .env file" -ForegroundColor $SuccessColor
}

Set-Location $backendPath

Write-Host "📥 Downloading Go modules..." -ForegroundColor $InfoColor
& go mod download
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to download Go modules" -ForegroundColor $ErrorColor
    exit 1
}

& go mod tidy
Write-Host "✅ Backend setup complete" -ForegroundColor $SuccessColor

# Setup Frontend
Write-Host ""
Write-Host "📱 Setting up Frontend..." -ForegroundColor $InfoColor

$frontendPath = Join-Path $PSScriptRoot "frontend"
Set-Location $frontendPath

if (Test-Path "node_modules") {
    Write-Host "⚠️  Dependencies already installed" -ForegroundColor $WarningColor
}
else {
    Write-Host "📥 Installing npm dependencies (this may take a few minutes)..." -ForegroundColor $InfoColor
    
    # Check if pnpm is installed
    $pnpmAvailable = $false
    try {
        & pnpm --version > $null 2>&1
        $pnpmAvailable = $true
    }
    catch {
        $pnpmAvailable = $false
    }
    
    if ($pnpmAvailable) {
        & pnpm install
    }
    else {
        Write-Host "ℹ️  pnpm not found, using npm instead" -ForegroundColor $InfoColor
        & npm install
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install dependencies" -ForegroundColor $ErrorColor
        exit 1
    }
}

Write-Host "✅ Frontend setup complete" -ForegroundColor $SuccessColor

# Setup Infrastructure
Write-Host ""
Write-Host "🐳 Starting Docker containers..." -ForegroundColor $InfoColor

Set-Location $PSScriptRoot

try {
    & docker-compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to start Docker containers" -ForegroundColor $ErrorColor
        exit 1
    }
    
    Write-Host "✅ Docker containers started" -ForegroundColor $SuccessColor
}
catch {
    Write-Host "❌ Docker command failed" -ForegroundColor $ErrorColor
    exit 1
}

# Wait for services
Write-Host ""
Write-Host "⏳ Waiting for services to be ready (30 seconds)..." -ForegroundColor $InfoColor
Start-Sleep -Seconds 30

# Initialize Cassandra
Write-Host "🗄️  Initializing Cassandra schema..." -ForegroundColor $InfoColor

try {
    $cassandraInit = Get-Content "infrastructure/cassandra/init.cql" -Raw
    # Note: Full CQL execution would require cqlsh, which may not be available on Windows
    # For now, we'll just show a message
    Write-Host "ℹ️  Cassandra will auto-initialize on first run" -ForegroundColor $InfoColor
}
catch {
    Write-Host "⚠️  Could not initialize Cassandra schema (this is okay, it will auto-initialize)" -ForegroundColor $WarningColor
}

# Final summary
Write-Host ""
Write-Host "✅ Nexus development environment is ready!" -ForegroundColor $SuccessColor
Write-Host ""
Write-Host "📚 Next steps:" -ForegroundColor $InfoColor
Write-Host "   1. Start Backend:" -ForegroundColor $InfoColor
Write-Host "      cd backend" -ForegroundColor $InfoColor
Write-Host "      go run ./cmd/api/main.go" -ForegroundColor $InfoColor
Write-Host ""
Write-Host "   2. Start WebSocket Server (new terminal):" -ForegroundColor $InfoColor
Write-Host "      cd backend" -ForegroundColor $InfoColor
Write-Host "      go run ./cmd/ws/main.go" -ForegroundColor $InfoColor
Write-Host ""
Write-Host "   3. Start Frontend (new terminal):" -ForegroundColor $InfoColor
Write-Host "      cd frontend" -ForegroundColor $InfoColor
Write-Host "      npm start  (or 'pnpm start' if pnpm is installed)" -ForegroundColor $InfoColor
Write-Host ""
Write-Host "🌐 Services:" -ForegroundColor $InfoColor
Write-Host "   API: http://localhost:8000" -ForegroundColor $InfoColor
Write-Host "   WebSocket: ws://localhost:8080" -ForegroundColor $InfoColor
Write-Host "   Cassandra: localhost:9042" -ForegroundColor $InfoColor
Write-Host "   NATS: localhost:4222" -ForegroundColor $InfoColor
Write-Host "   Redis: localhost:6379" -ForegroundColor $InfoColor
Write-Host "   PostgreSQL: localhost:5432" -ForegroundColor $InfoColor
Write-Host ""
Write-Host "📖 Documentation:" -ForegroundColor $InfoColor
Write-Host "   • COMECE_AQUI.md (Start here!)" -ForegroundColor $InfoColor
Write-Host "   • README.md (Project overview)" -ForegroundColor $InfoColor
Write-Host "   • PROJECT_SPEC.md (Technical specification)" -ForegroundColor $InfoColor
Write-Host "   • SETUP.md (Detailed setup guide)" -ForegroundColor $InfoColor
Write-Host ""
Write-Host "✨ You're all set! Happy coding! 🚀" -ForegroundColor $SuccessColor
Write-Host ""
