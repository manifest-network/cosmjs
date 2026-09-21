import { readFileSync } from "fs";

import { ics23 } from "./generated/codecimpl";
import { verifyMembership, verifyNonMembership } from "./ics23";
import { iavlSpec, tendermintSpec } from "./proofs";
import { fromHex } from "./testhelpers.spec";

describe("protobufjs 7 compatibility", () => {
  for (const [family, spec] of [
    ["iavl", iavlSpec],
    ["tendermint", tendermintSpec],
  ] as const) {
    for (const kind of ["exist", "nonexist"]) {
      for (const position of ["left", "middle", "right"]) {
        it(`round-trips and verifies ${family}/${kind}_${position}`, () => {
          const fixture = JSON.parse(readFileSync(`../testdata/${family}/${kind}_${position}.json`, "utf8"));
          const wire = fromHex(fixture.proof);
          const proof = ics23.CommitmentProof.decode(wire);
          expect(Array.from(ics23.CommitmentProof.encode(proof).finish())).toEqual(Array.from(wire));
          const jsonRoundTrip = ics23.CommitmentProof.fromObject(
            ics23.CommitmentProof.toObject(proof, { bytes: String, enums: String, longs: String }),
          );
          expect(Array.from(ics23.CommitmentProof.encode(jsonRoundTrip).finish())).toEqual(Array.from(wire));
          const root = fromHex(fixture.root);
          const key = fromHex(fixture.key);
          const alteredRoot = Uint8Array.from(root);
          alteredRoot[0] ^= 1;
          if (kind === "exist") {
            const value = fromHex(fixture.value);
            expect(verifyMembership(proof, spec, root, key, value)).toBe(true);
            expect(verifyMembership(proof, spec, alteredRoot, key, value)).toBe(false);
            const alteredKey = Uint8Array.from(key);
            alteredKey[0] ^= 1;
            expect(verifyMembership(proof, spec, root, alteredKey, value)).toBe(false);
          } else {
            expect(verifyNonMembership(proof, spec, root, key)).toBe(true);
            expect(verifyNonMembership(proof, spec, alteredRoot, key)).toBe(false);
          }
        });
      }
    }
  }
});
