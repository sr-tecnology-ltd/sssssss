import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiverModule = require("archiver") as any;
const ZipArchive = archiverModule.ZipArchive;
import fs from "fs";
import path from "path";

async function run() {
  const zipPath = path.join(process.cwd(), "sr-gateway-source-code.zip");
  console.log("Generating ZIP at:", zipPath);
  
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const output = fs.createWriteStream(zipPath);
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

  const writePromise = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", (err) => reject(err));
  });

  await archive.finalize();
  await writePromise;
  
  console.log("Zip finalized. Exists:", fs.existsSync(zipPath), "Size:", fs.statSync(zipPath).size);

  console.log("Uploading to Catbox...");
  const formData = new FormData();
  const fileBuffer = fs.readFileSync(zipPath);
  const blob = new Blob([fileBuffer], { type: "application/zip" });
  formData.append("reqtype", "fileupload");
  formData.append("fileToUpload", blob, "sr-gateway-source-code.zip");

  try {
    const res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData
    });
    const url = await res.text();
    console.log("---- CATBOX UPLOAD SUCCESSFUL ----");
    console.log("Direct Link:", url.trim());
    console.log("----------------------------");
  } catch (err: any) {
    console.error("Catbox upload error:", err.message);
  }

  // Also backup upload to gofile.io if catbox fails
  console.log("Trying gofile.io as backup...");
  try {
    // 1. Get gofile server
    const serverRes = await fetch("https://api.gofile.io/servers");
    const serverData = await serverRes.json() as any;
    if (serverData.status === "ok") {
      const server = serverData.data.servers[0].name;
      
      const goForm = new FormData();
      goForm.append("file", blob, "sr-gateway-source-code.zip");
      
      const uploadRes = await fetch(`https://${server}.gofile.io/contents/uploadfile`, {
        method: "POST",
        body: goForm
      });
      const uploadData = await uploadRes.json() as any;
      if (uploadData.status === "ok") {
        console.log("---- GOFILE UPLOAD SUCCESSFUL ----");
        console.log("Gofile Link:", uploadData.data.downloadPage);
        console.log("----------------------------------");
      } else {
        console.log("gofile.io status failed:", uploadData);
      }
    }
  } catch (e: any) {
    console.error("Gofile error:", e.message);
  }

  // clean up
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }
}

run();
