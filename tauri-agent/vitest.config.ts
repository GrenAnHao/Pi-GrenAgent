import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Heavy @lobehub/ui components are forced through the Vite transform (server.deps.inline
    // below), so a cold component render can exceed vitest's 5s default on slower/loaded
    // machines (Windows CI), surfacing as spurious "Test timed out" failures. Give renders headroom.
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        // @lobehub/ui 的 ESM 链路里有 JSON import attribute（emoji-mart），
        // 需走 Vite 转换管线才能在 node 下加载（组件测试用）。
        inline: [/@lobehub\/ui/, /@emoji-mart/],
      },
    },
  },
});
