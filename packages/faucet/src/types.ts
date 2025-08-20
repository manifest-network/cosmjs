import { Coin } from "@manifest-network/stargate";

export interface SendJob {
  readonly sender: string;
  readonly recipient: string;
  readonly amount: Coin;
}

export interface MinimalAccount {
  /** Bech32 account address */
  readonly address: string;
  readonly balance: readonly Coin[];
}
