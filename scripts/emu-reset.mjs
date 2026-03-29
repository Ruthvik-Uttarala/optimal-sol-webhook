import { rmSync } from "node:fs";
import { spawn } from "node:child_process";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

try {
  rmSync("emulator-data/_last", { recursive: true, force: true });
} catch (_err) {
  // no-op
}

const child = spawn(
  npxCommand,
  [
    "firebase",
    "emulators:start",
    "--project",
    "parking-sol-local",
    "--import=./emulator-data/baseline",
    "--export-on-exit=./emulator-data/_last"
  ],
  { stdio: "inherit" }
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
