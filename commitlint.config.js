/**
 * Commitlint Configuration
 * Conventional Commits 形式を強制
 * @see https://commitlint.js.org/
 */
export default {
  extends: ['@commitlint/config-conventional'],

  // ルール設定
  rules: {
    // type の制限（エラーレベル）
    'type-enum': [
      2,
      'always',
      [
        'feat', // 新機能
        'fix', // バグ修正
        'docs', // ドキュメント
        'style', // コードスタイル（機能に影響なし）
        'refactor', // リファクタリング
        'perf', // パフォーマンス改善
        'test', // テスト追加・修正
        'build', // ビルドシステム
        'ci', // CI設定
        'chore', // その他の変更
        'revert', // コミットの取り消し
      ],
    ],

    // type は必須
    'type-empty': [2, 'never'],

    // type は小文字のみ
    'type-case': [2, 'always', 'lower-case'],

    // subject は必須
    'subject-empty': [2, 'never'],

    // subject は100文字以内
    'subject-max-length': [2, 'always', 100],

    // subject の末尾にピリオド不要
    'subject-full-stop': [2, 'never', '.'],

    // body の前に空行が必要
    'body-leading-blank': [1, 'always'],

    // footer の前に空行が必要
    'footer-leading-blank': [1, 'always'],

    // header は100文字以内
    'header-max-length': [2, 'always', 100],
  },

  // カスタムヘルプメッセージ
  helpUrl:
    'https://github.com/conventional-changelog/commitlint/#what-is-commitlint',

  // プロンプトの設定
  prompt: {
    messages: {
      skip: ':スキップ',
      max: '最大 %d 文字',
      min: '最低 %d 文字',
      emptyWarning: '%s は必須です',
      upperLimitWarning: '%s は %d 文字を超えています',
      lowerLimitWarning: '%s は %d 文字未満です',
    },
    questions: {
      type: {
        description: 'コミットの種類を選択:',
        enum: {
          feat: {
            description: '新機能',
            title: 'Features',
            emoji: '✨',
          },
          fix: {
            description: 'バグ修正',
            title: 'Bug Fixes',
            emoji: '🐛',
          },
          docs: {
            description: 'ドキュメントのみの変更',
            title: 'Documentation',
            emoji: '📚',
          },
          style: {
            description: 'コードの意味に影響しない変更（空白、フォーマット等）',
            title: 'Styles',
            emoji: '💎',
          },
          refactor: {
            description: 'バグ修正でも機能追加でもないコード変更',
            title: 'Code Refactoring',
            emoji: '📦',
          },
          perf: {
            description: 'パフォーマンス改善',
            title: 'Performance Improvements',
            emoji: '🚀',
          },
          test: {
            description: 'テストの追加や修正',
            title: 'Tests',
            emoji: '🚨',
          },
          build: {
            description: 'ビルドシステムや外部依存関係の変更',
            title: 'Builds',
            emoji: '🛠',
          },
          ci: {
            description: 'CI設定ファイルやスクリプトの変更',
            title: 'Continuous Integrations',
            emoji: '⚙️',
          },
          chore: {
            description: 'その他の変更',
            title: 'Chores',
            emoji: '♻️',
          },
          revert: {
            description: '以前のコミットの取り消し',
            title: 'Reverts',
            emoji: '🗑',
          },
        },
      },
      scope: {
        description: '変更の範囲（例: backend, frontend, e2e）',
      },
      subject: {
        description: '変更内容の簡潔な説明',
      },
      body: {
        description: '変更の詳細な説明（オプション）',
      },
      isBreaking: {
        description: '破壊的変更はありますか？',
      },
      breakingBody: {
        description: '破壊的変更の詳細を入力してください',
      },
      breaking: {
        description: '破壊的変更の説明',
      },
      isIssueAffected: {
        description: '未解決のissueに関連していますか？',
      },
      issuesBody: {
        description: 'issue番号を入力してください（例: "fix #123", "re #123"）',
      },
      issues: {
        description: 'issueの参照を追加（例: "fix #123", "re #123"）',
      },
    },
  },
};
