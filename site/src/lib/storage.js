const STORAGE_KEY = "scrollmap_report";
const SYNC_ID_KEY = "scrollmap_sync_id";
const MOOD_KEY = "scrollmap_mood";

export function getStoredReport() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveReport(report) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(report));
}

export function getSyncId() {
  return localStorage.getItem(SYNC_ID_KEY) || "";
}

export function setSyncId(id) {
  if (id) localStorage.setItem(SYNC_ID_KEY, id);
  else localStorage.removeItem(SYNC_ID_KEY);
}

export function getMoodEntries() {
  try {
    return JSON.parse(localStorage.getItem(MOOD_KEY) || "[]");
  } catch {
    return [];
  }
}

export function addMoodEntry(value, note = "") {
  const entries = getMoodEntries();
  entries.push({ value, note, at: new Date().toISOString() });
  localStorage.setItem(MOOD_KEY, JSON.stringify(entries.slice(-30)));
  return entries;
}

export async function fetchSyncedReport(syncId) {
  if (!syncId) return null;
  const res = await fetch(`/api/sync/${encodeURIComponent(syncId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data?.report || null;
}

export async function pushReport(syncId, report) {
  const res = await fetch(`/api/sync/${encodeURIComponent(syncId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report }),
  });
  return res.ok;
}

export function parseImportFile(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return { reels: data, exportedAt: new Date().toISOString() };
  if (data.reels) return data;
  throw new Error("Invalid format — expected Reel Mirror JSON export");
}

export function createSyncId() {
  return `sm_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
