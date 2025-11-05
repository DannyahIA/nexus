# Dockerfiles

## Backend API Dockerfile
```dockerfile
# nexus/backend/Dockerfile

FROM golang:1.22-alpine AS builder

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build API
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-s -w" \
    -o /bin/nexus-api ./cmd/api

# Runtime
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /bin/nexus-api /app/

EXPOSE 8000

CMD ["/app/nexus-api"]
```

## Frontend Dockerfile
```dockerfile
# nexus/frontend/Dockerfile

FROM node:18-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .

RUN pnpm prebuild

EXPOSE 8081

CMD ["pnpm", "start"]
```

## Production Docker Compose
```yaml
# docker-compose.prod.yml

version: '3.8'

services:
  nexus-api:
    image: nexus-api:latest
    ports:
      - "8000:8000"
    environment:
      - CASS_HOSTS=cassandra
      - NATS_URL=nats://nats:4222
    depends_on:
      - cassandra
      - nats
    restart: always

  nexus-ws:
    image: nexus-ws:latest
    ports:
      - "8080:8080"
    environment:
      - NATS_URL=nats://nats:4222
    depends_on:
      - nats
    restart: always

  nexus-media:
    image: nexus-media:latest
    ports:
      - "7880:7880/udp"
    restart: always

  cassandra:
    image: cassandra:4.1
    volumes:
      - cassandra-data:/var/lib/cassandra
    environment:
      - CASSANDRA_CLUSTER_NAME=Nexus
      - CASSANDRA_DC=dc1
    restart: always

  nats:
    image: nats:2.10-alpine
    command: -js
    volumes:
      - nats-data:/data
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    restart: always

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=nexus_billing
      - POSTGRES_USER=nexus
      - POSTGRES_PASSWORD=secret
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: always

volumes:
  cassandra-data:
  nats-data:
  redis-data:
  postgres-data:
```
