export const Cron = () => () => {};
export const CronExpression = {
  EVERY_SECOND: '* * * * * *',
  EVERY_30_SECONDS: '*/30 * * * * *',
  EVERY_MINUTE: '*/1 * * * *',
  EVERY_HOUR: '0 * * * *',
};
export const ScheduleModule = {
  forRoot: () => ({
    module: class ScheduleModule {},
  }),
};
