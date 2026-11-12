type Timer = ReturnType<typeof setTimeout>;

export class AutosaveCoordinator {
    private timer: Timer | null = null;
    private pending = false;
    private inFlight: Promise<boolean> | null = null;

    constructor(
        private readonly save: () => Promise<boolean>,
        private readonly delay = 700,
        private readonly schedule: (callback: () => void, delay: number) => Timer = (
            callback,
            delay,
        ) => globalThis.setTimeout(callback, delay),
        private readonly cancel: (timer: Timer) => void = (timer) => globalThis.clearTimeout(timer),
    ) {}

    changed(): void {
        this.pending = true;
        this.clearTimer();
        this.timer = this.schedule(() => {
            this.timer = null;
            void this.flush();
        }, this.delay);
    }

    async flush(): Promise<boolean> {
        this.clearTimer();
        if (this.inFlight !== null) {
            const succeeded = await this.inFlight;
            return succeeded && (this.pending ? this.flush() : true);
        }
        if (!this.pending) return true;

        this.pending = false;
        const job = this.save();
        this.inFlight = job;
        const succeeded = await job;
        this.inFlight = null;
        if (!succeeded) {
            this.pending = true;
            return false;
        }
        return this.pending ? this.flush() : true;
    }

    dispose(): void {
        this.clearTimer();
    }

    discard(): boolean {
        if (this.inFlight !== null) return false;
        this.clearTimer();
        this.pending = false;
        return true;
    }

    async discardAfterCurrent(): Promise<void> {
        this.clearTimer();
        this.pending = false;
        if (this.inFlight !== null) await this.inFlight;
        this.pending = false;
    }

    private clearTimer(): void {
        if (this.timer === null) return;
        this.cancel(this.timer);
        this.timer = null;
    }
}
