import { Struct } from "../deps.ts";

export enum BatteryStatus {
  Normal = "Normal",
  Charging = "Charging",
}

export interface BatteryInfo {
  level: number;
  lastLevel: number;
  status: BatteryStatus;
  lastChange: DateTime;
  lastOff: DateTime;
}

export function parseBatteryResponse(data: DataView): BatteryInfo {
  const status = data.getInt8(2);
  const level = data.getInt8(1);
  const lastLevel = data.getInt8(19);
  const lastChange = parseDate(new DataView(data.buffer.slice(11, 18)));
  const lastOff = parseDate(new DataView(data.buffer.slice(3, 10)));

  return {
    level,
    lastLevel,
    status: status == 0 ? BatteryStatus.Normal : BatteryStatus.Charging,
    lastChange,
    lastOff,
  };
}

export interface DateTime {
  year: number;
  month: number;
  date: number;
  hours: number;
  minutes: number;
  seconds: number;
  day?: number;
  fractions?: number;
}

export function parseDate(data: DataView): DateTime {
  const year = data.getInt16(0, true);
  const month = data.getInt8(2);
  const date = data.getInt8(3);
  const hours = data.getInt8(4);
  const minutes = data.getInt8(5);
  const seconds = data.getInt8(6);
  let day: number | undefined = undefined;
  try {
    let v = data.getInt8(7);
    day = v;
  } catch (e) {}
  let fractions: number | undefined = undefined;
  try {
    let v = data.getInt8(8);
    fractions = v;
  } catch (e) {}

  return {
    year,
    month,
    date,
    hours,
    minutes,
    seconds,
    day,
    fractions,
  };
}

export function packDate(date: DateTime): DataView {
  const buffer = new ArrayBuffer(
    7 + (date.day !== undefined ? (date.fractions !== undefined ? 2 : 1) : 0)
  );
  const data = new DataView(buffer);
  data.setInt16(0, date.year);
  data.setInt8(2, date.month);
  data.setInt8(3, date.date);
  data.setInt8(4, date.hours);
  data.setInt8(5, date.minutes);
  data.setInt8(6, date.seconds);
  if (date.day) data.setInt8(7, date.day);
  if (date.fractions) data.setInt8(8, date.fractions);
  return data;
}

export interface StatusInfo {
  steps: number;
  meters: number;
  fatsBurned: number;
  calories: number;
}

export function parseStatus(data: DataView): StatusInfo {
  const steps = data.getInt16(1, true);
  const meters = data.getInt16(5, true);
  const fatsBurned = data.getInt16(2, true);
  const calories = data.getInt8(9);

  return {
    steps,
    meters,
    fatsBurned,
    calories,
  };
}
