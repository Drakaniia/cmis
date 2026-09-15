export type UpdaterStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "up-to-date";

export interface UpdaterSettings {
  autoCheckOnStartup: boolean;
  autoDownload: boolean;
  lastCheckedAt: string | null;
}

export const DEFAULT_UPDATER_SETTINGS: UpdaterSettings = {
  autoCheckOnStartup: true,
  autoDownload: true,
  lastCheckedAt: null,
};

export interface UpdateInfo {
  availableVersion: string | null;
  body: string | null;
  currentVersion: string;
  date: string | null;
}

export interface UpdaterState {
  availableVersion: string | null;
  currentVersion: string | null;
  error: string | null;
  notes: string | null;
  progress: number | null;
  status: UpdaterStatus;
}

export const UPDATER_TOAST_ID = "cmis-updater";
export const UPDATER_STORE_FILE = "updater.json";
