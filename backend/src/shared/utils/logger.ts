import path from 'path';
import fs from 'fs';
import winston from 'winston';
import 'winston-daily-rotate-file';

const logDir = path.join(
    process.env.APPDATA || process.env.HOME || '.',
    'Nautilus',
    'logs'
);

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);

const consoleFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
);

const logger = winston.createLogger({
    level: 'info',
    format: fileFormat,
    transports: [
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'nautilus-%DATE%-combined.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '14d',
        }),
        new winston.transports.DailyRotateFile({
            level: 'error',
            filename: path.join(logDir, 'nautilus-%DATE%-error.log'),
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxSize: '20m',
            maxFiles: '30d',
        }),
    ],
});

// Log to stderr (not stdout, which is used for IPC)
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Stream({
        stream: process.stderr,
        format: consoleFormat,
        level: 'debug'
    }));
}

export default logger;
