module.exports = {
  apps: [
    {
      name: 'vector-worker',
      cwd: '/opt/vector-worker',
      script: '/opt/vector-worker/venv/bin/python3',
      args: '-m uvicorn app.server:app --host 127.0.0.1 --port 8790',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '700M',
      env: {
        PYTHONUNBUFFERED: '1',
      },
    },
  ],
};
