import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electronAPI", {
  // Settings
  getSettings: () => ipcRenderer.invoke("get-settings"),
  setSetting: (key: string, value: boolean) => ipcRenderer.invoke("set-setting", key, value),

  // Worker
  getUpcomingCount: () => ipcRenderer.invoke("get-upcoming-count"),
  triggerCheck: () => ipcRenderer.invoke("trigger-check"),

  // Auth session sync
  setAuthSession: (accessToken: string) => ipcRenderer.invoke("set-auth-session", accessToken),

  // Platform info
  platform: process.platform,
  isElectron: true,
});

// TypeScript declarations for the renderer
declare global {
  interface Window {
    electronAPI?: {
      getSettings: () => Promise<{ autoLaunch: boolean; workerEnabled: boolean }>;
      setSetting: (key: string, value: boolean) => Promise<void>;
      getUpcomingCount: () => Promise<number>;
      triggerCheck: () => Promise<boolean>;
      setAuthSession: (accessToken: string) => Promise<void>;
      platform: string;
      isElectron: boolean;
    };
  }
}
