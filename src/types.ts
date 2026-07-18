enum JobPriority {
    LOW,
    MEDIUM,
    HIGH
}

interface JobExecutor {
    execute(): Promise<void>;
}

interface Job {
    priority: JobPriority;
    executor: JobExecutor;
}

export { Job, JobPriority, JobExecutor };