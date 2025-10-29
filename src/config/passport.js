// passport.js
import passport from "passport";
import pkg from "passport-google-oauth20";
const { Strategy: GoogleStrategy } = pkg;
import User from "../models/User.js";

// Export a configuration function instead of configuring immediately
export const configurePassport = () => {
  console.log('[Passport] Configuring with env vars...');
  console.log('- CLIENT_ID present:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('- CLIENT_SECRET present:', !!process.env.GOOGLE_CLIENT_SECRET);

  // Only configure Google OAuth if credentials are available
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          callbackURL: process.env.GOOGLE_CALLBACK_URL || "/api/auth/google/callback",
          proxy: true,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            console.log("[Passport] Google OAuth callback received for:", profile.id);

            const googleId = profile.id;
            const email = profile.emails?.[0]?.value?.toLowerCase();
            const fullName = profile.displayName || profile.name?.givenName || "User";
            const profilePictureUrl = profile.photos?.[0]?.value || null;

            if (!email) {
              return done(new Error("No email provided by Google"), false);
            }

            let user = await User.findOne({ googleId });

            if (user) {
              console.log("[Passport] Existing Google user found:", user.email);

              if (profilePictureUrl && user.profilePictureUrl !== profilePictureUrl) {
                user.profilePictureUrl = profilePictureUrl;
                await user.save();
              }

              return done(null, user);
            }

            const existingEmailUser = await User.findOne({ email });

            if (existingEmailUser) {
              console.log("[Passport] Linking Google account to existing email user:", email);

              existingEmailUser.googleId = googleId;

              if (profilePictureUrl && !existingEmailUser.profilePictureUrl) {
                existingEmailUser.profilePictureUrl = profilePictureUrl;
              }

              await existingEmailUser.save();
              return done(null, existingEmailUser);
            }

            console.log("[Passport] Creating new Google user:", email);

            const username = fullName.split(" ")[0].toLowerCase() || email.split("@")[0];

            const newUser = await User.create({
              googleId,
              email,
              username,
              fullName,
              profilePictureUrl,
            });

            console.log("[Passport] New user created:", newUser.email);
            return done(null, newUser);
          } catch (error) {
            console.error("[Passport] OAuth error:", error);
            return done(error, false);
          }
        }
      )
    );

    console.log("[Passport] ✅ Google OAuth strategy configured successfully");
  } else {
    console.warn("[Passport] ⚠️  Google OAuth not configured - Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
  }

  // Serialize user for the session
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  // Deserialize user from the session
  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};

export default passport;