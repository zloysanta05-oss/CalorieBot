# Deploy to VPS

This guide deploys CalorieBot to a VPS with Docker Compose and HTTPS via Caddy.

## Requirements

- Ubuntu/Debian VPS with SSH access
- Domain or subdomain pointed to the VPS IP address
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- OpenAI-compatible API key

## 1. Install Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and log back in after `usermod`.

Check Docker:

```bash
docker --version
docker compose version
```

## 2. Clone the Project

```bash
git clone https://github.com/zloysanta05-oss/CalorieBot.git
cd CalorieBot
```

If you deploy from another repository or upload files manually, run the following commands from the project root.

## 3. Configure Environment

```bash
cp .env.production .env
nano .env
```

Fill in the required values:

```env
BOT_TOKEN=your_bot_token_here
OPENAI_API_KEY=your_api_key_here
OPENAI_BASE_URL=https://routerai.ru/api/v1
OPENAI_MODEL=openai/gpt-5.4-nano
PORT=3000
NODE_ENV=production
```

`OPENAI_MODEL` is optional in code, but keeping it explicit makes production easier to inspect.

## 4. Configure Domain

Create an `A` DNS record:

```text
cal.example.com -> YOUR_VPS_IP
```

Then edit `Caddyfile` and replace `cal.example.com` with your real domain.

## 5. Check Caddy

The included `docker-compose.yml` starts Caddy together with the app. The included `Caddyfile` assumes Caddy runs in the same Docker Compose network and proxies requests to `app:3000`.

If you prefer to run Caddy outside Compose, change `reverse_proxy app:3000` in `Caddyfile` to `reverse_proxy localhost:3000`.

## 6. Start

```bash
docker compose up -d --build
docker compose logs -f app
```

Check locally on the VPS:

```bash
curl http://localhost:3000
```

Check HTTPS:

```bash
curl https://cal.example.com
```

Use your real domain instead of `cal.example.com`.

## 7. Connect Telegram Mini App

In [@BotFather](https://t.me/BotFather):

```text
/newapp
```

Select the bot and set the Mini App URL:

```text
https://cal.example.com
```

Telegram requires HTTPS, so wait until Caddy has issued the certificate successfully.

## Useful Commands

View logs:

```bash
docker compose logs -f app
docker compose logs -f caddy
```

Restart:

```bash
docker compose restart
```

Update after git pull:

```bash
git pull
docker compose up -d --build
```

Stop without deleting data:

```bash
docker compose down
```

Stop and delete all Docker volumes, including SQLite data:

```bash
docker compose down -v
```

## SQLite Data

The app stores SQLite data in the `caloriebot-data` Docker volume at:

```text
/app/data/app.sqlite
```

Create a simple backup:

```bash
docker run --rm \
  -v caloriebot-data:/data \
  -v "$PWD:/backup" \
  alpine cp /data/app.sqlite /backup/app.sqlite.backup
```

Restore a backup:

```bash
docker compose down
docker run --rm \
  -v caloriebot-data:/data \
  -v "$PWD:/backup" \
  alpine cp /backup/app.sqlite.backup /data/app.sqlite
docker compose up -d
```

## Troubleshooting

If HTTPS does not work:

- Check that DNS points to the VPS IP.
- Check that ports `80` and `443` are open in the VPS firewall.
- Run `docker compose logs -f caddy`.

If the app returns `Unauthorized`:

- Make sure `NODE_ENV=production`.
- Open it through Telegram Mini App, not directly in a browser.
- Check that `BOT_TOKEN` matches the bot used in BotFather.

If AI analysis fails:

- Check `OPENAI_API_KEY`.
- Check `OPENAI_BASE_URL`.
- Check whether your selected `OPENAI_MODEL` supports image input.
