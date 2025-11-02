# ===== Build stage =====
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json pnpm-lock.yaml* ./
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ===== Runtime stage =====
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
# مجلد الرفع
RUN mkdir -p /data/uploads
VOLUME ["/data/uploads"]
ENV UPLOADS_DIR=/data/uploads
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/main.js"]
