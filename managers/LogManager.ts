import chalk from 'chalk';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import Table from 'cli-table3';
import moment from 'moment';
import figlet from 'figlet';

const LOG_DIR = path.join(__dirname, '..', 'logs');

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Use static figures since it's an ESM module
const logSymbols = {
    error: '✖',
    warning: '⚠',
    success: '✓',
    info: 'ℹ',
    debug: '→',
    play: '▶'
};

// Custom colors using chalk
const unknownColors = {
    primary: chalk.hex('#FF4B91'),
    secondary: chalk.hex('#FFB3B3'),
    success: chalk.hex('#59CE8F'),
    error: chalk.hex('#FF1E1E'),
    warning: chalk.hex('#F7D060'),
    info: chalk.hex('#4B56D2')
};

interface LogMeta {
    [key: string]: any;
}

// Add success level to winston
const levels = {
    error: 0,
    warn: 1,
    success: 2,
    info: 3,
    debug: 4
};

export default class LogManager {
    private static instance: LogManager;
    private logger!: winston.Logger;

    constructor() {
        if (!LogManager.instance) {
            this.initLogger();
            LogManager.instance = this;
        }
        return LogManager.instance;
    }

    private initLogger(): void {
        const logFormat = winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const color = level === 'error' ? unknownColors.error :
                         level === 'warn' ? unknownColors.warning :
                         level === 'success' ? unknownColors.success :
                         level === 'info' ? unknownColors.info :
                         level === 'debug' ? unknownColors.secondary :
                         unknownColors.primary;

            const symbol = level === 'error' ? logSymbols.error :
                          level === 'warn' ? logSymbols.warning :
                          level === 'success' ? logSymbols.success :
                          level === 'info' ? logSymbols.info :
                          level === 'debug' ? logSymbols.debug :
                          logSymbols.play;

            let output = `${chalk.gray(moment(timestamp as string).format('YYYY-MM-DD HH:mm:ss'))} `;
            output += color(`${symbol} [${level.toUpperCase()}] ${message}`);

            if (Object.keys(meta).length > 0) {
                const table = new Table({
                    chars: {
                        'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
                        'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
                        'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
                        'right': '│', 'right-mid': '┤', 'middle': '│'
                    },
                    style: { 'padding-left': 1, 'padding-right': 1 }
                });

                for (const [key, value] of Object.entries(meta)) {
                    if (key !== 'splat' && value !== undefined) {
                        table.push([unknownColors.info(key), typeof value === 'object' ? 
                            JSON.stringify(value, null, 2) : String(value)]);
                    }
                }
                output += '\n' + table.toString();
            }
            return output;
        });

        this.logger = winston.createLogger({
            levels,
            level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] })
            ),
            transports: [
                new winston.transports.Console({
                    format: logFormat
                }),
                new DailyRotateFile({
                    dirname: LOG_DIR,
                    filename: 'application-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    maxFiles: '14d',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json()
                    )
                }),
                new DailyRotateFile({
                    dirname: LOG_DIR,
                    filename: 'error-%DATE%.log',
                    datePattern: 'YYYY-MM-DD',
                    level: 'error',
                    maxFiles: '14d',
                    format: winston.format.combine(
                        winston.format.timestamp(),
                        winston.format.json()
                    )
                })
            ]
        });
        this.logger.info('Logger initialized');
    }

    public static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    // Instance methods
    public info(message: string, meta: LogMeta = {}): void {
        this.logger.info(message, meta);
    }

    public error(message: string, error: Error | null = null): void {
        const meta: LogMeta = {};
        if (error) {
            meta.error = {
                message: error.message,
                stack: error.stack,
                name: error.name
            };
        }
        this.logger.error(message, meta);
    }

    public warn(message: string, meta: LogMeta = {}): void {
        this.logger.warn(message, meta);
    }

    public success(message: string, meta: LogMeta = {}): void {
        this.logger.log('success', message, meta);
    }

    public debug(message: string, meta: LogMeta = {}): void {
        if (process.env.NODE_ENV !== 'production') {
            this.logger.debug(message, meta);
        }
    }

    public async figlet(text: string): Promise<string> {
        return new Promise((resolve, reject) => {
            figlet(text, { 
                font: 'Big',
                horizontalLayout: 'default',
                verticalLayout: 'default'
            }, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(data || '');
            });
        });
    }

    // Static methods that use the instance
    public static info(message: string, meta: LogMeta = {}): void {
        LogManager.getInstance().info(message, meta);
    }

    public static error(message: string, error: Error | null = null): void {
        LogManager.getInstance().error(message, error);
    }

    public static warning(message: string, meta: LogMeta = {}): void {
        LogManager.getInstance().warn(message, meta);
    }

    public static success(message: string, meta: LogMeta = {}): void {
        LogManager.getInstance().success(message, meta);
    }

    public static debug(message: string, meta: LogMeta = {}): void {
        LogManager.getInstance().debug(message, meta);
    }

    public static async figlet(text: string): Promise<string> {
        return LogManager.getInstance().figlet(text);
    }
}