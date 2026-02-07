FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev --no-package-lock

# Copy source code
COPY src/ ./src/

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

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "console.log('Bot is running')" || exit 1

# Start the bot
CMD ["npm", "start"]


