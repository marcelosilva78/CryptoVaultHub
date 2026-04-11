/**
 * Compile-time stub for @nestjs/schedule.
 * The real package is installed as a production dependency and available at runtime.
 * This stub exists only to satisfy TypeScript compilation when the package is not
 * present in the local node_modules (it is resolved via the monorepo root).
 */

/**
 * Common cron expressions used throughout the service.
 */
export const CronExpression = {
  EVERY_SECOND: '* * * * * *',
  EVERY_5_SECONDS: '*/5 * * * * *',
  EVERY_10_SECONDS: '*/10 * * * * *',
  EVERY_30_SECONDS: '*/30 * * * * *',
  EVERY_MINUTE: '0 * * * * *',
  EVERY_5_MINUTES: '0 */5 * * * *',
  EVERY_10_MINUTES: '0 */10 * * * *',
  EVERY_30_MINUTES: '0 */30 * * * *',
  EVERY_HOUR: '0 0 * * * *',
  EVERY_DAY_AT_MIDNIGHT: '0 0 0 * * *',
} as const;

export type CronExpression = (typeof CronExpression)[keyof typeof CronExpression];

/**
 * @Cron decorator stub — at runtime the real decorator from @nestjs/schedule is used.
 */
export function Cron(_expression: string | CronExpression, _options?: Record<string, any>): MethodDecorator {
  return (_target: object, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => descriptor;
}

/**
 * ScheduleModule stub for use in AppModule.
 */
export const ScheduleModule = {
  forRoot: () => ({}) as any,
};
