#!/bin/bash

# Test script for AI Radio Backend
# Tests the newly added linked-accounts endpoints

BASE_URL="https://ai-radio-backend-917362189743.us-central1.run.app/api"
USER_ID="test@example.com"

echo "========================================"
echo "Testing AI Radio Backend"
echo "========================================"
echo ""

# Test 1: Health Check
echo "1. Testing Health Check..."
curl -s "$BASE_URL/health" | jq '.'
echo ""
echo ""

# Test 2: API Root
echo "2. Testing API Root..."
curl -s "$BASE_URL/" | jq '.'
echo ""
echo ""

# Test 3: Store Linked Account (Google)
echo "3. Testing Store Linked Account (Google)..."
curl -s -X POST "$BASE_URL/linked-accounts/$USER_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "email": "user@gmail.com",
    "access_token": "test_access_token_12345",
    "refresh_token": "test_refresh_token_67890",
    "email_enabled": true,
    "calendar_enabled": true
  }' | jq '.'
echo ""
echo ""

# Test 4: Get Linked Accounts
echo "4. Testing Get Linked Accounts..."
curl -s "$BASE_URL/linked-accounts/$USER_ID" | jq '.'
echo ""
echo ""

# Test 5: Cost Estimation
echo "5. Testing Cost Estimation..."
curl -s -X POST "$BASE_URL/podcast/estimate" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test@example.com",
    "preferences": {
      "include_email": true,
      "include_calendar": true
    }
  }' | jq '.'
echo ""
echo ""

# Test 6: Validate Prerequisites
echo "6. Testing Validate Prerequisites..."
curl -s -X POST "$BASE_URL/podcast/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test@example.com"
  }' | jq '.'
echo ""
echo ""

echo "========================================"
echo "All tests completed!"
echo "========================================"
