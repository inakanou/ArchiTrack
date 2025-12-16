# Research & Design Decisions: 現場調査機能

## Summary

- **Feature**: site-survey
- **Discovery Scope**: Complex Integration（新規技術スタック導入 + 既存システム拡張）
- **Key Findings**:
  - Fabric.js 6.xはTypeScriptネイティブ対応、Reactとの統合にはuseRef + useEffectパターンが推奨
  - Railway環境でのファイルストレージにはMinIO（S3互換）テンプレートが利用可能
  - オフライン同期にはDexie.jsが最もReact-friendlyなIndexedDBラッパー

## Research Log

### Canvas描画ライブラリの選定

- **Context**: 要件5-7（寸法線、マーキング、コメント）を実現するCanvas操作ライブラリが必要
- **Sources Consulted**:
  - [Fabric.js公式ドキュメント](https://fabricjs.com/)
  - [Fabric.js GitHub](https://github.com/kangax/fabric.js/)
  - [fabricjs-react npm](https://www.npmjs.com/package/fabricjs-react)
  - [LogRocket: Build indoor maps with Fabric.js and React](https://blog.logrocket.com/build-indoor-maps-fabric-js-react/)
- **Findings**:
  - Fabric.js v6はTypeScriptで書き直されており、型安全性が向上
  - v6ではimport構文が変更: `import * as fabric from 'fabric'`
  - React統合には非制御コンポーネントパターン（useRef + useEffect）が推奨
  - Context APIでcanvasインスタンスを共有するパターンが効果的
  - `canvas.dispose()`によるクリーンアップが必須
- **Implications**:
  - AnnotationEditorコンポーネントはuseRef/useEffectで実装
  - Fabric.js canvasインスタンスはContextで共有可能だが、単一画像編集なのでprops経由で十分
  - dispose処理をuseEffect cleanupに必ず含める

### 画像処理・アップロード

- **Context**: 要件3（画像アップロード・管理）のバックエンド実装方式
- **Sources Consulted**:
  - [Express Multer公式](https://expressjs.com/en/resources/middleware/multer.html)
  - [Sharp npm](https://www.npmjs.com/package/sharp)
  - [BezKoder: Upload & resize multiple images](https://www.bezkoder.com/node-js-upload-resize-multiple-images/)
  - [DEV: Multer + Sharp image upload](https://dev.to/mkilmer/how-to-upload-image-using-multer-and-sharp-45lm)
- **Findings**:
  - Multerはメモリストレージモードでバッファを取得し、Sharpで処理する構成が最適
  - Sharpは高速で、Node.js標準の画像処理ライブラリとしてデファクト
  - 300KB目標の段階的圧縮: 品質を10%ずつ下げながらリサイズ
  - バッチアップロードはPromise.allで並列処理（最大5ファイル）
- **Implications**:
  - ImageServiceでMulter(memoryStorage) → Sharp → MinIOの順で処理
  - 画像サイズ・品質調整のユーティリティ関数を作成
  - 大きすぎる画像（>10MB）は事前にクライアントで警告

### Railway環境でのファイルストレージ

- **Context**: 要件3の画像保存先、Railway環境での永続ストレージ戦略
- **Sources Consulted**:
  - [Railway Help Station: Persistent Storage](https://station.railway.com/feedback/persistent-storage-91c75620)
  - [Railway: Deploy Simple S3](https://railway.com/deploy/simple-s3)
  - [MinIO公式](https://www.min.io/)
- **Findings**:
  - Railwayのボリュームは$0.25/GB/月で、S3の$0.02/GBより高価
  - MinIOテンプレートで自己ホスト型S3互換ストレージをデプロイ可能
  - MinIOに永続ボリュームを接続することでデータ永続性を確保
  - S3互換APIにより、将来的にAWS S3へ移行も容易
- **Implications**:
  - MinIOをRailwayにデプロイしてS3互換ストレージとして使用
  - 環境変数でMinIO接続情報を管理
  - 開発環境ではローカルMinIOまたはモックを使用

### PDFエクスポート

- **Context**: 要件9.6-9.7（調査報告書PDF生成）の実装方式
- **Sources Consulted**:
  - [jsPDF npm](https://www.npmjs.com/package/jspdf)
  - [jsPDF TypeScript definitions](https://github.com/parallax/jsPDF/blob/master/types/index.d.ts)
  - [pdfannotate.js](https://www.jqueryscript.net/other/pdf-annotation-drawing-markup.html)
- **Findings**:
  - jsPDFはクライアントサイドでのPDF生成に対応
  - TypeScript型定義が同梱されている
  - 日本語フォント対応には追加設定が必要（カスタムフォント埋め込み）
  - 画像のBase64エンコードが必要
- **Implications**:
  - PDF生成はフロントエンドで実行（サーバー負荷軽減）
  - 日本語フォント（IPAゴシック等）をBase64で埋め込み
  - 画像が多い場合のメモリ使用量に注意

### オフライン同期

- **Context**: 要件12.4-12.5（オフライン保存と同期）の実装方式
- **Sources Consulted**:
  - Dexie.js、RxDB、PouchDBの比較（一般知識）
  - IndexedDB MDN documentation
- **Findings**:
  - Dexie.jsはIndexedDBのReact-friendlyなラッパー
  - RxDBはより高機能だが学習コストが高い
  - 競合解決戦略: Last-Write-Wins、Version Vectors、CRDTs
  - 本プロジェクトではupdatedAtベースのLWWが適切（注釈データは完全上書き前提）
- **Implications**:
  - Dexie.js 4.xを採用（シンプルで十分な機能）
  - 競合時はユーザーに選択肢を提示（ローカル優先/サーバー優先）
  - マージ機能は将来の拡張として検討

## Architecture Pattern Evaluation

| Option | Description | Strengths | Risks / Limitations | Notes |
|--------|-------------|-----------|---------------------|-------|
| Clean Architecture | サービス層でビジネスロジック分離 | 既存パターンとの整合性、テスタビリティ | 追加のレイヤー | 採用 |
| Event Sourcing | 注釈操作をイベントとして記録 | 完全な履歴、Undo/Redo容易 | 実装複雑、ストレージ増加 | 過剰 |
| CQRS | 読み取り/書き込み分離 | 最適化可能 | 複雑性増加 | 現時点では不要 |

## Design Decisions

### Decision: Canvas描画ライブラリ

- **Context**: 注釈編集機能（寸法線、マーキング、コメント）を実現するCanvas操作ライブラリが必要
- **Alternatives Considered**:
  1. Fabric.js — 豊富なオブジェクト操作、TypeScript対応
  2. Konva.js — React統合が良好、パフォーマンス重視
  3. Paper.js — ベクター重視、学習コスト高
- **Selected Approach**: Fabric.js 6.x
- **Rationale**:
  - v6からTypeScriptネイティブ対応
  - 注釈に必要な機能（図形、テキスト、変形）が揃っている
  - コミュニティが活発、ドキュメントが充実
  - JSON serialization/deserializationが組み込み
- **Trade-offs**:
  - バンドルサイズがやや大きい（gzip: ~100KB）
  - React統合に追加コードが必要
- **Follow-up**: Fabric.js v6の最新リリースを確認、React統合サンプルをプロトタイプ

### Decision: ファイルストレージ

- **Context**: Railway環境での画像ファイル永続保存
- **Alternatives Considered**:
  1. MinIO on Railway — S3互換、自己ホスト
  2. Railway Volumes — シンプルだが高価
  3. External S3 (AWS/Cloudflare R2) — 安価だが外部依存
- **Selected Approach**: MinIO on Railway
- **Rationale**:
  - Railwayテンプレートで簡単にデプロイ可能
  - S3互換APIで将来の移行が容易
  - 開発環境との一貫性（ローカルMinIOも使用可能）
  - プロジェクト内で完結
- **Trade-offs**:
  - Railway Volumeのコストがかかる
  - MinIOの運用・監視が必要
- **Follow-up**: MinIOテンプレートのデプロイ検証、バケットポリシー設計

### Decision: オフライン同期戦略

- **Context**: 現場でのネットワーク不安定環境での操作継続
- **Alternatives Considered**:
  1. Dexie.js + 手動同期 — シンプル、制御可能
  2. RxDB — 自動同期、CRDTs対応
  3. PouchDB + CouchDB — 双方向同期が容易
- **Selected Approach**: Dexie.js 4.x + 手動同期
- **Rationale**:
  - 学習コストが低い
  - 必要十分な機能（IndexedDBラッパー）
  - 競合解決はシンプルなタイムスタンプ比較で十分
  - バックエンドがCouchDBではないためPouchDBのメリットが薄い
- **Trade-offs**:
  - 自動同期機能は自前実装が必要
  - 複雑なマージは手動実装
- **Follow-up**: 競合解決UIのプロトタイプ、オフラインテストシナリオ策定

### Decision: PDF生成場所

- **Context**: 調査報告書PDFの生成をクライアント/サーバーどちらで行うか
- **Alternatives Considered**:
  1. クライアントサイド (jsPDF) — サーバー負荷なし
  2. サーバーサイド (pdfkit/Puppeteer) — 一貫性、大容量対応
- **Selected Approach**: クライアントサイド (jsPDF)
- **Rationale**:
  - サーバーリソース節約
  - ユーザーの待機時間にプログレス表示可能
  - 注釈データはすでにクライアントにある
- **Trade-offs**:
  - クライアントのメモリ・CPU使用
  - 大量画像時のブラウザクラッシュリスク
- **Follow-up**: 画像枚数制限の検討（最大50枚など）、プログレス表示実装

## Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Canvas描画の複雑性 | 開発遅延 | 中 | プロトタイプ先行、段階的実装 |
| MinIO運用負荷 | 運用コスト | 低 | 監視設定、ヘルスチェック統合 |
| オフライン競合解決 | ユーザー混乱 | 中 | 明確なUIガイダンス、テスト充実 |
| 大量注釈でのパフォーマンス | UX低下 | 中 | オブジェクト数制限、仮想化 |
| 日本語PDFフォント | 文字化け | 低 | フォント埋め込みテスト |
| Railway Volumeサイズ制限 | 容量不足 | 低 | 画像圧縮最適化、アーカイブ戦略 |

## References

- [Fabric.js Official Documentation](https://fabricjs.com/) — Canvas操作ライブラリ
- [Fabric.js GitHub](https://github.com/kangax/fabric.js/) — ソースコード、TypeScript定義
- [Sharp npm](https://www.npmjs.com/package/sharp) — 高速画像処理
- [Multer Express Middleware](https://expressjs.com/en/resources/middleware/multer.html) — ファイルアップロード
- [MinIO](https://www.min.io/) — S3互換オブジェクトストレージ
- [Railway Deploy MinIO](https://railway.com/deploy/simple-s3) — Railwayテンプレート
- [jsPDF](https://www.npmjs.com/package/jspdf) — クライアントサイドPDF生成
- [Dexie.js](https://dexie.org/) — IndexedDBラッパー
