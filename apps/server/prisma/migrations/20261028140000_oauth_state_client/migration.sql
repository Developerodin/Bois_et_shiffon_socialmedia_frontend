-- Where a connect was started: "mobile" states are completed by the app with its own token
ALTER TABLE "OAuthStateTransaction" ADD COLUMN "client" TEXT NOT NULL DEFAULT 'web';
