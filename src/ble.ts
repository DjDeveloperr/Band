import { EventEmitter } from "../deps.ts";

export class BTServuce extends EventEmitter<{}> {
  constructor(public service: BluetoothRemoteGATTService) {
    super();
  }
}

export class BTCharacteristic extends EventEmitter<{}> {
  constructor(public char: BluetoothRemoteGATTCharacteristic) {
    super();
  }
}

export class BTDescriptor extends EventEmitter<{}> {
  constructor(public desc: BluetoothRemoteGATTDescriptor) {
    super();
  }
}

export class BTGatt extends EventEmitter<{}> {
  constructor(public gatt: BluetoothRemoteGATTServer) {
    super();
  }
}

export class BTDevce extends EventEmitter<{
  advertisementReceived: [];
  notification: [char: BTCharacteristic];
}> {
  gatt?: BTGatt;

  constructor(public device: BluetoothDevice) {
    super();
    this.gatt = device.gatt ? new BTGatt(device.gatt) : undefined;
    this.device.onadvertisementreceived = async () =>
      await this.emit("advertisementReceived");
    this.device.oncharacteristicvaluechanged = async (evt) => {
      await this.emit("notification", new BTCharacteristic(evt.target as any));
    };
    this.device.onserviceadded;
  }

  get id() {
    return this.device.id;
  }

  get name() {
    return this.device.name;
  }

  get uuids() {
    return this.device.uuids;
  }
}
