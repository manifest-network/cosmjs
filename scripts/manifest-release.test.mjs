import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  assertPackedManifest,
  assertReleaseContext,
  repository,
  verifyPublishedArtifact,
  workflow,
} from "./manifest-release.mjs";

import {
  assertProvenanceCertificate,
  assertProvenanceStatement,
  assertVerifiedProvenance,
} from "./npm-provenance.mjs";

const sha = "a".repeat(40);
const context = {
  eventName: "workflow_dispatch",
  ref: "refs/heads/manifest/0.32",
  repository,
  sha,
  requestedSha: sha,
  head: sha,
};
test("publication requires the reviewed dispatch and checkout to describe one maintained manifest/0.32 commit", () => {
  assertReleaseContext(context);
  for (const changed of [
    { eventName: "pull_request" },
    { eventName: "push" },
    { ref: "refs/heads/main" },
    { ref: "refs/tags/v0.32.4-ll.5" },
    { ref: "refs/heads/feature" },
    { repository: "attacker/cosmjs" },
    { requestedSha: "main" },
    { requestedSha: "b".repeat(40) },
    { head: "c".repeat(40) },
  ])
    assert.throws(() => assertReleaseContext({ ...context, ...changed }));
});

const manifest = JSON.parse(readFileSync(new URL("../vendor/ics23/js/package.json", import.meta.url)));
test("tarball allowlist rejects package, dependency, and version substitution", () => {
  assertPackedManifest(manifest, "ics23", manifest.version, manifest);
  for (const changed of [
    { name: "@cosmjs/crypto" },
    { version: "0.0.1" },
    { private: true },
    { repository: { ...manifest.repository, url: "git+https://github.com/cosmos/ics23.git" } },
    { repository: { ...manifest.repository, directory: "packages/crypto" } },
    { dependencies: { ...manifest.dependencies, protobufjs: "^6.11.6" } },
    { publishConfig: { ...manifest.publishConfig, registry: "https://attacker.example" } },
    { publishConfig: { ...manifest.publishConfig, provenance: false } },
    { overrides: { protobufjs: "7.6.6" } },
    { bundledDependencies: ["protobufjs"] },
  ])
    assert.throws(() =>
      assertPackedManifest({ ...manifest, ...changed }, "ics23", manifest.version, manifest),
    );
  assert.throws(() => assertPackedManifest(manifest, "crypto", manifest.version, manifest));
  assert.throws(() => assertPackedManifest(manifest, "ics23", "latest", manifest));
});

const expected = {
  repository,
  workflow,
  ref: "refs/heads/manifest/0.32",
  name: manifest.name,
  version: manifest.version,
  sha,
  integrity: `sha512-${Buffer.alloc(64, 1).toString("base64")}`,
};
test("policy accepts the real SDK 0.22.0 provenance statement", () => {
  // Retrieved from public npm; source SHA independently matches GitHub's v0.22.0
  // annotated tag. The online validation also ran npm audit signatures; this
  // offline fixture checks schema compatibility, not cryptographic authenticity.
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/sdk-0.22.0-provenance.json", import.meta.url)));
  assertProvenanceStatement(fixture.statement, fixture.expected);
  assertVerifiedProvenance({ invalid: [], missing: [], verified: [fixture.verified] }, fixture.expected);
});

test("verified provenance requires the target's actual attestation and rejects policy substitutions", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/sdk-0.22.0-provenance.json", import.meta.url)));
  const audit = { invalid: [], missing: [], verified: [fixture.verified] };
  assert.throws(() => assertVerifiedProvenance({ ...audit, invalid: [{}] }, fixture.expected));
  assert.throws(() => assertVerifiedProvenance({ ...audit, missing: [{}] }, fixture.expected));
  assert.throws(() => assertVerifiedProvenance({ ...audit, verified: [] }, fixture.expected));
  assert.throws(() =>
    assertVerifiedProvenance(
      { ...audit, verified: [{ ...fixture.verified, attestationBundles: [] }] },
      fixture.expected,
    ),
  );
  assert.throws(
    () => assertVerifiedProvenance(audit, { ...fixture.expected, sha: "b".repeat(40) }),
    /Fulcio identity extension/,
  );
  assert.throws(
    () => assertVerifiedProvenance(audit, { ...fixture.expected, repository: "attacker/repo" }),
    /signing certificate/,
  );
  assert.throws(
    () => assertVerifiedProvenance(audit, { ...fixture.expected, integrity: expected.integrity }),
    /exact packed artifact/,
  );
});

test("certificate identity parser rejects malformed or ambiguous extensions", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/sdk-0.22.0-provenance.json", import.meta.url)));
  const raw = Buffer.from(
    fixture.verified.attestationBundles[0].bundle.verificationMaterial.certificate.rawBytes,
    "base64",
  );
  function changeOid(from, to) {
    const changed = Buffer.from(raw);
    const needle = Buffer.from(`2b0601040183bf3001${from}`, "hex");
    const offset = changed.indexOf(needle);
    assert.ok(offset >= 0);
    changed[offset + needle.length - 1] = Number.parseInt(to, 16);
    return changed.toString("base64");
  }
  assert.throws(() => assertProvenanceCertificate(changeOid("0d", "1d"), fixture.expected), /Missing Fulcio/);
  assert.throws(
    () => assertProvenanceCertificate(changeOid("0e", "0d"), fixture.expected),
    /Duplicate certificate extension/,
  );
  assert.throws(() =>
    assertProvenanceCertificate(raw.subarray(0, raw.length - 1).toString("base64"), fixture.expected),
  );
  const badLength = Buffer.from(raw);
  badLength[1] = 0x80;
  assert.throws(() => assertProvenanceCertificate(badLength.toString("base64"), fixture.expected));
});
function statement() {
  return {
    _type: "https://in-toto.io/Statement/v1",
    predicateType: "https://slsa.dev/provenance/v1",
    subject: [
      {
        name: `pkg:npm/%40manifest-network/ics23@${manifest.version}`,
        digest: { sha512: Buffer.alloc(64, 1).toString("hex") },
      },
    ],
    predicate: {
      buildDefinition: {
        buildType: "https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1",
        externalParameters: {
          workflow: {
            repository: `https://github.com/${repository}`,
            path: workflow,
            ref: "refs/heads/manifest/0.32",
          },
        },
        resolvedDependencies: [
          {
            uri: `git+https://github.com/${repository}@refs/heads/manifest/0.32`,
            digest: { gitCommit: sha },
          },
        ],
      },
      runDetails: { builder: { id: "https://github.com/actions/runner/github-hosted" } },
    },
  };
}
test("provenance policy rejects wrong artifact, source, workflow, and builder", () => {
  assertProvenanceStatement(statement(), expected);
  for (const mutate of [
    (value) => {
      value.subject[0].digest.sha512 = "0".repeat(128);
    },
    (value) => {
      value.subject[0].name = "pkg:npm/%40manifest-network/ics23@0.0.0";
    },
    (value) => {
      value.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/other.yml";
    },
    ...["refs/heads/main", "refs/tags/v0.32.4-ll.5", "refs/heads/feature"].map((ref) => (value) => {
      value.predicate.buildDefinition.externalParameters.workflow.ref = ref;
    }),
    (value) => {
      value.predicate.buildDefinition.externalParameters.workflow.repository =
        "https://github.com/attacker/cosmjs";
    },
    (value) => {
      value.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = "b".repeat(40);
    },
    (value) => {
      value.predicate.buildDefinition.resolvedDependencies = [];
    },
    (value) => {
      value.predicate.runDetails.builder.id = "self-hosted";
    },
  ]) {
    const value = statement();
    mutate(value);
    assert.throws(() => assertProvenanceStatement(value, expected));
  }
});

test("post-publication verification recovers from unavailable versions and delayed attestations", async (t) => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/sdk-0.22.0-provenance.json", import.meta.url)));
  const consumer = mkdtempSync(join(tmpdir(), "manifest-verification-retry-"));
  t.after(() => rmSync(consumer, { recursive: true, force: true }));
  const calls = [];
  let installs = 0;
  let audits = 0;
  let waits = 0;
  const verifiedAudit = { invalid: [], missing: [], verified: [fixture.verified] };
  const audit = await verifyPublishedArtifact(fixture.expected, consumer, {
    attempts: 3,
    wait: async () => {
      waits++;
    },
    execute(command, args, directory, capture) {
      assert.equal(command, "npm");
      assert.equal(directory, consumer);
      calls.push(args[0]);
      if (args[0] === "install") {
        assert.ok(args.includes("--ignore-scripts"));
        assert.ok(args.includes("--prefer-online"));
        assert.ok(args.includes(`${fixture.expected.name}@${fixture.expected.version}`));
        if (++installs === 1) throw new Error("E404: new version not visible yet");
        writeFileSync(
          join(consumer, "package-lock.json"),
          JSON.stringify({
            packages: {
              [`node_modules/${fixture.expected.name}`]: { integrity: fixture.expected.integrity },
            },
          }),
        );
        return;
      }
      assert.deepEqual(args, [
        "audit",
        "signatures",
        "--json",
        "--include-attestations",
        "--prefer-online",
        "--registry=https://registry.npmjs.org/",
      ]);
      assert.equal(capture, true);
      if (++audits === 1)
        return JSON.stringify({
          ...verifiedAudit,
          verified: [{ ...fixture.verified, attestationBundles: [] }],
        });
      return JSON.stringify(verifiedAudit);
    },
  });
  assert.deepEqual(audit, verifiedAudit);
  assert.deepEqual(calls, ["install", "install", "audit", "install", "audit"]);
  assert.equal(waits, 2);
});

test("post-publication verification exhausts installation retries without publishing", async () => {
  let installs = 0;
  let waits = 0;
  const failure = new Error("E404: version remains unavailable");
  await assert.rejects(
    verifyPublishedArtifact(expected, "/unused", {
      attempts: 3,
      wait: async () => {
        waits++;
      },
      execute(command, args) {
        assert.equal(command, "npm");
        assert.equal(args[0], "install");
        installs++;
        throw failure;
      },
    }),
    (error) => error === failure,
  );
  assert.equal(installs, 3);
  assert.equal(waits, 2);
});

test("retrying publication verification never accepts a wrong artifact or source identity", async (t) => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/sdk-0.22.0-provenance.json", import.meta.url)));
  const consumer = mkdtempSync(join(tmpdir(), "manifest-verification-policy-"));
  t.after(() => rmSync(consumer, { recursive: true, force: true }));
  for (const [integrity, identity, message] of [
    [expected.integrity, fixture.expected, /differs from the tested tarball/],
    [fixture.expected.integrity, { ...fixture.expected, sha: "b".repeat(40) }, /Fulcio identity extension/],
  ]) {
    let installs = 0;
    let waits = 0;
    await assert.rejects(
      verifyPublishedArtifact(identity, consumer, {
        attempts: 2,
        wait: async () => {
          waits++;
        },
        execute(command, args) {
          assert.equal(command, "npm");
          if (args[0] === "install") {
            installs++;
            writeFileSync(
              join(consumer, "package-lock.json"),
              JSON.stringify({
                packages: { [`node_modules/${identity.name}`]: { integrity } },
              }),
            );
            return;
          }
          assert.equal(args[0], "audit");
          return JSON.stringify({ invalid: [], missing: [], verified: [fixture.verified] });
        },
      }),
      message,
    );
    assert.equal(installs, 2);
    assert.equal(waits, 1);
  }
});
