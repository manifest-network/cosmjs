import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { assertPackedManifest, assertReleaseContext, repository, workflow } from "./manifest-release.mjs";

import {
  assertProvenanceCertificate,
  assertProvenanceStatement,
  assertVerifiedProvenance,
} from "./npm-provenance.mjs";

const sha = "a".repeat(40);
const context = {
  eventName: "workflow_dispatch",
  ref: "refs/heads/main",
  repository,
  sha,
  requestedSha: sha,
  head: sha,
};
test("publication requires the reviewed dispatch and checkout to describe one main commit", () => {
  assertReleaseContext(context);
  for (const changed of [
    { eventName: "pull_request" },
    { eventName: "push" },
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
  ref: "refs/heads/main",
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
            ref: "refs/heads/main",
          },
        },
        resolvedDependencies: [
          { uri: `git+https://github.com/${repository}@refs/heads/main`, digest: { gitCommit: sha } },
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
    (value) => {
      value.predicate.buildDefinition.externalParameters.workflow.ref = "refs/heads/feature";
    },
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
