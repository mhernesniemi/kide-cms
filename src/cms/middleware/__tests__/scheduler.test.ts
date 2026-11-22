import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const env: Record<string, string | undefined> = {};
const runPublishJob = vi.fn(async () => ({ published: 0, unpublished: 0 }));
const runTasksJob = vi.fn(async () => ({}));

vi.mock("../../core", () => ({ readEnv: (key: string) => env[key] }));
vi.mock("../../core/log", () => ({ log: { info: () => {}, error: () => {} } }));
vi.mock("../../routes/api/cron/_jobs", () => ({ runPublishJob, runTasksJob }));
vi.mock("virtual:kide/api", () => ({ cms: {} }));

const load = async () => {
  vi.resetModules();
  return (await import("../scheduler")).startSchedulerOnce;
};

const context = (locals: Record<string, unknown> = {}) => ({ locals, cache: { invalidate: vi.fn() } }) as never;

beforeEach(() => {
  vi.useFakeTimers();
  runPublishJob.mockClear();
  runTasksJob.mockClear();
  delete env.CMS_SCHEDULER;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startSchedulerOnce", () => {
  it("does nothing unless CMS_SCHEDULER is on", async () => {
    const start = await load();
    start(context());
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runPublishJob).not.toHaveBeenCalled();
  });

  it("runs both jobs at start and every minute, with the request's cache handle", async () => {
    env.CMS_SCHEDULER = "1";
    const start = await load();
    const ctx = context();
    start(ctx);
    start(context());
    await vi.advanceTimersByTimeAsync(0);
    expect(runPublishJob).toHaveBeenCalledTimes(1);
    expect(runPublishJob.mock.calls[0]).toContain((ctx as { cache: unknown }).cache);
    expect(runTasksJob).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(runPublishJob).toHaveBeenCalledTimes(3);
    expect(runTasksJob).toHaveBeenCalledTimes(3);
  });

  it("skips a tick while the previous run is still going", async () => {
    env.CMS_SCHEDULER = "true";
    let release!: () => void;
    runPublishJob.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ published: 0, unpublished: 0 }))),
    );
    const start = await load();
    start(context());
    await vi.advanceTimersByTimeAsync(180_000);
    expect(runPublishJob).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runPublishJob).toHaveBeenCalledTimes(2);
  });

  it("stays off on Cloudflare Workers", async () => {
    env.CMS_SCHEDULER = "1";
    const start = await load();
    start(context({ cfContext: {} }));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(runPublishJob).not.toHaveBeenCalled();
  });
});
