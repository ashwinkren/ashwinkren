// SHA-256 of site password (client gate — keeps casual visitors out)
export const PASSWORD_HASH = "bddabfaae15f3a2939f35ee9b7df44a1ca11c2ead8e5445ee5dc731c9c4af3ae";

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
