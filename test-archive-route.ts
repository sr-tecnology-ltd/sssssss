import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiverModule = require("archiver") as any;
const ZipArchive = archiverModule.ZipArchive;
import fs from "fs";

try {
  console.log("Starting ZIP generation...");
  const archive = new ZipArchive({ zlib: { level: 9 } });
  
  archive.on("error", (err) => {
    console.error("ARCHIVE ERROR EVENT CAUGHT:", err);
  });

  const output = fs.createWriteStream("test-route-out.zip");
  archive.pipe(output);

  archive.glob("**/*", {
    cwd: process.cwd(),
    ignore: [
      "node_modules/**",
      "dist/**",
      ".git/**",
      "*.zip",
      ".env",
      ".env.local"
    ],
    dot: true
  });

  await archive.finalize();
  console.log("ZIP process finalized! File size on disk:", fs.statSync("test-route-out.zip").size);
  fs.unlinkSync("test-route-out.zip");
} catch (e: any) {
  console.error("TRY-CATCH CAUGHT ERROR:", e);
}
