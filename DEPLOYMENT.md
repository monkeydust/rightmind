# Deployment Guide — RightMind

The application is deployed to a **Hetzner Cloud VPS** using Docker and served via **Caddy** with automatic HTTPS.

## Server Details
- **Provider:** Hetzner Cloud
- **IP:** `89.167.62.131`
- **OS:** Ubuntu 24.04 LTS
- **User:** `root`
- **App directory:** `/opt/rightmind`
- **Live URL:** https://www.rightmind.uk *(update with actual domain)*

## Architecture
- **Docker container** runs the Next.js app on port `3000` (mapped to host port `3001` to avoid conflict with rightdata)
- **Caddy** acts as a reverse proxy on ports `80`/`443`, handling SSL automatically via Let's Encrypt
- **SQLite database** is persisted via a Docker volume at `/app/data/production.db`
- **Shared server** — rightdata.uk is already running on port `3000`

## ⚠️ Known Quirk: docker-compose v1 on Ubuntu 24.04
The server has `docker-compose` v1.29.2 (the legacy Python-based CLI). This version has a bug with newer Docker Engine where it cannot recreate existing containers — it crashes with a `KeyError: 'ContainerConfig'` error.

**Workaround:** Always remove the old container before running `up`:
```bash
docker rm -f $(docker ps -q -f name=rightmind)
docker-compose --env-file .env.prod up -d
```

## First-Time Server Setup

> ⚠️ **Before SSHing: ask the user for the SSH password.** The server uses password authentication — SSH will hang silently without it. Do not attempt `ssh root@89.167.62.131` until you have the password confirmed from the user.

### 1. Clone the repo on the server
```bash
ssh root@89.167.62.131
cd /opt
git clone https://github.com/monkeydust/rightmind.git
cd rightmind
```

### 2. Create the production env file
```bash
cat > .env.prod << 'EOF'
OPENROUTER_API_KEY=sk-or-v1-xxxxx
AUTH_SECRET=xxxxx
AUTH_URL=https://www.rightmind.uk
AUTH_RESEND_KEY=re_xxxxx
EOF
```

### 3. Build and start the container
```bash
docker-compose --env-file .env.prod up -d --build
```

### 4. Update Caddy to serve the new domain
Edit `/etc/caddy/Caddyfile` and add:
```
rightmind.uk, www.rightmind.uk {
    reverse_proxy localhost:3001
}
```

Then reload Caddy:
```bash
systemctl restart caddy
systemctl status caddy --no-pager
```

## Deploying an Update

SSH into the server:
```bash
ssh root@89.167.62.131
```

Then run the full redeploy sequence:
```bash
cd /opt/rightmind
git stash          # stash any server-side local changes
git pull           # pull latest code from GitHub
docker-compose --env-file .env.prod up -d --build  # build new image
# If docker-compose crashes with 'ContainerConfig' error:
docker rm -f $(docker ps -q -f name=rightmind)
docker-compose --env-file .env.prod up -d
```

## Environment Variables
Stored at `/opt/rightmind/.env.prod` on the server. Contains:
- `OPENROUTER_API_KEY`
- `AUTH_SECRET`
- `AUTH_URL`
- `AUTH_RESEND_KEY`
- `DATABASE_URL=file:/app/data/production.db` (set in docker-compose.yml)

## Troubleshooting

### Check container logs
```bash
docker logs $(docker ps -q -f name=rightmind) --tail 100
```

### Check Caddy logs
```bash
journalctl -u caddy -n 50 --no-pager
```

### Check if app is running
```bash
docker ps
curl -s http://localhost:3001 -o /dev/null -w "%{http_code}"
```

### Login not working
The auth cookie is set with the `Secure` flag, so it **only works over HTTPS**. Accessing via raw `http://89.167.62.131:3001` will not work.
