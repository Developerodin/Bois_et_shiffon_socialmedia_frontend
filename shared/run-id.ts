/** An agent run's id as the app may send it (?runId=): letters, digits, - and _, up to 40. The server route and the web link check with the same rule. */
export const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
