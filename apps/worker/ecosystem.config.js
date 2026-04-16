module.exports = {
  apps: [{
    name:        "leadash-worker",
    script:      "node_modules/.bin/tsx",
    args:        "src/index.ts",
    cwd:         "/opt/leadash/apps/worker",
    interpreter: "none",
    // Restart if memory exceeds 600 MB
    max_memory_restart: "600M",
    // Restart with exponential backoff on crash
    restart_delay: 5_000,
    env: {
      NODE_ENV: "production",
      // Packages installed in the worker AND in the web app are both resolvable
      // when runner files (apps/web/src/lib/outreach/*.ts) are dynamically imported.
      // tsx/esbuild resolves imports from the file location, so web app deps must
      // be on NODE_PATH too.
      NODE_PATH: [
        "/opt/leadash/apps/worker/node_modules",
        "/opt/leadash/apps/web/node_modules",
        "/opt/leadash/node_modules",
      ].join(":"),
    },
  }],
};
