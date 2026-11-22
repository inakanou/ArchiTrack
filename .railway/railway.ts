import { defineRailway, project, service } from 'railway/iac';

// backend と frontend だけを管理する。Postgres・Redis・ボリュームは名前付きの partial の外に置き、
// このファイルから変更も削除もされないようにする。
export const partial = 'app';

const SERVICE_NAMES = {
  staging: { backend: 'Backend-Staging', frontend: 'Frontend-Staging' },
  production: { backend: 'Backend', frontend: 'Frontend' },
} as const;

type ManagedEnvironment = keyof typeof SERVICE_NAMES;

const isManagedEnvironment = (name: string): name is ManagedEnvironment =>
  Object.prototype.hasOwnProperty.call(SERVICE_NAMES, name);

export default defineRailway((ctx) => {
  if (!isManagedEnvironment(ctx.environment)) {
    throw new Error(`Railway の環境 "${ctx.environment}" はこのファイルの管理対象ではありません`);
  }
  const names = SERVICE_NAMES[ctx.environment];

  // 配備は GitHub Actions の railway up が行う。staging の監視パターンは、どのファイルにも
  // 一致しない現在の値（"[]"）を保つ。空にすると監視の制限が外れるため、空にしない。
  // production はこのパターンを保存していないので、切り替えの前に試算で扱いを確かめる。
  const build = {
    builder: 'DOCKERFILE',
    buildCommand: '',
    ...(ctx.environment === 'staging' ? { watchPatterns: ['[]'] } : {}),
  } as const;
  // production はアプリのスリープが有効で、書かないと無効へ変わる。設定を変えないために現在の値を保つ。
  const restart = {
    restartPolicyType: 'ON_FAILURE',
    restartPolicyMaxRetries: 3,
    ...(ctx.environment === 'production' ? { sleepApplication: true } : {}),
  } as const;

  // 接続元の種別を明示する。省くと試算で GitHub から empty への変更になる。
  const backend = service(names.backend, {
    source: { type: 'github', rootDirectory: '/backend' },
    build,
    deploy: { ...restart, healthcheckPath: '/health', healthcheckTimeout: 300 },
  });
  const frontend = service(names.frontend, {
    source: { type: 'github', rootDirectory: '/frontend' },
    build,
    deploy: restart,
  });

  return project('ArchiTrac Project', {
    variables: { managed: false },
    resources: [backend, frontend],
  });
});
