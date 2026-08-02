module.exports = {
  apps: [
    {
      name: "lejoy-ai",
      script: "dist/index.js",
      cwd: "/opt/lejoy-ai",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
