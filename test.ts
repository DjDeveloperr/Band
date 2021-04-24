/// <reference lib="dom"/>
import { Band, WorkoutType } from "./src/band.ts";

const log = (title: string, color: string, msg: string) =>
  (document.getElementById(
    "logs"
  )!.innerHTML += `<br/><span class="log-title" style="color: ${color}">[${title}]</span> <span>${msg}</span>`);

const define = (name: string, value: any) =>
  Object.defineProperty(window, name, { value });

const COLOR1 = "#0D993A";
const COLOR2 = "#519ABA";
const COLOR3 = "#CBBF38";
const COLOR4 = "#E37331";

const logs = {
  band: (msg: string) => log("Band", COLOR1, msg),
  gatt: (msg: string) => log("Gatt", COLOR2, msg),
  auth: (msg: string) => log("Auth", COLOR4, msg),
  info: (msg: string) => log("Info", COLOR3, msg),
  error: (msg: string) => log("Error", "red", msg),
};

logs.info("Init logger");

async function init(n: boolean = false) {
  try {
    if (!n) logs.band("Connecting...");

    // @ts-ignore
    if (typeof AES1 !== "undefined") {
      // @ts-ignore
      window.AES = AES1;
    }

    const band = await Band.connect(localStorage.getItem("AUTH_KEY")!);
    define("band", band);

    logs.band("Connected to Band!");

    band.on("disconnect", () => {
      logs.gatt("Disconnected");
    });

    band.on("init", () => {
      logs.gatt("Initialized");
    });

    band.on("musicFocusIn", () => {
      logs.info("Music Focus In");
    });

    band.on("musicFocusOut", () => {
      logs.info("Music Focus Out");
    });

    band.on("musicForward", () => {
      logs.info("Music Forward");
    });

    band.on("musicBackward", () => {
      logs.info("Music Backward");
    });

    band.on("musicPlay", () => {
      logs.info("Music Play");
    });

    band.on("musicPause", () => {
      logs.info("Music Pause");
    });

    band.on("musicVolumeUp", () => {
      logs.info("Music Volume Up");
    });

    band.on("musicVolumeDown", () => {
      logs.info("Music Volume Down");
    });

    band.on("findDevice", () => {
      logs.info("Find device");
    });

    band.on("foundDevice", () => {
      logs.info("Found device");
    });

    band.on("alarmToggle", () => {
      logs.info("Alarm Toggle");
    });

    band.on("workoutStart", (type, loc) => {
      logs.info(
        "Workout Start: " +
          WorkoutType[type] +
          (loc ? " (looking for location)" : "")
      );
    });

    band.on("authStateChange", (s) => {
      logs.auth("Auth State: " + s);
    });

    await band.init();
    logs.auth("Authorizing...");
    try {
      await band.authorize();
    } catch (e) {}

    const revision = await band.getRevision();
    const hrdwRevision = await band.getHrdwRevision();

    logs.info(`Firmware ${revision}`);
    logs.info(`Hardware ${hrdwRevision}`);

    const battery = await band.getBatteryInfo();
    logs.info(
      `Battery (${battery.status}): ${battery.level} (last level: ${battery.lastLevel})`
    );
    const time = await band.getCurrentTime();
    // logs.info(
    //   `Current Time: ${time.hours}:${time.minutes}:${time.seconds} - ${time.date}/${time.month}/${time.year} (Day ${time.day})`
    // );
  } catch (e) {
    if (!n) logs.error(e.toString());
  }
}

init(true).catch(() => {});
