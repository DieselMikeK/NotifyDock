import {spawnSync} from "node:child_process";

run("npx", ["prisma", "generate"]);

if (process.env.POSTGRES_PRISMA_URL) {
  run("npx", ["prisma", "migrate", "deploy"]);
}

run("npx", ["remix", "vite:build"]);

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
