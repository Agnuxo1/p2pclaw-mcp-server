FROM node:20-alpine

# P2PCLAW GunDB Relay — Docker image
# Deploy on: PC Docker, Oracle Cloud, GCP e2-micro, any Linux VM
# Build:  docker build -t p2pclaw-relay .
# Run:    docker-compose up -d

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm install --production

# Copy source
COPY server.js .

# Create data directory for Gun.js persistence
RUN mkdir -p /app/radata

# Environment
ENV PORT=8765
ENV NODE_NAME=docker-relay

# Expose Gun.js relay port
EXPOSE 8765

# Enable periodic GC to prevent OOM on free tier
CMD ["node", "--expose-gc", "server.js"]
