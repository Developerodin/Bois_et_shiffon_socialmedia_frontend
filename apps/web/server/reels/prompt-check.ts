/**
 * Free checks on a scene's video prompt before anything is paid for. Most wasted renders are prompt mistakes;
 * these are the ones Higgsfield's prompting guide names (higgsfield-ai/skills, MIT): image-to-video prompts
 * describe motion, not the still; phrase positively ("tack sharp", not "no blur"); keep it under ~200 tokens.
 */
const MAX_CHARS = 1200; // ≈ 200 tokens
const NEGATIVE = /\b(no|not|without|don't|never|pas de|sans|aucun|aucune)\b/i;
const DESCRIBES_STILL = /^\s*(a|an|the)?\s*(photo|image|picture|still|photograph)\s+of\b/i;

export function promptProblems(prompt: string): string[] {
  const out: string[] = [];
  if (prompt.length > MAX_CHARS) out.push(`The scene prompt is too long (${prompt.length} characters); keep it under ${MAX_CHARS}.`);
  if (NEGATIVE.test(prompt)) out.push("Say what should be there, positively (\"empty room\", not \"no people\"): video models ignore or invert negatives.");
  if (DESCRIBES_STILL.test(prompt)) out.push("Describe the motion and camera, not the photo: the model already has the image.");
  return out;
}
