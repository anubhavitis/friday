# Use the official Bun image
FROM oven/bun:1.0.25

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json .
COPY bun.lockb .

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build TypeScript
RUN bun run typecheck

# Generate and push database migrations
RUN bun run db:generate
RUN bun run db:push

# Expose port (adjust if needed)
EXPOSE 3000

# Start the application
COPY entrypoint.sh .
RUN chmod +x ./entrypoint.sh
CMD ["./entrypoint.sh"]