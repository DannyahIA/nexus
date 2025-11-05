# Nexus Makefile

.PHONY: help setup build run clean docker logs

help:
	@echo "Nexus Makefile Commands"
	@echo "======================="
	@echo "setup       - Setup development environment"
	@echo "build       - Build all services"
	@echo "run         - Run all services"
	@echo "docker      - Start Docker containers"
	@echo "logs        - Show container logs"
	@echo "clean       - Clean build artifacts"
	@echo "test        - Run tests"

setup:
	@echo "Setting up Nexus..."
	@chmod +x setup.sh
	@./setup.sh

build:
	@echo "Building backend services..."
	cd backend && \
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-api ./cmd/api && \
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-ws ./cmd/ws && \
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/nexus-media ./cmd/media
	@echo "✅ Build complete"

run: docker
	@echo "Starting services..."
	@(cd backend && ./bin/nexus-api) & \
	(cd backend && ./bin/nexus-ws) & \
	(cd backend && ./bin/nexus-media) & \
	wait

docker:
	@echo "Starting Docker containers..."
	docker-compose up -d
	@sleep 5
	@echo "✅ Containers started"

logs:
	docker-compose logs -f

clean:
	@echo "Cleaning build artifacts..."
	rm -rf backend/bin/*
	docker-compose down
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
