export function healthPayload(workerCount: number) {
  return {
    ok: true,
    workers: workerCount,
  };
}
