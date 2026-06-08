import { spawn } from "node:child_process";

const defaultPort = 1420;
const portFlags = new Set(["--port", "-p"]);

const parseArgs = (args) => {
  let port = process.env.PORT ?? process.env.VITE_PORT ?? process.env.TAURI_DEV_PORT;
  const passthrough = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (portFlags.has(arg)) {
      port = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      port = arg.slice("--port=".length);
      continue;
    }

    passthrough.push(arg);
  }

  const normalizedPort = Number(port ?? defaultPort);

  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    throw new Error(`Invalid dev port: ${port}`);
  }

  return {
    port: normalizedPort,
    passthrough,
  };
};

const { port, passthrough } = parseArgs(process.argv.slice(2));
const tauriConfig = JSON.stringify({
  build: {
    devUrl: `http://localhost:${port}`,
  },
});

const child = spawn("tauri", ["dev", "--config", tauriConfig, ...passthrough], {
  env: {
    ...process.env,
    PORT: String(port),
    VITE_PORT: String(port),
    TAURI_DEV_PORT: String(port),
  },
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
