import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import type { Plugin } from "vite";

// Plugin to copy static extension files (manifest, icons) into dist
function copyExtensionFiles(): Plugin {
  return {
    name: "copy-extension-files",
    closeBundle() {
      const files = ["manifest.json"];
      for (const file of files) {
        const src = resolve(__dirname, file);
        const dest = resolve(__dirname, "dist", file);
        if (existsSync(src)) {
          copyFileSync(src, dest);
          console.log(`Copied ${file} -> dist/${file}`);
        }
      }
      // Copy icons if they exist
      const iconsDir = resolve(__dirname, "icons");
      const distIconsDir = resolve(__dirname, "dist", "icons");
      if (existsSync(iconsDir)) {
        if (!existsSync(distIconsDir)) mkdirSync(distIconsDir, { recursive: true });
        for (const icon of ["icon16.png", "icon48.png", "icon128.png"]) {
          const src = resolve(iconsDir, icon);
          if (existsSync(src)) {
            copyFileSync(src, resolve(distIconsDir, icon));
          }
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyExtensionFiles()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        "content/linkedin": resolve(__dirname, "src/content/linkedin.ts"),
        "background/service-worker": resolve(__dirname, "src/background/service-worker.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
