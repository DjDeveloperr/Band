/// <reference lib="dom"/>

import { Band, timeToDate, WorkoutType } from "./mod.ts";
import { MusicState } from "./src/constants.ts";

const LOGS = document.getElementById(
  "logs",
)!;

const log = (
  title: string,
  color: string,
  msg: string,
) => {
  const isOnEnd = true; // Math.abs(LOGS.scrollHeight - LOGS.scrollTop) < 5; // TODO: How?
  LOGS.innerHTML +=
    `<span class="log-title" style="color: ${color}">[${title}]</span> <span>${msg}</span><br/>`;
  if (isOnEnd) {
    LOGS.scrollTop = LOGS.scrollHeight;
  }
};

const define = (name: string, value: any) => {
  const obj: any = {};
  obj[name] = value;
  Object.assign(window, obj);
};

const dfu = document.getElementById("dfu")!;
const dfuProg = document.getElementById("dfu-prog")!;
const dfuText = document.getElementById("dfu-text")!;

function enableDfu() {
  dfu.style.display = "block";
}

function disableDfu() {
  dfu.style.display = "none";
  dfuText.innerText = "0%";
}

function setDfuProg(prog: number) {
  if (prog > 100) prog = 100;
  dfuProg.style.width = `${prog}%`;
  dfuText.innerText = `${Math.floor(prog)}%`;
}

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

    const key = localStorage.getItem("AUTH_KEY");
    if (!key) logs.info("Auth Key not found in local storage.");

    const band = await Band.connect(key!, false);

    band.on("connect", () => {
      logs.gatt("GATT Connected.");
    });

    await band.ready;

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
      band.music.state = MusicState.Playing;
      band.updateMusic();
    });

    band.on("musicPause", () => {
      logs.info("Music Pause");
      band.music.state = MusicState.Paused;
      band.updateMusic();
    });

    band.on("musicVolumeUp", () => {
      // logs.info("Music Volume Up");
      band.music.volume += 5;
      if (band.music.volume > 100) band.music.volume = 100;
      band.updateMusic();
    });

    band.on("musicVolumeDown", () => {
      // logs.info("Music Volume Down");
      band.music.volume -= 5;
      if (band.music.volume < 0) band.music.volume = 0;
      band.updateMusic();
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
          (loc ? " (looking for location)" : ""),
      );
    });

    band.on("authStateChange", (s) => {
      logs.auth("Auth State: " + s);
    });

    band.on("fetchStart", (t) => {
      logs.info(`Fetch Start (${timeToDate(t).toString()})`);
    });

    band.on("fetchData", (d, t) => {
      // logs.info(
      //   `Fetch (${timeToDate(t).toString()}): Category: ${
      //     d.category
      //   }, Intensity: ${d.intensity}, Steps: ${d.steps}, Heart Rate: ${
      //     d.heartRate
      //   }`
      // );
      console.log("Fetch", t, d);
    });

    band.on("fetchEnd", () => {
      logs.info("Fetch End");
    });

    band.on("error", (e) => {
      logs.info(`Error: ${e}`);
    });

    band.on("info", (e) => {
      logs.info(`Info: ${e}`);
    });

    band.on("dfuStart", (type, len) => {
      logs.info(`DFU Start: ${type} (${len} bytes)`);
      enableDfu();
    });

    band.on("dfuProgress", (prog, total) => {
      setDfuProg((prog / total) * 100);
    });

    band.on("dfuEnd", () => {
      disableDfu();
      logs.info("DFU End");
    });

    band.on("callDismiss", () => {
      logs.info("Call Dismissed");
    });

    band.on("callSilent", () => {
      logs.info("Call Silent");
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
      `Battery (${battery.status}): ${battery.level} (last level: ${battery.lastLevel})`,
    );

    const time = await band.getCurrentTime();
    logs.info(
      `Current Time: ${time.hours}:${time.minutes}:${time.seconds} - ${time.date}/${time.month}/${time.year} (Day ${time.day})`,
    );
  } catch (e) {
    if (!n) logs.error(e.toString());
  }
}

function addKey() {
  const key = localStorage.getItem("AUTH_KEY");
  const newKey = prompt(
    `Enter Auth Key, or keep empty to remove.\nIf adding new key, this will be stored persistently, unless removed.${
      key
        ? "\nNote: A key already exists in local storage, adding new one will overwrite it"
        : ""
    }`,
  );
  if (newKey) {
    localStorage.setItem("AUTH_KEY", newKey);
  } else {
    localStorage.removeItem("AUTH_KEY");
  }
}

define("addKey", addKey);

fetch("http://localhost:6969/firmware").then((e) => e.arrayBuffer()).then((e) =>
  new Uint8Array(e)
).then((e) => {
  define("fw", e);
});

fetch("http://localhost:6969/watchface").then((e) => e.arrayBuffer()).then((
  e,
) => new Uint8Array(e)).then((e) => {
  define("wf", e);
});

fetch("http://localhost:6969/res").then((e) => e.arrayBuffer()).then((
  e,
) => new Uint8Array(e)).then((e) => {
  define("res", e);
});

init(true).catch(() => {});
