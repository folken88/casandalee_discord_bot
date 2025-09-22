# Google Sheets Integration Setup Guide

This guide will help you set up real-time data synchronization between your Discord bot and Google Sheets.

## Benefits of Google Sheets Integration

- **Real-time Updates**: Campaign data updates instantly when you edit your Google Sheet
- **Collaborative Editing**: Multiple people can edit campaign data simultaneously
- **No File Management**: No need to manually update CSV files
- **Automatic Refresh**: Data refreshes every 5 minutes (configurable)
- **Fallback Support**: Falls back to CSV files if Google Sheets is unavailable

## Setup Steps

### 1. Create a Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it "Campaign Data" or similar
4. Create the following sheets:

#### Timeline Sheet
Create a sheet named "Timeline" with these columns:
- **Column A**: Date (e.g., "4717.04.15")
- **Column B**: Location (e.g., "Absalom")
- **Column C**: AP (Adventure Path) (e.g., "Rise of the Runelords")
- **Column D**: Description (e.g., "The party discovers the ancient temple")

#### Characters Sheet
Create a sheet named "Characters" with these columns:
- **Column A**: Name (e.g., "Eldrin")
- **Column B**: Class (e.g., "Wizard")
- **Column C**: Level (e.g., "5")
- **Column D**: Race (e.g., "Elf")
- **Column E**: Player (e.g., "John")
- **Column F**: Notes (e.g., "Specializes in evocation")

### 2. Get Google API Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google Sheets API:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

4. Create API credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the API key

5. (Optional) Restrict the API key:
   - Click on your API key
   - Under "Application restrictions", select "HTTP referrers"
   - Add your domain (or leave unrestricted for testing)

### 3. Get Your Spreadsheet ID

1. Open your Google Sheet
2. Look at the URL: `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`
3. Copy the `SPREADSHEET_ID` part

### 4. Configure Your Bot

Add these variables to your `.env` file:

```env
# Google Sheets Configuration
GOOGLE_SHEETS_API_KEY=your_api_key_here
GOOGLE_SHEETS_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SHEETS_TIMELINE_RANGE=Timeline!A:D
GOOGLE_SHEETS_CHARACTERS_RANGE=Characters!A:F
GOOGLE_SHEETS_REFRESH_INTERVAL=300000
```

### 5. Install Dependencies

```bash
npm install googleapis
```

### 6. Deploy Commands

```bash
npm run deploy
```

### 7. Test the Integration

1. Start your bot: `npm start`
2. Use the `/refresh` command to test the connection
3. Check the logs for any errors

## Usage

### Automatic Refresh
- Data refreshes automatically every 5 minutes (configurable)
- No manual intervention needed

### Manual Refresh
Use the `/refresh` command to force an immediate data update:
- `/refresh` - Refresh all data
- `/refresh type:timeline` - Refresh timeline only
- `/refresh type:characters` - Refresh characters only

### Timeline Queries
The bot will automatically use Google Sheets data for timeline searches:
- `@Casandalee when did the party arrive in Absalom?`
- `/timeline search:Absalom`

### Character Queries
Character data is also pulled from Google Sheets:
- `/campaign type:characters` - Show all characters
- `@Casandalee who is playing the wizard?`

## Google Sheet Format Examples

### Timeline Sheet Example
```
Date        | Location | AP                    | Description
4717.04.15 | Absalom  | Rise of the Runelords | Party arrives in Absalom
4717.04.16 | Absalom  | Rise of the Runelords | Party meets with the mayor
4717.04.17 | Sandpoint| Rise of the Runelords | Party travels to Sandpoint
```

### Characters Sheet Example
```
Name   | Class   | Level | Race | Player | Notes
Eldrin | Wizard  | 5     | Elf  | John   | Specializes in evocation
Bob    | Fighter | 4     | Human| Sarah  | Two-weapon fighting
Alice  | Cleric  | 5     | Dwarf| Mike   | Healing domain
```

## Troubleshooting

### Bot Not Loading Data
1. Check your API key is correct
2. Verify the spreadsheet ID
3. Ensure the sheet names match exactly
4. Check that the ranges are correct

### Permission Errors
1. Make sure your Google Sheet is shared with the API key
2. Check that the Google Sheets API is enabled
3. Verify your API key has the correct permissions

### Data Not Updating
1. Use `/refresh` to force an update
2. Check the bot logs for errors
3. Verify your sheet has data in the expected format

### Fallback to CSV
If Google Sheets integration fails, the bot will automatically fall back to using the CSV files (`pf_folkengames_timeline.csv`).

## Advanced Configuration

### Custom Refresh Intervals
Set `GOOGLE_SHEETS_REFRESH_INTERVAL` to control how often data refreshes:
- `60000` = 1 minute
- `300000` = 5 minutes (default)
- `900000` = 15 minutes

### Custom Sheet Ranges
You can specify different ranges for your data:
- `Timeline!A:E` - Include an extra column
- `Campaign_Events!A:D` - Use a different sheet name
- `Characters!A:Z` - Include more character data

## Security Considerations

1. **API Key Security**: Keep your API key secret and don't commit it to version control
2. **Sheet Permissions**: Only share your sheet with trusted collaborators
3. **Rate Limits**: Google has API rate limits; the bot handles this automatically
4. **Data Validation**: The bot validates data format but doesn't sanitize content

## Benefits Over CSV Files

- ✅ **Real-time collaboration** - Multiple people can edit simultaneously
- ✅ **No file management** - No need to upload/download files
- ✅ **Version history** - Google Sheets tracks all changes
- ✅ **Easy editing** - User-friendly interface
- ✅ **Automatic backup** - Google handles backups
- ✅ **Mobile access** - Edit from anywhere
- ✅ **Comments and notes** - Add context to entries

Your Casandalee bot is now ready to use real-time Google Sheets data! 🎲✨
