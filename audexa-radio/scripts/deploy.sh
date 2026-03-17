#!/usr/bin/env bash
set -euo pipefail

# Audexa Radio — Hetzner VM Deployment Script
# Run on a fresh Ubuntu 22.04 VM (Hetzner CPX41 recommended)

echo "=== Audexa Radio Deployment ==="

# 1. System updates
echo "[1/8] Updating system..."
apt-get update && apt-get upgrade -y

# 2. Install Docker
echo "[2/8] Installing Docker..."
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# 3. Install Docker Compose + Node.js + Claude CLI
echo "[3/9] Installing Docker Compose..."
if ! command -v docker compose &>/dev/null; then
    apt-get install -y docker-compose-plugin
fi

echo "[4/9] Installing Node.js and Claude CLI..."
if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi
if ! command -v claude &>/dev/null; then
    npm install -g @anthropic-ai/claude-code
fi

# Check if Claude is logged in
echo "[5/9] Checking Claude CLI authentication..."
if ! claude --version &>/dev/null; then
    echo ""
    echo "========================================="
    echo "  Claude CLI needs authentication!"
    echo "  Run: claude login"
    echo "  This will open a browser for OAuth."
    echo "  SSH with -L flag for port forwarding."
    echo "========================================="
    echo ""
    echo "After logging in, re-run this script."
    exit 1
fi
echo "Claude CLI is ready"

# 6. Create project directory
echo "[6/9] Setting up project..."
PROJECT_DIR="/opt/audexa-radio"
mkdir -p "$PROJECT_DIR"

# If running from git repo, copy files
if [ -d "./docker-compose.yml" ] || [ -f "./docker-compose.yml" ]; then
    cp -r ./* "$PROJECT_DIR/"
fi

cd "$PROJECT_DIR"

# Create required directories
mkdir -p queue/ready queue/rendering logs music jingles

# 7. Check for .env
echo "[7/9] Checking configuration..."
if [ ! -f ".env" ]; then
    echo "ERROR: .env file not found!"
    echo "Copy .env.example to .env and fill in your secrets:"
    echo "  cp .env.example .env"
    echo "  nano .env"
    exit 1
fi

# Check for music files
echo "Checking music library..."
SONG_COUNT=$(find music/ -name "*.mp3" 2>/dev/null | wc -l)
if [ "$SONG_COUNT" -lt 5 ]; then
    echo "WARNING: Only $SONG_COUNT songs in music/. Add at least 20 royalty-free MP3s."
    echo "Suggestions: pixabay.com/music, freemusicarchive.org, incompetech.com"
fi

# 8. Build and start services
echo "[8/9] Building Docker images (this may take 10-15 minutes on first run)..."
docker compose build

echo "[9/9] Starting services..."
docker compose up -d

# Wait for health
echo ""
echo "Waiting for services to start..."
sleep 30

# Health check
echo ""
echo "=== Health Check ==="
curl -s http://localhost:8081/api/health | python3 -m json.tool 2>/dev/null || echo "Orchestrator not ready yet"
curl -s http://localhost:8080/health | python3 -m json.tool 2>/dev/null || echo "TTS service not ready yet"

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Stream URL: http://$(hostname -I | awk '{print $1}'):8000/stream"
echo "API:        http://$(hostname -I | awk '{print $1}'):8081/api/health"
echo "Icecast:    http://$(hostname -I | awk '{print $1}'):8000"
echo ""
echo "Next steps:"
echo "  1. Add royalty-free MP3s to $PROJECT_DIR/music/"
echo "  2. Add jingle MP3s to $PROJECT_DIR/jingles/ (station_id.mp3 at minimum)"
echo "  3. Set up DNS: radio.audexa.fm → $(hostname -I | awk '{print $1}')"
echo "  4. Set up SSL: certbot --nginx -d radio.audexa.fm"
echo "  5. Set up Retell agent with webhook URL: https://radio.audexa.fm/api/webhooks/retell"
echo ""
echo "Logs: docker compose logs -f"
