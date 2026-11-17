/** How a zone reads to people: "Europe/Paris" → "Paris", "America/New_York" → "New York". */
export const zoneCity = (timeZone: string) => timeZone.split("/").pop()!.replace(/_/g, " ");

/** Every percent in an offer's own wording, whatever the phrasing ("30 % sur tout le salon" → 30). */
export const offerPercents = (offer: string) => [...offer.matchAll(/(\d{1,3})[   ]?%/g)].map((m) => Number(m[1]));
