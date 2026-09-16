
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';
import { exec } from 'child_process';
import util from 'util';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key in .env.local');
  process.exit(1);
}

// Use service role key to bypass RLS (no user session needed)
const supabase = createClient(supabaseUrl, supabaseKey);
const execPromise = util.promisify(exec);

// Types
type ScheduledOutreach = {
  id: string;
  contact_id: string;
  channel: 'email' | 'sms' | 'linkedin';
  subject: string | null;
  message: string;
  scheduled_at: string;
  status: string;
};

type Contact = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
};

async function getContact(id: string): Promise<Contact | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) return null;
  return data;
}

async function markStatus(id: string, status: 'sent' | 'failed', errorMsg?: string) {
  const { error } = await supabase
    .from('scheduled_outreach')
    .update({ 
      status, 
      // specific error logging column could be added, but for now just console log
    })
    .eq('id', id);
    
  if (error) console.error(`Failed to update status for ${id}:`, error);
  if (errorMsg) console.error(`Error processing ${id}:`, errorMsg);
}

// ── FLIGHT CONTROLLERS ──────────────────────────────────────────────

async function sendEmail(contact: Contact, subject: string, message: string) {
  if (!contact.email) throw new Error('No email address for contact');
  
  // AppleScript to send email via Mail.app
  // Note: This requires the user to have Mail.app set up.
  const script = `
    tell application "Mail"
      set newMessage to make new outgoing message with properties {subject:"${subject.replace(/"/g, '\\"')}", content:"${message.replace(/"/g, '\\"')}", visible:true}
      tell newMessage
        make new to recipient at end of to recipients with properties {address:"${contact.email}"}
        send
      end tell
    end tell
  `;
  
  await execPromise(`osascript -e '${script}'`);
}

async function sendSMS(contact: Contact, message: string) {
  if (!contact.phone) throw new Error('No phone number for contact');
  
  // AppleScript to send SMS via Messages.app
  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${contact.phone}" of targetService
      send "${message.replace(/"/g, '\\"')}" to targetBuddy
    end tell
  `;
  
  // Fallback if iMessage fails or buddy not found is complex in AppleScript, 
  // keeping it simple for MVP.
  
  await execPromise(`osascript -e '${script}'`);
}

async function sendLinkedIn(contact: Contact, message: string) {
  if (!contact.linkedin_url) throw new Error('No LinkedIn URL for contact');

  console.log('Launching browser for LinkedIn...');
  // Launch puppeteer. 
  // NOTE: This assumes the user has a Chrome profile they can point to, OR they log in manually.
  // Ideally, we launch in a way that preserves session.
  // For this MVP, we'll launch a headful browser and wait for specific selectors.
  // If the user is NOT logged in, they will need to log in quickly or we'll time out.
  // Better approach: Launch with user data dir if possible, or just ask user to be logged in.
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized'] 
    // executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' // Optional: use system chrome
  });
  
  const page = await browser.newPage();
  
  try {
    await page.goto(contact.linkedin_url, { waitUntil: 'domcontentloaded' });
    
    // Check if logged in (look for generic logged-in element, e.g. 'me' icon or nav)
    // If not, pause for user to login?
    // For automation, we assume session cookies are restored or user logs in.
    // Let's just try to find the "Message" button.
    
    // LinkedIn "Message" button selectors can be tricky and change.
    // Common pattern: button with text "Message" or aria-label "Message [Name]"
    
    // Simplest robust strategy: Look for button containing text "Message"
    const messageBtn = await page.$x("//button[contains(., 'Message')]");
    
    if (messageBtn.length > 0) {
      await (messageBtn[0] as any).click();
    } else {
      // Maybe it's in the "More" dropdown?
      // MVP: Throw error if main button not found
      throw new Error('Could not find Message button. Are you logged in?');
    }
    
    // Wait for chat overlay
    await page.waitForSelector('.msg-form__contenteditable', { timeout: 10000 });
    
    // Type message
    await page.type('.msg-form__contenteditable', message);
    
    // Click send
    const sendBtn = await page.$('.msg-form__send-button');
    if (sendBtn) {
      await sendBtn.click();
    } else {
      throw new Error('Could not find Send button');
    }
    
    // Wait a bit for send to register
    await new Promise(r => setTimeout(r, 2000));
    
  } finally {
    await browser.close();
  }
}

// ── MAIN LOOP ───────────────────────────────────────────────────────

async function processQueue() {
  console.log('Checking for scheduled messages...');
  
  const now = new Date().toISOString();
  
  const { data: messages, error } = await supabase
    .from('scheduled_outreach')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now);
    
  if (error) {
    console.error('Error fetching messages:', error);
    return;
  }
  
  console.log(`Found ${messages?.length || 0} messages due.`);
  
  for (const msg of (messages || []) as ScheduledOutreach[]) {
    console.log(`Processing message ${msg.id} for channel ${msg.channel}`);
    
    try {
      const contact = msg.contact_id ? await getContact(msg.contact_id) : null;
      if (!contact && msg.contact_id) {
        throw new Error(`Contact ${msg.contact_id} not found`);
      }
      
      // If no contact but we have phone/email in msg? (Schema assumes contact_id or raw fields?
      // Current schema in OutreachEmailsPage has contact_id. If null, we might be stuck unless we add raw fields.)
      if (!contact) {
         throw new Error('No contact attached to message');
      }

      if (msg.channel === 'email') await sendEmail(contact, msg.subject || 'No Subject', msg.message);
      if (msg.channel === 'sms') await sendSMS(contact, msg.message);
      if (msg.channel === 'linkedin') await sendLinkedIn(contact, msg.message);
      
      await markStatus(msg.id, 'sent');
      console.log(`Reference ${msg.id} sent successfully.`);
      
    } catch (err: any) {
      console.error(`Failed to send ${msg.id}:`, err);
      // Optional: await markStatus(msg.id, 'failed', err.message);
    }
  }
}

// Run immediately then loop? Or just run once?
// For a worker, loop is best.
// Using simple interval.
async function run() {
  console.log('Worker started. Press Ctrl+C to stop.');
  while (true) {
    try {
      await processQueue();
    } catch (err) {
      console.error('Fatal error in loop:', err);
    }
    // Wait 60 seconds
    await new Promise(r => setTimeout(r, 60000));
  }
}

run();
