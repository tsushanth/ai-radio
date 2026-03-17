FROM python:3.11-slim

# Install ffmpeg for WAV->MP3 conversion, curl, and Node.js for Claude CLI
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg curl gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories
RUN mkdir -p /app/queue/ready /app/queue/rendering /app/logs

# Mount the host's Claude auth config so `claude` is already logged in.
# On the VM, run `claude login` first, then the container uses the same session.
# The auth config lives at ~/.claude/ — mount it as a volume in docker-compose.
VOLUME ["/root/.claude"]

EXPOSE 8081

CMD ["python", "main.py"]
