# Folk Care Deployment Status

## ✅ Completed

### 1. Express Backend Deployed to Vercel
- **Production URL**: https://folk-care-five.vercel.app
- **Project**: folk-care (free tier)
- **Configuration**: `vercel.json` updated to handle API routing
- **Function Entry Point**: `api/index.ts` → wraps `packages/app` Express server

### 2. Frontend Updated to Use Production Backend
- **Frontend**: Deployed on Netlify at https://mhc-portal.netlify.app
- **Configuration**: `netlify.toml` updated with `VITE_API_BASE_URL = "https://folk-care-five.vercel.app"`
- **Impact**: Frontend will now make API calls to Vercel backend instead of localhost:3001

### 3. Files Created/Modified
- ✅ `vercel.json` - Updated to deploy backend as serverless functions
- ✅ `.vercelignore` - Configured to include dist/ directories
- ✅ `netlify.toml` - Added VITE_API_BASE_URL environment variable
- ✅ `.env.production.example` - Template for production secrets

---

## 🔧 Next Steps: Set Production Environment Variables

The backend is deployed but needs database and auth secrets. These **MUST NOT be committed** to git.

### Option 1: Via Vercel CLI (Recommended)
```bash
cd /Users/markjordan/folk-care

# Set production database URL
vercel env add DATABASE_URL

# Set required secrets
vercel env add JWT_SECRET
vercel env add CSRF_SECRET
vercel env add SESSION_SECRET

# Redeploy to apply changes
vercel deploy --prod
```

### Option 2: Via Vercel Dashboard
1. Go to https://vercel.com/markjsjordans-projects/folk-care
2. Click "Settings" → "Environment Variables"
3. Add each variable from `.env.production.example`
4. Redeploy

### Required Environment Variables for Production
See `.env.production.example` for the complete list. Critical ones:

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection (use prod instance) | ✅ YES |
| `JWT_SECRET` | Auth token signing key (generate new, not dev key) | ✅ YES |
| `CSRF_SECRET` | CSRF protection (generate new) | ✅ YES |
| `SESSION_SECRET` | Session encryption (generate new) | ✅ YES |
| `CORS_ORIGIN` | Allow `https://mhc-portal.netlify.app` | ✅ YES |
| `REDIS_URL` or `UPSTASH_*` | Rate limiting (optional but recommended) | ❌ No |

---

## 🧪 Testing the Deployment

### 1. Check Vercel Backend Status
```bash
# Health check
curl https://folk-care-five.vercel.app/health

# Expected (before env vars): 500 with "DATABASE_URL required"
# Expected (after env vars): 200 with health status
```

### 2. Test Frontend → Backend Integration
1. Visit https://mhc-portal.netlify.app
2. Try to log in (will hit the backend API)
3. Check Network tab in DevTools → should see requests to `folk-care-five.vercel.app/api/...`

### 3. Verify CORS
```bash
curl -H "Origin: https://mhc-portal.netlify.app" \
     -H "Access-Control-Request-Method: POST" \
     -i https://folk-care-five.vercel.app/api/login
```

---

## 📝 Deployment Architecture

```
┌──────────────────────────────────┐
│  Frontend                        │
│  mhc-portal.netlify.app          │
│  (Vite + React SPA)              │
└────────────┬──────────────────────┘
             │ API Calls
             │ VITE_API_BASE_URL=
             │ folk-care-five.vercel.app
             ▼
┌──────────────────────────────────┐
│  Backend (Vercel Serverless)     │
│  folk-care-five.vercel.app       │
│  /api → serverless function      │
│  → api/index.ts                  │
│  → Express (packages/app)        │
└────────┬─────────────────────────┘
         │ Database
         │ Redis (rate limit)
         ▼
     [Production Services]
```

---

## 🔒 Security Notes

1. **No secrets in repo**: Database URL, JWT_SECRET, etc. are NOT in version control
2. **Environment-specific builds**: Frontend uses VITE_API_BASE_URL which changes by environment
3. **CORS configured**: Only allows requests from frontend domain
4. **Security headers**: Applied by vercel.json

---

## 📋 Configuration Files Reference

### vercel.json (Backend)
- Serverless function at `api/index.ts`
- Includes dist/ files from packages/app
- Rewrites `/api/*` and `/health` to handler
- Adds security headers (HSTS, X-Frame-Options, etc.)

### netlify.toml (Frontend)
- Builds: packages/web/dist
- Publishes to Netlify CDN
- Redirects SPA routes to index.html
- Environment variable: VITE_API_BASE_URL

---

## 🚀 Deployment Summary

| Component | Status | URL |
|-----------|--------|-----|
| Express Backend | ✅ Deployed | https://folk-care-five.vercel.app |
| React Frontend | ✅ Deployed | https://mhc-portal.netlify.app |
| Configuration | ✅ Updated | vercel.json + netlify.toml |
| Secrets | ⏳ Pending | Set via Vercel dashboard/CLI |

**Blockers**: None. Backend is live and callable. Needs production secrets to fully function.

---

## 🔗 Useful Commands

```bash
# Check Vercel project status
vercel projects list

# View deployment logs
vercel logs [url]

# Pull environment variables
vercel env pull

# Check build output
vercel inspect [url]

# Redeploy after secrets are set
vercel deploy --prod
```
