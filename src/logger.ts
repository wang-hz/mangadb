type Level = 'info' | 'warn' | 'error';

const PRIORITY: Record<Level, number> = { info: 0, warn: 1, error: 2 };

const configured = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
const minPriority = PRIORITY[configured] ?? 0;

function fmt(level: Level, msg: string) {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}`;
}

export const logger = {
  info(msg: string) {
    if (minPriority <= PRIORITY.info) console.log(fmt('info', msg));
  },
  warn(msg: string) {
    if (minPriority <= PRIORITY.warn) console.warn(fmt('warn', msg));
  },
  error(msg: string, err?: unknown) {
    if (minPriority > PRIORITY.error) return;
    console.error(fmt('error', msg));
    if (err instanceof Error) console.error(err.stack ?? err.message);
    else if (err !== undefined) console.error(err);
  },
};