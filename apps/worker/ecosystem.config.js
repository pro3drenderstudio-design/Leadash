module.exports = {
  apps: [{
    name:        "worker",
    script:      "node_modules/.bin/tsx",
    args:        "src/index.ts",
    cwd:         "/opt/leadash/apps/worker",
    interpreter: "none",
    env: {
      // Makes packages installed in the worker resolvable when
      // warmup-runner.ts (in apps/web/src/) is dynamically imported
      NODE_PATH: "/opt/leadash/apps/worker/node_modules",
    },
  }],
};
