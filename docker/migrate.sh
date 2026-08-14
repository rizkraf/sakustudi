#!/bin/sh
# One-shot migration + seed for the production image. Runs before web/worker
# start in compose (profile "tools").
set -eu
node build/worker/migrate.js
node build/worker/seed.js
