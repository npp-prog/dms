// Who is online (Messages): each signed-in user's DMS tells it is open every minute
// (presence/{uid}.at), unless they turned their online status off (hidden). Someone is shown online
// while their last sign of life is under 3 minutes old. Pure helpers; api.js reads and writes.
export const HEARTBEAT_MS = 60 * 1000;
export const ONLINE_MS = 3 * 60 * 1000;
export const isOnline = (p, now = Date.now()) => Boolean(p && !p.hidden && p.at && now - Date.parse(p.at) < ONLINE_MS);
