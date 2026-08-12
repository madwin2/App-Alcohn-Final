module.exports = {
  apps: [
    {
      name: 'andreani-worker',
      cwd: '/opt/andreani-worker',
      script: './start-andreani.sh',
      interpreter: 'bash',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '900M',
      env: {
        NODE_ENV: 'production',
        // false + xvfb: el portal Pymes pinta en blanco en headless real
        ANDREANI_HEADLESS: 'false',
      },
    },
  ],
};
