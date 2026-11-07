# ICT Futures Trading Platform — portable production image
# Build context MUST be the project root (nextjs_space/). See docker-compose.yml / README.
#
#   docker build -f deploy-portable/Dockerfile -t ict-futures .
#
# Multi-stage: deps -> builder -> runner. Alpine (musl) base matches the
# prisma binaryTargets ("linux-musl-openssl-3.0.x") declared in prisma/schema.prisma.

# ---------- deps: install full node_modules (incl. dev deps for the build) ----------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ---------- builder: generate prisma client + compile Next.js ----------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The app's dist dir is ".build" (not ".next"); next.config.js reads NEXT_DIST_DIR.
ENV NEXT_DIST_DIR=.build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npx prisma generate
RUN npm run build

# ---------- runner: production runtime ----------
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_DIST_DIR=.build
ENV NEXT_TELEMETRY_DISABLED=1
# PORT is honored by `next start --port`; keep in sync with docker-compose APP_PORT.
ENV PORT=3456

# Copy everything needed to run `next start`, plus prisma CLI + tsx for the
# entrypoint (migrate deploy + optional seed). We keep the full node_modules
# so `npx prisma` and `npx tsx` are available at container start.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.build ./.build
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY deploy-portable/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3456
ENTRYPOINT ["./docker-entrypoint.sh"]
