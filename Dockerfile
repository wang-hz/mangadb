FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY web/package*.json ./web/
RUN cd web && npm ci

COPY . .

RUN DATABASE_URL=postgres://dummy:dummy@localhost:5432/dummy npx prisma generate
RUN npm run build
RUN npm run web:build

FROM --platform=$TARGETPLATFORM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --omit=dev --ignore-scripts

# Copy pre-built artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist

# Copy Prisma CLI from builder so migrate/generate don't require npx download
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

# Generate Prisma engine binary for the target platform
RUN DATABASE_URL=postgres://dummy:dummy@localhost:5432/dummy node_modules/.bin/prisma generate

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/app.js"]