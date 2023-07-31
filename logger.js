const winston = require('winston');
require('winston-daily-rotate-file');

const { combine, timestamp, json } = winston.format;

const fileRotateTransport = new winston.transports.DailyRotateFile({
    filename: 'combined-%DATE%.log',
    dirname: "./log",
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    stderrLevels: ['error', 'debug']
});

const wlogger = winston.createLogger({
    level: 'http',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console({
        stderrLevels: ['error', 'debug']
    }), fileRotateTransport],
});


module.exports = wlogger