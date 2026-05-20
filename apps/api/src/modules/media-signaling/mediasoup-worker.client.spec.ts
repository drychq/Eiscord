import { shouldStartMediaWorkerOnInit } from './mediasoup-worker.client';

describe('shouldStartMediaWorkerOnInit', () => {
  it('does not start the worker automatically in ordinary unit tests', () => {
    expect(shouldStartMediaWorkerOnInit({ NODE_ENV: 'test' })).toBe(false);
  });

  it('starts the worker in test mode when explicitly enabled', () => {
    expect(shouldStartMediaWorkerOnInit({ NODE_ENV: 'test', MEDIA_WORKER_START_IN_TEST: 'true' })).toBe(true);
  });

  it('starts the worker outside test mode', () => {
    expect(shouldStartMediaWorkerOnInit({ NODE_ENV: 'development' })).toBe(true);
  });
});
