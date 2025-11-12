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
      p95: number;
      p99: number;
    };
    errors: number;
    timeouts: number;
    non2xx: number;
  }

  function autocannon(options: AutocannonOptions): Promise<AutocannonResult>;
  export default autocannon;
}
