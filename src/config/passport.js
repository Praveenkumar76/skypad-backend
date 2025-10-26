const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

// Only configure Google OAuth if credentials are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Configure Google OAuth Strategy
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
      proxy: true // Trust proxy for HTTPS in production
    },
  async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('[Passport] Google OAuth callback received for:', profile.id);
      
      // Extract user info from Google profile
      const googleId = profile.id;
      const email = profile.emails?.[0]?.value?.toLowerCase();
      const fullName = profile.displayName || profile.name?.givenName || 'User';
      const profilePictureUrl = profile.photos?.[0]?.value || null;

      if (!email) {
        return done(new Error('No email provided by Google'), false);
      }

      // Check if user already exists with this Google ID
      let user = await User.findOne({ googleId });

      if (user) {
        console.log('[Passport] Existing Google user found:', user.email);
        
        // Update profile picture if changed
        if (profilePictureUrl && user.profilePictureUrl !== profilePictureUrl) {
          user.profilePictureUrl = profilePictureUrl;
          await user.save();
        }
        
        return done(null, user);
      }

      // Check if a user with this email already exists (from regular registration)
      const existingEmailUser = await User.findOne({ email });
      
      if (existingEmailUser) {
        console.log('[Passport] Linking Google account to existing email user:', email);
        
        // Link the Google ID to the existing account
        existingEmailUser.googleId = googleId;
        
        if (profilePictureUrl && !existingEmailUser.profilePictureUrl) {
          existingEmailUser.profilePictureUrl = profilePictureUrl;
        }
        
        await existingEmailUser.save();
        return done(null, existingEmailUser);
      }

      // Create a new user
      console.log('[Passport] Creating new Google user:', email);
      
      const username = fullName.split(' ')[0].toLowerCase() || email.split('@')[0];
      
      const newUser = await User.create({
        googleId,
        email,
        username,
        fullName,
        profilePictureUrl,
        // passwordHash is not required for OAuth users
      });

      console.log('[Passport] New user created:', newUser.email);
      return done(null, newUser);

    } catch (error) {
      console.error('[Passport] OAuth error:', error);
      return done(error, false);
    }
  }
  ));

  console.log('[Passport] Google OAuth strategy configured successfully');
} else {
  console.warn('[Passport] Google OAuth not configured - Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
}

// Serialize user for the session (not used with JWT, but required by Passport)
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from the session (not used with JWT, but required by Passport)
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

module.exports = passport;

