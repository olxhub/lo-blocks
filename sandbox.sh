#!/bin/sh
#
# Optional firejail sandbox wrapper.
#
# We support firejail for sandboxing npm scripts. This reduces (but does
# not eliminate) the security perimeter when prototyping with many npm
# packages -- e.g. if a compromised package is pulled in, firejail limits
# what it can access on disk and over the network. It also provides
# defense-in-depth when running on a server.
#
# Firejail is not required, but recommended. On Ubuntu it's just:
#   sudo apt-get install firejail
#
# We made it optional since it doesn't work on macOS and we want the
# project to be easy to set up everywhere: npm install && npm run build && npm run dev
#
if command -v firejail >/dev/null 2>&1; then
  exec firejail --profile="$(pwd)/firejail.profile" --whitelist="$(pwd)" "$@"
else
  echo "WARNING: Running without a sandbox. For a sandbox, please install and configure firejail." >&2
  exec "$@"
fi
