// Tone values stay English (stored on the brand, apps/web brand-summary.ts TONES); labels come from
// onboarding:brand.tones.<lowercase>. Grouped so every kind of business finds itself, not only upscale ones;
// group titles: onboarding:brand.toneGroups.<key>. Used by onboarding A10 and Business M07.
export const TONE_GROUPS = [
  { key: "feel", tones: ["Warm", "Playful", "Bold", "Calm", "Romantic", "Edgy"] },
  { key: "style", tones: ["Modern", "Minimalist", "Rustic", "Vintage", "Bohemian", "Industrial", "Scandinavian", "Coastal"] },
  { key: "positioning", tones: ["Luxurious", "Premium", "Elegant", "Affordable", "Artisanal", "Sustainable", "Natural", "Family-friendly"] },
];
