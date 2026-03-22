FROM node:20-slim

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./
COPY packages/api/package*.json ./packages/api/

# Install all dependencies
RUN npm install --legacy-peer-deps

# Force got@11.8.6 (CJS) — required by @aptos-labs/aptos-client peerDep
RUN npm install got@11.8.6 --no-save

# Copy rest of source
COPY . .

EXPOSE 8080

CMD ["node", "--max-old-space-size=380", "--expose-gc", "packages/api/src/index.js"]
