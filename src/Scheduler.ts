import { Job, JobPriority } from "./types.js";

interface QueuedJob {
    job: Job;
    resolve: () => void;
    reject: (error: unknown) => void;
}

class Scheduler {
    private readonly MAX_ACTIVE_JOBS = 10;

    private highPriorityJobs: QueuedJob[] = [];
    private mediumPriorityJobs: QueuedJob[] = [];
    private lowPriorityJobs: QueuedJob[] = [];
    private activeJobs = 0;

    public submit(job: Job): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const queuedJob: QueuedJob = { job, resolve, reject };

            switch (job.priority) {
                case JobPriority.HIGH:
                    this.highPriorityJobs.push(queuedJob);
                    break;
                case JobPriority.MEDIUM:
                    this.mediumPriorityJobs.push(queuedJob);
                    break;
                case JobPriority.LOW:
                    this.lowPriorityJobs.push(queuedJob);
                    break;
            }

            this.dispatch();
        });
    }

    private dispatch(): void {
        while (this.isSlotAvailable()) {
            const next = this.takeNextQueuedJob();
            if (!next) break;

            this.activeJobs++;
            // Executor will be provided by the caller
            next.job.executor
                .execute()
                .then(
                    // Resolve the pending promise when execution is complete
                    () => next.resolve(),
                    (error) => next.reject(error)
                )
                .finally(() => {
                    this.releaseSlot();
                    // A slot is available, so we can try to dispatch the next job
                    this.dispatch();
                });
        }
    }

    private takeNextQueuedJob(): QueuedJob | undefined {
        if (this.highPriorityJobs.length > 0) {
            return this.highPriorityJobs.shift();
        }
        if (this.mediumPriorityJobs.length > 0) {
            return this.mediumPriorityJobs.shift();
        }
        return this.lowPriorityJobs.shift();
    }

    private isSlotAvailable(): boolean {
        return this.activeJobs < this.MAX_ACTIVE_JOBS;
    }

    private releaseSlot(): void {
        if (this.activeJobs > 0) {
            this.activeJobs--;
        }
    }
}

export { Scheduler };
