/**
 * oidc-provider 9.15.1 は型定義を同梱しないので、本システムが使う範囲だけを宣言する
 */
declare module 'oidc-provider' {
  import type { IncomingMessage, ServerResponse } from 'http';

  export interface OidcGrant {
    jti: string;
    accountId?: string;
    clientId?: string;
    exp?: number;
    iat?: number;
    addOIDCScope(scope: string): void;
    addResourceScope(resource: string, scope: string): void;
    getOIDCScope(): string;
    save(): Promise<string>;
  }

  export interface OidcToken {
    accountId?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
  }

  export interface OidcInteraction {
    prompt: { name: string; reasons: string[] };
    session?: { accountId?: string };
  }

  export interface OidcContext {
    oidc: {
      account?: { accountId: string };
      client?: { clientId: string; grantTypeAllowed(grantType: string): boolean };
      entities: { Grant?: OidcGrant };
      provider: Provider;
      requestParamScopes: Set<string>;
      result?: { consent?: { grantId?: unknown } };
      route?: string;
    };
    type: string;
    body: unknown;
  }

  export class Provider {
    constructor(issuer: string, configuration: Record<string, unknown>);
    proxy: boolean;
    callback(): (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    use(middleware: (ctx: OidcContext, next: () => Promise<void>) => Promise<void>): this;
    on(event: string, listener: (...args: never[]) => void): this;
    emit(event: string, ...args: unknown[]): boolean;
    interactionResult(
      req: IncomingMessage,
      res: ServerResponse,
      result: Record<string, unknown>
    ): Promise<string>;
    Grant: {
      new (input: { accountId: string; clientId: string }): OidcGrant;
      find(id: string): Promise<OidcGrant | undefined>;
    };
    AccessToken: { find(value: string): Promise<OidcToken | undefined> };
    AuthorizationCode: { find(value: string): Promise<OidcToken | undefined> };
    RefreshToken: { find(value: string): Promise<OidcToken | undefined> };
    Interaction: { find(uid: string): Promise<OidcInteraction | undefined> };
  }

  export const errors: {
    AccessDenied: new (description?: string, detail?: string) => Error;
    InvalidGrant: new (detail?: string) => Error;
    InvalidTarget: new (description?: string) => Error;
  };

  interface PolicyCheck {
    readonly reason: string;
  }

  interface PolicyPrompt {
    readonly name: string;
    readonly checks: PolicyCheck[] & {
      clear(): void;
      add(check: PolicyCheck): void;
    };
  }

  export const interactionPolicy: {
    base(): PolicyPrompt[] & { get(name: string): PolicyPrompt | undefined };
    Check: {
      new (
        reason: string,
        description: string,
        check: (ctx: OidcContext) => boolean | Promise<boolean>
      ): PolicyCheck;
      readonly REQUEST_PROMPT: true;
      readonly NO_NEED_TO_PROMPT: false;
    };
  };

  export default Provider;
}
