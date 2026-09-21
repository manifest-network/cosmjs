const { cpSync, rmSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

rmSync("build", { recursive: true, force: true });
const result = spawnSync(process.execPath, [require.resolve("typescript/bin/tsc")], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
cpSync("src/generated", "build/generated", { recursive: true });
