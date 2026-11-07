import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';

const require = createRequire(import.meta.url);

/**
 * Tesseract.js の worker・コア・日本語の言語データを画面と同じオリジンから配信する（是正計画 D14）
 *
 * 既定では cdn.jsdelivr.net から取得するため、CSP に外部の取得先の許可が要った。
 * 配信のパスは CDN と同じ並び（`/tesseract/tesseract.js@<版>/...` など）にし、
 * 画面の設定（src/utils/tesseract-assets.ts）が workerPath・corePath・langPath で指す。
 * - 開発・Storybook: 開発サーバーが node_modules の実物を返す
 * - ビルド: 配信物（dist）へ同じパスで出力する
 * 既定の OCR（LSTM のみ）が使うコアは 3 種（relaxed SIMD・SIMD・どちらも無い端末）で、
 * 端末の対応に応じて 1 つが読まれる。
 */
function tesseractAssetsPlugin(): Plugin {
  const packageDir = (name: string) => path.dirname(require.resolve(`${name}/package.json`));
  const version = (name: string) =>
    (
      JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')) as {
        version: string;
      }
    ).version;

  const tesseractDir = packageDir('tesseract.js');
  const coreDir = packageDir('tesseract.js-core');
  const jpnDir = packageDir('@tesseract.js-data/jpn');

  // 配信のパス（先頭の / を除く）→ 実物のファイル
  const assets = new Map<string, string>([
    [
      `tesseract/tesseract.js@${version('tesseract.js')}/worker.min.js`,
      path.join(tesseractDir, 'dist/worker.min.js'),
    ],
    ...[
      'tesseract-core-relaxedsimd-lstm.wasm.js',
      'tesseract-core-simd-lstm.wasm.js',
      'tesseract-core-lstm.wasm.js',
    ].map((file): [string, string] => [
      `tesseract/tesseract.js-core@${version('tesseract.js-core')}/${file}`,
      path.join(coreDir, file),
    ]),
    [
      'tesseract/@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz',
      path.join(jpnDir, '4.0.0_best_int/jpn.traineddata.gz'),
    ],
  ]);

  return {
    name: 'architrack-tesseract-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\//, '');
        const file = assets.get(pathname);
        if (!file) {
          next();
          return;
        }
        res.setHeader(
          'Content-Type',
          pathname.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'
        );
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [fileName, file] of assets) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  const isProduction = mode === 'production';

  return {
    plugins: [
      react(),
      tesseractAssetsPlugin(),
      // Bundle analyzer (本番ビルド時のみ)。出力は配信物（dist）の外に置く
      // （配信物から可視化の統計を外す。user-authentication design.md の FrontendNginxConfig）
      isProduction &&
        visualizer({
          filename: 'bundle-stats/stats.html',
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
            ? (id: string) => {
                // React関連を別チャンクに分離
                if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
                  return 'react';
                }
                // PDF.js関連を別チャンクに分離（react-pdf + pdfjs-dist）
                if (
                  id.includes('node_modules/react-pdf/') ||
                  id.includes('node_modules/pdfjs-dist/')
                ) {
                  return 'pdf-viewer';
                }
                // OCR関連を別チャンクに分離（Tesseract.js）
                if (id.includes('node_modules/tesseract.js/')) {
                  return 'ocr';
                }
                return undefined;
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

    // 依存関係の事前バンドル最適化
    optimizeDeps: {
      // pdfjs-distとtesseract.jsのESMモジュールを事前バンドル対象に含める
      include: ['pdfjs-dist', 'react-pdf'],
    },

    // 環境変数のプレフィックス
    envPrefix: 'VITE_',
  };
});
