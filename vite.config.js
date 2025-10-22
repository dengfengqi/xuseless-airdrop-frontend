import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',             // 设置相对路径，这样打包后的 HTML 引用 JS/CSS 都会用相对路径
  build: {
    outDir: 'docs',       // 打包输出到 docs 目录
    emptyOutDir: true,    // 每次打包前清空 docs
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        // 打包成单个 IIFE 或 UMD 文件
        format: 'iife',
        name: 'MyAirdropApp',
        entryFileNames: 'bundle.js'
      }
    }
  }
});
