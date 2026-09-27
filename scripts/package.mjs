import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.resolve(projectRoot, 'package.json'), 'utf8'));
const version = pkg.version || '1.0.0';

const releasesDir = path.resolve(projectRoot, 'dist/releases');
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir, { recursive: true });
}

function createZipArchive(sourceDir, outPath) {
  return new Promise((resolve, reject) => {
    // If output file already exists, remove it first
    if (fs.existsSync(outPath)) {
      try {
        fs.unlinkSync(outPath);
      } catch {
        // ignore
      }
    }

    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    output.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    // Append all files from source directory to the root of the zip archive
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

function getSha256(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  return hashSum.digest('hex');
}

async function main() {
  console.log(`\n========================================`);
  console.log(` Packaging Release Artifacts v${version}`);
  console.log(`========================================\n`);

  const chromeDir = path.resolve(projectRoot, 'dist/chrome');
  const firefoxDir = path.resolve(projectRoot, 'dist/firefox');

  if (!fs.existsSync(chromeDir) || !fs.existsSync(firefoxDir)) {
    console.error('Build output missing. Please run `npm run build` before packaging.');
    process.exit(1);
  }

  const chromeZipName = `tab-audio-recorder-chrome-v${version}.zip`;
  const firefoxZipName = `tab-audio-recorder-firefox-v${version}.zip`;
  const firefoxXpiName = `tab-audio-recorder-firefox-v${version}.xpi`;

  const chromeZipPath = path.join(releasesDir, chromeZipName);
  const firefoxZipPath = path.join(releasesDir, firefoxZipName);
  const firefoxXpiPath = path.join(releasesDir, firefoxXpiName);

  console.log(`[1/3] Packaging Chrome extension -> ${chromeZipName}...`);
  await createZipArchive(chromeDir, chromeZipPath);

  console.log(`[2/3] Packaging Firefox extension -> ${firefoxZipName}...`);
  await createZipArchive(firefoxDir, firefoxZipPath);

  console.log(`[3/3] Creating Firefox XPI bundle -> ${firefoxXpiName}...`);
  await createZipArchive(firefoxDir, firefoxXpiPath);

  console.log(`\n Release packages created successfully in dist/releases/:\n`);

  const artifacts = [
    { name: chromeZipName, path: chromeZipPath },
    { name: firefoxZipName, path: firefoxZipPath },
    { name: firefoxXpiName, path: firefoxXpiPath },
  ];

  for (const art of artifacts) {
    const stats = fs.statSync(art.path);
    const sizeKb = (stats.size / 1024).toFixed(1);
    const hash = getSha256(art.path);
    console.log(`  * ${art.name} (${sizeKb} KB)`);
    console.log(`    SHA-256: ${hash}`);
  }
  console.log('');
}

main().catch((err) => {
  console.error('Packaging failed:', err);
  process.exit(1);
});
