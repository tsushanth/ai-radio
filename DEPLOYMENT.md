# AI Radio / Audexa Deployment Guide

## Services Overview

| Component | Service Name | Project | Region | URL |
|-----------|--------------|---------|--------|-----|
| Web App | `audexa-web` | `summarizerproxy` | `us-central1` | https://audexa-web-917362189743.us-central1.run.app |
| Backend API | `ai-radio-backend` | `summarizerproxy` | `us-central1` | https://ai-radio-backend-917362189743.us-central1.run.app |
| iOS App | BriefCast | App Store | - | https://apps.apple.com/us/app/audexa/id6756477258 |
| Android App | Audexa | Play Store | - | https://play.google.com/store/apps/details?id=com.kreativekoala.audexa |

## Custom Domain

- Domain: `audexa.app`
- DNS: Cloudflare
- Target: `audexa-web` Cloud Run service

## Quick Deploy Commands

### Web App
```bash
cd web-app
./deploy.sh
# OR manually:
npm run build && gcloud run deploy audexa-web --source . --region us-central1 --project summarizerproxy --allow-unauthenticated
```

### Backend
```bash
cd ai-radio-backend
gcloud run deploy ai-radio-backend --source . --region us-central1 --project summarizerproxy --allow-unauthenticated
```

## Environment Variables

### Web App (.env.local)
```
NEXT_PUBLIC_API_URL=https://ai-radio-backend-917362189743.us-central1.run.app/api
```

### Backend
Set via Cloud Run environment variables or Secret Manager.

## Domain Setup (audexa.app)

1. Verify domain in Google Search Console
2. Map domain: `gcloud beta run domain-mappings create --service audexa-web --domain audexa.app --region us-central1 --project summarizerproxy`
3. Add DNS records in Cloudflare (CNAME to ghs.googlehosted.com)
4. Wait for SSL provisioning (~15-30 min)
