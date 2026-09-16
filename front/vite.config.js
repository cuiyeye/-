import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 相对 base：适配 GitHub Pages 等子路径部署，不依赖仓库名
  base: './',
  server: { port: 5173, host: true },
})
