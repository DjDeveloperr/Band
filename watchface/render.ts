import { assertExists } from "./deps.ts";
import { BandType, ParsedWatchface } from "./types.ts";

export interface BandState {
  date: Date;
  steps?: number;
  goal?: number;
  battery?: number;
  calories?: number;
  lock?: boolean;
  dnd?: boolean;
  bluetooth?: boolean;
  distance?: number;
  pai?: number;
  silent?: boolean;
  weather?: number;
}

export const BAND_DIMS: {
  [num: number]: [number, number];
} = {
  [BandType.BAND_4]: [120, 240],
  [BandType.BAND_5]: [126, 294],
  [BandType.BAND_6]: [152, 486],
};

export function render(
  { band, params, resources }: ParsedWatchface,
  state: BandState = {
    date: new Date(),
    steps: 100,
    goal: 1000,
    battery: 100,
    calories: 100,
    lock: true,
    dnd: true,
    bluetooth: true,
    distance: 100,
    pai: 100,
    silent: true,
    weather: 0,
  },
) {
  const dim = BAND_DIMS[band];
  const data = new Uint8Array(
    dim[0] * dim[1] * 4,
  );

  for (let i = 0; i < data.byteLength; i += 4) {
    data.set([0, 0, 0, 255], i);
  }

  if (params.background) {
    if (params.background.image) {
      const { x, y, imageIndex } = params.background.image;
      const img = resources.find((e) => e.id === Number(imageIndex))?.data;
      assertExists(img);
      data.set(img, ((Number(y) * dim[0]) + Number(x)) * 4);
    }
  }

  return {
    width: dim[0],
    height: dim[1],
    buffer: data,
  };
}
