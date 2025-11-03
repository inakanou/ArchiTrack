declare module 'autocannon' {
  interface AutocannonOptions {
    url: string;
    connections?: number;
    pipelining?: number;
    duration?: number;
    headers?: Record<string, string>;
  }

  interface AutocannonResult {
    requests: {
      total: number;
      average: number;
    };
    duration: number;
    latency: {
      mean: number;
      p99: number;
    };
    errors: number;
    timeouts: number;
  }

  function autocannon(options: AutocannonOptions): Promise<AutocannonResult>;
  export default autocannon;
}
