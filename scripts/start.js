const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const services = [
  {
    name: 'backend',
    cwd: path.join(root, 'FlowPilot', 'backend'),
    entry: path.join(root, 'FlowPilot', 'backend', 'dist', 'app.js'),
  },
  {
    name: 'frontend',
    cwd: path.join(root, 'FlowPilot', 'frontend'),
    entry: path.join(root, 'FlowPilot', 'frontend', '.next', 'standalone', 'server.js'),
  },
];

const children = [];
let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
  process.exitCode = exitCode;
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

for (const service of services) {
  const child = spawn(process.execPath, [service.entry, ...(service.args ?? [])], {
    cwd: service.cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);

  child.on('error', (error) => {
    console.error(`[${service.name}] Failed to start: ${error.message}`);
    stop(1);
  });

  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(`[${service.name}] Stopped${signal ? ` (${signal})` : ` with exit code ${code}`}.`);
      stop(code ?? 1);
    }
  });
}

console.log('FlowPilot is starting. Frontend: http://localhost:3000 | Backend: http://localhost:5000');
