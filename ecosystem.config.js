module.exports = {
  apps: [
    {
      name: "skypad-backend",
      script: "./src/server.js",   // 👈 your real entry point file
      cwd: "./",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 8080
      },
      instances: 1,
      autorestart: true
    }
  ]
};
