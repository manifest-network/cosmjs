# Maintained ICS23 dependency

Runtime sources, generated protobuf codec, proof schema, and proof vectors come
from `confio/ics23@v0.6.8`, commit
`bd5edc148f22b44899e39aa7cbede9343285214d`, under its original Apache-2.0 license.
They are preserved without runtime modifications.

Manifest changes the package identity to `@manifest-network/ics23@0.6.9` and
requires `protobufjs ^7.6.5`. Build/test metadata is maintained here. The upstream
membership, nonmembership, batch and compression tests remain enabled. Additional
codec tests check exact proof-byte round trips and rejection of altered roots
and keys against the upstream vectors.

The Stargate fork consumes this package through the `@confio/ics23` npm alias.
The published dependency declaration supplies the repair without application
overrides or install scripts. Publish this package before the Stargate patch
that consumes it. The CosmJS family and its signing implementation stay on the
existing 0.32.4 line; removing elliptic is separate work.
