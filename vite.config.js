import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // 打包成单个 IIFE 或 UMD 文件
        format: 'iife',
        name: 'MyAirdropApp',
        entryFileNames: 'bundle.js'
      }
    }
  }
});
