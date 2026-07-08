#!/usr/bin/env node
/**
 * Install t3code onto the local system:
 *   - Symlinks the `t3` CLI (apps/server/dist/bin.mjs) into ~/.local/bin
 *   - Ensures the Electron runtime is available for the desktop app
 *   - Installs a .desktop entry that launches the Electron desktop app
 *
 * Usage:
 *   node scripts/install.ts [--prefix <dir>] [--uninstall]
 *
 * --prefix   Destination prefix for install (default: ~/.local). The CLI goes
 *            to <prefix>/bin and the .desktop entry to <prefix>/share/applications.
 * --uninstall  Remove the installed files instead of creating them.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as NodeChildProcess from "node:child_process";

const __dirname = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const repoRoot = NodePath.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  NodeFS.mkdirSync(dir, { recursive: true });
}

function exists(p: string): boolean {
  try {
    NodeFS.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function rmIfExists(p: string): void {
  if (exists(p)) {
    NodeFS.rmSync(p, { force: true });
    console.log(`  removed ${p}`);
  }
}

function runChecked(command: string, args: ReadonlyArray<string>): void {
  const result = NodeChildProcess.spawnSync(command, args as string[], { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

const serverBin = NodePath.join(repoRoot, "apps", "server", "dist", "bin.mjs");
const desktopDir = NodePath.join(repoRoot, "apps", "desktop");
const electronMain = NodePath.join(desktopDir, "dist-electron", "main.cjs");
const iconPng = NodePath.join(desktopDir, "resources", "icon.png");
const desktopAppId = "com.t3tools.t3code";

interface InstallOptions {
  prefix: string;
  uninstall: boolean;
}

function parseArgs(): InstallOptions {
  const args = process.argv.slice(2);
  let prefix = NodePath.join(NodeOS.homedir(), ".local");
  let uninstall = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--prefix") {
      prefix = args[++i] ?? prefix;
    } else if (arg === "--uninstall") {
      uninstall = true;
    } else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  return { prefix, uninstall };
}

function printUsage(): void {
  console.log(`Usage: node scripts/install.ts [options]

Options:
  --prefix <dir>   Install prefix (default: ~/.local)
  --uninstall       Remove installed files instead of creating them
  -h, --help        Show this help
`);
}

// ---------------------------------------------------------------------------
// CLI symlink
// ---------------------------------------------------------------------------

function installCli(options: InstallOptions): void {
  const binDir = NodePath.join(options.prefix, "bin");
  const cliTarget = NodePath.join(binDir, "t3");

  if (options.uninstall) {
    rmIfExists(cliTarget);
    return;
  }

  ensureDir(binDir);

  if (!exists(serverBin)) {
    throw new Error(`Server build not found at ${serverBin}. Run 'npm run build' first.`);
  }

  // Always rewrite so the link points to the current build.
  NodeFS.rmSync(cliTarget, { force: true });
  NodeFS.symlinkSync(serverBin, cliTarget);
  NodeFS.chmodSync(serverBin, 0o755);
  console.log(`  linked ${cliTarget} -> ${serverBin}`);
}

// ---------------------------------------------------------------------------
// Electron runtime
// ---------------------------------------------------------------------------

function ensureElectron(): string {
  const ensureScript = NodePath.join(desktopDir, "scripts", "ensure-electron-runtime.mjs");
  if (!exists(ensureScript)) {
    throw new Error(`Electron runtime script not found at ${ensureScript}`);
  }

  const result = NodeChildProcess.spawnSync("node", [ensureScript], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    throw new Error("Failed to ensure Electron runtime.");
  }

  const electronPath = result.stdout.trim();
  if (!electronPath) {
    throw new Error("ensure-electron-runtime.mjs returned an empty path.");
  }
  return electronPath;
}

// ---------------------------------------------------------------------------
// Launcher wrapper script
// ---------------------------------------------------------------------------

function installLauncher(electronPath: string, options: InstallOptions): void {
  const binDir = NodePath.join(options.prefix, "bin");
  const launcherTarget = NodePath.join(binDir, "t3code-desktop");
  const desktopEntryTarget = NodePath.join(
    options.prefix,
    "share",
    "applications",
    "t3code.desktop",
  );

  if (options.uninstall) {
    rmIfExists(launcherTarget);
    rmIfExists(desktopEntryTarget);
    return;
  }

  if (!exists(electronMain)) {
    throw new Error(
      `Desktop build not found at ${electronMain}. Run 'npm run build:desktop' first.`,
    );
  }

  ensureDir(binDir);
  ensureDir(NodePath.dirname(desktopEntryTarget));

  // Electron on Linux needs a sandbox helper with suid or --no-sandbox.
  // The launcher mirrors the logic from electron-launcher.mjs.
  const launcherScript = `#!/bin/sh
# Auto-generated by scripts/install.ts - do not edit.
exec ${JSON.stringify(electronPath)} --no-sandbox ${JSON.stringify(electronMain)} "$@"
`;

  NodeFS.writeFileSync(launcherTarget, launcherScript);
  NodeFS.chmodSync(launcherTarget, 0o755);
  console.log(`  installed launcher ${launcherTarget}`);

  // .desktop entry
  const desktopEntry = `[Desktop Entry]
Type=Application
Name=T3 Code
GenericName=Coding Agent GUI
Comment=Minimal web GUI for coding agents
Exec=${launcherTarget} %U
Icon=${iconPng}
Terminal=false
Categories=Development;Utility;
StartupWMClass=t3code
MimeType=x-scheme-handler/t3code;
`;

  NodeFS.writeFileSync(desktopEntryTarget, desktopEntry);
  console.log(`  installed desktop entry ${desktopEntryTarget}`);

  // Register with desktop database if available
  if (exists("/usr/bin/update-desktop-database")) {
    try {
      runChecked("update-desktop-database", [NodePath.dirname(desktopEntryTarget)]);
    } catch {
      // non-fatal
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const options = parseArgs();
  console.log(`t3code install (prefix: ${options.prefix})`);

  if (options.uninstall) {
    console.log("Uninstalling...");
  } else {
    console.log("Installing CLI symlink...");
  }
  installCli(options);

  if (!options.uninstall) {
    console.log("Ensuring Electron runtime...");
    const electronPath = ensureElectron();
    console.log("Installing desktop launcher + .desktop entry...");
    installLauncher(electronPath, options);
    console.log("\nDone. Make sure these are on your PATH:");
    console.log(`  ${NodePath.join(options.prefix, "bin")}`);
    console.log("You may need to log out and back in, or run:");
    console.log(`  export PATH="${NodePath.join(options.prefix, "bin")}:$PATH"`);
  } else {
    console.log("\nUninstall complete.");
  }
}

main();
