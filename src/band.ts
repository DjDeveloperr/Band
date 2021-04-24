/// <reference path="./types.d.ts"/>

import { EventEmitter, AES, Struct, crc32 } from "../deps.ts";
import {
  AlertType,
  Chars,
  MusicState,
  Services,
  WeekDay,
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

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
const MAX_CHUNKLENGTH = 17;

export class Base {
  constructor(public band: Band) {}
}

export class BandServices extends Base {
  main1!: BluetoothRemoteGATTService;
  main2!: BluetoothRemoteGATTService;
  heartrate!: BluetoothRemoteGATTService;
  dfuFirmware!: BluetoothRemoteGATTService;
  alert!: BluetoothRemoteGATTService;
  alertNotification!: BluetoothRemoteGATTService;
  deviceInfo!: BluetoothRemoteGATTService;
  unknown1!: BluetoothRemoteGATTService;
  unknown2!: BluetoothRemoteGATTService;
  unknown3!: BluetoothRemoteGATTService;

  async init() {
    this.main1 = await this.band.gatt.getPrimaryService(Services.Main1);
    this.main2 = await this.band.gatt.getPrimaryService(Services.Main2);
    this.heartrate = await this.band.gatt.getPrimaryService(Services.HeartRate);
    this.dfuFirmware = await this.band.gatt.getPrimaryService(
      Services.DfuFirmware
    );
    this.alert = await this.band.gatt.getPrimaryService(Services.Alert);
    this.deviceInfo = await this.band.gatt.getPrimaryService(
      Services.DeviceInfo
    );
    this.alertNotification = await this.band.gatt.getPrimaryService(
      Services.AlertNotification
    );
    this.unknown1 = await this.band.gatt.getPrimaryService(Services.Unknown1);
    this.unknown2 = await this.band.gatt.getPrimaryService(Services.Unknown2);
    this.unknown3 = await this.band.gatt.getPrimaryService(Services.Unknown3);
  }
}

function byteq(left: DataView, right: number[]) {
  if (left.byteLength < right.length) return false;

  let match = true;
  right.forEach((e, i) => {
    if (!match) return;
    if (e != left.getUint8(i)) match = false;
  });
  return match;
}

export class BandCharacteristics extends Base {
  auth!: BluetoothRemoteGATTCharacteristic;
  heartCtrl!: BluetoothRemoteGATTCharacteristic;
  heartMeasure!: BluetoothRemoteGATTCharacteristic;
  fetch!: BluetoothRemoteGATTCharacteristic;
  activity!: BluetoothRemoteGATTCharacteristic;
  chunked!: BluetoothRemoteGATTCharacteristic;
  music!: BluetoothRemoteGATTCharacteristic;
  revision!: BluetoothRemoteGATTCharacteristic;
  hrdwRevision!: BluetoothRemoteGATTCharacteristic;
  battery!: BluetoothRemoteGATTCharacteristic;
  currentTime!: BluetoothRemoteGATTCharacteristic;
  config!: BluetoothRemoteGATTCharacteristic;
  alert!: BluetoothRemoteGATTCharacteristic;
  customAlert!: BluetoothRemoteGATTCharacteristic;
  steps!: BluetoothRemoteGATTCharacteristic;
  firm!: BluetoothRemoteGATTCharacteristic;
  firmWrite!: BluetoothRemoteGATTCharacteristic;
  hz!: BluetoothRemoteGATTCharacteristic;
  sensor!: BluetoothRemoteGATTCharacteristic;

  async init() {
    this.auth = await this.band.services.main2.getCharacteristic(Chars.Auth);
    this.heartCtrl = await this.band.services.heartrate.getCharacteristic(
      Chars.HeartRateControl
    );
    this.heartMeasure = await this.band.services.heartrate.getCharacteristic(
      Chars.HeartRateMeasure
    );
    this.fetch = await this.band.services.main1.getCharacteristic(Chars.Fetch);
    this.activity = await this.band.services.main1.getCharacteristic(
      Chars.ActivityData
    );
    this.chunked = await this.band.services.main1.getCharacteristic(
      Chars.ChunkedTransfer
    );
    this.music = await this.band.services.main1.getCharacteristic(Chars.Music);
    this.revision = await this.band.services.deviceInfo.getCharacteristic(
      Chars.Revision
    );
    this.hrdwRevision = await this.band.services.deviceInfo.getCharacteristic(
      Chars.HrdwRevision
    );
    this.battery = await this.band.services.main1.getCharacteristic(
      Chars.Battery
    );
    this.currentTime = await this.band.services.main1.getCharacteristic(
      Chars.CurrentTime
    );
    this.config = await this.band.services.main1.getCharacteristic(
      Chars.Configuration
    );
    this.steps = await this.band.services.main1.getCharacteristic(Chars.Steps);
    this.alert = await this.band.services.alert.getCharacteristic(Chars.Alert);
    this.customAlert = await this.band.services.alertNotification.getCharacteristic(
      Chars.CustomAlert
    );
    this.firm = await this.band.services.dfuFirmware.getCharacteristic(
      Chars.DfuFirmware
    );
    this.firmWrite = await this.band.services.dfuFirmware.getCharacteristic(
      Chars.DfuFirmwareWrite
    );
    this.hz = await this.band.services.main1.getCharacteristic(Chars.Hz);
    this.sensor = await this.band.services.main1.getCharacteristic(
      Chars.Sensor
    );

    this.auth.oncharacteristicvaluechanged = () => {
      console.log("Auth Change", [
        ...new Uint8Array(this.auth.value?.buffer ?? new ArrayBuffer(0)),
      ]);
      if (!this.auth.value) return;

      if (byteq(this.auth.value, [0x10, 0x01, 0x01])) {
        this.band.requestRandomNumber();
      } else if (byteq(this.auth.value, [0x10, 0x01, 0x04])) {
        this.band.state = AuthState.KeySendFail;
        this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x02, 0x01])) {
        const random = new Uint8Array(this.auth.value.buffer.slice(3));
        this.band.emit("authRandomNumber", random);
        this.band.sendEncryptedNumber(random);
      } else if (byteq(this.auth.value, [0x10, 0x02, 0x04])) {
        this.band.state = AuthState.RequestRdnError;
        this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x03, 0x01])) {
        this.band.state = AuthState.Success;
        this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x03, 0x04])) {
        this.band.state = AuthState.EncryptionKeyFailed;
        this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x03])) {
        this.band.state = AuthState.UnknownError;
        this.band.emit("authStateChange", this.band.state);
      }
    };
    this.music.oncharacteristicvaluechanged = () => {
      console.log("Music Change", [
        ...new Uint8Array(this.music.value?.buffer ?? new ArrayBuffer(0)),
      ]);
      if (!this.music.value) return;
      const bt = this.music.value.getUint8(0);
      if (bt == 8) {
        this.band.emit("findDevice");
        this.band.writeDisplayCommand(0x14, 0x00, 0x00);
      } else if (bt == 0x0f) {
        this.band.emit("foundDevice");
        this.band.writeDisplayCommand(0x14, 0x00, 0x01);
      } else if (bt == 22) {
      } else if (bt == 10) {
        this.band.emit("alarmToggle");
      } else if (bt == 1) {
      } else if (bt == 20) {
        if (this.music.value.getUint8(1) == 0)
          this.band.emit(
            "workoutStart",
            this.music.value.getUint8(3),
            this.music.value.getUint8(2) == 1
          );
      } else if (bt == 254) {
        const cmd =
          this.music.value.byteLength > 1
            ? this.music.value.getUint8(1)
            : undefined;

        if (cmd == 0xe0) {
          this.band.emit("musicFocusIn");
          this.band.updateMusic();
        } else if (cmd == 0xe1) {
          this.band.emit("musicFocusOut");
        } else if (cmd == 0x00) {
          this.band.emit("musicPlay");
        } else if (cmd == 0x01) {
          this.band.emit("musicPause");
        } else if (cmd == 0x03) {
          this.band.emit("musicForward");
        } else if (cmd == 0x04) {
          this.band.emit("musicBackward");
        } else if (cmd == 0x05) {
          this.band.emit("musicVolumeUp");
        } else if (cmd == 0x06) {
          this.band.emit("musicVolumeDown");
        }
      }
    };

    this.fetch.oncharacteristicvaluechanged = () => {
      console.log("Fetch Change", [
        ...new Uint8Array(this.fetch.value?.buffer ?? new ArrayBuffer(0)),
      ]);
    };

    this.activity.oncharacteristicvaluechanged = () => {
      console.log("Activity Change", [
        ...new Uint8Array(this.activity.value?.buffer ?? new ArrayBuffer(0)),
      ]);
    };

    this.steps.oncharacteristicvaluechanged = () => {
      const status = parseStatus(this.steps.value!);
      // console.log("Status Change", status);
      this.band.emit("statusChange", status);
    };

    this.heartMeasure.oncharacteristicvaluechanged = () => {
      if (!this.heartMeasure.value) return;
      const data = new Uint8Array(this.heartMeasure.value.buffer);
      this.band.emit("heartRateMeasure", data[1] ?? 0);
    };

    await this.auth.startNotifications();
    await this.music.startNotifications();
    await this.fetch.startNotifications();
    await this.activity.startNotifications();
    await this.steps.startNotifications();
  }
}

export interface MusicInfo {
  state: MusicState;
  artist?: string;
  album?: string;
  track?: string;
  position?: number;
  duration?: number;
  volume?: number;
}

export enum AuthState {
  None = "None",
  KeySendFail = "Key Send Failed",
  RequestRdnError = "Request Random Error",
  Success = "Success",
  EncryptionKeyFailed = "Encryption Key Failed",
  UnknownError = "Unknown Error",
}

export enum WorkoutType {
  OutdoorRunning = 1,
  Treadmill,
  Cycling,
  Walking,
  Freestyle,
  PoolSwimming,
}

function bytesFromHex(hex: string) {
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

export class Band extends EventEmitter<{
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
}> {
  static DEVICE_NAME = "Mi Smart Band 4";

  static async connect(key?: string) {
    let device: BluetoothDevice | undefined;
    const devices =
      (await (navigator.bluetooth.getDevices || (() => {}))()) ?? [];
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

    const gatt = await device?.gatt?.connect().catch(() => undefined);
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

  constructor(
    public device: BluetoothDevice,
    public gatt: BluetoothRemoteGATTServer,
    public key?: string
  ) {
    super();
    this.services = new BandServices(this);
    this.chars = new BandCharacteristics(this);

    device.ongattserverdisconnected = () => {
      this.emit("disconnect");
    };
  }

  async init() {
    await this.services.init();
    await this.chars.init();
    this.emit("init");
  }

  async authorize(): Promise<true> {
    if (!this.key) throw new Error("Auth Key not present");
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
      new Uint8Array([0x02, 0x00]).buffer
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
      new Uint8Array([6, 17, 0, ...encoder.encode(enc)]).buffer
    );
  }

  async sendAlert(type: AlertType) {
    await this.chars.alert.writeValue(new Uint8Array([type]).buffer);
  }

  async setCurrentTime(date: DateTime) {
    await this.chars.currentTime.writeValueWithResponse(packDate(date).buffer);
  }

  async writeDisplayCommand(...cmd: number[]) {
    await this.chars.config.writeValue(new Uint8Array([0x06, ...cmd]).buffer);
  }

  async sendCustomAlert(type: number, title: string, msg: string) {
    await this.chars.customAlert.writeValue(
      new Uint8Array([
        type,
        1,
        ...encoder.encode(title),
        0x0a,
        0x0a,
        0x0a,
        ...encoder.encode(msg),
      ]).buffer
    );
  }

  async getStatus() {
    const value = await this.chars.steps.readValue();
    return parseStatus(value);
  }

  async writeChunked(type: number, data: Uint8Array) {
    let remaining = data.length;
    let count = 0;

    while (remaining > 0) {
      let copybytes = Math.min(remaining, MAX_CHUNKLENGTH);
      let chunk: number[] = [];
      let flag = 0;
      if (remaining <= MAX_CHUNKLENGTH) {
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
        ...data.slice(
          count * MAX_CHUNKLENGTH,
          count * MAX_CHUNKLENGTH + copybytes
        )
      );
      count += 1;
      await this.chars.chunked.writeValueWithoutResponse(
        new Uint8Array(chunk).buffer
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
    id = 0
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
      Struct.pack("5B", [2, alarmTag, hour, minute, repitionMask]).buffer
    );
  }

  async dfuUpdate(type: "firmware" | "watchface", bin: Uint8Array) {
    const crc = parseInt(crc32(bin), 16);
    await this.chars.firm.writeValueWithResponse(
      new Uint8Array([
        0x01,
        0x08,
        ...Struct.pack("<I", [bin.byteLength]).slice(0, 3),
        0x00,
        ...Struct.pack("<I", [crc]),
      ]).buffer
    );
    await this.chars.firm.writeValueWithResponse(
      new Uint8Array([0x03, 0x01]).buffer
    );
    let offset = 0;
    while (offset < bin.byteLength) {
      const end = offset + 20;
      const chunk = bin.slice(
        offset,
        end >= bin.byteLength ? bin.byteLength : end
      );
      if (chunk.length === 0) continue;
      await this.chars.firmWrite.writeValue(chunk.buffer);
      offset += 20;
    }
    await this.chars.firm.writeValueWithResponse(new Uint8Array([0x00]).buffer);
    await this.chars.firm.writeValueWithResponse(new Uint8Array([0x04]).buffer);
    if (type === "firmware") {
      await this.chars.firm.writeValueWithResponse(
        new Uint8Array([0x05]).buffer
      );
    }
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
      new Uint8Array([0x15, 0x00, 0x00]).buffer
    );
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x14, 0x00]).buffer
    );
    if (enabled) {
      await this.chars.heartCtrl.writeValueWithResponse(
        new Uint8Array([0x15, 0x00, 0x01]).buffer
      );
      await this.chars.heartCtrl.writeValueWithResponse(
        new Uint8Array([0x14, ...new TextEncoder().encode(String(interval))])
          .buffer
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
    if (this.#heartRateRealtime)
      throw new Error("Heart Rate realtime already started");
    this.#heartRateRealtime = true;
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x02, 0x00]).buffer
    );
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x00]).buffer
    );
    await this.chars.heartMeasure.startNotifications();
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x01]).buffer
    );
    if (this.#heartRatePing) clearInterval(this.#heartRatePing);
    this.#heartRatePing = setInterval(() => {
      if (this.#heartRateRealtime !== true && this.#heartRatePing)
        return clearInterval(this.#heartRatePing);
      this.chars.heartCtrl.writeValueWithResponse(
        new Uint8Array([0x16]).buffer
      );
    }, 12000);
  }

  async stopHeartRateRealtime() {
    if (!this.#heartRateRealtime)
      throw new Error("Heart Rate realtime not even started");
    this.#heartRateRealtime = false;
    if (this.#heartRatePing) clearInterval(this.#heartRatePing);
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x00]).buffer
    );
    await this.chars.heartCtrl.writeValueWithResponse(
      new Uint8Array([0x15, 0x01, 0x00]).buffer
    );
    await this.chars.heartMeasure.stopNotifications();
    await this.chars.sensor.writeValueWithoutResponse(
      new Uint8Array([0x03]).buffer
    );
    await this.chars.hz.stopNotifications();
  }
}
