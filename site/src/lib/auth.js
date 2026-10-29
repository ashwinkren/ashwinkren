// SHA-256 of site password (client gate — keeps casual visitors out)
export const PASSWORD_HASH = "30c5461fc27b84f1f1ad0a83162a26882b22d11cdfa45978dd21c810056e8d0e";

export async function hashPassword(value) {
  const data = new TextEncoder().encode(value);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const AUTH_KEY = "ashwinkren-auth";

export function isAuthed() {
  return sessionStorage.getItem(AUTH_KEY) === "1";
}

export function setAuthed() {
  sessionStorage.setItem(AUTH_KEY, "1");
}
