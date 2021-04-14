import { serve, serveStatic } from "https://deno.land/x/sift@0.2.0/mod.ts";

serve({
  "/": serveStatic("./index.html", {
    baseUrl: import.meta.url,
    intervene: (res) => {
      res.headers.set("content-type", "text/html; charset=utf-8");
      return res;
    },
  }),
  "/bundle.js": serveStatic("./bundle.js", {
    baseUrl: import.meta.url,
  }),
});
