# Run the MCP server locally with workerd (via wrangler dev). No Cloudflare
# account is needed. This is the self-host path for people who do not want to
# deploy to Cloudflare.
FROM node:25-slim

WORKDIR /app

# workerd verifies upstream TLS against the system CA bundle, which the slim
# image does not ship. Without this, HTTPS fetches to the upstream API fail.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer is cached when only source changes.
# npm ci runs inside the linux image, so it pulls the linux workerd binary.
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and config.
COPY tsconfig.json wrangler.jsonc ./
COPY src ./src

ENV WRANGLER_SEND_METRICS=false
EXPOSE 8787

# Bind to 0.0.0.0 so the endpoint is reachable from outside the container.
CMD ["npx", "wrangler", "dev", "--ip", "0.0.0.0", "--port", "8787"]
