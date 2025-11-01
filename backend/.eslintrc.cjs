module.exports = {
  root: true, // 親ディレクトリの設定を読み込まない
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['prettier'],
  rules: {
    'prettier/prettier': 'error',
    'no-console': 'off', // サーバーサイドではconsoleを許可
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  },
};
