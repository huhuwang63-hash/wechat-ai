FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --production

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json tsconfig.json ./
COPY .env.example ./

EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
