#!/usr/bin/env bash
# 一次性把 Tailwind 编译成静态 CSS；运行时零依赖、断网可跑。
set -euo pipefail
cd "$(dirname "$0")/.."

TAILWIND=""
if [ -x node_modules/.bin/tailwindcss ]; then
  TAILWIND=node_modules/.bin/tailwindcss
elif [ -x /home/feifei/develop/ilyrics/node_modules/.bin/tailwindcss ]; then
  TAILWIND=/home/feifei/develop/ilyrics/node_modules/.bin/tailwindcss
else
  TAILWIND="npx --yes tailwindcss"
fi

$TAILWIND -i styles/input.css -o public/tailwind.css --minify
echo "built public/tailwind.css"
