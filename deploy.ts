import { serve, serveStatic } from "https://deno.land/x/sift@0.2.0/mod.ts";

serve({
  "/": serveStatic("./index.html", {
    baseUrl: import.meta.url,
  }),
  "/bundle.js": serveStatic("./bundle.js", {
    baseUrl: import.meta.url,
  }),
});
