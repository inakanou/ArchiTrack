declare module 'autocannon' {
  interface AutocannonOptions {
    url: string;
    connections?: number;
    pipelining?: number;
    duration?: number;
    headers?: Record<string, string>;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: string;
  }

  interface AutocannonResult {
    requests: {
      total: number;
      average: number;
    };
    duration: number;
    latency: {
      mean: number;
      p50: number;
      /**
       * @deprecated 実行時には存在しない。
       *
       * autocannon が採用する hdr-histogram-percentiles-obj の既定パーセンタイルは
       * [0.001, 0.01, 0.1, 1, 2.5, 10, 25, 50, 75, 90, 97.5, 99, 99.9, 99.99, 99.999] で、
       * 95 は含まれない。autocannon 側にパーセンタイルを追加するオプションも無い。
       * 参照すると undefined になるため、p90 または p97_5 を用いること。
       *
       * 既存の perf スクリプト（login / project-crud / token-refresh /
       * trading-partner-crud）が本項目を参照しており、いずれも判定が成立していない。
       */
      p95: number;
      p90: number;
      p97_5: number;
      p99: number;
    };
    errors: number;
    timeouts: number;
    non2xx: number;
  }

  function autocannon(options: AutocannonOptions): Promise<AutocannonResult>;
  export default autocannon;
}
