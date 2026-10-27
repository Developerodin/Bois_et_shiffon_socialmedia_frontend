// Adds what app.json can't hold: values from .env.local.
// Google sign-in on iOS needs the reversed iOS client ID as a URL scheme; Android needs no native config.
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (!iosClientId) return config;
  const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace(/\.apps\.googleusercontent\.com$/, "")}`;
  return { ...config, plugins: [...config.plugins, ["@react-native-google-signin/google-signin", { iosUrlScheme }]] };
};
