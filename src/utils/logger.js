/**
 * Logger Utility for Casandalee Bot
 * Provides comprehensive logging to both console and file
 */

const fs = require('fs');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = path.join(__dirname, '../../logs');
        this.logFile = path.join(this.logDir, `casandalee-${new Date().toISOString().split('T')[0]}.log`);
        this.maxLogSize = 5 * 1024 * 1024; // 5MB per log file
        this.maxLogFiles = 7; // Keep 7 days of logs
        
        // Create logs directory if it doesn't exist
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
                console.log(`📁 Created logs directory: ${this.logDir}`);
            }
            console.log(`📁 Logs directory: ${this.logDir}`);
            console.log(`📄 Log file: ${this.logFile}`);
            this.rotateLogsIfNeeded();
        } catch (error) {
            console.warn('⚠️  Could not create logs directory, logging to console only:', error.message);
            this.logDir = null;
            this.logFile = null;
        }
    }

    /**
     * Rotate logs if they exceed maximum size
     */
    rotateLogsIfNeeded() {
        if (!this.logFile || !fs.existsSync(this.logFile)) return;

        try {
            const stats = fs.statSync(this.logFile);
            if (stats.size > this.maxLogSize) {
                // Rotate current log
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const rotatedFile = path.join(this.logDir, `casandalee-${new Date().toISOString().split('T')[0]}-${timestamp}.log`);
                fs.renameSync(this.logFile, rotatedFile);
                
                // Clean up old logs
                this.cleanupOldLogs();
            }
        } catch (error) {
            console.warn('⚠️  Could not rotate logs:', error.message);
        }
    }

    /**
     * Clean up old log files, keeping only the most recent ones
     */
    cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.logDir)
                .filter(file => file.startsWith('casandalee-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.logDir, file),
                    stats: fs.statSync(path.join(this.logDir, file))
                }))
                .sort((a, b) => b.stats.mtime - a.stats.mtime);

            // Keep only the most recent files
            if (files.length > this.maxLogFiles) {
                files.slice(this.maxLogFiles).forEach(file => {
                    try {
                        fs.unlinkSync(file.path);
                        console.log(`🗑️  Cleaned up old log: ${file.name}`);
                    } catch (error) {
                        console.warn(`⚠️  Could not delete old log ${file.name}:`, error.message);
                    }
                });
            }
        } catch (error) {
            console.warn('⚠️  Could not cleanup old logs:', error.message);
        }
    }
    
    /**
     * Log a message with timestamp
     * @param {string} level - Log level (INFO, WARN, ERROR, DEBUG)
     * @param {string} message - Log message
     * @param {Object} data - Additional data to log
     */
    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data: data ? JSON.stringify(data, null, 2) : null
        };
        
        const logLine = `[${timestamp}] ${level}: ${message}${data ? '\n' + logEntry.data : ''}\n`;
        
        // Log to console
        console.log(`[${timestamp}] ${level}: ${message}`);
        if (data) {
            console.log(JSON.stringify(data, null, 2));
        }
        
        // Log to file (if available)
        if (this.logFile) {
            try {
                // Check if we need to rotate logs before writing
                this.rotateLogsIfNeeded();
                fs.appendFileSync(this.logFile, logLine);
            } catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }
    
    /**
     * Log info message
     * @param {string} message - Info message
     * @param {Object} data - Additional data
     */
    info(message, data = null) {
        this.log('INFO', message, data);
    }
    
    /**
     * Log warning message
     * @param {string} message - Warning message
     * @param {Object} data - Additional data
     */
    warn(message, data = null) {
        this.log('WARN', message, data);
    }
    
    /**
     * Log error message
     * @param {string} message - Error message
     * @param {Object} data - Additional data
     */
    error(message, data = null) {
        this.log('ERROR', message, data);
    }
    
    /**
     * Log debug message
     * @param {string} message - Debug message
     * @param {Object} data - Additional data
     */
    debug(message, data = null) {
        this.log('DEBUG', message, data);
    }
    
    /**
     * Log Discord interaction
     * @param {string} type - Interaction type
     * @param {Object} interaction - Discord interaction object
     */
    logInteraction(type, interaction) {
        this.info(`Discord ${type}`, {
            id: interaction.id,
            type: interaction.type,
            commandName: interaction.commandName || 'N/A',
            userId: interaction.user?.id || 'N/A',
            username: interaction.user?.username || 'N/A',
            guildId: interaction.guildId || 'N/A',
            channelId: interaction.channelId || 'N/A',
            options: interaction.options?.data || 'N/A'
        });
    }
    
    /**
     * Log command execution
     * @param {string} commandName - Command name
     * @param {Object} interaction - Discord interaction
     * @param {string} status - Execution status
     * @param {Object} error - Error object if any
     * @param {Object} additionalData - Additional debugging data
     */
    logCommand(commandName, interaction, status, error = null, additionalData = {}) {
        this.info(`Command ${status}: ${commandName}`, {
            commandName,
            status,
            userId: interaction.user?.id,
            username: interaction.user?.username,
            guildId: interaction.guildId,
            channelId: interaction.channelId,
            error: error ? {
                message: error.message,
                code: error.code,
                stack: error.stack
            } : null,
            ...additionalData
        });
    }

    /**
     * Manually clean up old log files
     */
    cleanupLogs() {
        this.cleanupOldLogs();
    }

    /**
     * Get log file information
     */
    getLogInfo() {
        if (!this.logDir || !fs.existsSync(this.logDir)) {
            return { error: 'Log directory not available' };
        }

        try {
            const files = fs.readdirSync(this.logDir)
                .filter(file => file.startsWith('casandalee-') && file.endsWith('.log'))
                .map(file => {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        size: stats.size,
                        modified: stats.mtime,
                        sizeMB: (stats.size / (1024 * 1024)).toFixed(2)
                    };
                })
                .sort((a, b) => b.modified - a.modified);

            return {
                logDirectory: this.logDir,
                currentLogFile: this.logFile,
                maxLogSize: `${(this.maxLogSize / (1024 * 1024)).toFixed(0)}MB`,
                maxLogFiles: this.maxLogFiles,
                logFiles: files,
                totalFiles: files.length,
                totalSizeMB: files.reduce((sum, file) => sum + parseFloat(file.sizeMB), 0).toFixed(2)
            };
        } catch (error) {
            return { error: error.message };
        }
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;
