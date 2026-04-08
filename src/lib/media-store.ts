import { get, set, del, keys } from "idb-keyval";

// Store uploaded media files in IndexedDB for persistence

export interface StoredFile {
  name: string;
  type: string;
  data: ArrayBuffer;
  addedAt: number;
}

const PREFIX_BG = "bg_clip_";
const PREFIX_MUSIC = "music_";

export async function saveBackgroundClip(file: File): Promise<void> {
  const data = await file.arrayBuffer();
  await set(`${PREFIX_BG}${file.name}`, {
    name: file.name,
    type: file.type,
    data,
    addedAt: Date.now(),
  } as StoredFile);
}

export async function saveMusicTrack(file: File): Promise<void> {
  const data = await file.arrayBuffer();
  await set(`${PREFIX_MUSIC}${file.name}`, {
    name: file.name,
    type: file.type,
    data,
    addedAt: Date.now(),
  } as StoredFile);
}

export async function getBackgroundClips(): Promise<StoredFile[]> {
  const allKeys = await keys();
  const bgKeys = allKeys.filter((k) => String(k).startsWith(PREFIX_BG));
  const files: StoredFile[] = [];
  for (const key of bgKeys) {
    const val = await get<StoredFile>(key);
    if (val) files.push(val);
  }
  return files.sort((a, b) => a.addedAt - b.addedAt);
}

export async function getMusicTracks(): Promise<StoredFile[]> {
  const allKeys = await keys();
  const musicKeys = allKeys.filter((k) => String(k).startsWith(PREFIX_MUSIC));
  const files: StoredFile[] = [];
  for (const key of musicKeys) {
    const val = await get<StoredFile>(key);
    if (val) files.push(val);
  }
  return files.sort((a, b) => a.addedAt - b.addedAt);
}

export async function removeBackgroundClip(name: string): Promise<void> {
  await del(`${PREFIX_BG}${name}`);
}

export async function removeMusicTrack(name: string): Promise<void> {
  await del(`${PREFIX_MUSIC}${name}`);
}

export function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
