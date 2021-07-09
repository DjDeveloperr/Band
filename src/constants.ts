export const Services = {
  Main1: "0000fee0-0000-1000-8000-00805f9b34fb",
  Main2: "0000fee1-0000-1000-8000-00805f9b34fb",
  Alert: "00001802-0000-1000-8000-00805f9b34fb",
  AlertNotification: "00001811-0000-1000-8000-00805f9b34fb",
  HeartRate: "0000180d-0000-1000-8000-00805f9b34fb",
  DeviceInfo: "0000180a-0000-1000-8000-00805f9b34fb",
  DfuFirmware: "00001530-0000-3512-2118-0009af100700",
  Unknown1: "00003802-0000-1000-8000-00805f9b34fb",
  Unknown2: "00001801-0000-1000-8000-00805f9b34fb",
  Unknown3: "00001800-0000-1000-8000-00805f9b34fb",
};

export const Chars = {
  Hz: "00000002-0000-3512-2118-0009af100700",
  Sensor: "00000001-0000-3512-2118-0009af100700",
  Auth: "00000009-0000-3512-2118-0009af100700",
  HeartRateMeasure: "00002a37-0000-1000-8000-00805f9b34fb",
  HeartRateControl: "00002a39-0000-1000-8000-00805f9b34fb",
  Alert: "00002a06-0000-1000-8000-00805f9b34fb",
  CustomAlert: "00002a46-0000-1000-8000-00805f9b34fb",
  Battery: "00000006-0000-3512-2118-0009af100700",
  Steps: "00000007-0000-3512-2118-0009af100700",
  ControlPoint: "0000ff05-0000-1000-8000-00805f9b34fb",
  FirmwareData: "0000ff08-0000-1000-8000-00805f9b34fb",
  LeParams: "0000ff09-0000-1000-8000-00805f9b34fb",
  Revision: 0x2a28,
  Serial: 0x2a25,
  HrdwRevision: 0x2a27,
  Configuration: "00000003-0000-3512-2118-0009af100700",
  ChunkedTransfer: "00000020-0000-3512-2118-0009af100700",
  Events: "00000010-0000-3512-2118-0009af100700",
  UserSettings: "00000008-0000-3512-2118-0009af100700",
  ActivityData: "00000005-0000-3512-2118-0009af100700",
  Fetch: "00000004-0000-3512-2118-0009af100700",
  CurrentTime: "00002a2b-0000-1000-8000-00805f9b34fb",
  Age: "00002a80-0000-1000-8000-00805f9b34fb",
  DfuFirmware: "00001531-0000-3512-2118-0009af100700",
  DfuFirmwareWrite: "00001532-0000-3512-2118-0009af100700",
};

export enum AlertType {
  None = 0,
  Email = 1,
  Phone = 2,
  Call = 3,
  CallNotif = 4,
  Message = 5,
}

export enum MusicState {
  Playing = 1,
  Paused = 0,
}

export enum WeekDay {
  Monday = 0x01 << 0,
  Tuesday = 0x01 << 1,
  Wednesday = 0x01 << 2,
  Thursday = 0x01 << 3,
  Friday = 0x01 << 4,
  Saturday = 0x01 << 5,
  Sunday = 0x01 << 6,
  Everyday = 0x01 << 7,
}

export interface MusicInfo {
  state: MusicState;
  artist?: string;
  album?: string;
  track?: string;
  position?: number;
  duration?: number;
  volume: number;
}

export enum AuthState {
  None = "None",
  KeySendFail = "Key Send Failed",
  RequestRdnError = "Request Random Error",
  Success = "Success",
  EncryptionKeyFailed = "Encryption Key Failed",
  IncorrectKey = "Incorrect Auth Key",
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
