module.exports = {
  apps: [
    {
      name: 'micorreo-worker',
      cwd: '/opt/micorreo-worker',
      script: 'dist/index.js',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        MICORREO_HEADLESS: 'true',
      },
    },
  ],
};
