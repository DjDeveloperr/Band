import { encodePNG } from "./deps.ts";
import { pack } from "./packer.ts";
import { parse } from "./parser.ts";

const parsed = parse(await Deno.readFile(Deno.args[0]));
const packed = pack(parsed);
if (Deno.args[2]) await Deno.writeFile(Deno.args[2], packed);
const data = parse(packed);

console.log("Parsed Watchface!");

const out = Deno.args[1];

if (out) {
  await Deno.writeTextFile(
    `${out}/meta.json`,
    JSON.stringify(
      data.params,
      (_, v) =>
        typeof v === "bigint"
          ? String(v)
          : (typeof v === "object" && v !== null
            ? (v instanceof Map ? Object.fromEntries(v) : v)
            : v),
      2,
    ),
  );

  for (const res of data.resources) {
    await Deno.writeFile(
      `${out}/${res.id}.png`,
      encodePNG(res.data, res.width, res.height),
    );
  }

  console.log("Written to " + out + "!");
}
