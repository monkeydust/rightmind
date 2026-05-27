FROM node:20-bookworm

# Install Chromium for server-side PDF generation (puppeteer-core)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy remaining source code
COPY . .

# Create the data directory for SQLite that will be mounted as a volume
RUN mkdir -p /app/data

# Environment to point Prisma to the persistent volume
ENV DATABASE_URL="file:/app/data/production.db"

# Generate prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build

# Set environment to production
ENV NODE_ENV=production

# Expose port 3000
EXPOSE 3000

# Copy and prepare startup script (fix Windows CRLF -> LF)
COPY start.sh /app/start.sh
RUN sed -i 's/\r$//' /app/start.sh && chmod +x /app/start.sh

# Start: sync DB schema then launch Next.js
CMD ["/app/start.sh"]
