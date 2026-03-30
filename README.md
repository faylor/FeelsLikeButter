# FeelsLikeButter
Swim analysis fun
# Swim Analyzer — Heroku Deployment Guide

## Prerequisites
- Node.js 18+ installed locally
- Heroku CLI installed: https://devcenter.heroku.com/articles/heroku-cli
- A Heroku account
- Your Anthropic API key: https://console.anthropic.com

---

## Step 1 — Set up the project locally

```bash
# 1. Put all these files in a folder called swim-analyzer
cd swim-analyzer

# 2. Install root dependencies
npm install

# 3. Install client dependencies and do a test build
cd client
npm install
npm run build
cd ..
```

---

## Step 2 — Test locally before deploying

```bash
# Create your local .env file
cp .env.example .env
# Edit .env and add your real Anthropic API key

# Run the full stack locally
npm run dev
# Express runs on :3001, Vite dev server on :5173
# Open http://localhost:5173
```

---

## Step 3 — Create the Heroku app

```bash
# Log in to Heroku
heroku login

# Create the app (pick your own name or let Heroku generate one)
heroku create swim-analyzer-yourname

# Set your Anthropic API key as a config var (this replaces .env on Heroku)
heroku config:set ANTHROPIC_API_KEY=sk-ant-your-key-here
```

---

## Step 4 — Configure Heroku build

Heroku needs to build the React client during deployment.
Add this buildpack so it runs `npm run build` automatically:

```bash
heroku buildpacks:set heroku/nodejs
```

The `package.json` `"build"` script handles the client build.
Heroku runs it automatically on every deploy.

---

## Step 5 — Deploy

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial deploy"

# Push to Heroku
git push heroku main

# Open your live app
heroku open
```

---

## Step 6 — Verify it's working

```bash
# Check logs if anything looks wrong
heroku logs --tail
```

You should see:
```
Swim Analyzer running on port XXXXX
```

---

## Updating the app

Any time you make changes:

```bash
git add .
git commit -m "Update description"
git push heroku main
```

---

## Dyno recommendation

- **Eco ($5/month)** — sleeps after 30 min inactivity, first load is slow (~10s)
- **Basic ($7/month)** — always on, recommended for regular use

```bash
# Upgrade to Basic dyno
heroku ps:type basic
```

---

## Data note

Session history is stored in the browser's `localStorage`.
This means each device/browser has its own history.
If you want shared history across devices, the next step
would be adding a small database (e.g. Heroku Postgres).

---

## Your app URL

After deploying, your app will be at:
`https://swim-analyzer-yourname.herokuapp.com`

Share this URL with any device — phone at poolside, tablet, laptop — 
and your son's sessions will be tracked per device.
