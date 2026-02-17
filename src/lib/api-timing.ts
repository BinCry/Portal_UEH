export const withApiTiming = async <T>(route: string, handler: () => Promise<T>): Promise<T> => {
  const start = Date.now();
  try {
    return await handler();
  } finally {
    const durationMs = Date.now() - start;
    console.info(`[api-timing] ${route} ${durationMs}ms`);
  }
};
