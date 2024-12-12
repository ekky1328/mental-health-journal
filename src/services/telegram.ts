import { Telegraf } from 'telegraf';
import fs from 'fs';
import moment from 'moment';
import schedule from 'node-schedule';

// Telegram Bot Token
const { TELEGRAM_TOKEN } = process.env;
const bot = new Telegraf(TELEGRAM_TOKEN as string);

// File storage for user journals
const JOURNAL_FILE = './data/journals.json';

// Define types for journal and check-in states
interface UserJournals {
  [userId: string]: string[];
}

interface CheckInStates {
  [userId: string]: NodeJS.Timeout | { editing: boolean | number };
}

// Load journals from file
function loadJournals(): UserJournals {
  if (fs.existsSync(JOURNAL_FILE)) {
    return JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf-8'));
  }
  return {};
}

// Save journals to file
function saveJournals(journals: UserJournals): void {
  fs.writeFileSync(JOURNAL_FILE, JSON.stringify(journals, null, 2));
}

const userJournals = loadJournals();
const checkInStates: CheckInStates = {}; // Track active check-in states

// Handle start command
bot.start((ctx) => {
  const userId = ctx.from?.id?.toString() || '';
  if (!userJournals[userId]) {
    userJournals[userId] = [];
    saveJournals(userJournals);
  }
  ctx.reply("Hello! I'm your daily mental health check-in bot. I'll ask you a few questions about your day each evening.");
});

// Check-in handler
bot.command('checkin', (ctx) => {
  const userId = ctx.from?.id?.toString() || '';
  if (!userJournals[userId]) {
    userJournals[userId] = [];
    saveJournals(userJournals);
  }
  checkInStates[userId] = setTimeout(() => delete checkInStates[userId], 60 * 60 * 1000); // Auto-reset after 1 hour
  ctx.reply("How was your day? Feel free to share any positive or negative feelings you experienced.");
});

// Edit journal entry handler
bot.command('edit', (ctx) => {
  const userId = ctx.from?.id?.toString() || '';
  if (userJournals[userId] && userJournals[userId].length > 0) {
    const entries = userJournals[userId]
      .map((entry, index) => `${index + 1}: ${entry.slice(0, 10)}...`)
      .join('\n');
    ctx.reply(`Which entry would you like to edit? Reply with the entry number:\n\n${entries}`);
    checkInStates[userId] = { editing: true };
  } else {
    ctx.reply("You don't have any journal entries yet.");
  }
});

// Edit journal entry handler
bot.command('exit-edit', (ctx) => {
  const userId = ctx.from?.id?.toString() || '';
  const state = checkInStates[userId];
  if (isEditingState(state)) {
      delete checkInStates[userId];
  }
});

// Single text handler to handle both check-in and editing
bot.on('text', (ctx) => {
  const userId = ctx.from?.id?.toString() || '';
  const state = checkInStates[userId];

  if (state) {

    if (isEditingState(state)) {
      const match = ctx.message.text.match(/^\d+$/);
      if (match) {
        const entryIndex = parseInt(match[0], 10) - 1;
        if (userJournals[userId][entryIndex]) {
          state.editing = entryIndex; // Store index for editing
          ctx.reply(`Editing entry ${entryIndex + 1}. Please send the updated text.`);
        } else {
          ctx.reply("Invalid entry number. Please try again.");
        }
      } else if (typeof state.editing === 'number') {
        userJournals[userId][state.editing] = `${moment().format('YYYY-MM-DD')}: ${ctx.message.text}`;
        saveJournals(userJournals);
        delete checkInStates[userId];
        ctx.reply("Your entry has been updated.");
      } else {
        ctx.reply("Please reply with a valid entry number.");
      }
    } 
    

    // Check In
    else {
      // Handle journal entry for check-in
      userJournals[userId].push(`${moment().format('YYYY-MM-DD')}: ${ctx.message.text}`);
      saveJournals(userJournals);

      // Clean up the message
      ctx.deleteMessage(ctx.message.message_id);

      clearTimeout(checkInStates[userId] as NodeJS.Timeout); // Clear the timeout
      delete checkInStates[userId];
      ctx.reply("Thank you! Your entry has been saved.");
    }
  } else {
    ctx.reply("Please use /checkin or wait for the scheduled check-in to add a journal entry.");
  }
});

// Utility function to check if the state is for editing
function isEditingState(state: NodeJS.Timeout | { editing: boolean | number }): state is { editing: boolean | number } {
  return (state as { editing: boolean | number }).editing !== undefined;
}

// Schedule daily check-in at 8 PM user time (adjustable as needed)
schedule.scheduleJob('0 20 * * *', () => {
  Object.keys(userJournals).forEach((userId) => {
    bot.telegram.sendMessage(userId, "How was your day? Feel free to share any positive or negative feelings you experienced.");
    checkInStates[userId] = setTimeout(() => delete checkInStates[userId], 60 * 60 * 1000); // Auto-reset after 1 hour
  });
});

// Start bot
bot.launch().then(() => console.log('Bot is running...')).catch(console.error);
