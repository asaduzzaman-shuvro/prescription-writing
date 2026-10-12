/**
 * After `pnpm --filter web build`, lay the standalone app out for shared cPanel.
 * Writes dist/ (index.js at the root) and rxpad-cpanel.zip (same files, no extra folder).
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, "apps/web/.next/standalone");
const dist = path.join(root, "dist");
const zip = path.join(root, "rxpad-cpanel.zip");

function versionParts(v) {
  return String(v).split(".").map((n) => Number.parseInt(n, 10) || 0);
}

function cmp(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

function readVersion(dir) {
  try {
    return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

if (!existsSync(path.join(standalone, "apps/web/server.js"))) {
  console.error("Missing apps/web/.next/standalone. Run: pnpm --filter web build");
  process.exit(1);
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(path.join(dist, "node_modules"), { recursive: true });

const pnpm = path.join(standalone, "node_modules/.pnpm");
const kept = new Map();

function consider(pkgDir, nmDir) {
  let st;
  try {
    st = lstatSync(pkgDir);
  } catch {
    return;
  }
  if (!st.isDirectory() || st.isSymbolicLink()) return;
  const name = path.relative(nmDir, pkgDir);
  if (!name || name.startsWith("..") || name === ".bin") return;
  const dest = path.join(dist, "node_modules", name);
  const version = readVersion(pkgDir);
  const prev = kept.get(name);
  if (prev) {
    if (versionParts(version)[0] !== versionParts(prev.version)[0]) {
      throw new Error(`${name} has two major versions (${prev.version} and ${version})`);
    }
    if (cmp(version, prev.version) <= 0) return;
    rmSync(dest, { recursive: true, force: true });
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(pkgDir, dest, { recursive: true, dereference: true });
  kept.set(name, { version });
}

for (const entry of readdirSync(pnpm)) {
  const mods = path.join(pnpm, entry, "node_modules");
  if (!existsSync(mods)) continue;
  for (const child of readdirSync(mods)) {
    const childPath = path.join(mods, child);
    if (child.startsWith("@")) {
      if (!statSync(childPath).isDirectory()) continue;
      for (const inner of readdirSync(childPath)) consider(path.join(childPath, inner), mods);
    } else {
      consider(childPath, mods);
    }
  }
}

const webSrc = path.join(standalone, "apps/web");
const webDest = path.join(dist, "apps/web");
mkdirSync(webDest, { recursive: true });
for (const child of readdirSync(webSrc)) {
  if (child === "node_modules") continue;
  cpSync(path.join(webSrc, child), path.join(webDest, child), { recursive: true, dereference: true });
}
cpSync(path.join(root, "apps/web/public"), path.join(webDest, "public"), { recursive: true, dereference: true });
cpSync(path.join(root, "apps/web/.next/static"), path.join(webDest, ".next/static"), { recursive: true, dereference: true });
cpSync(path.join(root, "apps/web/.env.production"), path.join(webDest, ".env.production"));

writeFileSync(
  path.join(dist, "index.js"),
  `// cPanel startup file. apps/web/server.js changes to its own folder.
import("./apps/web/server.js").catch((err) => {
  console.error(err);
  process.exit(1);
});
`,
);

function findLinks(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = lstatSync(p);
    if (st.isSymbolicLink()) acc.push(p);
    else if (st.isDirectory()) findLinks(p, acc);
  }
  return acc;
}

const links = findLinks(dist);
if (links.length) {
  console.error("symlinks left in dist:", links.slice(0, 10).join("\n"));
  process.exit(1);
}

for (const file of ["index.js", "apps/web/server.js", "apps/web/.env.production", "node_modules/next/package.json"]) {
  if (!existsSync(path.join(dist, file))) {
    console.error("dist is missing", file);
    process.exit(1);
  }
}

rmSync(zip, { force: true });
execFileSync("tar", ["-a", "-cf", zip, "-C", dist, "."], { stdio: "inherit" });
console.log(`dist/ and rxpad-cpanel.zip ready (${kept.size} packages)`);
