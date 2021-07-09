export const decoder = new TextDecoder("utf-8");
export const encoder = new TextEncoder();
export const MAX_CHUNK = 17;

export interface Time {
  year: number;
  month: number;
  date: number;
  hour: number;
  minute: number;
}

export function timeToDate(time: Time) {
  return new Date(
    `${time.month}/${time.date}/${time.year} ${time.hour}:${time.minute}`
  );
}

export function dateToTime(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    date: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

export interface ActivityData {
  category: number;
  steps: number;
  intensity: number;
  heartRate: number;
}

export function chunk<T>(arr: T[], size: number) {
  const res: T[][] = [];
  let idx = 0;
  arr.forEach((e) => {
    if (!res[idx]) res[idx] = [];
    res[idx].push(e);
    if (res[idx].length >= size) idx++;
  });
  return res;
}

export function byteq(left: DataView, right: number[]) {
  if (left.byteLength < right.length) return false;

  let match = true;
  right.forEach((e, i) => {
    if (!match) return;
    if (e != left.getUint8(i)) match = false;
  });
  return match;
}

export function bytesFromHex(hex: string) {
  return hex
    .split("")
    .reduce((resultArray: any, item, index) => {
      const chunkIndex = Math.floor(index / 2);

      if (!resultArray[chunkIndex]) {
        resultArray[chunkIndex] = [];
      }

      resultArray[chunkIndex].push(item);

      return resultArray;
    }, [])
    .map((e: string[]) => e.join(""))
    .map((e: string) => parseInt(e, 16));
}

console.log(
  new TextDecoder().decode(new Uint8Array(bytesFromHex(Deno.args[0])))
);
