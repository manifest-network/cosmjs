#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Build against the same published CosmJS packages consumers install, without
// relying on monorepo workspace artifacts or publishing unrelated workspaces.
const root = fileURLToPath(new URL("../", import.meta.url));
assert.equal(process.argv.length, 3, "Usage: node scripts/build-manifest-stargate.mjs OUTPUT_DIRECTORY");
const output = resolve(process.argv[2]);
const fromRoot = relative(root, output);
assert.ok(
  fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot),
  "Output must be outside this repository",
);
mkdirSync(output, { recursive: true });
const stage = mkdtempSync(join(output, "stargate-"));
const source = join(root, "packages/stargate");
const manifest = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
assert.equal(manifest.name, "@manifest-network/stargate");
const workspaces = new Map(
  readdirSync(join(root, "packages")).map((directory) => {
    const entry = JSON.parse(readFileSync(join(root, "packages", directory, "package.json"), "utf8"));
    return [entry.name, entry.version];
  }),
);
for (const field of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(manifest[field] ?? {})) {
    if (!version.startsWith("workspace:")) continue;
    assert.ok(workspaces.has(name), `Missing workspace ${name}`);
    assert.equal(version, "workspace:^", `Unsupported workspace declaration ${name}: ${version}`);
    manifest[field][name] = `^${workspaces.get(name)}`;
  }
}
manifest.repository = {
  type: "git",
  url: "git+https://github.com/manifest-network/cosmjs.git",
  directory: "packages/stargate",
};
writeFileSync(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
cpSync(join(source, "src"), join(stage, "src"), { recursive: true });
for (const name of readdirSync(source).filter((name) => name.endsWith(".md")))
  cpSync(join(source, name), join(stage, name));
cpSync(join(root, "LICENSE"), join(stage, "LICENSE"));
cpSync(join(root, "tsconfig.json"), join(stage, "tsconfig.base.json"));
const config = JSON.parse(readFileSync(join(source, "tsconfig.json"), "utf8"));
config.extends = "./tsconfig.base.json";
writeFileSync(join(stage, "tsconfig.json"), `${JSON.stringify(config, null, 2)}\n`);
cpSync(join(root, "jasmine-spec-reporter.config.json"), join(stage, "jasmine-spec-reporter.config.json"));
writeFileSync(
  join(stage, "jasmine-testrunner.js"),
  readFileSync(join(source, "jasmine-testrunner.js"), "utf8").replace(
    "../../jasmine-spec-reporter.config.json",
    "./jasmine-spec-reporter.config.json",
  ),
);

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: stage,
    env: process.env,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed\n${capture ? result.stderr : ""}`);
  return result.stdout;
}
console.log(`Standalone Stargate build: ${stage}`);
run("npm", ["install", "--ignore-scripts", "--audit=false", "--fund=false"]);
run("npm", ["run", "build"]);
run(process.execPath, ["jasmine-testrunner.js", "--quiet"]);
const [packed] = JSON.parse(
  run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", output], true),
);
const summary = { stage, artifact: join(output, packed.filename), integrity: packed.integrity, manifest };
writeFileSync(join(output, "stargate-build.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ artifact: summary.artifact, integrity: summary.integrity }));
