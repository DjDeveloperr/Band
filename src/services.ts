import { Services } from "./constants.ts";
import { Base } from "./base.ts";

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
