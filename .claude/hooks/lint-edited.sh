#!/bin/sh
# PostToolUse (Edit|Write): redaktə olunan src/tests JS faylını eslint-dən keçirir.
# Xəta varsa exit 2 — mətn Claude-a qayıdır və dərhal düzəldilir.
f=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$f" in
  "$root"/src/*.js|"$root"/tests/*.js|"$root"/server/*.mjs) ;;
  *) exit 0 ;;
esac
[ -x "$root/node_modules/.bin/eslint" ] || exit 0
out=$("$root/node_modules/.bin/eslint" --quiet "$f" 2>&1) || { echo "$out" >&2; exit 2; }
exit 0
