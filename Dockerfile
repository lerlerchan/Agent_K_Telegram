# Use Node.js 20 with slim base
FROM node:20-slim

# Install system dependencies for Playwright
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Install Playwright browsers
RUN npx playwright install chromium

# Create workspace and config directories
RUN mkdir -p /app/workspace /app/.claude

# Set working directory
WORKDIR /app

# Set HOME for Claude Code
ENV HOME=/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY src/ ./src/

# Set environment
ENV NODE_ENV=production
ENV WORKSPACE_DIR=/app/workspace

# Run the bot
CMD ["node", "src/index.js"]
