#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(output || `${command} ${args.join(" ")} failed`);
  }
  return result.stdout;
}

function listAvailableDevices() {
  const output = run("xcrun", ["simctl", "list", "devices", "available", "--json"]);
  const payload = JSON.parse(output);
  return Object.values(payload.devices ?? {})
    .flat()
    .filter((device) => device.isAvailable);
}

function pickIpad(devices) {
  const requestedDevice = process.env.T3CODE_IOS_DEVICE;
  const ipads = devices.filter((device) =>
    String(device.deviceTypeIdentifier ?? "").includes("iPad"),
  );

  if (ipads.length === 0) {
    throw new Error(
      "No available iPad simulators found. Install one from Xcode > Settings > Platforms.",
    );
  }

  if (requestedDevice) {
    const match = ipads.find(
      (device) => device.name === requestedDevice || device.udid === requestedDevice,
    );
    if (!match) {
      throw new Error(`Requested iPad simulator was not found: ${requestedDevice}`);
    }
    return match;
  }

  const booted = ipads.find((device) => device.state === "Booted");
  if (booted) {
    return booted;
  }

  return (
    ipads.find((device) => device.name === "iPad Pro 13-inch (M5)") ??
    ipads.find((device) => device.name.includes("iPad Pro 13-inch")) ??
    ipads.find((device) => device.name.includes("iPad Air 13-inch")) ??
    ipads.find((device) => device.name.includes("iPad Pro")) ??
    ipads[0]
  );
}

const ipad = pickIpad(listAvailableDevices());

if (ipad.state !== "Booted") {
  run("xcrun", ["simctl", "boot", ipad.udid]);
}

spawnSync("open", ["-a", "Simulator"], { stdio: "ignore" });

console.log(`Launching T3 Code on ${ipad.name} (${ipad.udid})`);

const child = spawn("expo", ["run:ios", "--device", ipad.udid], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }
  process.exit(code ?? 1);
});
