#!/bin/bash
# Deploy script for Audexa Web App
# Reads config from deploy.config.json

set -e

# Read config
CONFIG_FILE="$(dirname "$0")/deploy.config.json"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: deploy.config.json not found"
    exit 1
fi

PROJECT=$(jq -r '.project' "$CONFIG_FILE")
REGION=$(jq -r '.region' "$CONFIG_FILE")
SERVICE=$(jq -r '.service' "$CONFIG_FILE")

echo "=========================================="
echo "Deploying to Cloud Run"
echo "Project: $PROJECT"
echo "Region:  $REGION"
echo "Service: $SERVICE"
echo "=========================================="

# Build
echo "Building..."
npm run build

# Deploy
echo "Deploying..."
gcloud run deploy "$SERVICE" \
    --source . \
    --region "$REGION" \
    --project "$PROJECT" \
    --allow-unauthenticated

echo "=========================================="
echo "Deployment complete!"
echo "=========================================="
