/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // 必要に応じて他の環境変数を追加
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
