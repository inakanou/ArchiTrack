import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  const isProduction = mode === 'production';

  return {
    plugins: [
      react(),
      // Bundle analyzer (本番ビルド時のみ)
      isProduction &&
        visualizer({
          filename: 'dist/stats.html',
          open: false,
          gzipSize: true,
          brotliSize: true,
        }),
    ].filter(Boolean),

    // 開発サーバー設定
    server: {
      host: '0.0.0.0',
      port: 5173,
      // 開発環境でのみHMR有効化
      hmr: isDevelopment,
    },

    // ビルド設定
    build: {
      outDir: 'dist',
      // 本番環境ではソースマップを無効化（セキュリティ強化）
      sourcemap: !isProduction,
      // 本番環境では最小化
      minify: isProduction ? 'terser' : false,
      // Terserオプション（本番環境のみ）
      terserOptions: isProduction
        ? {
            compress: {
              drop_console: true, // console.logを削除
              drop_debugger: true,
            },
          }
        : undefined,
      // WSL2 6GBメモリ環境でのOOM防止: 並列ファイル処理を制限
      // 参考: https://rollupjs.org/configuration-options/#maxparallelfileops
      rollupOptions: {
        maxParallelFileOps: 2,
        output: {
          manualChunks: isProduction
            ? {
                // React関連を別チャンクに分離
                react: ['react', 'react-dom'],
              }
            : undefined,
        },
      },
    },

    // WSL2環境でのビルド最適化
    esbuild: {
      // ビルド時のメモリ使用量を制限
      logLevel: 'warning',
    },

    // パスエイリアス
    resolve: {
      alias: {
        '@': '/src',
      },
    },

    // 環境変数のプレフィックス
    envPrefix: 'VITE_',
  };
});
