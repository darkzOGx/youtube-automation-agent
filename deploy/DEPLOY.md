# ☁️ Deploying to a Server (24/7)

This guide takes the agent from your laptop to a machine that runs it **around
the clock** — a cloud VPS, a home server, or a Raspberry Pi.

You have two paths. **Pick one:**

| Path | Best for | Effort |
|---|---|---|
| **A. Docker** (recommended) | Anyone — FFmpeg + Chromium come bundled | Easiest |
| **B. Native + systemd** | Servers where you'd rather not use Docker | More setup |

Both need the same two secrets in a `.env` file:
- `ANTHROPIC_API_KEY` — the creative agents (get one at [console.anthropic.com](https://console.anthropic.com/))
- `OPENAI_API_KEY` — *optional*, only for real thumbnails & voice

---

## 0. Get a server

Any small Linux (Ubuntu 22.04+ recommended) box works. Popular, cheap options:

- **DigitalOcean / Linode / Hetzner / Vultr** — a $5–6/month "1 GB / 1 vCPU" droplet is enough for text-only; pick **2 GB** if you'll render real videos.
- **AWS Lightsail / Oracle Cloud Free Tier** — similar.
- **Raspberry Pi 4/5** at home — works great (the image builds for ARM).

SSH in, then update the box:
```bash
sudo apt update && sudo apt upgrade -y
```

---

## Path A — Docker (recommended)

### 1. Install Docker
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # run docker without sudo (re-login after)
```
Docker's service is enabled on boot by default, so containers with
`restart: unless-stopped` (which this project sets) come back up automatically
after a reboot.

### 2. Clone and configure
```bash
git clone https://github.com/Forty4theFuture/youtube-automation-agent.git
cd youtube-automation-agent
cp .env.example .env
nano .env                          # add ANTHROPIC_API_KEY (and OPENAI_API_KEY for media)
```

### 3. One-time YouTube login
```bash
docker compose run --rm agent npm run setup
```
This is interactive: it prints a Google authorization URL — open it, approve,
and paste the code back. It writes `config/credentials.json` + `config/tokens.json`
(persisted on the host via a volume).

### 4. Start it 24/7
```bash
docker compose up -d
docker compose logs -f             # watch it work; Ctrl-C to stop watching
```
Dashboard: `http://YOUR_SERVER_IP:3456` (open the port in your firewall, or keep
it private and use an SSH tunnel: `ssh -L 3456:localhost:3456 user@server`).

### 5. (Optional) Let systemd own the compose lifecycle
Docker already restarts the container, but if you want systemd to manage it:
```ini
# /etc/systemd/system/youtube-automation-agent-docker.service
[Unit]
Description=YouTube Automation Agent (Docker Compose)
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=true
WorkingDirectory=/home/YOUR_USER/youtube-automation-agent
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now youtube-automation-agent-docker
```

---

## Path B — Native Node + systemd (no Docker)

### 1. Install runtime dependencies
```bash
# Node.js 20 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs ffmpeg
```

### 2. Create a dedicated user and install the app
```bash
sudo useradd --system --create-home --shell /bin/bash ytagent
sudo mkdir -p /opt/youtube-automation-agent
sudo chown ytagent:ytagent /opt/youtube-automation-agent

sudo -u ytagent -H bash <<'EOF'
cd /opt/youtube-automation-agent
git clone https://github.com/Forty4theFuture/youtube-automation-agent.git .
npm install
npx playwright install --with-deps chromium   # browser for the slideshow renderer
cp .env.example .env
EOF
```

### 3. Configure and run the one-time login
```bash
sudo -u ytagent nano /opt/youtube-automation-agent/.env     # add your keys
sudo -u ytagent -H bash -c 'cd /opt/youtube-automation-agent && npm run setup'
```

### 4. Install the service
```bash
sudo cp /opt/youtube-automation-agent/deploy/youtube-automation-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now youtube-automation-agent
sudo systemctl status youtube-automation-agent
journalctl -u youtube-automation-agent -f       # live logs
```

> If `node` isn't at `/usr/bin/node`, run `which node` and update `ExecStart`
> in the service file.

---

## Verifying it's live

```bash
curl http://localhost:3456/health      # {"status":"healthy",...}
```
Then open the dashboard and trigger a test generation:
```bash
curl -X POST http://localhost:3456/generate \
  -H "Content-Type: application/json" \
  -d '{"topic":"Top 5 Beginner Houseplants","style":"listicle"}'
```

## Updating to the latest version

- **Docker:** `git pull && docker compose up -d --build`
- **Native:** `sudo -u ytagent -H bash -c 'cd /opt/youtube-automation-agent && git pull && npm install'` then `sudo systemctl restart youtube-automation-agent`

---

## ⚠️ Before you go public

- **Review first.** Set `DEFAULT_PRIVACY_STATUS=unlisted` (or `private`) in `.env`,
  let it generate a few videos, and only switch to `public` once you're happy.
- **Respect YouTube's Terms.** Automated, high-frequency, low-effort uploads can
  get a channel struck or terminated. Keep the posting frequency modest and the
  content genuinely useful.
- **Protect your secrets.** `.env`, `config/credentials.json`, and
  `config/tokens.json` grant access to your Google account and bill your AI
  usage — never commit them or expose port 3456 publicly without auth.

## Rough monthly cost

| Item | Cost |
|---|---|
| VPS (1–2 GB) | $5–12/month (or free on a home Pi) |
| Claude text (`claude-haiku-4-5`) | a few cents per video |
| OpenAI media (optional) | ~$0.20 per video with real thumbnails + voice |
| YouTube Data API | free (10,000 units/day) |
