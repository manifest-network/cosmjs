# Manifest dependency patch release

This repair starts from the source recorded by the published
`@manifest-network/stargate@0.32.4-ll.3` package:
`99ad972cc468b27ea4cf482e2d30a3ccb131c86e`. The repository's old `main` is an
earlier upstream commit and does not contain the released Manifest signing
workaround. Preserve that released history when reviewing or merging this patch.

The initial manual repair published:

1. `@manifest-network/ics23@0.6.9`, built from `vendor/ics23/js`.
2. `@manifest-network/stargate@0.32.4-ll.4`, built from `packages/stargate`.

ICS23 requires `protobufjs ^7.6.5` through its real dependencies. Stargate
requires the ICS23 fork using an npm alias. All other CosmJS dependencies remain
on 0.32.4, and Stargate's production TypeScript is unchanged from the published
Manifest fork. This patch does not claim to remove the elliptic advisory.

Those versions have **no npm provenance attestations**. Their source references
and recorded integrity hashes are useful for reviewing changes and identifying
artifacts, but do not authenticate where the artifacts were built. Do not
publish an SDK release that adopts them under an exception. New versions,
reviewed source, and CI publication are required; attestations cannot be added
to an existing npm version. The replacement version plan is reviewed separately
from this workflow.

## Build and validate ICS23

```sh
cd vendor/ics23/js
npm ci --ignore-scripts
npm test
npm audit --omit=dev --audit-level=high
npm pack --ignore-scripts --pack-destination /absolute/path/to/artifacts
```

The suite retains upstream proof vectors and adds exact codec round trips and
negative proof controls. Build outputs are excluded from source control; the
tarball excludes compiled tests and includes upstream license/provenance files.

## Build and validate Stargate

After the ICS23 version is available from the selected registry:

```sh
node scripts/build-manifest-stargate.mjs /absolute/path/outside/this/repo
```

The script stages source outside the workspace, expands `workspace:^` to the
actual 0.32.4 package versions, uses `npm ci` and the reviewed
`scripts/stargate-build-lock.json` with lifecycle scripts disabled, builds, runs
the upstream Jasmine suite, audits production dependencies, and packs only
Stargate. Its `stargate-build.json` records the tarball and integrity.
Network-dependent upstream tests remain pending unless their documented devnets
are enabled. Publishing every workspace in this historical monorepo is not part
of the repair.

Before publication, an isolated candidate registry may serve the ICS23 tarball
under its intended package name/version. This validates the declared dependency
graph without a root override. Do not commit staging registry URLs or claim a
public-registry install passed until both packages have actually been published.

After a source version or dependency declaration changes, explicitly regenerate
and review the standalone build lock, including every resolved URL and
integrity:

```sh
node scripts/build-manifest-stargate.mjs /absolute/path/outside/this/repo --refresh-lock
```

CI never refreshes that lock. All entries must resolve to public npm and include
SHA512 integrity. The lock keeps the historical development toolchain
reproducible; the consumer-facing declarations still determine consumer
resolution. Updating the maintained ICS23 dependency requires refreshing and
reviewing this lock too.

The CI release build also installs each tested tarball into a fresh temporary
consumer using public npm, without the source lock or lifecycle scripts. It
checks the installed artifact integrity, audits production dependencies, and
loads the published package entrypoint. This catches declaration and packaging
problems independently of the source build.

## Configure publication before dispatch

The workflow is `.github/workflows/manifest-release.yml`. Pull requests build
and test both packages without write or OIDC permissions. Publication is a
separate manual dispatch of one exact package version, from `main`, with the
full reviewed commit SHA as input. The SHA must equal both `GITHUB_SHA` and the
checked-out commit, because npm provenance records the workflow SHA. Selecting
another branch or checking out an unrelated SHA is rejected.

Before any publication, repository administrators must:

1. Protect `main` with required pull-request review and the two package build
   checks. Preserve the released Manifest signing history when merging this
   source branch.
2. Create the GitHub environment **`npm-release`**, allow deployments only from
   `main`, require a maintainer reviewer, and prevent self-review where
   supported. Restrict workflow changes through required review. The checked-in
   workflow cannot create or enforce GitHub environment settings by itself.
3. Configure each npm package's trusted publisher with GitHub organization
   **`manifest-network`**, repository **`cosmjs`**, workflow filename
   **`manifest-release.yml`** (filename only), environment **`npm-release`**,
   and the **direct `npm publish` allowed action**. Configure both
   `@manifest-network/ics23` and `@manifest-network/stargate` separately.
4. Confirm both GitHub repository and npm packages are public, and remove any
   legacy automation token fallback for this publication path.

These are npm/GitHub account settings, not values that a workflow can safely
infer. The workflow uses official actions pinned to commit hashes, GitHub-hosted
Ubuntu, Node 24.15.0 with explicitly pinned npm 11.19.1, no npm cache
restoration, empty user/global npm configuration, and no npm token. Only the
protected publication job receives `id-token: write`.
[npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/)
describes the required account binding and automatic provenance generation.

npm 11.19.1 contains patched Sigstore verification libraries (`sigstore` 4.1.1,
`@sigstore/verify` 3.1.1, `@sigstore/core` 3.2.1); the older npm bundled with
this Node release must not be used for provenance acceptance.

## Publish and verify one reviewed package

First publish the replacement ICS23 version. Then update Stargate's dependency
and build lock to the attested ICS23 release in a reviewed commit before
publishing the replacement Stargate version. The currently committed versions
already exist; the publication command intentionally rejects them. This workflow
preparation does not authorize overwriting versions or creating an SDK release.

Dispatch **Manifest dependency release** on `main` with the selected package
(`ics23` or `stargate`), exact new version, and full reviewed source SHA. Review
the successful build/test job and the `manifest-PACKAGE` artifact before
approving the protected environment. The publication job downloads that same
run's artifact, checks its SHA512 digest, package allowlist, version,
dependencies, and repository metadata against the reviewed source, and publishes
the tested tarball with `--provenance --ignore-scripts`. It never publishes all
CosmJS workspaces.

After publishing, the workflow requires all of the following:

- Public npm's artifact integrity equals the locally tested tarball.
- The provenance statement identifies that artifact, this repository, this exact
  workflow, `main`, the full reviewed source commit, and a GitHub-hosted
  builder.
- `npm audit signatures --json --include-attestations` succeeds in an isolated
  fresh install. Policy checks consume the exact cryptographically verified
  bundle from that command, requiring the signing certificate's workflow URI,
  GitHub OIDC issuer, source repository, source commit, and ref. Merely decoding
  an independently fetched statement or observing `dist.attestations` is not
  sufficient.

The workflow retains `verified-publication.json` for 90 days. If publication
succeeds but verification fails, stop the downstream releases and investigate;
do not bypass verification or attempt to replace the immutable npm version. Once
both replacements are verified, continue the reviewed ManifestJS version plan,
then run the MCP monorepo's public-registry SDK/CLI consumer audit and
single-Stargate identity check. Preserve the full audit reports and source/CI
links.

Provenance authenticates publication origin; it does not prove absence of unsafe
source or vulnerabilities. Maintainers still review upstream advisories under
the original package names and preserve the proof vectors and codec negative
controls. The broad crypto migration and devnet-only integration suite remain
separate work.
