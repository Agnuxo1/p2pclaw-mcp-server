FROM node:20-slim

WORKDIR /app

# Copy everything first so postinstall scripts can find their files
COPY . .

# Install all dependencies (postinstall needs patch-mcp-sdk.js to exist)
RUN npm install --legacy-peer-deps

# Force got@11.8.6 (CJS) — required by @aptos-labs/aptos-client peerDep
RUN npm install got@11.8.6 --no-save

EXPOSE 8080

CMD ["node", "--max-old-space-size=380", "--expose-gc", "packages/api/src/index.js"]
