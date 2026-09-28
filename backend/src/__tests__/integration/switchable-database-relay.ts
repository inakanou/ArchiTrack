/**
 * @fileoverview DB 接続のタイムアウトの統合検証で使う、実データベースへの転送と無応答を切り替えられる TCP の中継（タスク36.3）
 *
 * - 無応答: TCP 接続は受け付けるが、PostgreSQL の起動メッセージに一切応答しない。
 *   pg-pool の connectionTimeoutMillis 内に接続の確立が終わらない状況を決定的に作る
 * - 転送: テスト用の実データベースへそのまま転送する
 * 無応答へ切り替えるとき（cut）は確立済みの接続もすべて切り、pg のプールがそれを捨てるまで待つ。
 * これで次の問い合わせは新しい接続の確立を強いられ、接続のタイムアウトになる。
 */

import net from 'node:net';
import type { AddressInfo } from 'node:net';

/** 確立済みの接続を切った後、pg のプールがその接続を捨てるまで待つ時間（ミリ秒） */
const POOL_EVICTION_WAIT_MS = 100;

/**
 * 実データベースへの転送と無応答を切り替えられる TCP の中継
 */
export class SwitchableDatabaseRelay {
  private mode: 'forward' | 'unresponsive' = 'unresponsive';
  private readonly sockets = new Set<net.Socket>();
  private readonly server: net.Server;

  constructor(
    private readonly upstreamHost: string,
    private readonly upstreamPort: number
  ) {
    this.server = net.createServer((client) => this.accept(client));
  }

  async listen(): Promise<number> {
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    return (this.server.address() as AddressInfo).port;
  }

  /** 実データベースへの転送に戻す（以後の新しい接続から効く） */
  forward(): void {
    this.mode = 'forward';
  }

  /** 無応答へ切り替え、確立済みの接続もすべて切る */
  async cut(): Promise<void> {
    this.mode = 'unresponsive';
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POOL_EVICTION_WAIT_MS));
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  private track(socket: net.Socket): void {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => socket.destroy());
  }

  private accept(client: net.Socket): void {
    this.track(client);
    if (this.mode === 'unresponsive') {
      // PostgreSQL の起動メッセージに一切応答しない
      return;
    }
    const upstream = net.connect(this.upstreamPort, this.upstreamHost);
    this.track(upstream);
    client.on('close', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.pipe(upstream);
    upstream.pipe(client);
  }
}
