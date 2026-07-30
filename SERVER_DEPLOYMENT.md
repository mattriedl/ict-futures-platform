# ICT Futures Platform - Server Deployment Guide

Complete guide to deploying your ICT Futures Trading Platform to your own production server.

---

## 🎯 Quick Start (5 Steps)

1. **Clone repo on your server**
2. **Set up PostgreSQL database**
3. **Configure `.env` with production values**
4. **Build and start with PM2**
5. **Set up Nginx reverse proxy (optional)**

---

## Prerequisites

### On Your Server
- **Ubuntu 20.04+** (or similar Linux distro)
- **Node.js 18+** and npm
- **PostgreSQL 14+**
- **Git**
- **Domain name** (optional, for SSL)

### Check versions
```bash
node --version  # Should be 18+
npm --version
psql --version
```

### Install if needed
```bash
# Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# PM2 (process manager)
sudo npm install -g pm2

# Nginx (optional, for reverse proxy)
sudo apt-get install -y nginx
```

---

## Step 1: Clone Repository on Server

```bash
# SSH into your server
ssh user@your-server-ip

# Clone the repo
cd /var/www  # or your preferred directory
git clone https://github.com/mattriedl/ict-futures-platform.git
cd ict-futures-platform

# If the repo is private and you need authentication
git clone https://YOUR_GITHUB_TOKEN@github.com/mattriedl/ict-futures-platform.git
```

---

## Step 2: Set Up PostgreSQL Database

### Create database and user

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE ict_futures;
CREATE USER ict_user WITH ENCRYPTED PASSWORD 'your-secure-password';
GRANT ALL PRIVILEGES ON DATABASE ict_futures TO ict_user;

# Grant schema permissions
\c ict_futures
GRANT ALL ON SCHEMA public TO ict_user;

# Exit
\q
```

### Test connection

```bash
psql -h localhost -U ict_user -d ict_futures
# Enter password when prompted
# If successful, you'll see the psql prompt
\q
```

### Allow remote connections (if database is on different server)

Edit `/etc/postgresql/14/main/postgresql.conf`:
```conf
listen_addresses = '*'
```

Edit `/etc/postgresql/14/main/pg_hba.conf`:
```conf
# Add this line (adjust IP range as needed)
host    all             all             0.0.0.0/0               md5
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

---

## Step 3: Configure Environment Variables

Create production `.env` file:

```bash
cd /var/www/ict-futures-platform
nano .env
```

**Production `.env` template:**

```env
# ====================================
# DATABASE
# ====================================
DATABASE_URL="postgresql://ict_user:your-secure-password@localhost:5432/ict_futures?schema=public"

# ====================================
# NEXTAUTH
# ====================================
NEXTAUTH_URL="https://yourdomain.com"
# OR if using IP: NEXTAUTH_URL="http://your-server-ip:3000"

# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET="your-super-secret-32-char-minimum-key-here"

# ====================================
# ABACUS AI
# ====================================
ABACUS_API_KEY="your-abacus-api-key"

# ====================================
# EMAIL (Gmail - REQUIRED for alerts)
# ====================================
GMAIL_USER="ictfuturestrading@gmail.com"
GMAIL_APP_PASSWORD="your-16-char-app-password"

# ====================================
# OPTIONAL: Yahoo Finance API
# ====================================
# YF_API_KEY="your-yf-api-key"

# ====================================
# NODE ENVIRONMENT
# ====================================
NODE_ENV="production"
```

### 🔐 Security Notes

1. **NEVER commit `.env` to git** (already in `.gitignore`)
2. **Generate strong NEXTAUTH_SECRET**:
   ```bash
   openssl rand -base64 32
   ```
3. **Use PostgreSQL password with special chars**
4. **Restrict `.env` permissions**:
   ```bash
   chmod 600 .env
   ```

### ⚠️ Gmail App Password Setup (CRITICAL)

Email alerts **will not send** until you set up a Gmail App Password:

1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (required)
3. Go to https://myaccount.google.com/apppasswords
4. Generate an App Password for "Mail"
5. Copy the 16-character password (no spaces)
6. Set `GMAIL_APP_PASSWORD` in `.env`

**Note:** The app will run fine without this, but email alerts will silently fail.

---

## Step 4: Install Dependencies and Build

```bash
cd /var/www/ict-futures-platform

# Install dependencies
npm install --legacy-peer-deps

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push

# Seed instruments (optional but recommended)
npm run seed

# Build for production
npm run build
```

### Verify build succeeded
```bash
# Should see: "Compiled successfully"
# Creates .next/ directory with optimized production build
```

---

## Step 5: Start with PM2 (Recommended)

PM2 keeps your app running, auto-restarts on crashes, and manages logs.

### Start the application

```bash
# Start with PM2
pm2 start npm --name "ict-futures" -- start

# View status
pm2 status

# View logs
pm2 logs ict-futures

# Monitor in real-time
pm2 monit
```

### Configure PM2 startup script (auto-restart on server reboot)

```bash
# Save current PM2 processes
pm2 save

# Generate startup script
pm2 startup

# Follow the printed command, e.g.:
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u yourusername --hp /home/yourusername
```

### Useful PM2 commands

```bash
# Restart app
pm2 restart ict-futures

# Stop app
pm2 stop ict-futures

# Delete app from PM2
pm2 delete ict-futures

# View logs (last 200 lines)
pm2 logs ict-futures --lines 200

# Clear logs
pm2 flush

# Monitor CPU/memory
pm2 monit
```

---

## Step 6: Set Up Nginx Reverse Proxy (Optional)

Use Nginx to:
- Serve on port 80/443 (standard HTTP/HTTPS)
- Handle SSL certificates
- Add security headers
- Enable caching

### Install Nginx

```bash
sudo apt-get install -y nginx
```

### Create Nginx config

```bash
sudo nano /etc/nginx/sites-available/ict-futures
```

**Basic HTTP config:**

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 60m;
    }
}
```

### Enable the site

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/ict-futures /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

### Set up SSL with Let's Encrypt (Recommended)

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Get SSL certificate (interactive)
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will automatically:
# - Obtain certificate
# - Modify Nginx config
# - Enable HTTPS redirect

# Auto-renewal test
sudo certbot renew --dry-run
```

**After SSL setup, update `.env`:**
```env
NEXTAUTH_URL="https://yourdomain.com"
```

Restart the app:
```bash
pm2 restart ict-futures
```

---

## Alternative: systemd Service (Instead of PM2)

If you prefer systemd over PM2:

### Create service file

```bash
sudo nano /etc/systemd/system/ict-futures.service
```

```ini
[Unit]
Description=ICT Futures Trading Platform
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/ict-futures-platform
EnvironmentFile=/var/www/ict-futures-platform/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable and start

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable ict-futures

# Start service
sudo systemctl start ict-futures

# Check status
sudo systemctl status ict-futures

# View logs
sudo journalctl -u ict-futures -f
```

---

## Alternative: Docker Deployment

### Create Dockerfile (already included in repo)

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build app
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

### Create docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_USER: ict_user
      POSTGRES_PASSWORD: your-secure-password
      POSTGRES_DB: ict_futures
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: .
    ports:
      - "3000:3000"
    env_file:
      - .env
    depends_on:
      - postgres
    environment:
      DATABASE_URL: "postgresql://ict_user:your-secure-password@postgres:5432/ict_futures?schema=public"

volumes:
  postgres_data:
```

### Deploy with Docker

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Rebuild after changes
docker-compose up -d --build
```

---

## Post-Deployment: Database Migration

After deploying to production:

```bash
cd /var/www/ict-futures-platform

# Run migrations (if schema changes)
npx prisma migrate deploy

# Or push schema changes
npx prisma db push

# Seed instruments if not done
npm run seed
```

---

## Monitoring and Maintenance

### Check application health

```bash
# PM2 status
pm2 status

# CPU/Memory usage
pm2 monit

# Logs (real-time)
pm2 logs ict-futures --lines 100
```

### Database backup

```bash
# Backup database
pg_dump -U ict_user -h localhost ict_futures > backup_$(date +%Y%m%d).sql

# Restore database
psql -U ict_user -h localhost ict_futures < backup_20240730.sql
```

### Update application

```bash
cd /var/www/ict-futures-platform

# Pull latest changes
git pull origin main

# Install new dependencies
npm install --legacy-peer-deps

# Rebuild
npm run build

# Restart
pm2 restart ict-futures
```

---

## Firewall Configuration

### Open necessary ports

```bash
# Allow SSH (if not already)
sudo ufw allow 22

# Allow HTTP
sudo ufw allow 80

# Allow HTTPS
sudo ufw allow 443

# If accessing Node.js directly (no Nginx)
sudo ufw allow 3000

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

---

## Troubleshooting

### Port 3000 already in use

```bash
# Find process
sudo lsof -i :3000

# Kill process
sudo kill -9 <PID>

# Or use fuser
sudo fuser -k 3000/tcp
```

### Database connection fails

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U ict_user -h localhost -d ict_futures

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### PM2 app crashes on startup

```bash
# View error logs
pm2 logs ict-futures --err

# Check environment variables
pm2 env 0

# Restart with fresh config
pm2 delete ict-futures
pm2 start npm --name "ict-futures" -- start
```

### Nginx 502 Bad Gateway

```bash
# Check if app is running
pm2 status

# Check Nginx error logs
sudo tail -f /var/log/nginx/error.log

# Test Nginx config
sudo nginx -t

# Restart both
pm2 restart ict-futures
sudo systemctl restart nginx
```

### Build fails

```bash
# Clear Next.js cache
rm -rf .next

# Regenerate Prisma
npx prisma generate

# Rebuild
npm run build
```

---

## Security Checklist

- [ ] Set strong database password
- [ ] Generate secure `NEXTAUTH_SECRET`
- [ ] Use HTTPS (SSL certificate)
- [ ] Set `.env` permissions to 600
- [ ] Enable firewall (ufw)
- [ ] Keep Node.js and dependencies updated
- [ ] Enable automatic security updates
- [ ] Set up database backups
- [ ] Monitor logs regularly
- [ ] Use Nginx rate limiting (optional)

---

## Performance Optimization

### Enable compression in Nginx

Add to your Nginx config:

```nginx
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;
```

### PM2 cluster mode (for multi-core servers)

```bash
# Use all CPU cores
pm2 start npm --name "ict-futures" -i max -- start
```

### Database optimization

```sql
-- Connect to database
psql -U ict_user -d ict_futures

-- Create indexes for frequently queried columns
CREATE INDEX idx_trades_user_id ON "Trade"(user_id);
CREATE INDEX idx_trades_status ON "Trade"(status);
CREATE INDEX idx_alerts_user_id ON "Alert"(user_id);
```

---

## 🎉 You're Live!

Your ICT Futures Platform should now be running at:
- **Direct:** `http://your-server-ip:3000`
- **With Nginx:** `http://yourdomain.com`
- **With SSL:** `https://yourdomain.com`

### Test the deployment

1. Open your domain/IP in a browser
2. Create an account
3. Log in
4. Check Dashboard loads
5. Test a backtest run
6. Create a manual demo trade
7. Verify charts load

### Login as admin

The owner email `mattriedl@hotmail.com` is auto-promoted to admin on first login (configured in `lib/auth.ts`).

---

## Support

- **GitHub:** https://github.com/mattriedl/ict-futures-platform
- **Issues:** Report bugs via GitHub Issues
- **PR #1:** Review new features at https://github.com/mattriedl/ict-futures-platform/pull/1

---

## Quick Reference Commands

```bash
# View app status
pm2 status

# View logs
pm2 logs ict-futures

# Restart app
pm2 restart ict-futures

# Pull updates
cd /var/www/ict-futures-platform && git pull

# Rebuild and restart
npm run build && pm2 restart ict-futures

# Database backup
pg_dump -U ict_user ict_futures > backup.sql

# Check Nginx
sudo nginx -t && sudo systemctl status nginx

# View system resources
htop
```

---

**Questions or issues?** Check the logs first (`pm2 logs`) and refer to the troubleshooting section.
