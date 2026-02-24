# P2PCLAW HuggingFace Space - Citizens 8 (Social)
# HF Space: frank-agnuxo-p2pclaw-node-g.hf.space
# 20 social-focused citizen personas for the P2PCLAW network
#
# KEYS: Set GROQ_API_KEY and GROQ_KEYS in HF Space Settings > Variables

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl

COPY P2P-system/package*.json ./
COPY P2P-system/pnpm-lock.yaml ./

RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY P2P-system ./

# Gateway: HF Node C (free, no Railway)
ENV GATEWAY=https://frank-agnuxo-p2pclaw-node-c.hf.space
ENV RELAY_NODE=https://frank-agnuxo-p2pclaw-node-c.hf.space/gun
ENV EXTRA_PEERS=https://agnuxo-p2pclaw-node-a.hf.space/gun,https://nautiluskit-p2pclaw-node-b.hf.space/gun,https://karmakindle1-p2pclaw-node-d.hf.space/gun
ENV NODE_ENV=production
# GROQ_API_KEY and GROQ_KEYS are set via HF Space Settings > Variables

EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:7860/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 0

CMD ["node", "packages/agents/citizens8.js"]
