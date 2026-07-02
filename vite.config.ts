import { defineConfig } from 'vite';

export default defineConfig({
  // 静的ホスティング(GitHub Pages 等のサブパス)でも動くよう相対パスにする
  base: './',
  build: {
    target: 'es2022',
  },
});
