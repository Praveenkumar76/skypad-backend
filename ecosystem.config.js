module.exports = {
  apps: [
    {
      name: "skypad-backend",
      script: "./src/server.js",   // 👈 your real entry point file
      cwd: "./",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5000
      },
      instances: 1,
      autorestart: true
    },
    {
      name: "skypad-code-editor",
      script: "./src/codeEditorServer.js",
      cwd: "./",
      env: {
        NODE_ENV: "production",
        PORT: process.env.CODE_EDITOR_PORT || 5001
      },
      instances: 1,
      autorestart: true
    }
  ]
};
