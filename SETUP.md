# Casandalee Bot Setup Guide

## Quick Setup Steps

### 1. Create Environment File
Copy `env.example` to `.env` and update with your configuration:

```bash
copy env.example .env
```

### 2. Configure Your Bot Token
Edit the `.env` file and update:
```
DISCORD_TOKEN=your_discord_bot_token_here
```

### 3. Get Your Discord Application ID
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select existing one
3. Go to "General Information" 
4. Copy the "Application ID" to `CLIENT_ID` in your `.env` file

### 4. Install Dependencies
```bash
npm install
```

### 5. Deploy Commands
```bash
npm run deploy
```

### 6. Start the Bot
```bash
npm start
```

## Discord Bot Setup

### Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application"
3. Name it "Casandalee" (or your preferred name)
4. Go to "Bot" section
5. Click "Add Bot"
6. Copy the bot token to your `.env` file

### Bot Permissions
Your bot needs these permissions:
- Send Messages
- Use Slash Commands
- Read Message History
- Add Reactions
- Embed Links

### Invite Bot to Server
1. Go to "OAuth2" > "URL Generator"
2. Select "bot" and "applications.commands" scopes
3. Select the permissions listed above
4. Use the generated URL to invite the bot

## Optional: OpenAI Integration

For intelligent responses, get an OpenAI API key:
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Create an account and get an API key
3. Add it to your `.env` file as `OPENAI_API_KEY`

## Optional: FoundryVTT Integration

To access FoundryVTT tables:
1. Enable API access in your FoundryVTT instance
2. Create a user account for the bot
3. Add credentials to your `.env` file:
   - `FOUNDRY_URL` - Your FoundryVTT URL
   - `FOUNDRY_USERNAME` - Bot username
   - `FOUNDRY_PASSWORD` - Bot password

## Testing

Once running, test these commands in Discord:
- `/help` - Show available commands
- `/roll 1d20` - Roll a d20
- `/campaign` - Show campaign info
- Mention the bot: "@Casandalee roll 2d6+3"

## Troubleshooting

### Bot Not Responding
- Check if `.env` file exists and has correct token
- Verify bot has necessary permissions in Discord
- Check console for error messages

### Commands Not Working
- Run `npm run deploy` to register slash commands
- Wait a few minutes for Discord to update
- Check if bot is online in your server

### FoundryVTT Issues
- Verify FoundryVTT is running and accessible
- Check API credentials are correct
- Ensure FoundryVTT API is enabled

## Next Steps

1. **Test Basic Functionality**: Try the `/help` command
2. **Test Dice Rolling**: Use `/roll 1d20`
3. **Test Natural Language**: Mention the bot and ask a question
4. **Configure Campaign**: Add your campaign events and characters
5. **Customize**: Modify the bot's responses and add new features

## Support

If you encounter issues:
1. Check the console output for error messages
2. Verify all environment variables are set correctly
3. Ensure Discord bot has proper permissions
4. Check that all dependencies are installed

---

**Your Casandalee bot is ready to assist with your D&D campaign!** 🎲✨


