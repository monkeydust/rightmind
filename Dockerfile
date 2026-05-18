FROM node:20-bookworm

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
