#!/usr/bin/env bash
# Builds the web app as a self-contained bundle for shared cPanel ("Setup Node.js App" / Passenger), which has no
# Docker and no pnpm. See README "Deploy (shared cPanel)". Output: dist/rxpad-cpanel.tar.gz
#   Upload it to your home folder (NOT public_html) and extract: that creates ~/rxpad. Application root rxpad,
#   startup file index.js. Don't run "NPM install".
# No env vars are baked in at build time; set them all in the cPanel Node.js app screen.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm --filter web build

WEB=apps/web
OUT=$WEB/.next/standalone
# The build has just recreated .next, so the staging folder starts empty.
STAGE=$WEB/.next/cpanel
# Everything sits in one top folder, so extracting can't spill files into public_html (where Apache would serve them
# as plain files, and the domain shows 403 or a file listing instead of the app).
APP=$STAGE/rxpad

# pnpm's standalone output links packages together with symlinks, and cPanel's File Manager doesn't reliably restore
# symlinks on extract. Copying them as files breaks pnpm's layout (a package finds its deps only as siblings inside
# .pnpm), so lay node_modules out flat at the bundle root, the way npm would. Any package that appears twice is an error.
mkdir -p "$APP/node_modules"
for pkg in "$OUT"/node_modules/.pnpm/*/node_modules/* "$OUT"/node_modules/.pnpm/*/node_modules/@*/*; do
  [ -d "$pkg" ] && [ ! -L "$pkg" ] || continue
  name=${pkg#"$OUT"/node_modules/.pnpm/*/node_modules/}
  case $name in @*/*) ;; @*) continue ;; esac # a scope folder; its packages come from the second glob
  if [ -e "$APP/node_modules/$name" ]; then
    echo "error: $name is in the bundle twice (two versions?); a flat node_modules can't hold both" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$APP/node_modules/$name")"
  cp -RL "$pkg" "$APP/node_modules/$name"
done
# The app itself, minus its node_modules (only a link to next, now at the root). -L turns the links Next makes for
# serverExternalPackages (.next/node_modules/postgres-<hash>) into copies; their deps resolve from the root.
mkdir -p "$APP/$WEB"
rsync -aL --exclude=/node_modules "$OUT/$WEB/" "$APP/$WEB/"
# server.js serves these itself, but the standalone output doesn't copy them (Next "output" docs).
cp -R "$WEB/public/." "$APP/$WEB/public/"
cp -R "$WEB/.next/static" "$APP/$WEB/.next/static"
# cPanel's Node.js app screen expects a startup file at the app root. server.js is an ES module, and import() loads
# it on any Node version (require() of ESM needs Node 20.19+/22.12+).
cat > "$APP/index.js" <<'EOF'
// cPanel startup file: starts the Next.js server (apps/web/server.js chdirs to its own folder).
import("./apps/web/server.js").catch((err) => {
  console.error(err);
  process.exit(1);
});
EOF
cat > "$APP/DEPLOY-CPANEL.txt" <<'EOF'
RxPad on shared cPanel (full notes: README "Deploy (shared cPanel)")

The app must NOT live in public_html. If public_html shows 403 or a file listing, the app was put there:
delete apps/, node_modules/ and index.js from public_html (keep .htaccess), delete the old app in
Setup Node.js App, then follow these steps.

1. File Manager: open your home folder (/home/<user>), upload this archive, Extract. You get /home/<user>/rxpad.
2. Setup Node.js App -> Create Application:
     Node.js version      20.9 or newer
     Application mode     Production
     Application root     rxpad
     Application URL      your domain (leave the path empty)
     Startup file         index.js
   Add the environment variables (DATABASE_URL, DATABASE_URL_APP, SESSION_SECRET, POWERSYNC_URL,
   POWERSYNC_JWT_SECRET, POWERSYNC_JWT_KID, PUBLIC_BASE_URL, CRON_SECRET, SMS/email/SSLCommerz as used),
   then Create and Start. Do NOT click "Run NPM Install": node_modules is already included.
3. public_html/.htaccess should now have a "CLOUDLINUX PASSENGER CONFIGURATION" block with
   PassengerAppRoot "/home/<user>/rxpad". Remove any index.html / index.php left in public_html.
4. Open https://<domain>/ : it should go to /login. If it shows an error, read /home/<user>/rxpad/stderr.log.

Updating: upload the new archive to the home folder, Extract over the old files, then Restart the app.
EOF

if [ -n "$(find "$STAGE" -type l)" ]; then
  echo "error: symlinks left in the bundle:" >&2
  find "$STAGE" -type l >&2
  exit 1
fi

mkdir -p dist
# COPYFILE_DISABLE keeps macOS ._ metadata files out of the archive.
COPYFILE_DISABLE=1 tar -C "$STAGE" -czf dist/rxpad-cpanel.tar.gz rxpad
echo "dist/rxpad-cpanel.tar.gz ($(du -h dist/rxpad-cpanel.tar.gz | cut -f1)): extract in your home folder -> ~/rxpad, startup file index.js"
