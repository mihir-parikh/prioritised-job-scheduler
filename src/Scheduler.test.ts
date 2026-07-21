import { describe, it, expect } from "vitest";
import { Scheduler } from "./Scheduler.js";
import { Job, JobPriority, JobExecutor } from "./types.js";

// A promise that does NOT finish on its own -- you get a `resolve` function
// back and decide yourself, later, when to call it.
function createDeferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
        resolve = res;
    });
    return { promise, resolve };
}

function flushMicrotasks(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Scheduler", () => {
    it("never runs more than 10 jobs concurrently", async () => {
        const scheduler = new Scheduler();

        let active = 0;
        let peak = 0;
        const finishJob: Array<() => void> = []; // one "finish button" per started job

        const executor: JobExecutor = {
            execute: () => {
                active++;
                peak = Math.max(peak, active);

                const deferred = createDeferred();
                finishJob.push(deferred.resolve);

                // active only goes back down once this job's finish button is pressed.
                return deferred.promise.then(() => {
                    active--;
                });
            },
        };

        for (let i = 0; i < 25; i++) {
            scheduler.submit({ priority: JobPriority.MEDIUM, executor });
        }

        await flushMicrotasks();
        expect(peak).toBe(10);
        expect(active).toBe(10);
        expect(finishJob.length).toBe(10);

        while (finishJob.length > 0) {
            const finish = finishJob.shift()!;
            finish();
            await flushMicrotasks();
            expect(peak).toBeLessThanOrEqual(10);
        }

        expect(active).toBe(0);
    });

    it("starts a high priority job before an earlier-submitted low priority job once a slot frees", async () => {
        const scheduler = new Scheduler();

        const finishFillerJob: Array<() => void> = [];
        const fillerExecutor: JobExecutor = {
            execute: () => {
                const deferred = createDeferred();
                finishFillerJob.push(deferred.resolve);
                return deferred.promise;
            },
        };

        for (let i = 0; i < 10; i++) {
            scheduler.submit({ priority: JobPriority.MEDIUM, executor: fillerExecutor });
        }
        await flushMicrotasks();
        expect(finishFillerJob.length).toBe(10);

        const startOrder: string[] = [];

        const lowExecutor: JobExecutor = {
            execute: () => {
                startOrder.push("low");
                return new Promise<void>(() => {}); // never finishes -- doesn't matter here
            },
        };
        const highExecutor: JobExecutor = {
            execute: () => {
                startOrder.push("high");
                return new Promise<void>(() => {});
            },
        };

        // Low arrives first, High arrives second -- both queued, no slot free yet.
        scheduler.submit({ priority: JobPriority.LOW, executor: lowExecutor });
        scheduler.submit({ priority: JobPriority.HIGH, executor: highExecutor });
        await flushMicrotasks();
        expect(startOrder).toEqual([]);

        // Free exactly one slot.
        finishFillerJob.shift()!();
        await flushMicrotasks();

        // High started despite arriving after Low.
        expect(startOrder).toEqual(["high"]);
    });

    it("propagates a job's rejection to the caller instead of swallowing it", async () => {
        const scheduler = new Scheduler();

        const failingExecutor: JobExecutor = {
            execute: () => Promise.reject(new Error("boom")),
        };

        await expect(
            scheduler.submit({ priority: JobPriority.HIGH, executor: failingExecutor })
        ).rejects.toThrow("boom");
    });
});
