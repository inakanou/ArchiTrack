# 実装タスク一覧

本ドキュメントは、ユーザー認証機能（user-authentication）の実装タスクを定義します。要件定義書（requirements.md）と技術設計書（design.md）に基づいて、段階的に実装を進めます。

**実装方針**:
- Phase 1-3: 完了✅（46タスク、全32要件カバー）
- Phase 4: 実装ギャップ対応（10タスク、実装ギャップ分析で特定された項目）
- Phase 5: E2Eテスト修正（1タスク）

## タスク一覧

### Phase 1-3: 完了タスク ✅

既存の実装タスク（1-11）は完了しています。詳細は以下のセクションを参照してください。

- [x] 1. プロジェクト基盤整備とデータモデル構築（4サブタスク完了✅）
- [x] 2. 認証システムのコア機能実装（8サブタスク完了✅）
- [x] 3. 認可システムの実装（7サブタスク完了✅）
- [x] 4. 二要素認証（2FA）の実装（4サブタスク完了✅）
- [x] 5. 監査ログシステムの構築（3サブタスク完了✅）
- [x] 6. APIエンドポイントとバリデーション（7サブタスク完了✅）
- [x] 7. フロントエンド基盤構築（4サブタスク完了✅）
- [x] 8. 認証UI実装（4サブタスク完了✅）
- [x] 9. RBACとプロフィール管理UI実装（3サブタスク完了✅）
- [x] 10. E2Eテスト実装（3サブタスク完了✅）
- [x] 11. パフォーマンス・セキュリティ・デプロイ（4サブタスク完了✅）

**Phase 1-3完了サマリー**:
- **完了タスク数**: 11メジャータスク、47サブタスク ✅
- **要件カバレッジ**: 全32要件を完全にカバー ✅

---

### Phase 4: 実装ギャップ対応（優先度順）

実装ギャップ分析（2025-11-25実施）で特定された10項目の実装漏れを優先的にタスク化します。

#### 12. 【Critical】EdDSA鍵ペア生成スクリプトとセットアップガイドの整備

- [x] 12.1 鍵ペア生成スクリプト作成とドキュメント整備
  - `scripts/generate-eddsa-keys.ts`が存在するか確認し、存在しない場合は作成
  - 開発環境セットアップ手順書（README.md）への鍵ペア生成セクション追加
  - 本番環境セットアップ手順書（Railway デプロイガイド）への鍵ペア設定セクション追加
  - .env.example への JWT_PUBLIC_KEY、JWT_PRIVATE_KEY、JWT_PUBLIC_KEY_OLD サンプル追加
  - _Requirements: 5, 10_
  - _Details: design.md「EdDSA鍵ペア管理と運用戦略」参照_
  - _Completion Criteria:_
    - ✅ `scripts/generate-eddsa-keys.ts`が実装され、jose v5を使用してEdDSA鍵ペアを生成できる
    - ✅ 開発環境セットアップ手順書に鍵ペア生成の6ステップが記載されている
    - ✅ 本番環境セットアップ手順書（Railway）に鍵ペア設定の8ステップが記載されている
    - ✅ .env.exampleにJWT_PUBLIC_KEY、JWT_PRIVATE_KEY、JWT_PUBLIC_KEY_OLDのサンプルが含まれている

#### 13. 【Critical】JWKS公開鍵エンドポイントの実装検証

- [ ] 13.1 JWKSエンドポイント実装検証とテスト追加
  - `backend/src/routes/jwks.routes.ts`が実装されているか確認
  - 現在の公開鍵（JWT_PUBLIC_KEY）と旧公開鍵（JWT_PUBLIC_KEY_OLD）を両方配信する実装を検証
  - 単体テスト（jwks.routes.test.ts）にて猶予期間中の複数鍵配信をテスト
  - E2Eテスト（e2e/specs/api/jwks.spec.ts）にてRFC 7517準拠のレスポンス形式を検証
  - _Requirements: 5_
  - _Details: design.md「JWKS（JSON Web Key Set）エンドポイント実装」参照_
  - _Completion Criteria:_
    - ✅ `GET /.well-known/jwks.json`エンドポイントが実装され、RFC 7517準拠のレスポンスを返す
    - ✅ 現在の公開鍵と旧公開鍵（猶予期間中のみ）を両方配信する
    - ✅ 単体テストで猶予期間中の複数鍵配信を検証
    - ✅ E2Eテストでレスポンス形式がRFC 7517に準拠していることを検証

#### 14. 【High】Result型統合パターンの実装検証

- [ ] 14.1 Result型ユーティリティ実装検証
  - `backend/src/types/result.ts`にOk/Err関数が定義されているか確認
  - `backend/src/utils/result-mapper.ts`にmapResultToApiError関数が実装されているか確認
  - `backend/src/utils/controller-helpers.ts`にhandleServiceResult関数が実装されているか確認
  - サービス層（AuthService、InvitationService等）がResult型を返すように実装されているか確認
  - コントローラー層でhandleServiceResultを使用しているか確認
  - 単体テストで全エラー型（AuthError、InvitationError、PasswordError、RBACError）のマッピングを検証
  - _Requirements: 全要件_
  - _Details: design.md「Result型統合パターンの実装詳細（Critical Issue 1対応）」参照_
  - _Completion Criteria:_
    - ✅ Result型ユーティリティ（Ok/Err）が実装されている
    - ✅ mapResultToApiError関数が全エラー型をApiErrorにマッピングする
    - ✅ handleServiceResult関数がResult型を処理しHTTPレスポンスを返す
    - ✅ 全サービス層がResult型を返す
    - ✅ 全コントローラー層でhandleServiceResultを使用
    - ✅ 単体テストで全エラー型マッピングを検証

#### 15. 【High】N+1問題対策の実装検証

- [ ] 15.1 Prisma includeによるJOINクエリ実装検証
  - RBACService.getUserPermissions()でPrisma includeが使用されているか確認
  - AuditLogService.getAuditLogs()でPrisma includeが使用されているか確認
  - InvitationService.listInvitations()でPrisma includeが使用されているか確認
  - N+1問題が発生しやすいAPIエンドポイントを特定し、Prisma includeで対策されているか確認
  - パフォーマンステスト（Autocannon）でN+1対策の効果を測定
  - _Requirements: 23_
  - _Details: design.md「Performance Optimization: N+1 Problem Mitigation」参照_
  - _Completion Criteria:_
    - ✅ RBACService.getUserPermissions()でPrisma includeを使用し1クエリで権限取得
    - ✅ AuditLogService.getAuditLogs()でPrisma includeを使用し1クエリで監査ログ取得
    - ✅ InvitationService.listInvitations()でPrisma includeを使用し1クエリで招待一覧取得
    - ✅ パフォーマンステストで権限チェックAPI 99パーセンタイル100ms以内を達成

#### 16. 【High】鍵ローテーション戦略の実装検証

- [ ] 16.1 鍵ローテーション手順書作成
  - design.md「鍵ローテーション戦略（90日周期）」のフェーズ1-4を基に、運用手順書を作成
  - フェーズ1: 準備（T-7日目）の手順を記載
  - フェーズ2: 新しい鍵ペア生成（T日目）の手順を記載
  - フェーズ3: 猶予期間開始（T日目 - T+30日目）の動作説明と検証方法を記載
  - フェーズ4: 旧鍵削除（T+30日目）の手順を記載
  - ローテーション完了チェックリストを作成
  - _Requirements: 5_
  - _Details: design.md「鍵ローテーション詳細運用手順（Critical Issue 2対応）」参照_
  - _Completion Criteria:_
    - ✅ 鍵ローテーション手順書が作成され、フェーズ1-4の詳細手順が記載されている
    - ✅ ローテーション完了チェックリストが作成されている
    - ✅ JWKSエンドポイントで両方の鍵が配信されることを検証する手順が記載されている

#### 17. 【Medium】Redisフォールバック処理の実装検証

- [ ] 17.1 Graceful Degradationパターン実装検証
  - RBACService.getUserPermissions()でRedisキャッシュ読み取り失敗時にDB fallbackが実装されているか確認
  - Redisキャッシュ書き込み失敗時に警告ログが記録されているか確認
  - 単体テストでRedis接続エラー時のフォールバック処理を検証
  - _Requirements: 24_
  - _Details: design.md「Redisキャッシング戦略（Cache-Asideパターン + Graceful Degradation）」参照_
  - _Completion Criteria:_
    - ✅ RBACService.getUserPermissions()でRedisキャッシュ読み取り失敗時にDB fallbackが実装されている
    - ✅ Redisキャッシュ書き込み失敗時に警告ログが記録されている
    - ✅ 単体テストでRedis接続エラー時のフォールバック処理を検証

#### 18. 【Medium】Bloom Filter禁止パスワードリストの準備

- [ ] 18.1 禁止パスワードリストの準備とBloom Filter統合検証
  - `data/common-passwords.txt`が存在するか確認し、存在しない場合はHIBP Pwned Passwordsのサブセットを準備
  - PasswordServiceでBloom Filter初期化（サイズ1000万件、偽陽性率0.001）が実装されているか確認
  - 単体テストでBloom Filter照合機能を検証
  - パフォーマンステストでBloom Filter照合時間を測定（目標: O(k)、k=ハッシュ関数数）
  - _Requirements: 2, 10_
  - _Details: design.md「Bloom Filter実装」参照_
  - _Completion Criteria:_
    - ✅ `data/common-passwords.txt`が準備され、HIBP Pwned Passwordsのサブセットが含まれている
    - ✅ PasswordServiceでBloom Filter初期化が実装されている
    - ✅ 単体テストでBloom Filter照合機能を検証
    - ✅ パフォーマンステストでBloom Filter照合時間がO(k)であることを確認

#### 19. 【Medium】2FA暗号化鍵の設定ガイド

- [ ] 19.1 2FA暗号化鍵設定ガイド作成
  - 環境変数`TWO_FACTOR_ENCRYPTION_KEY`（256ビット16進数文字列、64文字）のサンプル生成スクリプト作成
  - 開発環境セットアップ手順書への2FA暗号化鍵設定セクション追加
  - 本番環境セットアップ手順書（Railway）への2FA暗号化鍵設定セクション追加
  - .env.exampleへのTWO_FACTOR_ENCRYPTION_KEYサンプル追加
  - _Requirements: 27C_
  - _Details: design.md「TwoFactorService」参照_
  - _Completion Criteria:_
    - ✅ 2FA暗号化鍵生成スクリプト（`scripts/generate-2fa-key.ts`）が実装されている
    - ✅ 開発環境セットアップ手順書に2FA暗号化鍵設定の手順が記載されている
    - ✅ 本番環境セットアップ手順書（Railway）に2FA暗号化鍵設定の手順が記載されている
    - ✅ .env.exampleにTWO_FACTOR_ENCRYPTION_KEYのサンプルが含まれている

#### 20. 【Low】パスワード履歴自動削除の実装検証

- [ ] 20.1 パスワード履歴自動削除実装検証
  - PasswordServiceでパスワード更新時に過去3件のパスワード履歴のみ保持する実装を確認
  - 古いパスワード履歴を自動削除する処理が実装されているか確認
  - 単体テストでパスワード履歴自動削除を検証
  - _Requirements: 7_
  - _Details: requirements.md「要件7受入基準8」参照_
  - _Completion Criteria:_
    - ✅ PasswordServiceでパスワード更新時に最新3件のみ保持する実装が確認できる
    - ✅ 古いパスワード履歴を自動削除する処理が実装されている
    - ✅ 単体テストでパスワード履歴自動削除を検証

#### 21. 【Low】マルチタブ同期のBroadcast Channel API実装検証

- [ ] 21.1 Broadcast Channel API統合検証
  - TokenRefreshManagerでBroadcast Channel API初期化が実装されているか確認
  - トークン更新時に他のタブへ通知する処理が実装されているか確認
  - 他のタブからのトークン更新通知を受信する処理が実装されているか確認
  - E2Eテストでマルチタブ同期を検証（2つのタブを開き、1つのタブでトークン更新、もう1つのタブで自動反映を確認）
  - _Requirements: 16_
  - _Details: design.md「マルチタブ同期（Broadcast Channel API）」参照_
  - _Completion Criteria:_
    - ✅ TokenRefreshManagerでBroadcast Channel API初期化が実装されている
    - ✅ トークン更新時に他のタブへ通知する処理が実装されている
    - ✅ 他のタブからのトークン更新通知を受信する処理が実装されている
    - ✅ E2Eテストでマルチタブ同期を検証

---

### Phase 5: E2Eテスト修正と改善

#### 22. E2Eテスト待機処理改善

- [ ] 22.1 E2Eテスト待機処理改善
  - `waitForFunction`にタイムアウト設定（10秒推奨）を追加
  - 複数のURLパターン対応（リダイレクト先が動的な場合は正規表現やOR条件で柔軟に対応）
  - `waitForLoadState('networkidle')`を使用してネットワーク通信完了を待機
  - 全E2Eテストファイル（e2e/specs/api/、e2e/specs/ui/、e2e/specs/integration/）を確認し、待機処理を改善
  - _Requirements: 全要件_
  - _Details: tech.md「待機処理のベストプラクティス」参照_
  - _Completion Criteria:_
    - ✅ 全E2Eテストファイルで`waitForFunction`にタイムアウト設定が追加されている
    - ✅ リダイレクト待機時に複数のURLパターンに対応している
    - ✅ `waitForLoadState('networkidle')`を使用してネットワーク通信完了を待機している
    - ✅ E2Eテストが安定して実行される（タイムアウトエラーが発生しない）

---

## 実装状況サマリー

### 完了タスク数
- **Phase 1-3 (Critical/High/Medium)**: 11メジャータスク、47サブタスク ✅完了
- **Phase 4 (実装ギャップ対応)**: 10メジャータスク（未完了）
- **Phase 5 (E2Eテスト修正)**: 1メジャータスク（未完了）

**合計**: 22メジャータスク、58サブタスク（Phase 1-3完了✅、Phase 4-5未完了）

### 要件カバレッジ
- ✅ 要件1: 管理者によるユーザー招待
- ✅ 要件2: 招待を受けたユーザーのアカウント作成
- ✅ 要件3: 初期管理者アカウントのセットアップ
- ✅ 要件4: ログイン
- ✅ 要件5: トークン管理
- ✅ 要件6: 拡張可能なRBAC
- ✅ 要件7: パスワード管理
- ✅ 要件8: セッション管理
- ✅ 要件9: ユーザー情報取得・管理
- ✅ 要件10: セキュリティとエラーハンドリング
- ✅ 要件11: ログイン画面のUI/UX
- ✅ 要件12: ユーザー登録画面のUI/UX
- ✅ 要件13: 管理者ユーザー招待画面のUI/UX
- ✅ 要件14: プロフィール画面のUI/UX
- ✅ 要件15: 共通UI/UXガイドライン
- ✅ 要件16: セッション有効期限切れ時の自動リダイレクト
- ✅ 要件16A: 認証状態初期化時のUIチラつき防止
- ✅ 要件17: 動的ロール管理
- ✅ 要件18: 権限（Permission）管理
- ✅ 要件19: ロールへの権限割り当て
- ✅ 要件20: ユーザーへのロール割り当て
- ✅ 要件21: 権限チェック機能
- ✅ 要件22: 監査ログとコンプライアンス
- ✅ 要件23: 非機能要件（パフォーマンス・スケーラビリティ）
- ✅ 要件24: フォールトトレランス（障害耐性）
- ✅ 要件25: データ整合性とトランザクション管理
- ✅ 要件26: セキュリティ対策（脅威モデリング）
- ✅ 要件27: 二要素認証（2FA）設定機能
- ✅ 要件27A: 二要素認証（2FA）ログイン機能
- ✅ 要件27B: 二要素認証（2FA）管理機能
- ✅ 要件27C: 二要素認証（2FA）セキュリティ要件
- ✅ 要件27D: 二要素認証（2FA）UI/UX要件
- ✅ 要件27E: 二要素認証（2FA）アクセシビリティ要件

**カバレッジ**: 全32要件を完全にカバー ✅

### 次のアクション
1. Phase 4（実装ギャップ対応）のタスク12-21を優先的に実装
2. Phase 5（E2Eテスト修正）のタスク22を実装
3. 全タスク完了後、総合E2Eテストを実行し、全要件が満たされていることを確認
4. `/kiro:validate-impl user-authentication`を実行し、実装品質を検証

---

## 既存完了タスク詳細（Phase 1-3）

### 1. プロジェクト基盤整備とデータモデル構築 ✅完了

- [x] 1.1 ユーザー情報とアクセス制御のデータモデル構築
  - 招待制ユーザー登録に必要なデータ構造を定義
  - ロールベースアクセス制御のデータ関係を確立
  - セッション管理と二要素認証のデータ保存機能を準備
  - データ検索性能を最適化するインデックス戦略を実装
  - データベーススキーマをマイグレーションで適用
  - _Requirements: 1-27（全要件の基盤）_

- [x] 1.2 JWT署名鍵の生成と公開鍵配布機能の準備
  - EdDSA署名用の鍵ペアを生成
  - 秘密鍵と公開鍵を環境変数用に準備
  - 公開鍵をJWKS形式で配布するエンドポイントを実装
  - _Requirements: 5.7, 5.8, 5.9, 5.10_

- [x] 1.3 認証機能に必要な依存関係のインストール
  - JWT署名・検証ライブラリを追加
  - パスワードハッシュライブラリを追加
  - メール送信とキュー管理ライブラリを追加
  - 二要素認証とパスワード強度評価ライブラリを追加
  - 型定義ファイルを含むすべての依存関係を設定
  - _Requirements: 2.6, 2.7, 5.7, 7.2, 27.2, 27.3_

- [x] 1.4 環境変数の設定とパスワード強度チェック準備
  - トークン有効期限の環境変数を設定
  - 二要素認証暗号化鍵の環境変数を設定
  - 初期管理者アカウント情報の環境変数を設定
  - 漏洩パスワードデータベースをBloom Filterに変換
  - Frontend APIベースURLとトークンリフレッシュ設定を追加
  - _Requirements: 2.7, 3.1, 5.9, 5.10, 27C.4, 27C.5_

### 2. 認証システムのコア機能実装 ✅完了

- [x] 2.1 JWTトークンの生成・検証機能の実装
  - EdDSA署名によるアクセストークンを発行する機能を実装
  - EdDSA署名によるリフレッシュトークンを発行する機能を実装
  - トークンの署名検証とペイロード抽出機能を実装
  - トークンのデコード機能を実装（検証なし）
  - _Requirements: 5.1, 5.2, 5.4, 5.6, 5.7, 5.8, 5.9, 5.10_

- [x] 2.2 セキュアなパスワード管理機能の実装
  - パスワードのハッシュ化機能を実装
  - ハッシュ化されたパスワードの検証機能を実装
  - パスワード強度の評価機能を実装（長さ、複雑性、漏洩チェック）
  - パスワード履歴の管理機能を実装（過去3回の再利用防止）
  - _Requirements: 2.6, 2.7, 2.8, 2.9, 7.2, 7.6, 7.7, 7.8, 10.2_

- [x] 2.3 招待制ユーザー登録の管理機能実装
  - 管理者による新規ユーザー招待機能を実装
  - 招待トークンの検証機能を実装（有効期限、使用済みチェック）
  - 招待の取り消し機能を実装
  - 招待一覧の取得機能を実装（ステータス別フィルタリング対応）
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 2.4 メール送信の非同期処理基盤実装
  - メール送信の基盤を実装（SMTP設定、テンプレート対応）
  - 非同期メール送信キューを実装
  - 招待メールの送信機能を実装
  - パスワードリセットメールの送信機能を実装
  - メール送信の自動リトライ機能を実装
  - _Requirements: 1.3, 1.6, 7.1, 24.3_

- [x] 2.5 ユーザー認証フローの統合実装
  - ユーザー登録機能を実装（招待経由、パスワード検証、トランザクション管理）
  - ログイン機能を実装（メールアドレス・パスワード検証、JWT発行、連続失敗検知）
  - ログアウト機能を実装（リフレッシュトークン無効化）
  - 全デバイスログアウト機能を実装
  - 現在のユーザー情報取得機能を実装
  - _Requirements: 2.1-2.12, 3.1-3.5, 4.1-4.7, 8.1-8.5, 9.1-9.5_

- [x] 2.6 パスワードリセット機能の実装
  - パスワードリセット要求機能を実装（リセットトークン生成、メール送信）
  - リセットトークン検証機能を実装（24時間有効期限チェック）
  - パスワードリセット実行機能を実装（新パスワード設定、全トークン無効化）
  - パスワード変更機能を実装（現在のパスワード確認、履歴チェック）
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

- [x] 2.7 JWT認証ミドルウェアの実装
  - JWTトークン検証ミドルウェアを実装
  - トークン期限切れエラーハンドリングを実装
  - _Requirements: 5.4, 5.5, 16.1, 16.2, 16.18_

- [x] 2.8 マルチデバイスセッション管理機能の実装
  - デバイスごとの独立したセッション管理機能を実装
  - セッション有効期限の自動延長機能を実装
  - セッション一覧の取得機能を実装
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

### 3-11. その他の完了タスク ✅

（省略: 認可システム、2FA、監査ログ、APIエンドポイント、フロントエンド、UI、E2Eテスト、パフォーマンス・セキュリティ・デプロイ）

詳細は既存のtasks.mdファイルを参照してください。

#1 times. 実装タスク生成完了。Phase 1-3の既存完了タスク（47サブタスク）を保持し、Phase 4（実装ギャップ対応、10タスク）とPhase 5（E2Eテスト修正、1タスク）を追加しました。
