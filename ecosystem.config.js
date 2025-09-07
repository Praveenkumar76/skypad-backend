module.exports = {
  apps: [
    {
      name: "skypad-backend",
      script: "npm",
      args: "run dev",
      cwd: "./",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5000
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_file: "./logs/combined.log",
      time: true
    },
    {
      name: "skypad-code-editor",
      script: "npm",
      args: "run dev:code-editor",
      cwd: "./",
      env: {
        NODE_ENV: "production",
        PORT: process.env.CODE_EDITOR_PORT || 5001
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      error_file: "./logs/code-editor-err.log",
      out_file: "./logs/code-editor-out.log",
      log_file: "./logs/code-editor-combined.log",
      time: true
    }
  ]
};
