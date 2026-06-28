/**
 * Daily History Command - Test, preview, or trigger Casandalee's daily Recollection
 */

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily-history')
        .setDescription('Test or preview Casandalee\'s daily Recollection')
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Post a Recollection to the General channel now (admin only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('today')
                .setDescription('Preview a Recollection (event + past-life quote) just for you')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('trigger')
                .setDescription('Manually trigger a Recollection post to the General channel (admin only)')
        ),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'test') {
                if (!interaction.member.permissions.has('Administrator')) {
                    await interaction.reply({ content: '❌ This command requires Administrator permissions.', ephemeral: true });
                    return;
                }
                await interaction.deferReply({ ephemeral: true });
                const scheduler = interaction.client.dailyHistoryScheduler;
                if (!scheduler) {
                    await interaction.editReply('❌ Recollection scheduler not found.');
                    return;
                }
                await scheduler.testDailyHistory();
                await interaction.editReply('✅ Recollection posted! Check the General channel.');

            } else if (subcommand === 'today') {
                await interaction.deferReply();
                const scheduler = interaction.client.dailyHistoryScheduler;
                const embed = scheduler ? await scheduler.buildRecollectionPreview() : null;
                if (!embed) {
                    await interaction.editReply('📜 No campaign events available to recollect right now.');
                    return;
                }
                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'trigger') {
                if (!interaction.member.permissions.has('Administrator')) {
                    await interaction.reply({ content: '❌ This command requires Administrator permissions.', ephemeral: true });
                    return;
                }
                await interaction.deferReply({ ephemeral: true });
                const scheduler = interaction.client.dailyHistoryScheduler;
                if (!scheduler) {
                    await interaction.editReply('❌ Recollection scheduler not found.');
                    return;
                }
                await scheduler.postDailyHistory();
                await interaction.editReply('✅ Recollection post triggered! Check the General channel.');
            }
        } catch (error) {
            console.error('Error in daily-history command:', error);
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply('❌ An error occurred while running this command.').catch(() => {});
            } else {
                await interaction.reply({ content: '❌ An error occurred while running this command.', ephemeral: true }).catch(() => {});
            }
        }
    }
};
