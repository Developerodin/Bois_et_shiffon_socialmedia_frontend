/** What a new product post or story is for. The server's brief goal, the web dialog and the app all read this list. */
export const CONTENT_GOALS = ["newArrival", "productFeature", "specialOffer"] as const;
export type ContentGoal = (typeof CONTENT_GOALS)[number];
export const CONTENT_GOAL_LABELS: Record<ContentGoal, string> = { newArrival: "New arrival", productFeature: "Product feature", specialOffer: "Special offer" };
