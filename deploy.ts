import { serve } from "https://deno.land/x/sift@0.2.0/mod.ts";

serve({
  "/": async (req) => {
    return new Response(
      await fetch(new URL("./index.html", import.meta.url)).then((r) =>
        r.text()
      ),
      {
        headers: {
          "content-type": "text/html",
        },
      }
    );
  },
  "/bundle.js": async (req) => {
    return new Response(
      await fetch(new URL("./bundle.js", import.meta.url)).then((r) =>
        r.text()
      ),
      {
        headers: {
          "content-type": "application/javascript",
        },
      }
    );
  },
});
