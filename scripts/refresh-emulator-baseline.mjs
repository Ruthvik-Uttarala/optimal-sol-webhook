import { rmSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

try {
  rmSync("emulator-data/baseline", { recursive: true, force: true });
} catch (_err) {
  // no-op
}

mkdirSync("emulator-data/baseline", { recursive: true });

const child = spawn(
  npxCommand,
  [
    "firebase",
    "emulators:exec",
    "--project",
    "parking-sol-local",
    "--only",
    "auth,firestore",
    "--import=./emulator-data/baseline",
    "--export-on-exit=./emulator-data/baseline",
    "node scripts/seed-emulator.mjs"
  ],
  { stdio: "inherit" }
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
