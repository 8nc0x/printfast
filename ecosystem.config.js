// PrintFlow/PrintPass — PM2 process definitions (STRICT: everything runs under PM2).
// Start/reload with:  pm2 startOrReload ecosystem.config.js --env production
// Persist on boot:    pm2 startup && pm2 save

const os = require('os');

const WEB_PORT = process.env.WEB_PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  apps: [
    // ── Web (Next.js standalone) ────────────────────────────────────────────
    {
      name: 'printflow-web',
      cwd: __dirname,
      script: 'apps/web/.next/standalone/apps/web/server.js',
      args: [],
      env: {
        NODE_ENV: 'production',
        PORT: WEB_PORT,
        HOSTNAME: '127.0.0.1',
      },
      // Cluster across all cores. Next standalone + JWT sessions are cluster-safe.
      instances: isProd ? os.cpus().length : 1,
      exec_mode: isProd ? 'cluster' : 'fork',
      max_memory_restart: '600M',
      kill_timeout: 10000, // graceful drain for SSE connections
      wait_ready: false,
      autorestart: true,
      env_file: '/etc/printflow.env', // loaded by pm2 via --update-env at shell level
    },

    // ── Payments reconcile (PayXmint check-status sweep) ───────────────────
    // Fulfills/expires stale PENDING payments if the webhook was missed.
    {
      name: 'printflow-reconcile',
      cwd: __dirname,
      script: 'workers/payments.mjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      cron_restart: '*/5 * * * *',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },

    // ── Maintenance cron ──────────────────────────────────────────────────
    // Expiry, subscription dunning, pairing-token cleanup.
    {
      name: 'printflow-cron',
      cwd: __dirname,
      script: 'workers/cron.mjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      cron_restart: '*/10 * * * *',
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
