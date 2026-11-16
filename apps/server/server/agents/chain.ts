/**
 * The posts chain ("Generate calendar"): Brief writer and Creator work in batches (8 and 5 per run), so each starts
 * its next round while posts are still waiting. ponytail: at most this many rounds per stage per Generate (about 48
 * briefs, 30 drafts); a bigger calendar finishes on the next Generate.
 */
export const CHAIN_ROUNDS = 6;
