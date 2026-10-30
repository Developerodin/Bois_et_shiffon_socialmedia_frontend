/**
 * The password typed on "Create an account", held in memory until the emailed code is entered (A14 → A02).
 * Never in route params (those can end up in logs) and never in device storage; a cold start just asks again.
 */
let pending: { email: string; password: string } | null = null;
export const holdRegistration = (email: string, password: string) => void (pending = { email, password });
export const registrationFor = (email: string) => (pending?.email === email ? pending.password : null);
export const clearRegistration = () => void (pending = null);
