# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY package*.json ./
RUN npm install --production

COPY server/ ./server/
COPY --from=builder /app/dist ./dist

USER appuser

EXPOSE 80

CMD ["node", "server/index.js"]
