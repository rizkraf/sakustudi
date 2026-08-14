#!/bin/sh
# Health check for web/worker containers. Requires the app on PORT (default
# 3000) and PostgreSQL + Redis reachable via env, else exits nonzero.
set -eu

if [ -n "${PORT:-}" ]; then
  node -e "fetch('http://localhost:${PORT:-3000}/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
fi

node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
pool.query('SELECT 1').then(() => { pool.end(); }).catch(() => process.exit(1));
"
