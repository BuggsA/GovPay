// Paybook site. Static output: every page is pre-built; the calculator runs in the browser.
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://paybook.hhouse.dev",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },        // /civilian/gs/12/washington-dc.html, served as /civilian/gs/12/washington-dc
});
