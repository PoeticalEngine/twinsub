#!/bin/zsh
# Sets the Dodo secrets on the twinsub-api Worker. Paste each value when wrangler asks; nothing is echoed or saved.
# Usage: scripts/dodo-secrets.sh [test|live] [webhook]   (webhook: set only the signing secret)
set -e
cd "$(dirname "$0")/.."
LW="/Volumes/exernal SSD/MacData/Development/little-weekend"
(cd "$LW" && cf d1 query 815d0e44-47de-4ddd-8193-00f84b846c96 --sql "SELECT 1" >/dev/null)
export CLOUDFLARE_ACCOUNT_ID=a8a946d0976509a9dc2be14db6964c50
export CLOUDFLARE_API_TOKEN=$(python3 -c "import json,os;print(json.load(open(os.path.expanduser('~/Library/Preferences/cloudflare/config/default.json')))['oauth_token'])")
P=$([ "$1" = live ] && echo DODO_LIVE_ || echo DODO_)
if [ "$2" != webhook ]; then
  echo "Paste the Dodo API key (${1:-test} mode):"
  "$LW/node_modules/.bin/wrangler" secret put ${P}API_KEY
fi
echo "Paste the webhook signing secret (whsec_…) of https://api.poeticalengine.com/v1/dodo:"
"$LW/node_modules/.bin/wrangler" secret put ${P}WEBHOOK_SECRET
