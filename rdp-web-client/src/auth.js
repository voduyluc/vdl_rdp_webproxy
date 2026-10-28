// Login token lives in sessionStorage: it is dropped when the tab/browser is closed,
// so every new browser session must log in again. (localStorage would persist it.)
const KEY = 'token';

// Tokens saved by older builds in localStorage would keep users logged in forever.
try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }

export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (token) => sessionStorage.setItem(KEY, token);
export const clearToken = () => sessionStorage.removeItem(KEY);
