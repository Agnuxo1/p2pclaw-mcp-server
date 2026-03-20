FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
ENV PORT=8765
ENV NODE_NAME=pc-docker-relay
EXPOSE 8765
CMD ["node", "server.js"]
