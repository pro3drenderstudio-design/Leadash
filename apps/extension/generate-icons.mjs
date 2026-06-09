import { Resvg } from "@resvg/resvg-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const svgPath = resolve(__dirname, "../../apps/web/public/Logo_Icon_Colored.svg");
const svg = readFileSync(svgPath, "utf8");

const iconsDir = resolve(__dirname, "icons");
if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
  const png = resvg.render().asPng();
  const dest = resolve(iconsDir, `icon${size}.png`);
  writeFileSync(dest, png);
  console.log(`Generated icons/icon${size}.png (${png.length} bytes)`);
}
