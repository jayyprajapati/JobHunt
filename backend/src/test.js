const { google } = require('googleapis');
require('dotenv').config({ path: '../.env' });

console.log('google client id: ' + process.env.GOOGLE_CLIENT_ID);
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

console.log(
  oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/gmail.send"],
    prompt: "consent"
  })
);