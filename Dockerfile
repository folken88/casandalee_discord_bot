FROM node:18-alpine

# Timezone data so node-cron "America/Chicago" works (daily posts & quotes)
RUN apk add --no-cache tzdata

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev --no-package-lock

# Copy source code and tools (personality editor)
COPY src/ ./src/
COPY tools/ ./tools/

# Copy data files
COPY *.csv ./
COPY *.json ./
COPY data/ ./data/

# Create cache, dossier, and logs directories (data/ already copied)
RUN mkdir -p /app/data/dossiers
RUN mkdir -p /app/data/cache
RUN mkdir -p /app/logs

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S cass -u 1001

# Change ownership of the app directory
RUN chown -R cass:nodejs /app
USER cass

# Expose ports: bot (3000), personality editor (3960)
EXPOSE 3000 3960

# Health check — verifies the bot is actively logging (Google Sheets refreshes
# every ~5 min, so any log written in the last 10 min means the process is alive)
HEALTHCHECK --interval=5m --timeout=10s --start-period=60s --retries=3 \
  CMD find /app/logs -name "*.log" -mmin -10 | grep -q . || exit 1

# Start the bot
CMD ["npm", "start"]


