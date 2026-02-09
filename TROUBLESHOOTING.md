# Casandalee Bot Troubleshooting Guide

## Common Issues and Solutions

### Bot Returns "Sorry, I'm having trouble processing your request right now"

**Problem**: The bot responds to questions but only returns generic error messages instead of actual answers.

**Cause**: This usually means the OpenAI API key has exceeded its quota or is invalid.

**Solution**:
1. Check your OpenAI billing at https://platform.openai.com/settings/organization/billing
2. Verify you have available credits/quota
3. Ensure your payment method is valid
4. If needed, generate a new API key at https://platform.openai.com/api-keys
5. Update the `OPENAI_API_KEY` in your `.env` file
6. Restart the bot:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

**Test the API key**:
```bash
node -e "require('dotenv').config(); const OpenAI = require('openai'); const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); client.chat.completions.create({ model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'test' }], max_tokens: 5 }).then(r => console.log('SUCCESS:', r.choices[0].message.content)).catch(e => console.error('ERROR:', e.message, e.status));"
```

### Bot Not Responding at All

**Symptoms**: Bot is online but doesn't respond to commands or mentions.

**Possible Causes**:
- Bot is not running
- Discord permissions are incorrect
- Commands not deployed
- Bot crashed

**Solutions**:

1. **Check if bot is running**:
   ```bash
   docker ps --filter "name=cass"
   ```

2. **Check bot logs**:
   ```bash
   docker-compose logs --tail=50 cass-bot
   ```

3. **Verify bot permissions** in Discord:
   - Send Messages
   - Use Slash Commands
   - Read Message History
   - Embed Links

4. **Redeploy commands**:
   ```bash
   npm run deploy
   ```

5. **Restart the bot**:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Slash Commands Not Showing Up

**Problem**: The `/ask`, `/roll`, etc. commands don't appear in Discord.

**Note**: For reincarnation, use `/reincarnate` then choose the **standard** or **aquatic** subcommand. The aquatic option appears in the subcommand list when you select `/reincarnate`. The standalone `/reincarnate-aquatic` command is still available.

**Solutions**:
1. Deploy the commands:
   ```bash
   npm run deploy
   ```

2. Wait 5-10 minutes for Discord to update globally

3. Try these quick fixes:
   - Restart Discord client
   - Leave and rejoin the server
   - Check bot has `applications.commands` permission

4. Verify deployment:
   ```bash
   npm run deploy
   ```
   Look for "Successfully registered X application commands"

### Timeline/Google Sheets Not Loading

**Symptoms**: Bot can't find timeline events or character data.

**Solutions**:

1. **Verify Google Sheets API key** in `.env`:
   ```
   GOOGLE_SHEETS_API_KEY=your_key_here
   GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id
   GOOGLE_SHEETS_TIMELINE_RANGE=Sheet1!A1:D800
   ```

2. **Check spreadsheet permissions**:
   - Make sure the sheet is publicly readable, OR
   - Use a service account with access

3. **Test the connection**:
   ```bash
   docker-compose logs -f cass-bot | grep "Google Sheets"
   ```
   Look for "✅ Loaded X timeline events from Google Sheets"

4. **Manual refresh** in Discord:
   ```
   /refresh timeline
   ```

### Docker Container Won't Start

**Symptoms**: `docker-compose up` fails or container immediately stops.

**Solutions**:

1. **Check Docker logs**:
   ```bash
   docker-compose logs cass-bot
   ```

2. **Verify environment variables**:
   - Make sure `.env` file exists
   - Check all required variables are set (especially `DISCORD_TOKEN`)

3. **Rebuild the container**:
   ```bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up -d
   ```

4. **Check Docker Desktop** is running (Windows/Mac)

5. **Clean up old containers**:
   ```bash
   docker system prune -a
   ```

### High Memory Usage

**Problem**: Bot consumes too much memory over time.

**Solutions**:

1. **Restart periodically**:
   ```bash
   docker-compose restart cass-bot
   ```

2. **Check log file size**:
   ```bash
   /logs status
   ```
   Use `/logs cleanup` to remove old logs

3. **Monitor Docker stats**:
   ```bash
   docker stats cass-discord-bot
   ```

### FoundryVTT Integration Not Working

**Symptoms**: Table lookups fail or FoundryVTT features don't work.

**Solutions**:

1. **Verify FoundryVTT is running** and accessible

2. **Check credentials** in `.env`:
   ```
   FOUNDRY_URL=http://localhost:30000
   FOUNDRY_USERNAME=your_username
   FOUNDRY_PASSWORD=your_password
   ```

3. **Test connection manually**:
   - Visit `FOUNDRY_URL` in browser
   - Try logging in with the credentials

4. **Check FoundryVTT API** is enabled in settings

5. **Note**: FoundryVTT integration is optional. Bot works without it.

### Personality System Not Working

**Symptoms**: Bot always responds the same way or doesn't switch personalities.

**Cause**: Missing personality guide file.

**Solutions**:

1. **Check for personality guide**:
   ```bash
   ls data/casandalee_personality_guide.json
   ```

2. **Verify the file is loaded**:
   ```bash
   docker-compose logs cass-bot | grep "personality"
   ```

3. **Test personality switching**:
   ```
   @Casandalee who are you right now?
   ```

4. The bot switches personalities every 1d7 queries or after 1 hour

## Diagnostic Commands

### Check Bot Health
```bash
# View live logs
docker-compose logs -f cass-bot

# Check container status
docker-compose ps

# Check resource usage
docker stats cass-discord-bot

# Test bot is responding
# (In Discord): @Casandalee ping
```

### Test API Keys
```bash
# Test OpenAI API
node -e "require('dotenv').config(); console.log('OpenAI Key:', process.env.OPENAI_API_KEY?.substring(0, 20));"

# Test Discord Token
node -e "require('dotenv').config(); console.log('Discord Token:', process.env.DISCORD_TOKEN?.substring(0, 20));"
```

### Restart Sequence
```bash
# Full restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Quick restart
docker-compose restart cass-bot

# View startup logs
docker-compose logs --tail=30 cass-bot
```

## Getting Help

If you're still having issues:

1. **Check the logs** for specific error messages
2. **Verify all environment variables** are set correctly
3. **Test API keys** individually
4. **Restart the bot** completely
5. **Open an issue** on GitHub with:
   - Error messages from logs
   - Steps to reproduce
   - Your environment (Docker/local, OS, etc.)

## Contact

For additional support, contact the developer or open an issue on the GitHub repository.

---

**Most issues can be resolved by checking API keys and restarting the bot!** 🔧
