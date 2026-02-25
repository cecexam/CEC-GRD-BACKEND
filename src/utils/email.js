const emailjs = require("@emailjs/nodejs");
const { db, admin } = require("../config/firebase");

// Initialize EmailJS with your keys (optional: these can be passed in send method too, but better here)
// However, the nodejs SDK usually picks up from params or init.
// Let's use the explicit init if available or just pass params.
// The SDK documentation suggests init for browser, but for nodejs:
/*
  emailjs.init({
    publicKey: 'YOUR_PUBLIC_KEY',
    privateKey: 'YOUR_PRIVATE_KEY', // optional, highly recommended for security
  });
*/

const publicKey = process.env.EMAILJS_PUBLIC_KEY;
const privateKey = process.env.EMAILJS_PRIVATE_KEY;

emailjs.init({
  publicKey: publicKey,
  privateKey: privateKey,
});


/**
 * Generates a 6-digit OTP
 * @returns {string}
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Sends OTP via EmailJS and stores it in Firestore
 * @param {string} email
 * @returns {Promise<void>}
 */
const sendOTP = async (email) => {
  const otp = generateOTP();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes from now

  // Store in Firestore
  await db.collection("otps").doc(email).set({
    otp,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Send via EmailJS SDK
  const serviceId = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_ID;

  const templateParams = {
    to_email: email,
    otp: otp,
  };

  try {
    const response = await emailjs.send(serviceId, templateId, templateParams);
    console.log('SUCCESS!', response.status, response.text);
  } catch (error) {
    console.error("FAILED...", error);
    throw new Error("Failed to send OTP email");
  }
};

module.exports = { sendOTP };
