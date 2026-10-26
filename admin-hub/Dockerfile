# syntax=docker/dockerfile:1
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web/package.json web/package-lock.json ./web/
RUN npm ci --prefix web
COPY . .
RUN npx prisma generate && npm run build && npm run build --prefix web

FROM node:22-slim AS run
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/web-dist ./web-dist
COPY prisma ./prisma
COPY prisma.config.ts ./
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3200)+'/api/auth/status').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "run", "start:prod"]
