const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');
const staticAssets = path.join(root, '.next', 'static');
const standaloneStatic = path.join(standalone, '.next', 'static');
const publicAssets = path.join(root, 'public');
const standalonePublic = path.join(standalone, 'public');

if (!fs.existsSync(path.join(standalone, 'server.js'))) {
  throw new Error('Next.js standalone server output was not created.');
}

fs.mkdirSync(path.dirname(standaloneStatic), { recursive: true });
fs.cpSync(staticAssets, standaloneStatic, { recursive: true });

if (fs.existsSync(publicAssets)) {
  fs.cpSync(publicAssets, standalonePublic, { recursive: true });
}

console.log('Copied Next.js static and public assets into standalone output.');
