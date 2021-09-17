import { Struct } from "../deps.ts";
import { Base } from "./base.ts";
import { AuthState, Chars } from "./constants.ts";
import { parseStatus } from "./parsers.ts";
import { byteq, dateToTime, Time, timeToDate } from "./util.ts";

export class BandCharacteristics extends Base {
  auth!: BluetoothRemoteGATTCharacteristic;
  heartCtrl!: BluetoothRemoteGATTCharacteristic;
  heartMeasure!: BluetoothRemoteGATTCharacteristic;
  fetch!: BluetoothRemoteGATTCharacteristic;
  activity!: BluetoothRemoteGATTCharacteristic;
  chunked!: BluetoothRemoteGATTCharacteristic;
  events!: BluetoothRemoteGATTCharacteristic;
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
      Chars.HeartRateControl,
    );
    this.heartMeasure = await this.band.services.heartrate.getCharacteristic(
      Chars.HeartRateMeasure,
    );
    this.fetch = await this.band.services.main1.getCharacteristic(Chars.Fetch);
    this.activity = await this.band.services.main1.getCharacteristic(
      Chars.ActivityData,
    );
    this.chunked = await this.band.services.main1.getCharacteristic(
      Chars.ChunkedTransfer,
    );
    this.events = await this.band.services.main1.getCharacteristic(
      Chars.Events,
    );
    this.revision = await this.band.services.deviceInfo.getCharacteristic(
      Chars.Revision,
    );
    this.hrdwRevision = await this.band.services.deviceInfo.getCharacteristic(
      Chars.HrdwRevision,
    );
    this.battery = await this.band.services.main1.getCharacteristic(
      Chars.Battery,
    );
    this.currentTime = await this.band.services.main1.getCharacteristic(
      Chars.CurrentTime,
    );
    this.config = await this.band.services.main1.getCharacteristic(
      Chars.Configuration,
    );
    this.steps = await this.band.services.main1.getCharacteristic(Chars.Steps);
    this.alert = await this.band.services.alert.getCharacteristic(Chars.Alert);
    this.customAlert = await this.band.services.alertNotification
      .getCharacteristic(
        Chars.CustomAlert,
      );
    this.firm = await this.band.services.dfuFirmware.getCharacteristic(
      Chars.DfuFirmware,
    );
    this.firmWrite = await this.band.services.dfuFirmware.getCharacteristic(
      Chars.DfuFirmwareWrite,
    );
    this.hz = await this.band.services.main1.getCharacteristic(Chars.Hz);
    this.sensor = await this.band.services.main1.getCharacteristic(
      Chars.Sensor,
    );

    this.auth.oncharacteristicvaluechanged = async () => {
      console.log("Auth Change", [
        ...new Uint8Array(this.auth.value?.buffer ?? new ArrayBuffer(0)),
      ]);
      if (!this.auth.value) return;

      if (byteq(this.auth.value, [0x10, 0x01, 0x01])) {
        await this.band.requestRandomNumber();
      } else if (byteq(this.auth.value, [0x10, 0x01, 0x04])) {
        this.band.state = AuthState.KeySendFail;
        await this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x02, 0x01])) {
        const random = new Uint8Array(this.auth.value.buffer.slice(3));
        await this.band.emit("authRandomNumber", random);
        await this.band.sendEncryptedNumber(random);
      } else if (byteq(this.auth.value, [0x10, 0x02, 0x04])) {
        this.band.state = AuthState.RequestRdnError;
        await this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x03, 0x01])) {
        this.band.state = AuthState.Success;
        await this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x03, 0x04])) {
        this.band.state = AuthState.EncryptionKeyFailed;
        await this.band.emit("authStateChange", this.band.state);
      } else if (byteq(this.auth.value, [0x10, 0x03])) {
        this.band.state = this.auth.value.byteLength >= 3 &&
            new Uint8Array(this.auth.value.buffer)[2] == 8
          ? AuthState.IncorrectKey
          : AuthState.UnknownError;
        await this.band.emit("authStateChange", this.band.state);
      }
    };
    this.events.oncharacteristicvaluechanged = async () => {
      console.log("Events Change", [
        ...new Uint8Array(this.events.value?.buffer ?? new ArrayBuffer(0)),
      ]);
      if (!this.events.value) return;
      const bt = this.events.value.getUint8(0);
      if (bt == 8) {
        await this.band.emit("findDevice");
        await this.band.writeDisplayCommand(0x14, 0x00, 0x00);
      } else if (bt == 7) {
        await this.band.emit("callDismiss");
      } else if (bt == 9) {
        await this.band.emit("callSilent");
      } else if (bt == 0x0f) {
        await this.band.emit("foundDevice");
        await this.band.writeDisplayCommand(0x14, 0x00, 0x01);
      } else if (bt == 22) {
      } else if (bt == 10) {
        await this.band.emit("alarmToggle");
      } else if (bt == 1) {
      } else if (bt == 20) {
        if (this.events.value.getUint8(1) == 0) {
          await this.band.emit(
            "workoutStart",
            this.events.value.getUint8(3),
            this.events.value.getUint8(2) == 1,
          );
        }
      } else if (bt == 254) {
        const cmd = this.events.value.byteLength > 1
          ? this.events.value.getUint8(1)
          : undefined;

        if (cmd == 0xe0) {
          await this.band.emit("musicFocusIn");
          await this.band.updateMusic();
        } else if (cmd == 0xe1) {
          await this.band.emit("musicFocusOut");
        } else if (cmd == 0x00) {
          await this.band.emit("musicPlay");
        } else if (cmd == 0x01) {
          await this.band.emit("musicPause");
        } else if (cmd == 0x03) {
          await this.band.emit("musicForward");
        } else if (cmd == 0x04) {
          await this.band.emit("musicBackward");
        } else if (cmd == 0x05) {
          await this.band.emit("musicVolumeUp");
        } else if (cmd == 0x06) {
          await this.band.emit("musicVolumeDown");
        }
      }
    };

    this.fetch.oncharacteristicvaluechanged = async () => {
      console.log("Fetch Change", [
        ...new Uint8Array(this.fetch.value?.buffer ?? new ArrayBuffer(0)),
      ]);
      if (!this.fetch.value) return;
      const bytes = new Uint8Array(this.fetch.value.buffer);

      if (byteq(this.fetch.value, [0x10, 0x01, 0x01])) {
        const [year] = Struct.unpack("<H", bytes.slice(7, 9)) as [number];
        const [month, date, hour, minute] = bytes.slice(9, 13);
        const time: Time = {
          year,
          minute,
          month,
          hour,
          date,
        };

        this.band.firstTimestamp = time;
        this.band.pkg = 0;
        await this.band.emit("fetchStart", time);
        await this.fetch.writeValueWithoutResponse(
          new Uint8Array([0x02]).buffer,
        );
      } else if (byteq(this.fetch.value, [0x10, 0x02, 0x01])) {
        await this.band.emit("fetchEnd");
        this.band._fetching = false;
      } else if (byteq(this.fetch.value, [0x10, 0x01, 0x02])) {
        await this.band.emit("error", "Already fetching Activity Data");
      } else if (byteq(this.fetch.value, [0x10, 0x02, 0x04])) {
        await this.band.emit("info", "No more activity fetch possible");
      }
    };

    this.firm.oncharacteristicvaluechanged = async () => {
      console.log("Firmware Change", [
        ...new Uint8Array(this.firm.value?.buffer ?? new ArrayBuffer(0)),
      ]);
    };

    this.activity.oncharacteristicvaluechanged = async () => {
      console.log("Activity Change", [
        ...new Uint8Array(this.activity.value?.buffer ?? new ArrayBuffer(0)),
      ]);

      if (!this.activity.value) return;
      const bytes = new Uint8Array(this.activity.value.buffer);

      if (bytes.length % 4 === 1) {
        if (!this.band.pkg) this.band.pkg = 0;
        this.band.pkg++;
        let i = 1;
        while (i < bytes.length) {
          const index = this.band.pkg! * 4 + (i - 1) / 4;
          const ts = new Date(
            timeToDate(this.band.firstTimestamp!).getTime() + 1000 * index,
          );
          this.band.lastTimestamp = dateToTime(ts);
          const [category] = Struct.unpack("<B", [
            ...bytes.slice(i, i + 1),
          ]) as [number];
          const [intensity, steps, heartRate] = bytes.slice(i + 1, i + 4);
          await this.band.emit(
            "fetchData",
            {
              category,
              intensity,
              heartRate,
              steps,
            },
            this.band.lastTimestamp,
          );
          i += 4;
        }
      }
    };

    this.steps.oncharacteristicvaluechanged = async () => {
      const status = parseStatus(this.steps.value!);
      // console.log("Status Change", status);
      await this.band.emit("statusChange", status);
    };

    this.heartMeasure.oncharacteristicvaluechanged = async () => {
      if (!this.heartMeasure.value) return;
      const data = new Uint8Array(this.heartMeasure.value.buffer);
      await this.band.emit("heartRateMeasure", data[1] ?? 0);
    };

    await this.auth.startNotifications();
    await this.events.startNotifications();
    await this.steps.startNotifications();
    await this.fetch.startNotifications();
    await this.activity.startNotifications();
    await this.firm.startNotifications();
  }
}
