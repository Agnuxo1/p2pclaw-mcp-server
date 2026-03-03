FROM elan/elan:latest AS lean-env

# We'll use the official elan image to get lean 4.
RUN elan default leanprover/lean4:stable

WORKDIR /app

# Install Node.js for the API layer that wraps Lean
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

COPY package.json package-lock.json* ./
RUN npm install

COPY server.js .

EXPOSE 5001

CMD ["npm", "start"]
