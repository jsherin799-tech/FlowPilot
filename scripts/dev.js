const { spawn } = require('node:child_process');
const path = require('node:path');
const net = require('node:net');

const root = path.resolve(__dirname, '..');
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('Unable to locate npm. Start this script with `npm run dev`.');
  process.exit(1);
}

const children = [];
let stopping = false;

function isPortAvailable(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(error);
      }
    });
    server.listen({ port, exclusive: true }, () => {
      server.close((error) => {
        if (error) reject(error);
        else resolve(true);
      });
    });
  });
}

async function selectPort(name, envName, defaultPort) {
  const configuredPort = process.env[envName];
  const firstPort = configuredPort === undefined ? defaultPort : Number(configuredPort);
  if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65535) {
    throw new Error(`${envName} must be a valid port number.`);
  }

  const lastPort = configuredPort === undefined ? Math.min(firstPort + 100, 65535) : firstPort;
  for (let port = firstPort; port <= lastPort; port += 1) {
    if (await isPortAvailable(port)) return port;
  }

  throw new Error(`${name} port ${firstPort} is unavailable. Set ${envName} to an available port.`);
}

function stop(exitCode = 0, signal = 'SIGTERM') {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill(signal);
  }
  process.exitCode = exitCode;
}

process.on('SIGINT', () => stop(0, 'SIGINT'));
process.on('SIGTERM', () => stop(0));

async function start() {
  const [backendPort, frontendPort] = await Promise.all([
    selectPort('Backend', 'BACKEND_PORT', 5000),
    selectPort('Frontend', 'FRONTEND_PORT', 3000),
  ]);
  const frontendApiUrl = process.env.NEXT_PUBLIC_API_URL || `http://localhost:${backendPort}/api/v1`;
  const services = [
    {
      name: 'backend',
      cwd: path.join(root, 'FlowPilot', 'backend'),
      env: { ...process.env, PORT: String(backendPort) },
    },
    {
      name: 'frontend',
      cwd: path.join(root, 'FlowPilot', 'frontend'),
      env: {
        ...process.env,
        PORT: String(frontendPort),
        NEXT_PUBLIC_API_URL: frontendApiUrl,
      },
    },
  ];

  for (const service of services) {
    const child = spawn(process.execPath, [npmCli, 'run', 'dev'], {
      cwd: service.cwd,
      env: service.env,
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

  console.log(`FlowPilot is starting. Frontend: http://localhost:${frontendPort} | Backend: http://localhost:${backendPort}`);
}

start().catch((error) => {
  console.error(`[FlowPilot] ${error.message}`);
  process.exitCode = 1;
});
