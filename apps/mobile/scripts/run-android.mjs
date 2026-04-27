#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileRoot = dirname(scriptDir);
const requireFromMobile = createRequire(join(mobileRoot, "package.json"));

const isWindows = process.platform === "win32";
const javaBinName = isWindows ? "java.exe" : "java";

function javaExecutable(javaHome) {
  return join(javaHome, "bin", javaBinName);
}

function parseJavaMajor(versionOutput) {
  const match = versionOutput.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  const first = Number(match[1]);
  if (first === 1 && match[2]) {
    return Number(match[2]);
  }
  return first;
}

function readJavaVersion(javaPath) {
  const result = spawnSync(javaPath, ["-version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return null;
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const major = parseJavaMajor(output);
  return major === null ? null : { major, output };
}

function javaCandidate(javaHome, label) {
  if (!javaHome) return null;
  const executable = javaExecutable(javaHome);
  if (!existsSync(executable)) return null;
  const version = readJavaVersion(executable);
  return version ? { home: javaHome, executable, label, ...version } : null;
}

function androidStudioJavaHomes() {
  if (!isWindows) {
    return [
      "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
      "/Applications/Android Studio.app/Contents/jre/Contents/Home",
    ];
  }

  const localAppData = process.env.LOCALAPPDATA;
  return [
    "C:\\Program Files\\Android\\Android Studio\\jbr",
    "C:\\Program Files\\Android\\Android Studio\\jre",
    localAppData ? join(localAppData, "Programs", "Android Studio", "jbr") : null,
    localAppData ? join(localAppData, "Programs", "Android Studio", "jre") : null,
  ].filter(Boolean);
}

function pathJavaCandidate() {
  const result = spawnSync("java", ["-version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return null;
  }

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const major = parseJavaMajor(output);
  if (major === null) return null;
  return { home: null, executable: "java", label: "PATH", major, output };
}

function isSupportedJava(candidate) {
  return candidate.major >= 17 && candidate.major <= 24;
}

function sdkCandidates() {
  const localAppData = process.env.LOCALAPPDATA;
  const home = process.env.HOME;
  return [
    process.env.T3CODE_ANDROID_HOME,
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    localAppData ? join(localAppData, "Android", "Sdk") : null,
    home ? join(home, "Library", "Android", "sdk") : null,
    home ? join(home, "Android", "Sdk") : null,
    "/opt/android-sdk",
  ].filter(Boolean);
}

function isAndroidSdk(path) {
  return existsSync(join(path, "platforms")) && existsSync(join(path, "platform-tools"));
}

function pickAndroidSdk() {
  const requested = process.env.T3CODE_ANDROID_HOME;
  if (requested && !isAndroidSdk(requested)) {
    throw new Error(`T3CODE_ANDROID_HOME does not point to a valid Android SDK: ${requested}`);
  }

  const sdk = sdkCandidates().find(isAndroidSdk);
  if (sdk) return sdk;

  throw new Error(
    [
      "No Android SDK location found.",
      "Install the Android SDK in Android Studio or set T3CODE_ANDROID_HOME/ANDROID_HOME to your SDK path.",
      isWindows
        ? "Expected default path: %LOCALAPPDATA%\\Android\\Sdk"
        : "Expected default paths: ~/Library/Android/sdk or ~/Android/Sdk",
    ].join("\n"),
  );
}

function pickJava() {
  const requested = javaCandidate(process.env.T3CODE_ANDROID_JAVA_HOME, "T3CODE_ANDROID_JAVA_HOME");
  if (process.env.T3CODE_ANDROID_JAVA_HOME && !requested) {
    throw new Error(
      `T3CODE_ANDROID_JAVA_HOME does not point to a working JDK: ${process.env.T3CODE_ANDROID_JAVA_HOME}`,
    );
  }

  const candidates = [
    requested,
    ...androidStudioJavaHomes().map((home) => javaCandidate(home, "Android Studio JBR")),
    javaCandidate(process.env.JAVA_HOME, "JAVA_HOME"),
    pathJavaCandidate(),
  ].filter(Boolean);

  const supported = candidates.find(isSupportedJava);
  if (supported) return supported;

  const discovered = candidates
    .map((candidate) => `${candidate.label}: Java ${candidate.major}`)
    .join("\n");
  throw new Error(
    [
      "No supported Java runtime found for the Android build.",
      "Install Android Studio or set T3CODE_ANDROID_JAVA_HOME to a JDK 17-24 install.",
      discovered ? `Detected:\n${discovered}` : "No Java runtimes were detected.",
    ].join("\n"),
  );
}

function patchExpoModulesCoreCxxBuildDirectory() {
  if (!isWindows) return;

  const packageJson = requireFromMobile.resolve("expo-modules-core/package.json");
  const buildGradle = join(dirname(packageJson), "android", "build.gradle");
  const buildStagingDirectory =
    'buildStagingDirectory file("${rootProject.buildDir}/cxx/${project.name}")';
  const current = readFileSync(buildGradle, "utf8");
  if (current.includes(buildStagingDirectory)) {
    return;
  }

  const updated = current.replace(
    /cmake \{\r?\n\s+path "CMakeLists\.txt"\r?\n\s+\}/,
    `cmake {\n      path "CMakeLists.txt"\n      ${buildStagingDirectory}\n    }`,
  );
  if (updated === current) {
    throw new Error(`Could not patch expo-modules-core CMake build directory in ${buildGradle}`);
  }

  writeFileSync(buildGradle, updated);
}

const java = pickJava();
const androidSdk = pickAndroidSdk();
patchExpoModulesCoreCxxBuildDirectory();

const javaHome = java.home ?? process.env.JAVA_HOME;
const pathEntries = [
  java.home ? join(java.home, "bin") : null,
  join(androidSdk, "platform-tools"),
  join(androidSdk, "emulator"),
  join(androidSdk, "cmdline-tools", "latest", "bin"),
  process.env.PATH,
].filter(Boolean);
const env = {
  ...process.env,
  ...(javaHome ? { JAVA_HOME: javaHome } : {}),
  ANDROID_HOME: androidSdk,
  ANDROID_SDK_ROOT: androidSdk,
  ORG_GRADLE_PROJECT_newArchEnabled: "false",
  PATH: pathEntries.join(delimiter),
};

console.log(`Using ${java.label}: Java ${java.major}${java.home ? ` (${java.home})` : ""}`);
console.log(`Using Android SDK: ${androidSdk}`);

const child = spawn("expo", ["run:android", ...process.argv.slice(2)], {
  cwd: mobileRoot,
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
