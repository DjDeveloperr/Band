class EventEmitter {
  listeners = {};
  globalWriters = [];
  onWriters = {};
  limit;
  constructor(maxListenersPerEvent) {
    this.limit = maxListenersPerEvent ?? 10;
  }
  on(eventName, listener) {
    if (listener) {
      if (!this.listeners[eventName]) {
        this.listeners[eventName] = [];
      }
      if (this.limit !== 0 && this.listeners[eventName].length >= this.limit) {
        throw new TypeError("Listeners limit reached: limit is " + this.limit);
      }
      this.listeners[eventName].push({
        once: false,
        cb: listener,
      });
      return this;
    } else {
      if (!this.onWriters[eventName]) {
        this.onWriters[eventName] = [];
      }
      if (this.limit !== 0 && this.onWriters[eventName].length >= this.limit) {
        throw new TypeError("Listeners limit reached: limit is " + this.limit);
      }
      const { readable, writable } = new TransformStream();
      this.onWriters[eventName].push(writable.getWriter());
      return readable[Symbol.asyncIterator]();
    }
  }
  once(eventName, listener) {
    if (!this.listeners[eventName]) {
      this.listeners[eventName] = [];
    }
    if (this.limit !== 0 && this.listeners[eventName].length >= this.limit) {
      throw new TypeError("Listeners limit reached: limit is " + this.limit);
    }
    this.listeners[eventName].push({
      once: true,
      cb: listener,
    });
    return this;
  }
  off(eventName, listener) {
    if (eventName) {
      if (listener) {
        this.listeners[eventName] = this.listeners[eventName]?.filter(
          ({ cb }) => cb !== listener
        );
      } else {
        delete this.listeners[eventName];
      }
    } else {
      this.listeners = {};
    }
    return this;
  }
  async emit(eventName, ...args) {
    const listeners = this.listeners[eventName]?.slice() ?? [];
    for (const { cb, once } of listeners) {
      cb(...args);
      if (once) {
        this.off(eventName, cb);
      }
    }
    if (this.onWriters[eventName]) {
      for (const writer of this.onWriters[eventName]) {
        await writer.write(args);
      }
    }
    for (const writer of this.globalWriters) {
      await writer.write({
        name: eventName,
        value: args,
      });
    }
  }
  async close(eventName) {
    this.off(eventName);
    if (eventName) {
      if (this.onWriters[eventName]) {
        for (const writer of this.onWriters[eventName]) {
          await writer.close();
        }
        delete this.onWriters[eventName];
      }
    } else {
      for (const writers of Object.values(this.onWriters)) {
        for (const writer of writers) {
          await writer.close();
        }
      }
      this.onWriters = {};
      for (const writer of this.globalWriters) {
        await writer.close();
      }
      this.globalWriters = [];
    }
  }
  [Symbol.asyncIterator]() {
    if (this.limit !== 0 && this.globalWriters.length >= this.limit) {
      throw new TypeError("Listeners limit reached: limit is " + this.limit);
    }
    const { readable, writable } = new TransformStream();
    this.globalWriters.push(writable.getWriter());
    return readable[Symbol.asyncIterator]();
  }
}
const Services = {
  Main1: "0000fee0-0000-1000-8000-00805f9b34fb",
  Main2: "0000fee1-0000-1000-8000-00805f9b34fb",
  Alert: "00001802-0000-1000-8000-00805f9b34fb",
  AlertNotification: "00001811-0000-1000-8000-00805f9b34fb",
  HeartRate: "0000180d-0000-1000-8000-00805f9b34fb",
  DeviceInfo: "0000180a-0000-1000-8000-00805f9b34fb",
  DfuFirmware: "00001530-0000-3512-2118-0009af100700",
};
const Chars = {
  Hz: "00000002-0000-3512-2118-0009af100700",
  Sensor: "00000001-0000-3512-2118-0009af100700",
  Auth: "00000009-0000-3512-2118-0009af100700",
  HeartRateMeasure: "00002a37-0000-1000-8000-00805f9b34fb",
  HeartRateControl: "00002a39-0000-1000-8000-00805f9b34fb",
  Alert: "00002a06-0000-1000-8000-00805f9b34fb",
  CustomAlert: "00002a46-0000-1000-8000-00805f9b34fb",
  Battery: "00000006-0000-3512-2118-0009af100700",
  Steps: "00000007-0000-3512-2118-0009af100700",
  LeParams: "0000FF09-0000-1000-8000-00805f9b34fb",
  Revision: 10792,
  Serial: 10789,
  HrdwRevision: 10791,
  Configuration: "00000003-0000-3512-2118-0009af100700",
  DeviceEvent: "00000010-0000-3512-2118-0009af100700",
  ChunkedTransfer: "00000020-0000-3512-2118-0009af100700",
  Music: "00000010-0000-3512-2118-0009af100700",
  UserSettings: "00000008-0000-3512-2118-0009af100700",
  ActivityData: "00000005-0000-3512-2118-0009af100700",
  Fetch: "00000004-0000-3512-2118-0009af100700",
  CurrentTime: "00002a2b-0000-1000-8000-00805f9b34fb",
  Age: "00002a80-0000-1000-8000-00805f9b34fb",
  DfuFirmware: "00001531-0000-3512-2118-0009af100700",
  DfuFirmwareWrite: "00001532-0000-3512-2118-0009af100700",
};
var AlertType;
(function (AlertType1) {
  AlertType1["None"] = "\x00";
  AlertType1["Message"] = "\x01";
  AlertType1["Phone"] = "\x02";
})(AlertType || (AlertType = {}));
var MusicState;
(function (MusicState1) {
  MusicState1[(MusicState1["Playing"] = 0)] = "Playing";
  MusicState1[(MusicState1["Paused"] = 1)] = "Paused";
})(MusicState || (MusicState = {}));
var WeekDay;
(function (WeekDay1) {
  WeekDay1[(WeekDay1["Monday"] = 1)] = "Monday";
  WeekDay1[(WeekDay1["Tuesday"] = 2)] = "Tuesday";
  WeekDay1[(WeekDay1["Wednesday"] = 4)] = "Wednesday";
  WeekDay1[(WeekDay1["Thursday"] = 8)] = "Thursday";
  WeekDay1[(WeekDay1["Friday"] = 16)] = "Friday";
  WeekDay1[(WeekDay1["Saturday"] = 32)] = "Saturday";
  WeekDay1[(WeekDay1["Sunday"] = 64)] = "Sunday";
  WeekDay1[(WeekDay1["Everyday"] = 128)] = "Everyday";
})(WeekDay || (WeekDay = {}));
var BatteryStatus;
(function (BatteryStatus1) {
  BatteryStatus1["Normal"] = "normal";
  BatteryStatus1["Charging"] = "charging";
})(BatteryStatus || (BatteryStatus = {}));
function parseBatteryResponse(data) {
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
function parseDate(data) {
  const year = data.getInt16(0, true);
  const month = data.getInt8(2);
  const date = data.getInt8(3);
  const hours = data.getInt8(4);
  const minutes = data.getInt8(5);
  const seconds = data.getInt8(6);
  let day = undefined;
  try {
    let v = data.getInt8(7);
    day = v;
  } catch (e) {}
  let fractions = undefined;
  try {
    let v1 = data.getInt8(8);
    fractions = v1;
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
function packDate(date) {
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
const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
class Base {
  band;
  constructor(band) {
    this.band = band;
  }
}
class BandServices extends Base {
  main1;
  main2;
  heartrate;
  dfuFirmware;
  alert;
  alertNotification;
  deviceInfo;
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
class BandCharacteristics extends Base {
  auth;
  heartCtrl;
  heartMeasure;
  fetch;
  acitvity;
  chunked;
  music;
  revision;
  hrdwRevision;
  battery;
  currentTime;
  config;
  alert;
  customAlert;
  steps;
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
class Band extends EventEmitter {
  device;
  gatt;
  static DEVICE_NAME = "Mi Smart Band 4";
  static async connect() {
    let device;
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
  services;
  chars;
  constructor(device, gatt) {
    super();
    this.device = device;
    this.gatt = gatt;
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
  async getBatteryInfo() {
    const data = await this.chars.battery.readValue();
    return parseBatteryResponse(data);
  }
  async getCurrentTime() {
    const data = await this.chars.currentTime.readValue();
    return parseDate(data);
  }
  async setEncoding(enc = "en_US") {
    await this.chars.config.writeValue(
      new Uint8Array([6, 17, 0, ...encoder.encode(enc)]).buffer
    );
  }
  async sendAlert(type) {
    await this.chars.alert.writeValue(encoder.encode(type).buffer);
  }
  async setCurrentTime(date) {
    await this.chars.currentTime.writeValueWithResponse(packDate(date).buffer);
  }
  async writeDisplayCommand(...cmd) {
    await this.chars.config.writeValue(new Uint8Array([6, ...cmd]).buffer);
  }
  async sendCustomAlert(type, title, msg) {
    await this.chars.customAlert.writeValue(
      new Uint8Array([
        type,
        1,
        ...encoder.encode(`${title}\x0a\0x0a\x0a${msg}`),
      ]).buffer
    );
  }
}
const log = (title, color, msg) =>
  (document.getElementById(
    "logs"
  ).innerHTML += `<br/><span style="color: ${color}">[${title}]</span> <span>${msg}</span>`);
const define = (name, value) =>
  Object.defineProperty(window, name, {
    value,
  });
const COLOR1 = "#0D993A";
const COLOR2 = "#519ABA";
const COLOR3 = "#CBBF38";
const logs = {
  band: (msg) => log("Band", COLOR1, msg),
  gatt: (msg) => log("Gatt", COLOR2, msg),
  info: (msg) => log("Info", COLOR3, msg),
  error: (msg) => log("Error", "red", msg),
};
logs.info("Init logger");
async function init(n = false) {
  try {
    if (!n) alert("Connecting");
    if (!n) logs.band("Connecting...");
    const band1 = await Band.connect();
    define("band", band1);
    logs.band("Connected to Band!");
    band1.on("disconnect", () => {
      logs.gatt("Disconnected");
    });
    band1.on("init", () => {
      logs.gatt("Initialized");
    });
    await band1.init();
    const revision = await band1.getRevision();
    const hrdwRevision = await band1.getHrdwRevision();
    logs.info(`Firmware ${revision}`);
    logs.info(`Hardware ${hrdwRevision}`);
    const battery = await band1.getBatteryInfo();
    logs.info(
      `Battery (${battery.status}): ${battery.level} (last time charged: ${battery.lastLevel})`
    );
    const time = await band1.getCurrentTime();
    logs.info(
      `Current Time: ${time.hours}:${time.minutes}:${time.seconds} - ${time.date}/${time.month}/${time.year} (Day ${time.day})`
    );
  } catch (e) {
    if (!n) alert(e.toString());
  }
}
init(true).catch(() => {});
