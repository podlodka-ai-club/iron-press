import pino from "pino";

const isTty = process.stdout.isTTY;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: isTty
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss.l",
          ignore: "pid,hostname",
          singleLine: false,
        },
      }
    : undefined,
});

export type Logger = typeof logger;

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings) as Logger;
}
