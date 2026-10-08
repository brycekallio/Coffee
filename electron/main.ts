import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  Notification,
  ipcMain,
  NativeImage,
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ESM compatibility for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { exec } from "child_process";
import { promisify } from "util";
import AutoLaunch from "auto-launch";
import Store from "electron-store";

const execPromise = promisify(exec);

// Store schema type
type StoreSchema = {
  autoLaunch: boolean;
  workerEnabled: boolean;
};

// Store for app settings - using type assertion for electron-store v11
const store = new Store({
  name: "coffee-settings",
  defaults: {
    autoLaunch: false,
    workerEnabled: true,
  },
}) as unknown as {
  get: <K extends keyof StoreSchema>(key: K) => StoreSchema[K];
  set: <K extends keyof StoreSchema>(key: K, value: StoreSchema[K]) => void;
};

// Supabase setup - will be initialized after loading env
let supabase: SupabaseClient | null = null;
// Set by the renderer after it signs in through the Cloudflare Worker. The main
// process never signs anyone in itself; it only borrows the renderer's token.
let rendererAccessToken: string | null = null;

// References
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let workerInterval: NodeJS.Timeout | null = null;
let isQuitting = false;

// Auto-launcher
const autoLauncher = new AutoLaunch({
  name: "Coffee",
  path: app.getPath("exe"),
});

// ── Types ────────────────────────────────────────────────────────────────────

type ScheduledOutreach = {
  id: string;
  contact_id: string;
  channel: "email" | "sms" | "linkedin";
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

// ── Supabase Helpers ─────────────────────────────────────────────────────────

function initSupabase() {
  // In production, we'll read from the built app's env or a config file
  // For development, read from process.env (loaded by dotenv in dev)
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Supabase credentials not found");
    return false;
  }

  // Same contract as the browser client: a function the SDK calls for a token.
  // supabase.auth is disabled by setting this, which is correct here — GoTrue
  // issued none of these tokens and would reject every one of them.
  supabase = createClient(url, key, { accessToken: async () => rendererAccessToken });
  return true;
}

async function getContact(id: string): Promise<Contact | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

async function markStatus(id: string, status: "sent" | "failed") {
  if (!supabase) return;
  const { error } = await supabase
    .from("scheduled_outreach")
    .update({ status })
    .eq("id", id);

  if (error) console.error(`Failed to update status for ${id}:`, error);
}

// ── Message Senders ──────────────────────────────────────────────────────────

async function sendEmail(contact: Contact, subject: string, message: string) {
  if (!contact.email) throw new Error("No email address for contact");

  // Escape special characters for AppleScript
  const escapedSubject = subject.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, "\\n");

  const script = `
    tell application "Mail"
      set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedMessage}", visible:false}
      tell newMessage
        make new to recipient at end of to recipients with properties {address:"${contact.email}"}
        send
      end tell
    end tell
  `;

  await execPromise(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

async function sendSMS(contact: Contact, message: string) {
  if (!contact.phone) throw new Error("No phone number for contact");

  const escapedMessage = message.replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const escapedPhone = contact.phone.replace(/"/g, '\\"');

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${escapedPhone}" of targetService
      send "${escapedMessage}" to targetBuddy
    end tell
  `;

  await execPromise(`osascript -e '${script.replace(/'/g, "'\\''")}'`);
}

// ── Notifications ────────────────────────────────────────────────────────────

function showNotification(title: string, body: string) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ── Background Worker ────────────────────────────────────────────────────────

async function processQueue() {
  if (!supabase || !store.get("workerEnabled")) return;

  console.log("[Worker] Checking for scheduled messages...");

  const now = new Date().toISOString();

  const { data: messages, error } = await supabase
    .from("scheduled_outreach")
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_at", now);

  if (error) {
    console.error("[Worker] Error fetching messages:", error);
    return;
  }

  if (!messages || messages.length === 0) {
    console.log("[Worker] No messages due.");
    return;
  }

  console.log(`[Worker] Found ${messages.length} messages due.`);
  let sentCount = 0;

  for (const msg of messages as ScheduledOutreach[]) {
    console.log(`[Worker] Processing message ${msg.id} for channel ${msg.channel}`);

    try {
      const contact = msg.contact_id ? await getContact(msg.contact_id) : null;
      if (!contact) {
        throw new Error("No contact attached to message");
      }

      if (msg.channel === "email") {
        await sendEmail(contact, msg.subject || "No Subject", msg.message);
      } else if (msg.channel === "sms") {
        await sendSMS(contact, msg.message);
      } else if (msg.channel === "linkedin") {
        // LinkedIn cannot be auto-sent - skip and mark as failed with explanation
        console.log(`[Worker] Skipping LinkedIn message ${msg.id} - auto-send not supported`);
        await markStatus(msg.id, "failed");
        continue;
      }

      await markStatus(msg.id, "sent");
      sentCount++;
      console.log(`[Worker] Message ${msg.id} sent successfully.`);
    } catch (err: any) {
      console.error(`[Worker] Failed to send ${msg.id}:`, err.message);
      await markStatus(msg.id, "failed");
    }
  }

  if (sentCount > 0) {
    showNotification(
      "Outreach Sent",
      `${sentCount} message${sentCount > 1 ? "s" : ""} sent successfully.`
    );
  }

  updateTrayMenu();
}

function startWorker() {
  if (workerInterval) return;

  console.log("[Worker] Starting background worker...");

  // Run immediately
  processQueue();

  // Then run every 60 seconds
  workerInterval = setInterval(processQueue, 60000);
}

function stopWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log("[Worker] Stopped background worker.");
  }
}

// ── Tray ─────────────────────────────────────────────────────────────────────

async function getUpcomingCount(): Promise<number> {
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("scheduled_outreach")
    .select("id")
    .eq("status", "scheduled");

  if (error) return 0;
  return data?.length ?? 0;
}

async function updateTrayMenu() {
  if (!tray) return;

  const upcomingCount = await getUpcomingCount();
  const workerEnabled = store.get("workerEnabled") as boolean;
  const autoLaunchEnabled = store.get("autoLaunch") as boolean;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `Coffee - ${upcomingCount} scheduled`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open App",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: "separator" },
    {
      label: workerEnabled ? "Pause Sending" : "Resume Sending",
      click: () => {
        store.set("workerEnabled", !workerEnabled);
        if (!workerEnabled) {
          startWorker();
        }
        updateTrayMenu();
        showNotification(
          workerEnabled ? "Sending Paused" : "Sending Resumed",
          workerEnabled
            ? "Scheduled messages will not be sent until resumed."
            : "Scheduled messages will now be sent automatically."
        );
      },
    },
    {
      label: "Check Now",
      click: () => processQueue(),
    },
    { type: "separator" },
    {
      label: "Start on Login",
      type: "checkbox",
      checked: autoLaunchEnabled,
      click: async () => {
        const newValue = !autoLaunchEnabled;
        store.set("autoLaunch", newValue);
        if (newValue) {
          await autoLauncher.enable();
        } else {
          await autoLauncher.disable();
        }
        updateTrayMenu();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Update tooltip
  tray.setToolTip(`Coffee - ${upcomingCount} messages scheduled`);
}

function createTray() {
  // Create a simple tray icon (coffee cup emoji as text for now)
  // In production, you'd use a proper icon file
  const iconPath = path.join(__dirname, "../public/tray-icon.png");

  // Create a template image for macOS (16x16 or 22x22)
  let icon: NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      throw new Error("Icon not found");
    }
    // Resize for menu bar
    icon = icon.resize({ width: 18, height: 18 });
  } catch {
    // Fallback: create a simple colored icon
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip("Coffee");

  tray.on("click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  updateTrayMenu();
}

// ── Main Window ──────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#050b14",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load from Vite dev server
  // In production, load from built files
  const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Minimize to tray instead of closing
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ─────────────────────────────────────────────────────────────

function setupIPC() {
  ipcMain.handle("get-settings", () => {
    return {
      autoLaunch: store.get("autoLaunch"),
      workerEnabled: store.get("workerEnabled"),
    };
  });

  ipcMain.handle("set-setting", (_, key: string, value: any) => {
    if (key === "autoLaunch" || key === "workerEnabled") {
      store.set(key, value);
      updateTrayMenu();
    }
  });

  ipcMain.handle("get-upcoming-count", async () => {
    return getUpcomingCount();
  });

  ipcMain.handle("trigger-check", async () => {
    await processQueue();
    return true;
  });

  ipcMain.handle("set-auth-session", async (_, accessToken: string) => {
    // The renderer re-sends this roughly hourly as it refreshes, so a long-running
    // background queue never ends up signing requests with an expired token.
    rendererAccessToken = accessToken || null;
  });
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Load environment variables in development
  if (!app.isPackaged) {
    const dotenv = await import("dotenv");
    dotenv.config({ path: ".env.local" });
  }

  // Initialize Supabase
  if (!initSupabase()) {
    console.error("Failed to initialize Supabase. Check your environment variables.");
  }

  setupIPC();
  createWindow();
  createTray();
  startWorker();

  // Sync auto-launch setting
  const autoLaunchEnabled = store.get("autoLaunch") as boolean;
  const isEnabled = await autoLauncher.isEnabled();
  if (autoLaunchEnabled !== isEnabled) {
    if (autoLaunchEnabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, keep running in the background (menu bar app)
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  isQuitting = true;
  stopWorker();
});
