declare global {
  namespace Express {
    interface Request {
      /**
       * Zodバリデーション済みのbodyデータ
       * validate middleware使用後に利用可能
       */
      validatedBody?: unknown;

      /**
       * Zodバリデーション済みのqueryデータ
       * validate middleware使用後に利用可能
       */
      validatedQuery?: unknown;

      /**
       * Zodバリデーション済みのparamsデータ
       * validate middleware使用後に利用可能
       */
      validatedParams?: unknown;

      /**
       * 認証済みユーザー情報
       * authenticate middleware使用後に利用可能
       */
      user?: {
        userId: string;
        email: string;
        roles: string[];
      };
    }
  }
}

export {};
