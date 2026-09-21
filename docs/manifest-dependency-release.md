# Manifest dependency patch release

This repair starts from the source recorded by the published
`@manifest-network/stargate@0.32.4-ll.3` package:
`99ad972cc468b27ea4cf482e2d30a3ccb131c86e`. The repository's old `main` is an
earlier upstream commit and does not contain the released Manifest signing
workaround. Preserve that released history when reviewing or merging this patch.

The two packages to publish here are:

1. `@manifest-network/ics23@0.6.9`, built from `vendor/ics23/js`.
2. `@manifest-network/stargate@0.32.4-ll.4`, built from `packages/stargate`.

ICS23 requires `protobufjs ^7.6.5` through its real dependencies. Stargate
requires the ICS23 fork using an npm alias. All other CosmJS dependencies remain
on 0.32.4, and Stargate's production TypeScript is unchanged from the published
Manifest fork. This patch does not claim to remove the elliptic advisory.

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
actual 0.32.4 package versions, installs with lifecycle scripts disabled, builds,
runs the upstream Jasmine suite, and packs only Stargate. Its
`stargate-build.json` records the tarball and integrity. Network-dependent
upstream tests remain pending unless their documented devnets are enabled.
Publishing every workspace in this historical monorepo is not part of the repair.

Before publication, an isolated candidate registry may serve the ICS23 tarball
under its intended package name/version. This validates the declared dependency
graph without a root override. Do not commit staging registry URLs or claim a
public-registry install passed until both packages have actually been published.

Publish the reviewed tarballs with `npm publish TAR_FILE --access public --tag latest`,
in the order above. Then release the ManifestJS dependency patch and run the MCP
monorepo's isolated SDK/CLI consumer audit against public npm. Retain the package
integrities, dependency trees, and full audit reports.
