import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Parse target from CLI arguments (--target=chrome or --target=firefox or both)
const args = process.argv.slice(2);
let targets = ['chrome', 'firefox'];

for (const arg of args) {
  if (arg.startsWith('--target=')) {
    const val = arg.split('=')[1].toLowerCase();
    if (val === 'chrome' || val === 'firefox') {
      targets = [val];
    }
  }
}

async function buildExtension(target) {
  console.log(`\n========================================`);
  console.log(` Building Tab Audio Recorder for: ${target.toUpperCase()}`);
  console.log(`========================================\n`);

  const outDir = path.resolve(projectRoot, `dist/${target}`);

  // 1. Clean output directory
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  // 2. Build HTML and UI assets (popup, and offscreen for Chrome)
  const htmlInputs = {
    popup: path.resolve(projectRoot, 'popup.html'),
  };
  if (target === 'chrome') {
    htmlInputs.offscreen = path.resolve(projectRoot, 'offscreen.html');
  }

  console.log(`[1/4] Building UI pages...`);
  await build({
    root: projectRoot,
    configFile: false,
    plugins: [react()],
    base: './',
    build: {
      outDir,
      emptyOutDir: false,
      rollupOptions: {
        input: htmlInputs,
      },
    },
  });

  // 3. Build Background script as self-contained bundle
  console.log(`[2/4] Bundling background script...`);
  await build({
    root: projectRoot,
    configFile: false,
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: path.resolve(projectRoot, 'src/background/index.ts'),
        name: 'background',
        formats: ['iife'],
        fileName: () => 'background.js',
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
  });

  // 4. Build Content script as self-contained bundle
  console.log(`[3/4] Bundling content script...`);
  await build({
    root: projectRoot,
    configFile: false,
    build: {
      outDir,
      emptyOutDir: false,
      lib: {
        entry: path.resolve(projectRoot, 'src/content/contentScript.ts'),
        name: 'contentScript',
        formats: ['iife'],
        fileName: () => 'contentScript.js',
      },
      rollupOptions: {
        output: {
          extend: true,
        },
      },
    },
  });

  // 5. Copy manifest, icons, and metadata
  console.log(`[4/4] Copying manifest and icons...`);
  const manifestSource = path.resolve(projectRoot, `manifest/manifest.${target}.json`);
  const manifestDest = path.resolve(outDir, 'manifest.json');
  fs.copyFileSync(manifestSource, manifestDest);

  const iconsSrcDir = path.resolve(projectRoot, 'public/icons');
  const iconsDestDir = path.resolve(outDir, 'icons');
  if (fs.existsSync(iconsSrcDir)) {
    fs.cpSync(iconsSrcDir, iconsDestDir, { recursive: true });
  }

  console.log(`\n Successfully built ${target.toUpperCase()} extension!`);
  console.log(`   Output: ${path.relative(projectRoot, outDir)}/\n`);
}

async function main() {
  for (const target of targets) {
    await buildExtension(target);
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
