/**
 * Runs in <head> before the first paint (app/layout.tsx): applies a saved light/dark choice so the page never
 * flashes the other theme. A fixed string, no input from anywhere. Storage can be blocked: then the system
 * setting decides, as it does when nothing was chosen.
 */
export const THEME_KEY = "espanda.theme";
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.classList.add(t)}catch(e){}`;
