/**
 * Deploy Commands Script
 * Registers slash commands with Discord
 */

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Load all command files
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
        console.log(`⚠️  Command at ${filePath} is missing required "data" or "execute" property.`);
    }
}

// Create REST instance
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// Deploy commands
(async () => {
    try {
        const guildId = process.env.GUILD_ID?.trim();

        // Register to guild first if set (commands appear instantly on that server)
        if (guildId) {
            console.log(`🔄 Registering ${commands.length} commands to your server (guild ${guildId})...`);
            const guildData = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
                { body: commands }
            );
            console.log(`✅ ${guildData.length} commands now available on your server (instant).`);
        } else {
            console.warn('⚠️  GUILD_ID not set in .env — registering globally only (can take up to 1 hour to appear).');
            console.warn('   For instant slash commands: set GUILD_ID=your_server_id in .env, then run this again.');
        }

        // Also register globally so commands work in DMs / other servers
        console.log(`🔄 Registering ${commands.length} commands globally...`);
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        console.log(`✅ Global: ${data.length} commands registered.`);
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();


