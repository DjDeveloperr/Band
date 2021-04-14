/// <reference path="./types.d.ts"/>

import { EventEmitter, AES } from "../deps.ts";
import { AlertType, Chars, Services } from "./constants.ts";
import {
  BatteryInfo,
  DateTime,
  packDate,
  parseBatteryResponse,
  parseDate,
} from "./parsers.ts";

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();

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
  }
}

export class BandCharacteristics extends Base {
  auth!: BluetoothRemoteGATTCharacteristic;
  heartCtrl!: BluetoothRemoteGATTCharacteristic;
  heartMeasure!: BluetoothRemoteGATTCharacteristic;
  fetch!: BluetoothRemoteGATTCharacteristic;
  acitvity!: BluetoothRemoteGATTCharacteristic;
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

  async init() {
    this.auth = await this.band.services.main2.getCharacteristic(Chars.Auth);
    this.heartCtrl = await this.band.services.heartrate.getCharacteristic(
      Chars.HeartRateControl
    );
    this.heartMeasure = await this.band.services.heartrate.getCharacteristic(
      Chars.HeartRateMeasure
    );
    this.fetch = await this.band.services.main1.getCharacteristic(Chars.Fetch);
    this.acitvity = await this.band.services.main1.getCharacteristic(
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
    // this.customAlert = await this.band.services.alert.getCharacteristic(
    //   Chars.CustomAlert
    // );

    this.auth.oncharacteristicvaluechanged = (evt) => {
      console.log("Auth Change", evt);
    };
    this.music.oncharacteristicvaluechanged = (evt) => {
      console.log("Music Change", evt);
    };

    await this.auth.startNotifications();
    await this.music.startNotifications();
  }
}

export class Band extends EventEmitter<{
  disconnect: [];
  init: [];
}> {
  static DEVICE_NAME = "Mi Smart Band 4";

  static async connect() {
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

    return new Band(device, gatt);
  }

  services: BandServices;
  chars: BandCharacteristics;

  constructor(
    public device: BluetoothDevice,
    public gatt: BluetoothRemoteGATTServer
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
    await this.chars.alert.writeValue(encoder.encode(type).buffer);
  }

  async setCurrentTime(date: DateTime) {
    await this.chars.currentTime.writeValueWithResponse(packDate(date).buffer);
  }

  async writeDisplayCommand(...cmd: number[]) {
    await this.chars.config.writeValue(new Uint8Array([6, ...cmd]).buffer);
  }

  async sendCustomAlert(type: number, title: string, msg: string) {
    await this.chars.customAlert.writeValue(
      new Uint8Array([type, 1, ...encoder.encode(`${title}\x0a\x0a\x0a${msg}`)])
        .buffer
    );
  }
}
