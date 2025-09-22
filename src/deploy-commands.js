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
        console.log(`🔄 Started refreshing ${commands.length} application (/) commands.`);
        
        // Register commands globally
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
        
        // Also register for specific guild if GUILD_ID is provided
        if (process.env.GUILD_ID) {
            console.log(`🔄 Also registering commands for guild ${process.env.GUILD_ID}.`);
            
            const guildData = await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
                { body: commands }
            );
            
            console.log(`✅ Successfully reloaded ${guildData.length} guild application (/) commands.`);
        }
        
    } catch (error) {
        console.error('❌ Error deploying commands:', error);
    }
})();


