#!/usr/bin/env bash
# Usage: verify-deployed-site.sh <base-url>
# Exercises a freshly deployed, empty Kide site: first-run setup, login, admin pages,
# create + publish a page and render it, upload an image and fetch a resized rendition.
set -u
BASE="${1%/}"
EMAIL="admin@example.com"
PW="$(openssl rand -hex 16)"
fail=0
ok() { echo "  ✓ $1"; }
bad() { echo "  ✗ $1"; fail=1; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

# A just-deployed Worker propagates unevenly across the edge; one good response isn't enough.
streak=0
for _ in $(seq 1 40); do
  loc=$(curl -s -o /dev/null -D - "$BASE/admin" | grep -i '^location:' | tr -d '\r' | awk '{print $2}')
  [[ "$loc" == */admin/setup ]] && streak=$((streak + 1)) || streak=0
  [[ $streak -ge 5 ]] && break
  sleep 2
done
[[ $streak -ge 5 ]] && ok "/admin redirects to setup" || { bad "/admin redirected to '$loc'"; exit 1; }

s=$(curl -s -o /dev/null -D - -X POST -H "Origin: $BASE" \
  --data-urlencode "name=CI Admin" --data-urlencode "email=$EMAIL" \
  --data-urlencode "password=$PW" --data-urlencode "confirmPassword=$PW" \
  "$BASE/api/cms/auth/setup" | grep -i '^location:' | tr -d '\r')
[[ -n "$s" && "$s" != *error* ]] && ok "setup created the admin" || bad "setup failed ($s)"

hdr=$(curl -s -o /dev/null -D - -X POST -H "Origin: $BASE" \
  --data-urlencode "email=$EMAIL" --data-urlencode "password=$PW" "$BASE/api/cms/auth/login")
COOKIE=$(echo "$hdr" | grep -i '^set-cookie: cms_session=' | head -1 | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1)
[[ -n "$COOKIE" ]] && ok "login sets a session cookie" || { bad "login failed"; exit 1; }

for path in /admin/recent /admin/pages /admin/pages/new /admin/assets /admin/users; do
  body=$(curl -s -w '\n%{http_code}' -H "Cookie: $COOKIE" "$BASE$path")
  c="${body##*$'\n'}"
  [[ "$c" == 200 ]] && ok "GET $path" || bad "GET $path returned $c: $(echo "${body%$'\n'*}" | head -c 200)"
done

SLUG="ci-$(date +%s)"
created=$(curl -s -X POST -H "Origin: $BASE" -H "Cookie: $COOKIE" -H "Content-Type: application/json" \
  -d "{\"title\":\"CI page\",\"slug\":\"$SLUG\",\"body\":{\"type\":\"root\",\"children\":[{\"type\":\"paragraph\",\"children\":[{\"type\":\"text\",\"value\":\"Hello from CI\"}]}]}}" \
  "$BASE/api/cms/pages")
ID=$(echo "$created" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("_id",""))' 2>/dev/null)
[[ -n "$ID" ]] && ok "created a page" || bad "create page failed: ${created:0:200}"
if [[ -n "$ID" ]]; then
  c=$(code -X POST -H "Origin: $BASE" -H "Cookie: $COOKIE" -H "Content-Type: application/json" "$BASE/api/cms/pages/$ID/publish")
  [[ "$c" == 200 ]] && ok "published the page" || bad "publish returned $c"
  curl -s "$BASE/$SLUG" | grep -q "Hello from CI" && ok "public page renders the body" || bad "public /$SLUG is missing the body"
fi

PNG="$(mktemp).png"
python3 - "$PNG" <<'EOF'
import sys, zlib, struct
w = h = 64
rows = b"".join(b"\x00" + b"".join(bytes([(x * 4) % 256, (y * 4) % 256, 128]) for x in range(w)) for y in range(h))
def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
open(sys.argv[1], "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))
EOF
up=$(curl -s -X POST -H "Origin: $BASE" -H "Cookie: $COOKIE" -F "file=@$PNG;type=image/png" "$BASE/api/cms/assets/upload")
URL=$(echo "$up" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("url",""))' 2>/dev/null)
rm -f "$PNG"
[[ -n "$URL" ]] && ok "uploaded an image" || bad "upload failed: ${up:0:200}"
if [[ -n "$URL" ]]; then
  c=$(code "$BASE$URL")
  [[ "$c" == 200 ]] && ok "original is served from R2" || bad "original returned $c"
  ct=$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$BASE/api/cms/img$URL?w=320")
  [[ "$ct" == "200 image/"* ]] && ok "resized rendition ($ct)" || bad "rendition returned $ct"
fi

exit $fail
