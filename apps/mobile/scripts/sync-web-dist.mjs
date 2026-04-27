import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { relative, resolve, sep } from "node:path";

const mobileRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(mobileRoot, "../..");
const webDist = resolve(repoRoot, "apps/web/dist");
const archiveDir = resolve(mobileRoot, "assets/web-archive");
const generatedFile = resolve(mobileRoot, "src/generated/webBundleAssets.ts");

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      yield* walk(path);
    } else if (entry.isFile()) {
      yield path;
    }
  }
}

function toPosixPath(path) {
  return path.split(sep).join("/");
}

function archiveName(relativePath) {
  return `${Buffer.from(relativePath).toString("base64url")}.bundle`;
}

const files = [];
for await (const file of walk(webDist)) {
  const relativePath = toPosixPath(relative(webDist, file));
  files.push({ file, relativePath, archiveFile: resolve(archiveDir, archiveName(relativePath)) });
}
files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

if (!files.some((file) => file.relativePath === "index.html")) {
  throw new Error(`Missing index.html in ${webDist}`);
}

await rm(archiveDir, { force: true, recursive: true });
await mkdir(archiveDir, { recursive: true });
await mkdir(resolve(mobileRoot, "src/generated"), { recursive: true });

for (const file of files) {
  await cp(file.file, file.archiveFile);
}

const versionHash = createHash("sha256");
for (const file of files) {
  versionHash.update(file.relativePath);
  versionHash.update("\0");
  versionHash.update(await readFile(file.file));
  versionHash.update("\0");
}

const generated = `export const WEB_BUNDLE_VERSION = ${JSON.stringify(
  versionHash.digest("hex").slice(0, 16),
)};

export const WEB_BUNDLE_ASSETS = {
${files
  .map(
    (file) =>
      `  ${JSON.stringify(file.relativePath)}: require(${JSON.stringify(
        `../../assets/web-archive/${archiveName(file.relativePath)}`,
      )}),`,
  )
  .join("\n")}
} as const;
`;

await writeFile(generatedFile, generated);

console.log(`Synced ${files.length} web bundle assets into ${archiveDir}`);
