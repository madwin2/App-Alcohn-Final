import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { micorreoUploadDevProxy, andreaniGenerateDevProxy, andreaniSyncLabelsDevProxy, andreaniSyncTrackingDevProxy, andreaniJobStatusDevProxy, vectorizeEnqueueDevProxy } from './vite-micorreo-proxy'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), micorreoUploadDevProxy(env), andreaniGenerateDevProxy(env), andreaniSyncLabelsDevProxy(env), andreaniSyncTrackingDevProxy(env), andreaniJobStatusDevProxy(env), vectorizeEnqueueDevProxy(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    assetsInclude: ['**/*.svg'],
    publicDir: 'public',
  }
})
