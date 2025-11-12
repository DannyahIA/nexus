# Nexus Makefile

.PHONY: help setup build run clean docker logs stop restart build-docker up down

help:
	@echo "Nexus Makefile Commands"
	@echo "======================="
	@echo "setup          - Setup development environment"
	@echo "build          - Build backend services locally"
	@echo "build-docker   - Build Docker images for all services"
	@echo "up             - Start all services with Docker (build + run)"
	@echo "run            - Run services locally (without Docker)"
	@echo "docker         - Start Docker infrastructure only"
	@echo "down           - Stop all Docker containers"
	@echo "stop           - Stop all Docker containers (alias)"
	@echo "restart        - Restart all Docker containers"
	@echo "logs           - Show container logs"
	@echo "clean          - Clean build artifacts and stop containers"
	@echo "test           - Run tests"

setup:
	@echo "Setting up Nexus..."
	@chmod +x setup.sh
	@./setup.sh

build:
	@echo "Building backend services locally..."
	cd backend && \
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-api ./cmd/api && \
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-ws ./cmd/ws && \
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-media ./cmd/media
	@echo "✅ Build complete"

build-docker:
	@echo "Building Docker images..."
	docker-compose build
	@echo "✅ Docker images built"

up:
	@echo "Starting all services with Docker..."
	docker-compose up -d --build
	@echo "✅ All services started"
	@echo ""
	@echo "Services available at:"
	@echo "  - API:       http://localhost:8000"
	@echo "  - WebSocket: http://localhost:8080"
	@echo "  - Cassandra: localhost:9042"
	@echo "  - NATS:      localhost:4222"
	@echo "  - Redis:     localhost:6379"

down:
	@echo "Stopping all Docker containers..."
	docker-compose down
	@echo "✅ Containers stopped"

stop: down

restart:
	@echo "Restarting all Docker containers..."
	docker-compose restart
	@echo "✅ Containers restarted"

run: docker
	@echo "Starting services locally..."
	@(cd backend && ./bin/nexus-api) & \
	(cd backend && ./bin/nexus-ws) & \
	(cd backend && ./bin/nexus-media) & \
	wait

docker:
	@echo "Starting Docker infrastructure only (Cassandra, NATS, Redis, etc)..."
	docker-compose up -d cassandra nats redis coturn postgres
	@sleep 5
	@echo "✅ Infrastructure started"

logs:
	docker-compose logs -f

clean:
	@echo "Cleaning build artifacts..."
	rm -rf backend/bin/*
	docker-compose down -v
	@echo "✅ Clean complete"

test:
	@echo "Running tests..."
	cd backend && go test ./...
	cd ../frontend && pnpm test

lint:
	@echo "Linting code..."
	cd backend && go fmt ./...
	cd ../frontend && pnpm lint

deps:
	@echo "Updating dependencies..."
	cd backend && go get -u ./... && go mod tidy
	cd ../frontend && pnpm update

install-protoc:
	@echo "Installing protobuf compiler..."
	brew install protobuf
	go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
	go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

.DEFAULT_GOAL := help
