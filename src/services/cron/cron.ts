import { CronJob } from "cron";
import { SchedulerCronService } from "./scheduler";

export class CronService {
    private schedulerService: SchedulerCronService;
    private job: CronJob;

    constructor(schedulerService: SchedulerCronService) {
        this.schedulerService = schedulerService;
        this.job = this.getJobs();
    }

    private getJobs(): CronJob {
        const job = new CronJob(
            '*/5 * * * *', // Run every 5 minutes
            async () => {
                console.log('Checking for scheduled events...');
                await this.schedulerService.checkRecentScheduledEvents();
            },
            null,
            false,
        );
        return job;
    }

    public start() {
        this.job.start();
        console.log('Cron job started - checking for scheduled events every 5 minutes');
    }

    public stop() {
        this.job.stop();
        console.log('Cron job stopped');
    }
}