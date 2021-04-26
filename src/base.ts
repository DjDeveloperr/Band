import type { Band } from "./band.ts";

export class Base {
  band!: Band;

  constructor(band: Band) {
    Object.defineProperty(this, "band", {
      value: band,
    });
  }
}
