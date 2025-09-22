const { SlashCommandBuilder } = require('discord.js');
const logger = require('../utils/logger');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('Manage bot logs')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current log file status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Clean up old log files')
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'status') {
            const logInfo = logger.getLogInfo();
            
            if (logInfo.error) {
                await interaction.reply(`❌ Error getting log info: ${logInfo.error}`);
                return;
            }

            let response = `📊 **Log Status**\n\n`;
            response += `📁 Directory: \`${logInfo.logDirectory}\`\n`;
            response += `📄 Current File: \`${path.basename(logInfo.currentLogFile)}\`\n`;
            response += `📏 Max Size: \`${logInfo.maxLogSize}\`\n`;
            response += `📚 Max Files: \`${logInfo.maxLogFiles}\`\n`;
            response += `📈 Total Files: \`${logInfo.totalFiles}\`\n`;
            response += `💾 Total Size: \`${logInfo.totalSizeMB}MB\`\n\n`;

            if (logInfo.logFiles.length > 0) {
                response += `📋 **Recent Log Files:**\n`;
                logInfo.logFiles.slice(0, 5).forEach(file => {
                    response += `• \`${file.name}\` (${file.sizeMB}MB)\n`;
                });
                if (logInfo.logFiles.length > 5) {
                    response += `• ... and ${logInfo.logFiles.length - 5} more files\n`;
                }
            }

            await interaction.reply(response);
        } else if (subcommand === 'cleanup') {
            await interaction.deferReply();
            
            const logInfoBefore = logger.getLogInfo();
            logger.cleanupLogs();
            const logInfoAfter = logger.getLogInfo();

            const filesRemoved = logInfoBefore.totalFiles - logInfoAfter.totalFiles;
            const sizeFreed = (parseFloat(logInfoBefore.totalSizeMB) - parseFloat(logInfoAfter.totalSizeMB)).toFixed(2);

            let response = `🧹 **Log Cleanup Complete**\n\n`;
            response += `🗑️ Files Removed: \`${filesRemoved}\`\n`;
            response += `💾 Space Freed: \`${sizeFreed}MB\`\n`;
            response += `📚 Remaining Files: \`${logInfoAfter.totalFiles}\`\n`;
            response += `💾 Remaining Size: \`${logInfoAfter.totalSizeMB}MB\``;

            await interaction.editReply(response);
        }
    }
};
