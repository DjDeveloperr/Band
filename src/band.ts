/// <reference path="./types.d.ts"/>

import { AES, crc32, EventEmitter, Struct } from "../deps.ts";
import {
  AlertType,
  AuthState,
  MusicInfo,
  MusicState,
  Services,
  WeekDay,
  WorkoutType,
} from "./constants.ts";
import {
  BatteryInfo,
  DateTime,
  packDate,
  parseBatteryResponse,
  parseDate,
  parseStatus,
  StatusInfo,
} from "./parsers.ts";
import {
  ActivityData,
  bytesFromHex,
  chunk,
  decoder,
  encoder,
  MAX_CHUNK,
  Time,
  timeToDate,
} from "./util.ts";
import { BandServices } from "./services.ts";
import { BandCharacteristics } from "./chars.ts";

export type BandEvents = {
  connect: [];
  disconnect: [];
  init: [];
  authStateChange: [AuthState];
  authRandomNumber: [Uint8Array];
  musicFocusIn: [];
  musicFocusOut: [];
  musicPlay: [];
  musicPause: [];
  musicForward: [];
  musicBackward: [];
  musicVolumeUp: [];
  musicVolumeDown: [];
  findDevice: [];
  alarmToggle: [];
  foundDevice: [];
  workoutStart: [WorkoutType, boolean];
  statusChange: [StatusInfo];
  heartRateMeasure: [number];
  dfuStart: [string, number];
  dfuProgress: [number, number];
  dfuEnd: [];
  error: [string];
  info: [string];
  fetchStart: [Time];
  fetchEnd: [];
  fetchData: [ActivityData, Time];
  callDismiss: [];
  callSilent: [];
};

export class Band extends EventEmitter<BandEvents> {
  static DEVICE_NAME = "Mi Smart Band 4";

  static async connect(key?: string, gattConnect = true) {
    let device: BluetoothDevice | undefined;
    const devices = (await navigator.bluetooth.getDevices()) ?? [];
    if (devices.length) {
      const found = devices.find((e) => e.name === Band.DEVICE_NAME);
      if (found) device = found;
    }
    if (!device) {
      const deviceReq = await navigator.bluetooth
        .requestDevice({
          filters: [
            {
              name: Band.DEVICE_NAME,
            },
          ],
          optionalServices: Object.values(Services),
        })
        .catch(() => undefined);

      if (deviceReq) device = deviceReq;
    }

    const gatt = gattConnect
      ? await device?.gatt?.connect().catch(() => undefined)
      : device?.gatt;
    if (!gatt || !device) throw new Error("Failed to connect to Band");

    return new Band(device, gatt, key);
  }

  services: BandServices;
  music: MusicInfo = {
    state: MusicState.Paused,
    track: "Nothing playing",
    volume: 100,
  };
  chars: BandCharacteristics;
  state: AuthState = AuthState.None;
  ready: Promise<this>;

  constructor(
    public device: BluetoothDevice,
    public gatt: BluetoothRemoteGATTServer,
    public key?: string,
  ) {
    super();
    this.services = new BandServices(this);
    this.chars = new BandCharacteristics(this);

    if (!this.gatt.connected) {
      this.ready = this.gatt
        .connect()
        .then(() => this.emit("connect"))
        .then(() => this);
    } else {
      this.ready = Promise.resolve(this);
    }

    device.ongattserverdisconnected = async () => {
      await this.emit("disconnect");
    };
  }

  async init() {
    await this.services.init();
    await this.chars.init();
    this.emit("init");
  }

  async authorize(): Promise<true> {
    if (!this.key) throw new Error("Auth Key not provided");
    const promise = new Promise((res, rej) => {
      this.once("authStateChange", (state) => {
        if (state == AuthState.Success) res(true);
        else rej("Auth State: " + state);
      });
    });
    await this.requestRandomNumber();
    return promise as any;
  }

  async requestRandomNumber() {
    await this.chars.auth.writeValueWithoutResponse(
      new Uint8Array([0x02, 0x00]).buffer,
    );
  }

  async sendEncryptedNumber(data: Uint8Array) {
    let encrypted: any = await this.encrypt(data);
    encrypted = [0x03, 0x00, ...encrypted].slice(0, 18);
    await this.chars.auth.writeValue(new Uint8Array(encrypted).buffer);
  }

  async encrypt(msg: string | Uint8Array) {
    return await new AES(bytesFromHex(this.key!), { mode: "ecb" }).encrypt(msg);
  }

  async getRevision() {
    const val = await this.chars.revision.readValue();
    return decoder.decode(val.buffer);
  }

  async getHrdwRevision() {
    const val = await this.chars.hrdwRevision.readValue();
    return decoder.decode(val.buffer);
  }

  async getBatteryInfo(): Promise<BatteryInfo> {
    const data = await this.chars.battery.readValue();
    return parseBatteryResponse(data);
  }

  async getCurrentTime(): Promise<DateTime> {
    const data = await this.chars.currentTime.readValue();
    return parseDate(data);
  }

  async setEncoding(enc = "en_US") {
    await this.chars.config.writeValue(
      new Uint8Array([6, 17, 0, ...encoder.encode(enc)]).buffer,
    );
  }

  async sendAlert(...type: number[]) {
    await this.chars.alert.writeValue(new Uint8Array(type).buffer);
  }

  async setCurrentTime(date?: DateTime) {
    const d = new Date();
    date = date ?? {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      date: d.getDate(),
      hours: d.getHours(),
      minutes: d.getMinutes(),
      seconds: d.getSeconds(),
    };
    await this.chars.currentTime.writeValueWithResponse(packDate(date).buffer);
  }

  async writeDisplayCommand(...cmd: number[]) {
    await this.chars.config.writeValue(new Uint8Array([0x06, ...cmd]).buffer);
  }

  async setDisplayOnLiftWrist(display: boolean) {
    await this.writeDisplayCommand(0x05, 0x00, display ? 0x01 : 0x00);
  }

  async scheduleDisplayOnLiftWrist(
    start: [hour: number, minute: number],
    end: [hour: number, minute: number],
  ) {
    const buf = new Uint8Array([0x05, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
    buf[3] = start[0];
    buf[4] = start[1];
    buf[5] = end[0];
    buf[6] = end[1];
    await this.writeDisplayCommand(...buf);
  }

  async setGoalNotification(enabled: boolean) {
    await this.writeDisplayCommand(0x06, 0x00, enabled ? 0x01 : 0x00);
  }

  async setDisplayCaller(enabled: boolean) {
    await this.writeDisplayCommand(0x10, 0x00, 0x00, enabled ? 0x01 : 0x00);
  }

  async setDistanceUnit(unit: "metric" | "imperial") {
    await this.writeDisplayCommand(0x03, 0x00, unit == "metric" ? 0x00 : 0x01);
  }

  async setDisconnectNotification(enabled: boolean) {
    await this.writeDisplayCommand(
      0x0c,
      0x00,
      enabled ? 0x01 : 0x00,
      0,
      0,
      0,
      0,
    );
  }

  async setTimeFormat(fmt: 12 | 24) {
    if (fmt !== 12 && fmt !== 24) {
      throw new Error("Invalid format, must be 12 or 24");
    }
    await this.writeDisplayCommand(0x02, 0x00, fmt == 12 ? 0x00 : 0x01);
  }

  async sendCustomAlert(
    type: number = AlertType.None,
    title: string = "",
    msg: string = "",
  ) {
    await this.chars.customAlert.writeValue(
      new Uint8Array([
        type,
        1,
        ...encoder.encode(title),
        0x0a,
        0x0a,
        0x0a,
        ...encoder.encode(
          type === AlertType.Call ? "" : chunk(msg.split(""), 10)
            .map((e) => e.join(""))
            .join("\n"),
        ),
      ]).buffer,
    );
  }

  async sendEmailNotification(title: string, msg: string) {
    await this.sendCustomAlert(AlertType.Email, title, msg);
  }

  async sendCallNotification(title: string, msg: string) {
    await this.sendCustomAlert(AlertType.CallNotif, title, msg);
  }

  async sendMessageNotification(title: string, msg: string) {
    await this.sendCustomAlert(AlertType.Message, title, msg);
  }

  async sendCall(name: string) {
    await this.sendCustomAlert(AlertType.Call, name, "");
  }

  async getStatus() {
    const value = await this.chars.steps.readValue();
    return parseStatus(value);
  }

  async writeChunked(type: number, data: Uint8Array) {
    let remaining = data.length;
    let count = 0;

    while (remaining > 0) {
      let copybytes = Math.min(remaining, MAX_CHUNK);
      let chunk: number[] = [];
      let flag = 0;
      if (remaining <= MAX_CHUNK) {
        flag |= 0x80;
        if (count == 0) {
          flag |= 0x40;
        }
      } else if (count > 0) {
        flag |= 0x40;
      }
      chunk.push(0);
      chunk.push(flag | type);
      chunk.push(count & 0xff);
      chunk.push(
        ...data.slice(count * MAX_CHUNK, count * MAX_CHUNK + copybytes),
      );
      count += 1;
      await this.chars.chunked.writeValueWithoutResponse(
        new Uint8Array(chunk).buffer,
      );
      remaining -= copybytes;
    }
  }

  async setMusic(music: Partial<MusicInfo>) {
    Object.assign(this.music, music);
    await this.updateMusic();
  }

  async updateMusic() {
    let flag = 0x00 | 0x01;
    let buf: number[] = [];

    if (this.music.artist) {
      flag |= 0x02;
      buf.push(...encoder.encode(this.music.artist), 0x00);
    }

    if (this.music.album) {
      flag |= 0x04;
      buf.push(...encoder.encode(this.music.album), 0x00);
    }

    if (this.music.track) {
      flag |= 0x08;
      buf.push(...encoder.encode(this.music.track), 0x00);
    }

    if (this.music.duration) {
      flag |= 0x10;
      const data = new Uint8Array(2);
      new DataView(data.buffer).setUint16(0, this.music.duration, true);
      buf.push(...data);
    }

    if (this.music.volume) {
      flag |= 0x40;
      buf.push(this.music.volume, 0x00);
    }

    const position: number[] = [];
    if (this.music.position) {
      const data = new Uint8Array(2);
      new DataView(data.buffer).setUint16(0, this.music.position, true);
      position.push(...data);
    } else {
      position.push(0x00, 0x00);
    }

    buf = [flag, this.music.state, 0x00, ...position, ...buf];
    await this.writeChunked(3, new Uint8Array(buf));
  }

  async setAlarm(
    hour: number,
    minute: number,
    days: WeekDay[] = [],
    enabled = true,
    snooze = true,
    id = 0,
  ) {
    let alarmTag = id;
    if (enabled) {
      alarmTag |= 0x80;
      if (!snooze) {
        alarmTag |= 0x40;
      }
    }

    let repitionMask = 0x00;
    days.forEach((day) => {
      repitionMask |= day;
    });

    await this.chars.config.writeValue(
      Struct.pack("5B", [2, alarmTag, hour, minute, repitionMask]).buffer,
    );
  }

  async dfuUpdate(
    type: "firmware" | "watchface" | "resource",
    bin: Uint8Array,
  ) {
    const crc = parseInt(crc32(bin), 16);
    await this.emit("dfuStart", type, bin.byteLength);
    await this.chars.firm.writeValueWithResponse(
      new Uint8Array([
        0x01,
        // 0x08,
        ...Struct.pack("<I", [bin.byteLength]),
        ...Struct.pack("<I", [crc]),
      ]).buffer,
    );
    await this.chars.firm.writeValueWithResponse(
      new Uint8Array([0x03, 0x01]).buffer,
    );
    let offset = 0;
    while (offset < bin.byteLength) {
      const end = offset + 20;
      const offsetEnd = end >= bin.byteLength ? bin.byteLength : end;
      const chunk = bin.slice(offset, offsetEnd);
      if (chunk.length === 0) continue;
      await this.chars.firmWrite.writeValue(chunk.buffer);
      const diff = offsetEnd - offset;
      offset += diff;
      this.emit("dfuProgress", offset, bin.byteLength);
    }
    await this.chars.firm.writeValueWithResponse(new Uint8Array([0x00]).buffer);
    await this.chars.firm.writeValueWithResponse(new Uint8Array([0x04]).buffer);
    if (type === "firmware") {
      await this.chars.firm.writeValueWithResponse(
        new Uint8Array([0x05]).buffer,
      );
    }
    this.emit("dfuEnd");
  }

  updateWatchface(bin: Uint8Array) {
    return this.dfuUpdate("watchface", bin);
  }

  updateFirmware(bin: Uint8Array) {
    return this.dfuUpdate("firmware", bin);
  }

  async setHeartRateMonitorSleep(enabled = true, interval = 1) {
    await this.chars.heartMeasure.startNotifications();
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x00, 0x00]).buffer,
    );
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x14, 0x00]).buffer,
    );
    if (enabled) {
      await this.chars.heartCtrl.writeValueWithResponse(
        new Uint8Array([0x15, 0x00, 0x01]).buffer,
      );
      await this.chars.heartCtrl.writeValueWithResponse(
        new Uint8Array([0x14, ...new TextEncoder().encode(String(interval))])
          .buffer,
      );
    }
    await this.chars.heartMeasure.stopNotifications();
  }

  async getHeartRateOneTime() {
    const promise = new Promise((res) => {
      this.once("heartRateMeasure", async (v) => {
        await this.stopHeartRateRealtime();
        res(v);
      });
    });
    await this.startHeartRateRealtime();
    return promise;
  }

  #heartRateRealtime = false;
  #heartRatePing?: number;

  get heartRateRealtime() {
    return this.#heartRateRealtime;
  }

  async startHeartRateRealtime() {
    if (this.#heartRateRealtime) {
      throw new Error("Heart Rate realtime already started");
    }
    this.#heartRateRealtime = true;
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x02, 0x00]).buffer,
    );
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x00]).buffer,
    );
    await this.chars.heartMeasure.startNotifications();
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x01]).buffer,
    );
    if (this.#heartRatePing) clearInterval(this.#heartRatePing);
    this.#heartRatePing = setInterval(() => {
      if (this.#heartRateRealtime !== true && this.#heartRatePing) {
        return clearInterval(this.#heartRatePing);
      }
      this.chars.heartCtrl.writeValueWithResponse(
        new Uint8Array([0x16]).buffer,
      );
    }, 12000);
  }

  async stopHeartRateRealtime() {
    if (!this.#heartRateRealtime) {
      throw new Error("Heart Rate realtime not even started");
    }
    this.#heartRateRealtime = false;
    if (this.#heartRatePing) clearInterval(this.#heartRatePing);
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x00]).buffer,
    );
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x00]).buffer,
    );
    await this.chars.heartMeasure.stopNotifications();
    await this.chars.sensor.writeValueWithoutResponse(
      new Uint8Array([0x03]).buffer,
    );
    await this.chars.hz.stopNotifications();
  }

  #fetching = false;
  #fetchStart?: Time;
  firstTimestamp?: Time;
  lastTimestamp?: Time;
  pkg: number = 0;

  set _fetching(v: boolean) {
    this.#fetching = v;
  }

  get fetching() {
    return this.#fetching;
  }

  get fetchStart() {
    return this.#fetchStart;
  }

  get fetchStartDate() {
    const start = this.#fetchStart;
    if (!start) return;
    return timeToDate(start);
  }

  async startActivityFetch(start: Partial<Time> = {}) {
    this.pkg = 0;
    start = Object.assign(
      {
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        date: new Date().getDate(),
        hour: 0,
        minute: 0,
      },
      start,
    );

    const command: number[] = [0x01, 0x01];
    const offset = await this.chars.currentTime
      .readValue()
      .then((e) => new Uint8Array(e.buffer).slice(9, 11));

    command.push(
      ...Struct.pack("<H", [start.year!]),
      start.month!,
      start.date!,
      start.hour!,
      start.minute!,
      ...offset,
    );

    await this.chars.fetch.writeValueWithoutResponse(
      new Uint8Array(command).buffer,
    );
    this.#fetching = true;
    this.#fetchStart = start as any;
  }
}
