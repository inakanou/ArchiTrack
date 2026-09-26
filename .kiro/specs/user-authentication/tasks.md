# 実装タスク一覧

本ドキュメントは、ユーザー認証機能（user-authentication）の実装タスクを定義します。要件定義書（requirements.md）と技術設計書（design.md）に基づいて、段階的に実装を進めます。

**実装方針**:
- Phase 1-3: 完了 (46タスク、全32要件カバー)
- Phase 4: 実装ギャップ対応 (10タスク、実装ギャップ分析で特定された項目)
- Phase 5: E2Eテスト修正 (1タスク)
- Phase 6: 画面遷移・ナビゲーション強化 (3タスク、要件28, 29対応)

## タスク一覧

### Phase 1-3: 完了タスク

既存の実装タスク（1-11）は完了しています。詳細は以下のセクションを参照してください。

- [x] 1. プロジェクト基盤整備とデータモデル構築（4サブタスク完了）
- [x] 2. 認証システムのコア機能実装（8サブタスク完了）
- [x] 3. 認可システムの実装（7サブタスク完了）
- [x] 4. 二要素認証（2FA）の実装（4サブタスク完了）
- [x] 5. 監査ログシステムの構築（3サブタスク完了）
- [x] 6. APIエンドポイントとバリデーション（7サブタスク完了）
- [x] 7. フロントエンド基盤構築（4サブタスク完了）
- [x] 8. 認証UI実装（4サブタスク完了）
- [x] 9. RBACとプロフィール管理UI実装（3サブタスク完了）
- [x] 10. E2Eテスト実装（3サブタスク完了）
- [x] 11. パフォーマンス・セキュリティ・デプロイ（4サブタスク完了）

**Phase 1-3完了サマリー**:
- **完了タスク数**: 11メジャータスク、47サブタスク
- **要件カバレッジ**: 全32要件を完全にカバー

---

### Phase 4: 実装ギャップ対応（優先度順）

実装ギャップ分析（2025-11-25実施）で特定された10項目の実装漏れを優先的にタスク化します。

#### 12. 【Critical】EdDSA鍵ペア生成スクリプトとセットアップガイドの整備

- [x] 12.1 鍵ペア生成スクリプト作成とドキュメント整備
  - `scripts/generate-eddsa-keys.ts`が存在するか確認し、存在しない場合は作成
  - 開発環境セットアップ手順書（README.md）への鍵ペア生成セクション追加
  - 本番環境セットアップ手順書（Railway デプロイガイド）への鍵ペア設定セクション追加
  - .env.example への JWT_PUBLIC_KEY、JWT_PRIVATE_KEY、JWT_PUBLIC_KEY_OLD サンプル追加
  - _Requirements: 5.1, 10.1_
  - _Details: design.md「EdDSA鍵ペア管理と運用戦略」参照_

#### 13. 【Critical】JWKS公開鍵エンドポイントの実装検証

- [x] 13.1 JWKSエンドポイント実装検証とテスト追加
  - `backend/src/routes/jwks.routes.ts`が実装されているか確認
  - 現在の公開鍵（JWT_PUBLIC_KEY）と旧公開鍵（JWT_PUBLIC_KEY_OLD）を両方配信する実装を検証
  - 単体テスト（jwks.routes.test.ts）にて猶予期間中の複数鍵配信をテスト
  - E2Eテスト（e2e/specs/api/jwks.spec.ts）にてRFC 7517準拠のレスポンス形式を検証
  - _Requirements: 5.1_
  - _Details: design.md「JWKS（JSON Web Key Set）エンドポイント実装」参照_

#### 14. 【High】Result型統合パターンの実装検証

- [x] 14.1 Result型ユーティリティ実装検証
  - `backend/src/types/result.ts`にOk/Err関数が定義されているか確認
  - `backend/src/utils/result-mapper.ts`にmapResultToApiError関数が実装されているか確認
  - `backend/src/utils/controller-helpers.ts`にhandleServiceResult関数が実装されているか確認
  - サービス層（AuthService、InvitationService等）がResult型を返すように実装されているか確認
  - コントローラー層でhandleServiceResultを使用しているか確認
  - 単体テストで全エラー型（AuthError、InvitationError、PasswordError、RBACError）のマッピングを検証
  - _Requirements: 10.1, 10.2_
  - _Details: design.md「Result型統合パターンの実装詳細（Critical Issue 1対応）」参照_

#### 15. 【High】N+1問題対策の実装検証

- [x] 15.1 Prisma includeによるJOINクエリ実装検証
  - RBACService.getUserPermissions()でPrisma includeが使用されているか確認
  - AuditLogService.getAuditLogs()でPrisma includeが使用されているか確認
  - InvitationService.listInvitations()でPrisma includeが使用されているか確認
  - N+1問題が発生しやすいAPIエンドポイントを特定し、Prisma includeで対策されているか確認
  - パフォーマンステスト（Autocannon）でN+1対策の効果を測定
  - _Requirements: 23.1_
  - _Details: design.md「Performance Optimization: N+1 Problem Mitigation」参照_

#### 16. 【High】鍵ローテーション戦略の実装検証

- [x] 16.1 鍵ローテーション手順書作成
  - design.md「鍵ローテーション戦略（90日周期）」のフェーズ1-4を基に、運用手順書を作成
  - フェーズ1: 準備（T-7日目）の手順を記載
  - フェーズ2: 新しい鍵ペア生成（T日目）の手順を記載
  - フェーズ3: 猶予期間開始（T日目 - T+30日目）の動作説明と検証方法を記載
  - フェーズ4: 旧鍵削除（T+30日目）の手順を記載
  - ローテーション完了チェックリストを作成
  - _Requirements: 5.1_
  - _Details: design.md「鍵ローテーション詳細運用手順（Critical Issue 2対応）」参照_

#### 17. 【Medium】Redisフォールバック処理の実装検証

- [x] 17.1 Graceful Degradationパターン実装検証
  - RBACService.getUserPermissions()でRedisキャッシュ読み取り失敗時にDB fallbackが実装されているか確認
  - Redisキャッシュ書き込み失敗時に警告ログが記録されているか確認
  - 単体テストでRedis接続エラー時のフォールバック処理を検証
  - _Requirements: 24.1_
  - _Details: design.md「Redisキャッシング戦略（Cache-Asideパターン + Graceful Degradation）」参照_

#### 18. 【Medium】Bloom Filter禁止パスワードリストの準備

- [x] 18.1 禁止パスワードリストの準備とBloom Filter統合検証
  - `data/common-passwords.txt`が存在するか確認し、存在しない場合はHIBP Pwned Passwordsのサブセットを準備
  - PasswordServiceでBloom Filter初期化（サイズ1000万件、偽陽性率0.001）が実装されているか確認
  - 単体テストでBloom Filter照合機能を検証
  - パフォーマンステストでBloom Filter照合時間を測定（目標: O(k)、k=ハッシュ関数数）
  - _Requirements: 2.3, 7.1_
  - _Details: design.md「Bloom Filter実装」参照_

#### 19. 【Medium】2FA暗号化鍵の設定ガイド

- [x] 19.1 2FA暗号化鍵設定ガイド作成
  - 環境変数`TWO_FACTOR_ENCRYPTION_KEY`（256ビット16進数文字列、64文字）のサンプル生成スクリプト作成
  - 開発環境セットアップ手順書への2FA暗号化鍵設定セクション追加
  - 本番環境セットアップ手順書（Railway）への2FA暗号化鍵設定セクション追加
  - .env.exampleへのTWO_FACTOR_ENCRYPTION_KEYサンプル追加
  - _Requirements: 27.4_
  - _Details: design.md「TwoFactorService」参照_

#### 20. 【Low】パスワード履歴自動削除の実装検証

- [x] 20.1 パスワード履歴自動削除実装検証
  - PasswordServiceでパスワード更新時に過去3件のパスワード履歴のみ保持する実装を確認
  - 古いパスワード履歴を自動削除する処理が実装されているか確認
  - 単体テストでパスワード履歴自動削除を検証
  - _Requirements: 7.2_
  - _Details: requirements.md「要件7受入基準8」参照_

#### 21. 【Low】マルチタブ同期のBroadcast Channel API実装検証

- [x] 21.1 Broadcast Channel API統合検証
  - TokenRefreshManagerでBroadcast Channel API初期化が実装されているか確認
  - トークン更新時に他のタブへ通知する処理が実装されているか確認
  - 他のタブからのトークン更新通知を受信する処理が実装されているか確認
  - E2Eテストでマルチタブ同期を検証（2つのタブを開き、1つのタブでトークン更新、もう1つのタブで自動反映を確認）
  - _Requirements: 16.1_
  - _Details: design.md「マルチタブ同期（Broadcast Channel API）」参照_

---

### Phase 5: E2Eテスト修正と改善

#### 22. E2Eテスト待機処理改善

- [x] 22.1 E2Eテスト待機処理改善
  - `waitForFunction`にタイムアウト設定（10秒推奨）を追加
  - 複数のURLパターン対応（リダイレクト先が動的な場合は正規表現やOR条件で柔軟に対応）
  - `waitForLoadState('networkidle')`を使用してネットワーク通信完了を待機
  - 全E2Eテストファイル（e2e/specs/api/、e2e/specs/ui/、e2e/specs/integration/）を確認し、待機処理を改善
  - _Requirements: 10.1_
  - _Details: tech.md「待機処理のベストプラクティス」参照_

---

### Phase 6: 画面遷移・ナビゲーション強化

#### 23. 【High】画面遷移とナビゲーションの実装強化

- [x] 23.1 (P) ProtectedRouteの遷移先state保存の検証と強化
  - 未認証時にログイン画面へリダイレクトする際、元のパス（pathname + search）をlocation.stateに保存
  - ログイン成功後に元のパスへリダイレクトする処理の検証
  - state.fromが存在しない場合のデフォルトリダイレクト先（/dashboard）の設定
  - _Requirements: 28.1, 28.3_
  - _Completed: 2025-12-03 - LoginPageのデフォルトリダイレクト先を`/`から`/dashboard`に修正、テスト強化_

- [x] 23.2 (P) ナビゲーションコンポーネントの認証状態対応
  - ヘッダーナビゲーションに認証状態を反映（ログイン・ログアウトリンク切り替え）
  - 管理者メニューの権限に応じた表示・非表示制御
  - ユーザー情報（displayName）の表示
  - _Requirements: 28.2_
  - _Completed: 2025-12-03 - AppHeaderコンポーネント実装、ドロップダウンメニュー、キーボードナビゲーション対応、ARIA属性対応_

- [x] 23.3 セッション有効期限切れ時のリダイレクト確認
  - 401エラー受信時のログイン画面リダイレクト処理の検証
  - リダイレクト先に`redirectUrl`クエリパラメータを含める
  - ログイン画面でredirectUrlを復元しログイン後に遷移する処理
  - _Requirements: 16.1, 16.2, 28.1_
  - _Completed: 2025-12-03 - ProtectedRouteにredirectUrlクエリパラメータ追加、LoginPageでredirectUrl優先読み取り、セキュリティ対策（外部URL、プロトコル相対URL拒否）実装_

#### 24. 【High】パスワードリセット画面のUI/UX強化

- [x] 24.1 パスワードリセット要求画面の実装検証
  - メールアドレス入力フォームのバリデーション確認
  - 送信成功時の確認メッセージ表示（「リセットリンクを送信しました」）
  - 存在しないメールアドレスでもセキュリティ上同一メッセージを表示
  - ログイン画面へのリンク配置
  - _Requirements: 29.1_
  - _Completed: 2025-12-03 - PasswordResetForm/PasswordResetPageの実装検証完了、セキュリティ要件テスト追加（28テスト+15テスト全パス）_

- [x] 24.2 パスワードリセット実行画面の実装検証
  - URLパラメータからリセットトークンを取得
  - トークン検証APIの呼び出しとエラー表示（無効・期限切れ）
  - 新しいパスワード入力フォーム（パスワード確認含む）
  - PasswordStrengthIndicatorとPasswordRequirementsChecklistの統合
  - リセット成功時のログイン画面リダイレクト
  - _Requirements: 29.2, 29.3_
  - _Completed: 2025-12-03 - PasswordResetFormにPasswordStrengthIndicator統合、トークン検証エラー処理、要件29.2テスト追加（55テスト全パス）_

- [x] 24.3 パスワードリセットフローのE2Eテスト検証
  - パスワードリセット要求 → メール送信 → リセット実行 → ログインの一連のフロー確認
  - 無効トークンでのエラー表示確認
  - 期限切れトークンでのエラー表示確認
  - _Requirements: 29.1, 29.2, 29.3_
  - _Completed: 2025-12-03 - Mailpit連携E2Eテスト追加、パスワードリセットURLをpassword-resetに修正、全20テストパス_

#### 25. 【Medium】初期管理者セットアップの自動化検証

- [x] 25.1 prisma/seed.tsの実装確認と検証
  - 初期管理者アカウント作成ロジックの確認（ADMIN_EMAIL, ADMIN_PASSWORD環境変数）
  - システムロール（admin, user）の初期データ挿入確認
  - デフォルト権限（user:read, user:create, user:update, user:delete, user:invite等）の定義確認
  - パスワードがArgon2idでハッシュ化されていることの確認
  - 重複実行時の冪等性（既存ユーザーがある場合はスキップ）の確認
  - _Requirements: 3.1_
  - _Completed: 2025-12-03 - user:invite権限追加、Argon2idハッシュ検証テスト追加、INITIAL_ADMIN_*環境変数優先テスト追加（全8テストパス）_

---

## 実装状況サマリー

### 完了タスク数
- **Phase 1-3 (Critical/High/Medium)**: 11メジャータスク、47サブタスク完了
- **Phase 4 (実装ギャップ対応)**: 10メジャータスク完了
- **Phase 5 (E2Eテスト修正)**: 1メジャータスク完了
- **Phase 6 (画面遷移・ナビゲーション強化)**: 5サブタスク完了、2サブタスク未完了

**合計**: 25メジャータスク、67サブタスク（2サブタスク未完了）

### 要件カバレッジ
- 要件1: 管理者によるユーザー招待
- 要件2: 招待を受けたユーザーのアカウント作成
- 要件3: 初期管理者アカウントのセットアップ
- 要件4: ログイン
- 要件5: トークン管理
- 要件6: 拡張可能なRBAC
- 要件7: パスワード管理
- 要件8: セッション管理
- 要件9: ユーザー情報取得・管理
- 要件10: セキュリティとエラーハンドリング
- 要件11: ログイン画面のUI/UX
- 要件12: ユーザー登録画面のUI/UX
- 要件13: 管理者ユーザー招待画面のUI/UX
- 要件14: プロフィール画面のUI/UX
- 要件15: 共通UI/UXガイドライン
- 要件16: セッション有効期限切れ時の自動リダイレクト
- 要件16A: 認証状態初期化時のUIチラつき防止
- 要件17: 動的ロール管理
- 要件18: 権限（Permission）管理
- 要件19: ロールへの権限割り当て
- 要件20: ユーザーへのロール割り当て
- 要件21: 権限チェック機能
- 要件22: 監査ログとコンプライアンス
- 要件23: 非機能要件（パフォーマンス・スケーラビリティ）
- 要件24: フォールトトレランス（障害耐性）
- 要件25: データ整合性とトランザクション管理
- 要件26: セキュリティ対策（脅威モデリング）
- 要件27: 二要素認証（2FA）設定機能
- 要件27A: 二要素認証（2FA）ログイン機能
- 要件27B: 二要素認証（2FA）管理機能
- 要件27C: 二要素認証（2FA）セキュリティ要件
- 要件27D: 二要素認証（2FA）UI/UX要件
- 要件27E: 二要素認証（2FA）アクセシビリティ要件
- 要件28: 画面遷移とナビゲーション
- 要件29: パスワードリセット画面のUI/UX

**カバレッジ**: 全35要件を完全にカバー

### 次のアクション
1. Phase 6（画面遷移・ナビゲーション強化）のタスク23-25を実装
2. 総合E2Eテストを実行し、全要件が満たされていることを確認
3. `/kiro:validate-impl user-authentication`を実行し、実装品質を検証

---

## 既存完了タスク詳細（Phase 1-3）

### 1. プロジェクト基盤整備とデータモデル構築（完了）

- [x] 1.1 ユーザー情報とアクセス制御のデータモデル構築
  - 招待制ユーザー登録に必要なデータ構造を定義
  - ロールベースアクセス制御のデータ関係を確立
  - セッション管理と二要素認証のデータ保存機能を準備
  - データ検索性能を最適化するインデックス戦略を実装
  - データベーススキーマをマイグレーションで適用
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 17.1, 18.1, 19.1, 21.1, 27.1_

- [x] 1.2 JWT署名鍵の生成と公開鍵配布機能の準備
  - EdDSA署名用の鍵ペアを生成
  - 秘密鍵と公開鍵を環境変数用に準備
  - 公開鍵をJWKS形式で配布するエンドポイントを実装
  - _Requirements: 5.1_

- [x] 1.3 認証機能に必要な依存関係のインストール
  - JWT署名・検証ライブラリを追加
  - パスワードハッシュライブラリを追加
  - メール送信とキュー管理ライブラリを追加
  - 二要素認証とパスワード強度評価ライブラリを追加
  - 型定義ファイルを含むすべての依存関係を設定
  - _Requirements: 2.3, 5.1, 7.1, 27.1, 27.2_

- [x] 1.4 環境変数の設定とパスワード強度チェック準備
  - トークン有効期限の環境変数を設定
  - 二要素認証暗号化鍵の環境変数を設定
  - 初期管理者アカウント情報の環境変数を設定
  - 漏洩パスワードデータベースをBloom Filterに変換
  - Frontend APIベースURLとトークンリフレッシュ設定を追加
  - _Requirements: 2.3, 3.1, 5.1, 27.4_

### 2. 認証システムのコア機能実装（完了）

- [x] 2.1 JWTトークンの生成・検証機能の実装
  - EdDSA署名によるアクセストークンを発行する機能を実装
  - EdDSA署名によるリフレッシュトークンを発行する機能を実装
  - トークンの署名検証とペイロード抽出機能を実装
  - トークンのデコード機能を実装（検証なし）
  - _Requirements: 5.1, 5.2_

- [x] 2.2 セキュアなパスワード管理機能の実装
  - パスワードのハッシュ化機能を実装
  - ハッシュ化されたパスワードの検証機能を実装
  - パスワード強度の評価機能を実装（長さ、複雑性、漏洩チェック）
  - パスワード履歴の管理機能を実装（過去3回の再利用防止）
  - _Requirements: 2.3, 7.1, 7.2, 10.2_

- [x] 2.3 招待制ユーザー登録の管理機能実装
  - 管理者による新規ユーザー招待機能を実装
  - 招待トークンの検証機能を実装（有効期限、使用済みチェック）
  - 招待の取り消し機能を実装
  - 招待一覧の取得機能を実装（ステータス別フィルタリング対応）
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2.4 メール送信の非同期処理基盤実装
  - メール送信の基盤を実装（SMTP設定、テンプレート対応）
  - 非同期メール送信キューを実装
  - 招待メールの送信機能を実装
  - パスワードリセットメールの送信機能を実装
  - メール送信の自動リトライ機能を実装
  - _Requirements: 1.2, 7.3, 24.1_

- [x] 2.5 ユーザー認証フローの統合実装
  - ユーザー登録機能を実装（招待経由、パスワード検証、トランザクション管理）
  - ログイン機能を実装（メールアドレス・パスワード検証、JWT発行、連続失敗検知）
  - ログアウト機能を実装（リフレッシュトークン無効化）
  - 全デバイスログアウト機能を実装
  - 現在のユーザー情報取得機能を実装
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 4.1, 4.2, 4.3, 4.4, 8.1, 8.2, 9.1, 9.2_

- [x] 2.6 パスワードリセット機能の実装
  - パスワードリセット要求機能を実装（リセットトークン生成、メール送信）
  - リセットトークン検証機能を実装（24時間有効期限チェック）
  - パスワードリセット実行機能を実装（新パスワード設定、全トークン無効化）
  - パスワード変更機能を実装（現在のパスワード確認、履歴チェック）
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 2.7 JWT認証ミドルウェアの実装
  - JWTトークン検証ミドルウェアを実装
  - トークン期限切れエラーハンドリングを実装
  - _Requirements: 5.1, 16.1, 16.2_

- [x] 2.8 マルチデバイスセッション管理機能の実装
  - デバイスごとの独立したセッション管理機能を実装
  - セッション有効期限の自動延長機能を実装
  - セッション一覧の取得機能を実装
  - _Requirements: 8.1, 8.2_

### 3. 認可システムの実装（完了）

- [x] 3.1 ロールベースアクセス制御（RBAC）サービスの実装
  - ユーザーの権限取得機能を実装（N+1問題対策済み）
  - 権限チェック機能を実装
  - Redisキャッシュによる権限情報のキャッシング
  - _Requirements: 6.1, 20.1, 23.1_

- [x] 3.2 ロール管理機能の実装
  - ロール作成機能を実装
  - ロール更新機能を実装
  - ロール削除機能を実装（システムロール削除禁止）
  - ロール一覧取得機能を実装
  - _Requirements: 17.1, 17.2_

- [x] 3.3 権限管理機能の実装
  - 権限一覧取得機能を実装
  - ロールへの権限割り当て機能を実装
  - ロールからの権限削除機能を実装
  - _Requirements: 18.1, 18.2_

- [x] 3.4 ユーザー・ロール管理機能の実装
  - ユーザーへのロール割り当て機能を実装
  - ユーザーからのロール削除機能を実装（最後の管理者保護）
  - _Requirements: 19.1, 19.2_

- [x] 3.5 認可ミドルウェアの実装
  - authorize関数の実装
  - 権限チェックとForbiddenError処理
  - _Requirements: 6.1, 20.1_

- [x] 3.6 権限キャッシュの実装
  - Redisキャッシュによる権限情報のキャッシング（TTL 15分）
  - キャッシュ無効化（ロール変更時）
  - _Requirements: 23.1_

- [x] 3.7 Graceful Degradationの実装
  - Redis障害時のDBフォールバック
  - 警告ログ記録
  - _Requirements: 24.1_

### 4. 二要素認証（2FA）の実装（完了）

- [x] 4.1 TOTP生成・検証機能の実装
  - TOTP秘密鍵生成
  - 秘密鍵のAES-256-GCM暗号化
  - TOTP検証（30秒ウィンドウ、±1ステップ許容）
  - QRコード生成
  - _Requirements: 27.1, 27.2_

- [x] 4.2 バックアップコード機能の実装
  - バックアップコード生成（10個、8文字英数字）
  - Argon2idハッシュ化
  - バックアップコード検証（1回限り使用）
  - バックアップコード再生成
  - _Requirements: 27.3_

- [x] 4.3 2FA有効化・無効化機能の実装
  - 2FAセットアップ
  - TOTP検証後の2FA有効化
  - パスワード確認後の2FA無効化
  - _Requirements: 27.1, 27.3, 27.4_

- [x] 4.4 2FAログインフローの統合
  - ログイン時の2FA判定
  - TOTP検証APIエンドポイント
  - バックアップコード検証
  - _Requirements: 27.2_

### 5. 監査ログシステムの構築（完了）

- [x] 5.1 監査ログ記録機能の実装
  - 監査ログ記録サービス
  - ロール変更、権限変更、ユーザー・ロール変更のログ記録
  - 2FA有効化・無効化のログ記録
  - _Requirements: 21.1_

- [x] 5.2 監査ログ取得機能の実装
  - フィルタリング取得
  - Prisma includeによるN+1問題対策
  - ページネーション
  - _Requirements: 21.2_

- [x] 5.3 監査ログエクスポート機能の実装
  - JSON Linesエクスポート
  - _Requirements: 21.2_

### 6. APIエンドポイントとバリデーション（完了）

- [x] 6.1 認証APIエンドポイントの実装
  - POST /api/v1/auth/register
  - POST /api/v1/auth/login
  - POST /api/v1/auth/logout
  - POST /api/v1/auth/logout-all
  - POST /api/v1/auth/refresh
  - _Requirements: 2.1, 4.1, 5.2, 8.1, 8.2_

- [x] 6.2 2FA APIエンドポイントの実装
  - POST /api/v1/auth/2fa/setup
  - POST /api/v1/auth/2fa/enable
  - POST /api/v1/auth/2fa/disable
  - POST /api/v1/auth/verify-2fa
  - POST /api/v1/auth/2fa/backup-codes/regenerate
  - _Requirements: 27.1, 27.2, 27.3, 27.4_

- [x] 6.3 招待APIエンドポイントの実装
  - POST /api/v1/invitations
  - GET /api/v1/invitations
  - GET /api/v1/invitations/verify
  - POST /api/v1/invitations/:id/revoke
  - POST /api/v1/invitations/:id/resend
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1_

- [x] 6.4 パスワード管理APIエンドポイントの実装
  - POST /api/v1/auth/password/reset-request
  - GET /api/v1/auth/password/verify-reset
  - POST /api/v1/auth/password/reset
  - _Requirements: 7.3, 7.4, 29.1, 29.2_

- [x] 6.5 ユーザー情報APIエンドポイントの実装
  - GET /api/v1/users/me
  - PATCH /api/v1/users/me
  - _Requirements: 9.1, 9.2_

- [x] 6.6 RBAC管理APIエンドポイントの実装
  - GET/POST/PATCH/DELETE /api/v1/roles
  - POST/DELETE /api/v1/roles/:id/permissions
  - GET /api/v1/permissions
  - POST/DELETE /api/v1/users/:id/roles
  - _Requirements: 17.1, 17.2, 18.1, 18.2, 19.1, 19.2_

- [x] 6.7 監査ログAPIエンドポイントの実装
  - GET /api/v1/audit-logs
  - _Requirements: 21.2_

### 7. フロントエンド基盤構築（完了）

- [x] 7.1 AuthContext実装
  - 認証状態管理（user, isAuthenticated, isLoading）
  - login, verify2FA, register, logout, refreshToken関数
  - isLoading初期値trueによるUIチラつき防止
  - _Requirements: 11.1, 16.1, 16.2_

- [x] 7.2 TokenRefreshManager実装
  - 単一Promiseパターン（Race Condition対策）
  - Broadcast Channel APIによるマルチタブ同期
  - 有効期限5分前の自動リフレッシュ
  - _Requirements: 5.3, 16.1_

- [x] 7.3 APIクライアント拡張
  - トークンリフレッシュインターセプター
  - 401エラー時の自動リフレッシュ
  - HttpOnly Cookie対応
  - _Requirements: 5.3, 16.1_

- [x] 7.4 ProtectedRoute実装
  - isLoading中のローディングインジケーター表示
  - 未認証時のリダイレクト
  - アクセシビリティ対応
  - _Requirements: 16.2, 28.1_

### 8. 認証UI実装（完了）

- [x] 8.1 LoginForm/LoginPage実装
  - メールアドレス・パスワード入力
  - Zodバリデーション
  - エラーメッセージ表示
  - _Requirements: 11.1, 11.2, 11.3, 28.1_

- [x] 8.2 TwoFactorVerificationForm/Page実装
  - 6桁TOTPコード入力
  - バックアップコードモード
  - _Requirements: 27.6, 27.7, 28.1_

- [x] 8.3 RegisterForm/RegisterPage実装
  - 表示名、パスワード入力
  - PasswordStrengthIndicator
  - PasswordRequirementsChecklist
  - _Requirements: 12.1, 12.2, 12.3, 28.1_

- [x] 8.4 PasswordReset画面実装
  - パスワードリセット要求画面
  - パスワードリセット実行画面
  - _Requirements: 29.1, 29.2, 29.3, 28.1_

### 9. RBACとプロフィール管理UI実装（完了）

- [x] 9.1 ProfileForm/ProfilePage実装
  - 表示名編集
  - パスワード変更
  - 2FA設定セクション
  - _Requirements: 14.1, 14.2, 14.3, 27.5_

- [x] 9.2 TwoFactorSetupForm実装
  - 3ステップウィザード
  - QRコード表示
  - バックアップコード保存機能
  - _Requirements: 27.5, 27.6_

- [x] 9.3 招待管理UI実装
  - InvitationForm
  - InvitationList
  - InvitationManagementPage
  - _Requirements: 13.1, 13.2, 13.3_

### 10. E2Eテスト実装（完了）

- [x] 10.1 認証フローE2Eテスト
  - ユーザー招待 → 登録 → ログイン
  - 2FA設定 → ログイン
  - パスワードリセット
  - _Requirements: 1.1, 2.1, 4.1, 7.3, 27.2_

- [x] 10.2 権限チェックE2Eテスト
  - 管理者アクセス
  - 一般ユーザーアクセス制限
  - _Requirements: 6.1, 20.1_

- [x] 10.3 セッション管理E2Eテスト
  - 有効期限切れリダイレクト
  - マルチタブ同期
  - _Requirements: 16.1_

### 11. パフォーマンス・セキュリティ・デプロイ（完了）

- [x] 11.1 パフォーマンステスト
  - ログインAPI
  - 権限チェックAPI
  - トークンリフレッシュAPI
  - _Requirements: 23.1_

- [x] 11.2 セキュリティ設定
  - helmetミドルウェア
  - CSP/HSTSヘッダー
  - レート制限
  - _Requirements: 10.1, 10.2, 26.1_

- [x] 11.3 Storybook実装
  - 認証コンポーネントStories
  - アクセシビリティテスト
  - _Requirements: 15.1, 15.2, 15.3, 27.8_

- [x] 11.4 単体テスト・統合テスト
  - サービス層テスト
  - ミドルウェアテスト
  - コンテキスト・コンポーネントテスト
  - _Requirements: 全要件_

---

### Phase 7: セッション切れモーダル再認証（要件30対応）

_追加日: 2026-02-09_

**概要**: 操作中にセッションが切れた場合、ログイン画面へのリダイレクトではなくモーダルダイアログによるインプレース再認証を実装し、フォーム入力データの損失を防止する。

**前提条件**: Phase 1-6の実装が完了していること。

#### 26. API Client にセッション切れコールバック機構を追加

- [x] 26.1 sessionExpiredCallback の追加
  - `frontend/src/api/client.ts` に `sessionExpiredCallback` プロパティと `setSessionExpiredCallback()` メソッドを追加
  - 401レスポンスでトークンリフレッシュが失敗した場合に `sessionExpiredCallback` を呼び出す
  - `tokenRefreshCallback` が null の場合にも `sessionExpiredCallback` を呼び出す
  - _Requirements: 30.13_
  - _Test: `frontend/src/__tests__/api/client.test.ts` に追加テスト_

- [x] 26.2 既存テストの更新
  - `client.test.ts` の既存401テストケースが `sessionExpiredCallback` を考慮するよう更新
  - リフレッシュ失敗時に `sessionExpiredCallback` が呼ばれることを検証
  - `sessionExpiredCallback` が null の場合に既存動作が維持されることを検証
  - _Requirements: 30.13_

#### 27. AuthContext のセッション切れ状態管理を拡張

- [x] 27.1 sessionExpiredDuringOperation 状態の追加
  - `AuthContext.tsx` に `sessionExpiredDuringOperation` 状態を追加
  - `isInitialized === true` の場合のみモーダル方式を適用する条件分岐を実装
  - `handleReauthSuccess` 関数を実装（トークン更新、TRM再初期化、状態リセット）
  - `navigateToLogin` 関数を実装（トークンクリア、ログイン画面遷移）
  - `apiClient.setSessionExpiredCallback()` の設定をログイン・セッション復元の各箇所に追加
  - _Requirements: 30.14, 30.15_
  - _Test: `frontend/src/__tests__/contexts/AuthContext.test.tsx` に追加テスト_

- [x] 27.2 AuthContextValue インターフェースの更新
  - `sessionExpiredDuringOperation`, `handleReauthSuccess`, `navigateToLogin` を公開インターフェースに追加
  - `useAuth` フックのエクスポート型に反映
  - 既存テストが新しいインターフェースと互換であることを確認
  - _Requirements: 30.14, 30.15_

- [x] 27.3 ProtectedRoute のリダイレクト抑制
  - `ProtectedRoute.tsx` に `sessionExpiredDuringOperation` の参照を追加
  - `!isAuthenticated && !sessionExpiredDuringOperation` の条件でリダイレクトを制御
  - 操作中セッション切れ時にはchildrenを表示し続け、モーダルがオーバーレイで動作することを保証
  - 既存のProtectedRouteテストを更新し、新しい条件分岐をカバー
  - _Requirements: 30.2, 30.3_
  - _Test: `frontend/src/__tests__/components/ProtectedRoute.test.tsx` に追加テスト_

#### 28. SessionExpiredModal コンポーネントの実装

- [x] 28.1 基本コンポーネント構造の実装
  - `frontend/src/components/SessionExpiredModal.tsx` を新規作成
  - Props定義: `isOpen`, `userEmail`, `onReauthSuccess`, `onNavigateToLogin`
  - オーバーレイ（クリック無効）＋中央配置モーダルカードのレイアウト
  - Tailwind CSSによるスタイリング
  - _Requirements: 30.2, 30.3, 30.5_

- [x] 28.2 再認証フォームの実装
  - メールアドレスフィールド（自動入力、読み取り専用）
  - パスワード入力フィールド（自動フォーカス、`autocomplete="current-password"`）
  - 再ログインボタン（ローディング状態対応）
  - エラーメッセージ表示領域
  - フォームバリデーション（パスワード必須）
  - _Requirements: 30.4, 30.7, 30.8, 30.11_

- [x] 28.3 再認証APIの呼び出しロジック
  - `apiClient.post('/api/v1/auth/login', ...)` を呼び出し
  - 成功時: `onReauthSuccess` コールバックを呼び出し、トークンを返す
  - 失敗時: モーダル内にエラーメッセージを表示
  - 連続失敗カウンターの管理（3回連続失敗で「ログイン画面へ移動」ボタン表示）
  - ネットワークエラー時のメッセージ表示とリトライボタン
  - _Requirements: 30.8, 30.9, 30.10, 30.11, 30.16, 30.17_

- [x] 28.4 2FA対応
  - ログインレスポンスの `requires2FA` フィールドを検知
  - 2FA要求時にTOTPコード入力フィールドを追加表示（6桁入力）
  - 「バックアップコードを使用する」リンクの表示
  - 2FA検証APIの呼び出し（`/api/v1/auth/verify-2fa`、`/api/v1/auth/verify-2fa/backup`）
  - _Requirements: 30.12_

- [x] 28.5 アクセシビリティ実装
  - `role="dialog"`, `aria-modal="true"`, `aria-labelledby="session-expired-title"`
  - フォーカストラップ実装（Tab/Shift+Tab循環）
  - Escキー無効化
  - `aria-live="assertive"` でセッション切れメッセージをスクリーンリーダーに通知
  - _Requirements: 30.6, 30.18, 30.19, 30.20_

- [x] 28.6 レスポンシブ対応
  - デスクトップ: `max-w-md` 中央配置
  - モバイル（< 768px）: フルスクリーンに近いレイアウト
  - _Requirements: 30.21_

#### 29. グローバルレイアウトへの統合

- [x] 29.1 SessionExpiredModal のグローバル配置
  - `App.tsx` または認証済みレイアウトにSessionExpiredModalを配置
  - `useAuth()` から `sessionExpiredDuringOperation`, `user`, `handleReauthSuccess`, `navigateToLogin` を取得して Props に渡す
  - 全ての認証済み画面で一貫してモーダルが表示されることを保証
  - _Requirements: 30.1, 30.2, 30.3_

#### 30. 単体テスト・Storybook

- [x] 30.1 SessionExpiredModal 単体テスト
  - `frontend/src/__tests__/components/SessionExpiredModal.test.tsx` を新規作成
  - テストケース:
    - `isOpen=false` 時にモーダルが表示されないこと
    - `isOpen=true` 時にモーダルが表示されること
    - メールアドレスが自動入力されていること
    - パスワード入力 → 再ログインボタンクリック → 成功時にコールバックが呼ばれること
    - 認証失敗時にエラーメッセージが表示されること
    - 3回連続失敗後に「ログイン画面へ移動」ボタンが表示されること
    - ネットワークエラー時のメッセージとリトライボタン表示
    - 2FA要求時にTOTPフィールドが表示されること
    - Escキーでモーダルが閉じないこと
    - フォーカストラップが機能すること
    - aria属性が正しく設定されていること
    - レスポンシブレイアウトの検証
  - _Requirements: 30.1-30.21_

- [x] 30.2 Storybook ストーリー作成
  - `frontend/src/components/SessionExpiredModal.stories.tsx` を新規作成
  - ストーリー: Default, WithError, With2FA, ConsecutiveFailures, NetworkError, Mobile
  - _Requirements: 30.4, 30.12, 30.16, 30.17, 30.21_

#### 31. E2Eテスト

- [x] 31.1 セッション切れモーダルE2Eテスト
  - `e2e/specs/auth/session-expired-modal.spec.ts` を新規作成
  - テストシナリオ:
    - フォーム入力中にトークン期限切れ → モーダル表示 → 再認証 → 入力データ保持確認
    - 再認証3回連続失敗 → ログイン画面遷移ボタン表示
    - 2FAユーザーのモーダル再認証フロー
    - モーダル表示中にEscキーで閉じないことの確認
  - _Requirements: 30.1-30.21_

---

**Phase 7 サマリー**:
- **メジャータスク数**: 6（タスク26-31）
- **サブタスク数**: 15
- **新規ファイル**: 4（SessionExpiredModal.tsx, SessionExpiredModal.test.tsx, SessionExpiredModal.stories.tsx, session-expired-modal.spec.ts）
- **既存ファイル変更**: 3（client.ts, AuthContext.tsx, App.tsx）
- **要件カバレッジ**: 要件30（全21受入基準）を完全にカバー

**推奨実装順序**:
1. タスク26 → タスク27 → タスク28 → タスク29 → タスク30 → タスク31（順次依存）

**並列実行可能タスク**:
- タスク28.5（アクセシビリティ）と タスク28.6（レスポンシブ）は並列可能
- タスク30（単体テスト/Storybook）と タスク31（E2E）は並列可能

## タスク32: 公開鍵配布のキャッシュ制御（要件31）

**経緯**: site-survey の Task 115.127 段6 で、E2E の「適切なCache-Controlヘッダーが設定されていること」が観測結果で主張を包む構造により恒久的に緑になっていたことが判明した。実装は `Cache-Control` を一切設定しておらず、かつ**本仕様に JWKS の記述が無かった**ため、誰も決めていない仕様を検証している状態だった。利用者の判断（2026-08-22）により、要件へ昇格して実装することとした。

- [x] 32.1 公開鍵配布エンドポイントにキャッシュ制御を実装する
  - `backend/src/routes/jwks.routes.ts` の応答に `Cache-Control` を設定する。有効期間は300秒（5分）とする
  - 値の根拠を注釈に残すこと。**鍵の入れ替えの猶予期間（`JWT_PUBLIC_KEY_OLD` が設定されている期間）より十分に短いこと**が要件6の趣旨である。アクセストークンの既定有効期限15分より短い値を選んでいる
  - 有効期間は本番コードの定数として一元管理し、検証側が同じ定数を参照できるようにすること。**検証が本番の算出を再実行する形にしないこと**（期待値は具体値で書くこと）
  - 単体テストで、応答に `Cache-Control` が含まれ有効期間が300秒であることを確認できること
  - _Requirements: 31.4, 31.5, 31.6_
  - _Boundary: 公開鍵配布エンドポイントの応答ヘッダー_
  - **処遇（コミット `af75c660` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: `backend/src/routes/jwks.routes.ts` に公開定数 `JWKS_CACHE_MAX_AGE_SECONDS = 300` を置き、成功応答の `res.json` の直前で `Cache-Control: public, max-age=300` を設定した（500 応答には付けない）。値の根拠は注釈に残した——鍵の入れ替えの猶予期間（design.md の鍵ローテーション手順 T〜T+30日）より十分に短く、アクセストークンの既定有効期限 15 分（`security.constants.ts` の `ACCESS_TOKEN_EXPIRY: '15m'`）より短い。要件・設計に `public` / `private` の指定は無く、公開鍵は秘匿情報を含まないため共有キャッシュを許す `public` とした
  - **検証**: 単体テスト `backend/src/__tests__/unit/routes/jwks.routes.test.ts` の `describe('キャッシュ制御')` に2件を追加した——応答ヘッダーが `'public, max-age=300'` と一致すること（`@requirement` 31.4 / 31.5）、定数が `300` であり 30日（`2_592_000`）と15分（`900`）より小さいこと（31.5 / 31.6）。期待値はいずれも具体値。**RED**: フラグ OFF で `expected undefined to be 'public, max-age=300'` により1件が落ち、ON で10件緑、フラグ撤去後も10件緑。独立レビューが `res.set` の削除・`max-age=3000`・定数 3000 の変異をいずれも赤で再現した。backend 単体 5740件・type-check・lint は緑
  - **関門**: `check:req-coverage` は基線から EXIT 1 のまま、本スペックの受入基準は 358→361/388（31.4 / 31.5 / 31.6 が単体の印で被覆）。`count:coverage-marks` は本スペック 461→464。`check:req-exclusions` / `check:design-code-refs` / `check:design-path-refs` / `check:design-measurement-freshness` は差分なし
  - **申し送り（32.2 で必ず扱うこと）**: (i) 実装は test 環境（tsx watch）へ即反映され、`e2e/specs/api/jwks.spec.ts` のキャッシュ制御の検証に置かれた `test.fail()` は「落ちるはずが通った」として赤になる。**本項を含むブランチの push は 32.2 の完了後に行うこと**。(ii) `e2e/requirement-exclusions.json` の REQ-31.4 / 31.5 / 31.6 は pending-implementation のまま「実装が存在しない」と述べており、本項で事実と合わなくなった。32.2 の対象要件は 31.4 / 31.5 だけで、**31.6 の除外の処遇（削除するか、代替検証を上記の単体テストへ書き換えるか）は担当が明記されていない**
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- jwks` 10/10、backend type-check EXIT=0

- [ ] 32.2 公開鍵配布の受入検証からラチェットを外す
  - `e2e/specs/api/jwks.spec.ts` の「キャッシュ制御: 適切なCache-Controlヘッダーが設定されていること」に置かれた `test.fail()` を外す
  - 主張を要件31.5 の具体値（300秒）と突き合わせる形へ強化すること。**「定義されている」「public か private か max-age を含む」といった弱い主張のままにしないこと**
  - あわせて `@requirement user-authentication/REQ-31.4, 31.5` を付与し、被覆に計上されるようにすること
  - **変異検証**: ヘッダーの設定を外すと当該の検証が落ちることを実測すること
  - _Depends: 32.1_
  - _Requirements: 31.4, 31.5_
  - _Boundary: 公開鍵配布のE2E_
  - **処遇（コミット `4dd8f37d` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: `e2e/specs/api/jwks.spec.ts` の「キャッシュ制御: 適切なCache-Controlヘッダーが設定されていること」から `test.fail()` を外し、主張をステータス 200 と `cache-control` が `'public, max-age=300'` と一致すること（具体値。本番定数は参照しない）へ強めた。旧来の `toBeDefined` / `toMatch(/public|private|max-age/)` は残していない。`@requirement user-authentication/REQ-31.4` / `REQ-31.5` を同ファイルの 31.1〜31.3 と同じ書式で付与した。被覆印とラチェットの無い除外の同居は `coverage-tag-coexistence:no-ratchet` で禁じられるため、`e2e/requirement-exclusions.json` の REQ-31.4 / 31.5 の除外を取り下げた。**REQ-31.6 は利用者の裁定（2026-09-26「(A) 実態どおりに書き換える」）により**、値の選び方への制約で E2E から観測できないため除外に残し、分類を pending-implementation → integration-test、代替検証を method: unit-test / tool: Vitest（`backend/src/__tests__/unit/routes/jwks.routes.test.ts` の定数の検証）へ改めた（同じ組み合わせの既存除外は17件）。集計は総数 157→155、pending-implementation 4→1、integration-test 38
  - **検証（独立レビューが再現）**: `npm run test:e2e -- e2e/specs/api/jwks.spec.ts` は 10/10 で緑（実装者2回・レビュー1回）。**変異**: `jwks.routes.ts` の `res.set` の一行を外すと当該の検証が `toBe` の不一致で落ちる（9/10、EXIT=1）。復元は blob `ccac2729` の一致で確かめ、再実行は 10/10。`check:req-exclusions`（155 件、同居の違反なし）/ `check:e2e-guards` / `check:e2e-selfjudge` / `count:coverage-marks`（本スペック 464→466）/ prettier / eslint は EXIT 0。`check:req-coverage` は基線から EXIT 1 のまま、method:none は 3→0
  - **取り下げで赤くなった上流所管の関門（HEAD では緑）**: `check:req-exclusions:selftest`（`promiselessEntry` が実データの method:none の除外を前提にしており、0件で中断）、`check:design-measurement-freshness`（site-survey の design.md を錨にする5宣言: 除外総数 157→155、pending 4→1、promiseless 3→0、自己検査を引く2宣言が空）、`check:design-measurement-freshness:selftest`（1/56）。いずれも site-survey の所管であり下流は書き換えていない。デバッグ調査は、境界内で関門を赤くせずに本項を実装する方法は無いと結論した（印を付けずにラチェットだけ外す案は本文の要求に反し、31.6 を method:none のまま残す案でも件数の宣言は赤くなる）。**利用者の判断（2026-09-26）で本項はローカルにコミットし、上流へ起票して待つ**。上流が解決するまで当該ブランチは push できない
  - _Blocked: site-survey スペックの Task 115.334（除外台帳の自己検査の対照を合成データへ改めることと、除外の件数を固定した5宣言の貼り直し。親が上流の tasks.md へ実際に書き込み済み）の解決待ち。変更そのものは承認・コミット済み。`[x]` は 115.334 の解決後に関門が緑へ戻ったことを確かめてから付けること_

- [x] 32.3 (P) 公開鍵配布の既存の受入基準を要件へ結線する
  - 要件31.1〜31.3（JWKS形式での応答・旧公開鍵の併載・`alg`/`use`/`kid` の付与）は実装済みであり、`e2e/specs/api/jwks.spec.ts` に検証も存在する
  - 当該の検証へ `@requirement user-authentication/REQ-31.1` 等を付与し、被覆に計上されるようにすること
  - **実装が既にあることを確認したうえで付与すること。**タグだけ付けて被覆を埋める形にしないこと
  - _Requirements: 31.1, 31.2, 31.3_
  - _Boundary: 公開鍵配布のE2Eの要件タグ_
  - **処遇（コミット `8546b446` の作業ツリー、2026-09-26 にリポジトリルートで実測）**: 要件 31.1〜31.3 の実装が `backend/src/routes/jwks.routes.ts` にあることを確かめた（`{ keys }` 形式の応答、`JWT_PUBLIC_KEY_OLD` による旧鍵の併載、`ensureRfc7517Compliance` による `alg` / `use` / `kid` の付与）。被覆印は `f11f09a5` で既に付いていたため、**印を検証ごとに見直し、主張が受入基準に届いていないものを正した**。本節の前提「検証も存在する」は 31.2 については成り立っていなかった
    - **31.1**: 印は形式だけを確かめる「RFC 7517準拠: レスポンスがkeysプロパティを持つJWKS形式であること」にあり、`{keys: []}` でも緑になった（独立レビューの差し戻し1回）。主張は変えずに、鍵が1本以上あることと kty / crv / x を主張する「RFC 7517準拠: 公開鍵がEdDSA (OKP) 形式であること」にも印を付け、形式と現在の鍵の配布の両方を結線した
    - **31.2**: 印の付いた E2E は `keys.length > 0` しか主張しておらず、test 環境には `JWT_PUBLIC_KEY_OLD` が無い（応答は `current` の1本のみ）ため偽の被覆だった。**利用者の裁定（2026-09-26「(A) 印を単体テストへ移す」）**に従い、E2E から印を外してテスト名を主張どおり「鍵の配布: keys配列が空でないこと」へ改め（主張は不変）、旧鍵を設定して2本と kid の順を主張する `backend/src/__tests__/unit/routes/jwks.routes.test.ts` の「should include old public key when JWT_PUBLIC_KEY_OLD is set」へ印を付けた
    - **31.3**: 印は `kid` の検証にしか無かったため、`use`（`sig`）と `alg`（`EdDSA`）の検証にも付けた
  - **変異（独立レビューが両方を再現）**: 旧鍵を加える行を外すと単体テストで 31.2 の検証だけが `expected 1 to be 2` で赤。現在の鍵を加える行を外すと（tsx watch の再読込を `touch backend/src/index.ts` と curl の `{"keys":[]}` で確認）、E2E で EdDSA（31.1）・kid / use / alg（31.3）・「鍵の配布」の5件が赤、形式の検証は緑のまま。いずれも復元後 `git hash-object` が HEAD の blob `ccac2729` と一致し、E2E 10/10・単体 10/10 が緑
  - **関門**: `check:req-exclusions` 緑（155 件。31.1〜31.3 の除外は無い）、被覆は 2735/2890 で不変（31.1 / 31.3 は `e2e/specs/api/jwks.spec.ts`、31.2 は単体テストが被覆）、`count:coverage-marks` の総数は不変（jwks.spec.ts 5→4、jwks.routes.test.ts 3→4）。prettier / eslint 合格。`check:req-coverage` は基線から EXIT 1（要件31とは無関係の未被覆）
  - **検証（親が承認後に新鮮な証拠で再実行）**: `npm --prefix backend run test -- jwks` 10/10、`check:req-exclusions` EXIT=0

## タスク33: 除外一覧が名乗る検証道具名を実体へ揃える

**経緯**: site-survey の Task 115.213 が設計文書に滞留していた未起票の提案を台帳化し、その `### 判定の一覧` の行7「他機能スペックの除外一覧の Jest 道具名」を**後続タスクへ送る**と裁定した。site-survey の Task 115.238 が申し送りを実行して本節を起こした。**所有権は本スペックにある。** site-survey は自機能分 32 件を Task 115.121 で既に Vitest へ改めており、現場調査スペックの所管は 0 件である。

**測った事実**（いずれもコミット `9e63637`、2026-09-02 にリポジトリルートで実測）:

- **本リポジトリに Jest は存在しない。** `find . -name 'jest.config*' -not -path '*/node_modules/*' | wc -l` の出力が `0`。`package.json` / `backend/package.json` / `frontend/package.json` の依存に `jest` は無く、名前に jest を含むのは `frontend/package.json` の `@testing-library/jest-dom`（Vitest から使う照合子の集まりであって走者ではない）だけである
- **単体・統合の走者は backend / frontend とも Vitest である。** 両者の `npm test` はいずれも `vitest run` であり、`backend/vitest.config.ts` / `backend/vitest.integration.config.ts` / `frontend/vitest.config.ts` が実在する
- **利用の実測**: `grep -rlE "from ['\"]vitest['\"]" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` の出力が `757` である。**同じ走査根・同じ glob** で `grep -rlE "from ['\"]@jest/globals['\"]|\bjest\.(fn|mock|spyOn)\(" backend/src frontend/src --include=*.ts --include=*.tsx | wc -l` を測ると出力は `0` である。**総数 `757` を併記するのは、`0` だけでは「走査根を読めていない」場合と区別できないためである**——同じ式を実在しないパスへ当てても出力は同じく `0` になる（2026-09-02 に実測）
- **提案が生きていること**: `node -e "const j=require('./e2e/requirement-exclusions.json');const k=j.exclusions.filter(e=>/Jest/.test(e.alternativeVerification.tool));console.log(k.length, k.filter(e=>e.id.startsWith('site-survey/')).length)"` の出力が `64 0`（後の `0` が現場調査スペックの分）
- **機械保証は無い。断定でなく変異で示す**（115.235 の作法）: `e2e/requirement-exclusions.schema.json` は `tool` を `{ "type": "string", "minLength": 1 }` としか定めず、道具の実在を見ない。実在しない道具名 `Kaboomtest 9000 / Nonexistent Runner` へ一件を差し替える変異を当てても `npm run check:req-exclusions` は 205 件を検査して終了コード 0 のままである（2026-09-02 に実測。変異は複製からの書き戻しで復元し、blob ハッシュが `HEAD` と一致することで確かめた）

**是正すると別の関門が赤くなる。着手前に読むこと**: 上の `node -e` の出力 `64 0` は `scripts/design-measurements.json` の宣言 `jest-alternative-verification-exclusions` に固定されており、`.kiro/specs/site-survey/design.md` の台帳の再現コマンド 5 の行と双方向で突き合わされる。**一件でも道具名から Jest を落とすと `npm run check:design-measurement-freshness` が「expected=`64 0` actual=`63 0`」として終了コード 1 で落ちる**（`company-info/REQ-6.9` の道具名を実在しない `Kaboomtest 9000 / Nonexistent Runner` へ差し替える変異を実際に当てて実測。2026-09-02、コミット `9e63637` にリポジトリルートで実測。変異は事前複製からの `cp` で復元し、`git hash-object e2e/requirement-exclusions.json` が `HEAD` の blob `77d4bb8443f19bc5c2de768c866eae1943175a6d` と一致することで確かめた）。宣言の解除と台帳の追随は**現場調査スペックの Task 115.280 が所管する**。

**同じ変異を当てたまま測った他の関門の実測**（走査の範囲は日本語でなくコマンドで宣言する。2026-09-02、コミット `9e63637` にリポジトリルートで実測）: 測ったのは `npm run` に与える名で `check:req-exclusions` / `check:req-exclusions:selftest` / `check:req-coverage` / `check:trace-coverage` / `check:design-refs` / `check:design-code-refs` / `check:design-path-refs` / `check:cf-evidence` / `check:steering-refs` / `check:steering-idents` / `check:steering-test-tree` / `lint` / `type-check` / `format:check` の **14 本**である。**いずれも基線と同じ終了コードのままであった。ただし `check:req-coverage` は基線から既に終了コード 1 であり（到達被覆 2632/2684 = 98.1%、未カバー 215 件）、変異の前後で変わらない**——「14 本が緑のままであった」のではない。**終了コードが動かないことと出力が動かないことも別である**: 14 本のうち 13 本は基線と出力まで一致したが、`check:req-coverage` だけは除外一覧の監査の内訳が「リポジトリ外の代替検証: 32件 / リポジトリ内検証あり: 22件」から「33件 / 21件」へ変わる（差分はこの 2 行のみで、終了コードも被覆率も動かない）。**着手時にはこの 14 本と `check:design-measurement-freshness` を自分で測り直し、実測日とコミットハッシュを添えること**（115.212 の規約）。

**是正先**:

1. `e2e/requirement-exclusions.json` の下表の `alternativeVerification.tool`
2. 本スペックの設計文書——**ただし実測では該当が 0 件である。** `for f in .kiro/specs/*/design.md; do printf '%s %s\n' "$f" "$(grep -c Jest "$f")"; done` を走らせると、`Jest` を挙げる設計文書は 13 スペックのうち `site-survey` の 1 件（6 箇所）だけで、他の 12 スペックはいずれも `0` である（2026-09-02 に実測）。台帳の行7 は是正先に「各機能スペックの設計文書」を挙げているが、起票の時点で当たりが無い。**この `0` は着手時に測り直すこと**

**本スペックの所管は 12 件で、全件を次に挙げる**（2026-09-02 に実測。抜き取りではない）。**この 12 件は id に機能名の接頭辞を持たない。** 機能名を冠さない旧来の識別子は本スペックへ帰属する（`scripts/check-requirement-exclusions.ts` の `DEFAULT_FEATURE` が `user-authentication` であり、被覆率側の `normalizeExclusionId` と同じ規則である）。`REQ-24` / `REQ-25` は `.kiro/specs/user-authentication/requirements.md` の `### 要件24: フォールトトレランス（障害耐性）` と `### 要件25: データ整合性とトランザクション管理` に実在する（2026-09-02 に実測）:

| id | 現在の `alternativeVerification.tool` |
|---|---|
| `REQ-24.3` | `Jest / Vitest with mock` |
| `REQ-24.6` | `Jest / Toxiproxy` |
| `REQ-24.7` | `Jest with log spy` |
| `REQ-24.8` | `Jest with mock` |
| `REQ-25.6` | `Jest / Prisma` |
| `REQ-25.8` | `Jest / Concurrent requests` |
| `REQ-25.1` | `Jest / Prisma` |
| `REQ-25.2` | `Jest / Prisma` |
| `REQ-25.3` | `Jest / Prisma` |
| `REQ-25.4` | `Jest / Prisma` |
| `REQ-25.5` | `Jest / Prisma` |
| `REQ-25.7` | `Jest / Prisma` |

- [x] 33.1 除外一覧の道具名を実体へ揃える
  - 上表 12 件の `alternativeVerification.tool` から、実在しない `Jest` を取り除く
  - **先例に揃えること**: site-survey は Task 115.121 で自機能分 32 件を「道具名の先頭 `Jest` を `Vitest` へ置換し、`React Testing Library` / `Supertest` などの併記部分は据え置く」形で是正した。`.kiro/specs/site-survey/design.md` の `**あわせて是正した除外一覧の記述**` に続く項が、その形を逐語で記録している
  - **`REQ-24.3` の `Jest / Vitest with mock` は、`Jest` を落とすだけで `Vitest with mock` になる。** 先頭を置換すると重複になるため、置換ではなく除去であること
  - **`REQ-24.7` の `Jest with log spy` と `REQ-24.8` の `Jest with mock` は区切りが `/` ではない。** 先頭語だけを見る一括置換では取りこぼす
  - **`REQ-24.6` の `Toxiproxy` は併記の側も確かめること。** `toxiproxy` は npm の依存ではなく単体の実行体であるため、root / backend / frontend のいずれの `package.json` の依存にも無いこと（2026-09-02 に実測）は不在の証明にならない。**接続断を実際に模倣している手段を測ってから書くこと**
  - **`Prisma` は実在する**（`backend/package.json`。2026-09-02 に実測）ため据え置いてよい。`REQ-25.8` の `Concurrent requests` は道具名ではなく手法の記述であり、走者名との併記として残すか `description` 側へ寄せるかを判断すること
  - **道具名だけを機械的に置換して終えないこと。** 除外は受入基準を分母から丸ごと外すため、`description` が約束する代替検証が現に存在するかを一件ずつ確かめること。存在しないなら道具名の是正ではなく除外の取り下げが要る
  - **JSON の整形は `npm run format:check` では見られない。** リポジトリルートの `format:check` は `prettier --check "e2e/**/*.{js,ts}" "playwright.config.{js,ts}" "scripts/**/*.ts"` であって JSON を含まず、`lint-staged` も `*.{js,ts}` だけを対象とする（2026-09-02 に実測）。`npx prettier --check e2e/requirement-exclusions.json` を直接走らせること（現況は整形済みで終了コード 0。同日に実測）
  - **検証**: `npm run check:req-exclusions` が緑であること、および上の `node -e` の出力の第一値が本スペックの件数だけ減っていること
  - _Depends: site-survey スペックの Task 115.280（`64 0` の宣言の解除と台帳の追随）_
  - _Boundary: 本スペックが所管する除外項目の `alternativeVerification.tool`_
  - **処遇（コミット `0459f048` の作業ツリー、2026-09-26 にリポジトリルートで実測。利用者の裁定「取り下げて後続を起票」）**: 道具名を是正する前に、12 件の代替検証が実在するかを一件ずつ確かめた。**`description` の約束を満たす検証は 0 件だった**。部分的な検証にとどまるのは 3 件——24.3 は `backend/src/__tests__/unit/services/email.service.test.ts` がキュー投入・`attempts: 5`・exponential を主張するが間隔を見ず、しかも実装は Bull の `(2^n−1)×60s`（1分・3分・7分・15分）で条文の 1分・5分・15分・1時間・6時間と一致しない。25.1 は `auth.integration.test.ts` が登録の結果だけを、25.2 は `database.integration.test.ts` が Prisma 一般のロールバックだけを見る。24.7 は実装（`rbac.service.ts`）があるが検証が無い。24.6 / 24.8 / 25.3 / 25.4 / 25.5 / 25.6 / 25.7 / 25.8 は実装も無い。併記の `Toxiproxy` はリポジトリの中で一度も使われていない（親も `git grep` で確認）。確かめる対象の無い条文を分母から外すのは偽の宣言になるため、道具名は是正せず、`e2e/requirement-exclusions.json` から 12 件を取り下げて未被覆として分母へ戻した（summary: `totalExclusions` 155→143、`fault-tolerance` 14→10、`data-integrity` 27→19、`note` に経緯を追記）。実装と検証はタスク35 として起票した
  - **関門（前後の実測）**: `node -e` の出力は `48 0` → `36 0`（第一値が本スペックの 12 件だけ減り、本スペック分で `Jest` を名乗る除外は 0 件）。`check:req-exclusions` EXIT=0（155→143 件）、`npx prettier --check e2e/requirement-exclusions.json` EXIT=0。`check:req-coverage` は基線から EXIT=1 で FAILED の種類は不変——適用対象 2735→2747、到達被覆 2700/2735（98.7%）→ 2700/2747（98.3%）、本スペックの E2E 適用対象 99.4%→96.3%、未カバー受入基準 2→14 件。`count:coverage-marks` は不変。`check:design-measurement-freshness` / `:selftest` は上流 115.334 に由来して基線から EXIT=1 で、本件で実測値が動いたのは既に赤だった `requirement-exclusions-total`（actual 155→143）だけ、新しく赤になった宣言は無い（`jest-alternative-verification-exclusions` は版固定で `64 0` のまま）。`check:req-exclusions:selftest` は上流 115.334 に由来して基線から停止したまま。本スペックの設計文書の `grep -c Jest` は 0
  - **申し送り**: `requirement-exclusions-total` の現況 143 を site-survey 115.334 へ追記した。REQ-24.1 / 24.2 の道具名 `Toxiproxy` も偽りだが `Jest` を含まず本項の範囲外（別途の扱いを要する）

## タスク34: 認証のE2Eに残る返り値を使わない待機を撤去する

**経緯**: site-survey の Task 115.108 が新設した検査の洗い出しで、認証のE2E2箇所に**何も待たない待機**が残ることが判明した。同スペックは所管外として Task 115.154 を `_Blocked:_` に置いたが、**本スペックへ起票されないまま滞留していた**。site-survey の機能レベル検証がその断絶を検出し、申し送りを実行して本節を起こした。**所有権は本スペックにある。**

**実害は無い。体裁の問題である。** 2箇所とも直後に通信の傍受による本番経路の主張（`expect(...).toBe(true)`）があるため、**偽の緑ではない**。撤去しても検証の主張は一つも減らない。**起票の粒度をこれ以上大きくしないこと**——過大な起票は、実害のある起票を埋もれさせる。

**測った事実**（いずれもコミット `c3f3e9f6`、2026-09-08 にリポジトリルートで実測）:

- `e2e/specs/auth/session-expired-modal.spec.ts` の区間 `REQ-30.8: 有効な認証情報で再認証API呼び出しが行われる` に、述語が定数 `true` を返す待機が1件ある（`grep -cF 'await page.waitForFunction(() => true, {}, { timeout: getTimeout(5000) });' e2e/specs/auth/session-expired-modal.spec.ts` の出力が `1`）。註は「APIが呼び出されたことを確認」と述べるが、**述語は API の呼び出しを一切読まない**。実際に確認しているのは直後の `expect(loginApiCalled).toBe(true)` である
- `e2e/specs/auth/token-refresh.spec.ts` の区間 `アクセストークン有効期限の5分前に自動リフレッシュされる` に、本体が `return true;` で終わる待機が1件ある（入口は `grep -nF '// 注: 実際にはrouteハンドラーで検出されるため、このチェックは補助的' e2e/specs/auth/token-refresh.spec.ts`。当たりは1行）。**註自身が「補助的」と認めている**。実際に確認しているのは直後の `expect(backgroundRefreshCalled).toBe(true)` である
- **機械の関門は無い**: `npm run check:e2e-selfjudge` は「画面の中で判定を自前で書き起こす構造」を見る検査であり、**返り値を使わない待機は検出対象外である**（2026-09-08 に実行し、走査ファイル217件・画面へ送るスクリプト456件で検出0件・終了コード0。上の2件は在るまま通る）。**「画面へ送るスクリプト」の件数は他タスクのE2E編集で動く**——同日の起票作業中に 455 件から 456 件へ動いた。**動くのは母集団であって、上の2件が検出されないという性質ではない**

**着手前に測り直すこと**: `e2e/specs/**` は他のタスクが並行して編集しうる。上の2件が現存するかを取り直してから着手すること。**既に撤去されていれば本節は不要である**（site-survey の Task 115.155 と同じ形の差分零の完了になる。その場合は解消元を明記すること）。

- [ ] 34.1 (P) 何も待たない2件の待機を撤去する
  - 上の2箇所を削る。**主張（`expect`）には触れないこと**——本節は無価値な一行を消すだけであり、検証の主張を増減させない
  - 待機を消したことで不安定になる場合は、**定数を返す述語で待つのではなく、実際に待ちたい条件を述語へ書くこと**。「短い待機でAPIコールの完了を待つ」型の固定時間待機へ置き換えないこと
  - **出口条件**: 上の2つの再現コマンドの出力がいずれも `0` になり、両ファイルの当該区間が緑のままであること
  - **`_Requirements:` を持たないのは意図である。** 本節は受入基準を実装せず、既存の主張を変えずに無価値な一行を消すだけである。当該区間が名乗る受入基準を挙げると偽の被覆申告になる
  - _Boundary: 認証のE2Eの待機（`session-expired-modal.spec.ts` / `token-refresh.spec.ts` の各1箇所）_

_申し送り元: site-survey スペックの Task 115.154（同スペックでは所管外としてブロック）_

## タスク35: 要件24・25（障害耐性・データ整合性）を実装し検証する

**経緯**: タスク33.1 は、除外一覧の道具名 `Jest` を是正する前に、12 件（REQ-24.3 / 24.6 / 24.7 / 24.8 / 25.1〜25.8）の代替検証が実在するかを一件ずつ確かめた。`description` の約束を満たす検証は 0 件で、8 件は実装も存在しなかった。利用者の裁定「取り下げて後続を起票」（2026-09-26）に従い、12 件は除外から取り下げて未被覆として分母へ戻した。本節はその後続である。**所有権は本スペックにある。** 各項の完了条件は、**条文を直接主張する検証（Vitest の単体または統合テスト、`@requirement user-authentication/REQ-…` の被覆印付き）を置き、それが変異で現に赤くなることを実測する**ことである。

**測った事実**（コミット `0459f048`、2026-09-26 にリポジトリルートで実測）: 各項に記す。

- [ ] 35.1 メール再送の間隔を条文へ合わせる
  - 条文 24.3（逐語）: 「WHEN 外部メールサービスが応答しない THEN Authentication Serviceはメール送信をキューに保存し、最大5回までリトライ（1分、5分、15分、1時間、6時間後）を実行しなければならない」
  - 実測: `backend/src/services/email.service.ts:87-93` に `RETRY_DELAYS = [1分, 5分, 15分, 1時間, 6時間]` があるが、`:178-186` 等の `emailQueue.add` は `attempts: 5, backoff: { type: 'exponential', delay: RETRY_DELAYS[0] }` を渡している。Bull 4.16.5 の exponential は `(2^n − 1) × delay`（`backend/node_modules/bull/lib/backoffs.js:12-15`）であり、実際の間隔は 1分・3分・7分・15分で、`RETRY_DELAYS[1..4]` は使われていない
  - 実測: 既存の検証 `backend/src/__tests__/unit/services/email.service.test.ts` の `:229` の検証（`:239` の `attempts: 5`）/ `:244` の検証（`:256` の `delay: expect.any(Number)`）は間隔を見ていない
  - 条文の「最大5回までリトライ」が初回を含む 5 回（`attempts: 5`）か初回＋リトライ 5 回（`attempts: 6`）かを、間隔が 5 つであることを踏まえて決めてから実装すること
  - 実装: Bull のカスタム backoff 戦略（`settings.backoffStrategies`）で `RETRY_DELAYS[attemptsMade − 1]` を返し、4 種のジョブすべてに適用する
  - 検証: 戦略関数が n = 1..5 に 60000 / 300000 / 900000 / 3600000 / 21600000 を返すこと、4 種のジョブがその戦略名で投入されることを主張する
  - _Requirements: 24.3_
  - _Boundary: EmailService のキュー投入オプションと backoff 戦略、およびその単体検証_

- [ ] 35.2 DB 接続タイムアウト時のリトライを実装する
  - 条文 24.6: 最大 3 回、1 秒・2 秒・4 秒のエクスポネンシャルバックオフ
  - 実測: `backend/src/db.ts`（全 45 行）にリトライの実装は無い。`grep -rlE "retr(y|ies)" backend/src --include=*.ts`（テストを除く）の当たりは `redis.ts` と `rateLimit.middleware.ts` だけ。Toxiproxy はリポジトリのどこでも使われていない
  - 実装の範囲（接続確立時のみかクエリ単位か）と 24.1（タイムアウト時 503）との関係を design.md で決めること
  - 検証: 接続失敗を模したモックで、3 回まで再試行し間隔が 1000 / 2000 / 4000ms（偽の時計で測る）、4 回目は行わず失敗を返すことを主張する
  - _Requirements: 24.6_
  - _Boundary: `backend/src/db.ts`（または新設する接続ラッパー）とその単体検証_

- [ ] 35.3 権限キャッシュ障害時の警告ログを検証する
  - 実測: 実装は既にある。`backend/src/services/rbac.service.ts:40-54` の `getUserPermissions` は `redis.get` の失敗時に `logger.warn({ error, userId }, 'Failed to get permissions from Redis cache')` を出して DB の取得へ進む
  - 実測: 検証が無い。`backend/src/__tests__/unit/services/rbac.service.test.ts:397` / `:477` は `invalidate*` の例外が漏れないことを見るだけで、`getUserPermissions` の障害経路もログも主張していない
  - 検証: `redis.get` を reject させたとき `logger.warn` が 1 回呼ばれること（spy）と、DB から取った権限が返ることを主張する。warn の削除または debug への格下げで赤くなることを変異で実測する
  - _Requirements: 24.7_
  - _Boundary: `rbac.service.test.ts` への検証の追加（実装に欠陥が見つかった場合に限り `rbac.service.ts`）_

- [ ] 35.4 登録・招待の処理をメール送信から切り離す
  - 実測: `EmailService.sendInvitationEmail`（`email.service.ts:177`）の本番からの呼び出しは 0 件。本番から呼ばれるのは `password.service.ts:302` と `user-role.service.ts:147` / `:286` だけで、`InvitationService.createInvitation`（`invitation.service.ts:45`）はメールを送らない
  - 実測: `password.service.ts:302` は `sendPasswordResetEmail` を await しており、キュー投入（Redis）が失敗すると `catch` で `RESET_TOKEN_INVALID` を返す
  - 招待メールを結線するか（design.md で決める）と、キュー投入が失敗しても招待・登録が成功することを実装する
  - 検証: キューの `add` を reject させても招待の作成（と登録）が Ok を返し DB の状態が成立することを主張する
  - _Requirements: 24.8_
  - _Boundary: InvitationService / AuthService / EmailService の結線と、その単体・統合検証_

- [ ] 35.5 認証系の書き込みの原子性を実装し、失敗注入で検証する
  - 実測（25.1 / 25.2）: `auth.service.ts:130` の `$transaction` は実在する。単体の `auth.service.test.ts:147` は `$transaction` を `mockResolvedValue` で置き換えてコールバックを実行しない。統合の `auth.integration.test.ts:337` は結果だけを見て、`database.integration.test.ts:278` は Prisma 一般のロールバックを見るだけ
  - 実測（25.3）: `user-role.service.ts:382` の `addRolesToUser` は docstring で「トランザクション」と述べるが、`addRoleToUser` を 1 件ずつループしておりトランザクションは無い（`:403` の `removeRolesFromUser` も同じ）
  - 実測（25.5）: `user-role.service.ts:91` の `userRole.create` と `:104-105` の監査ログ、`role-permission.service.ts:89` の `create` と `:107-108` の監査ログ、`:204` の `delete` と `:219-220` の監査ログはいずれも別々の書き込み。`role-permission.service.ts` に `$transaction` は 0 件
  - 実測（25.6）: `password.service.ts:277-310` の `requestPasswordReset` はトークン作成（`:293`）とメール投入（`:302`）がトランザクション外で、ログの記録も無い。**外部への副作用（メール）を DB トランザクションとどう組むか（コミット後の投入か outbox か）を design.md で決めてから着手すること**
  - 実測（25.7）: ロール・権限の紐付け変更に、変更前後の整合性検証もトランザクションも無い
  - 検証: 実 DB の統合テストで、各フローの途中の書き込み（監査ログを含む）を失敗させ、全変更がロールバックされることを主張する。トランザクションを外す変異で赤くなることを実測する
  - 大きいのでフローごとに 35.5a〜e へ分割してよい
  - _Requirements: 25.1, 25.2, 25.3, 25.5, 25.6, 25.7_
  - _Boundary: AuthService / UserRoleService / RolePermissionService / PasswordService / AuditLogService の書き込み経路と、その統合検証_

- [ ] 35.6 書き込みの ACID 特性を定め検証する
  - 条文 25.4 は「ACID特性を保証」とだけ述べる。取り下げた除外の description は「READ COMMITTED 以上」を掲げていたが条文には無い
  - 実測: 認証領域のテスト・実装に `isolationLevel` / READ COMMITTED を扱う箇所は 0 件（`git grep -nE 'isolationLevel|READ COMMITTED' -- backend/src` の当たりは `estimate-draft.service.ts:429` の注釈 1 件のみ。追跡対象外の生成コード `backend/src/generated/prisma/` には Prisma 自身の `isolationLevel` の定義がある）
  - 保証の内容（分離レベルを明示するか既定値に依拠するか）を design.md で定め、実 DB で検証する
  - _Requirements: 25.4_
  - _Boundary: 設計の決定と、それを主張する統合検証_

- [ ] 35.7 楽観的ロックの競合処理を実装する
  - 実測: 認証領域のサービス（auth / user-role / role-permission / role / invitation / password / audit-log / rbac / session / two-factor）に楽観的ロックの実装は 0 件。先例は取引先管理の `trading-partner.service.ts`（`:409-421` の JSDoc が方式を説明し、`:456` の `expectedUpdatedAt` の比較と `:459` の `TradingPartnerConflictError` の送出が実装）
  - 対象（ユーザープロフィール更新、ロール更新など）を design.md で決める
  - 検証: 同じ版からの並行更新で片方がリトライされるか 409 を返すことを、実 DB の並行リクエストで主張する
  - _Requirements: 25.8_
  - _Boundary: 対象エンティティの更新経路と、その統合検証_

_起票元: タスク33.1（利用者の裁定「取り下げて後続を起票」、2026-09-26）_
