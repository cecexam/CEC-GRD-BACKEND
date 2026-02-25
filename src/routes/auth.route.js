const express = require("express");
const fetch = require("node-fetch");
const router = express.Router();

const { admin, db } = require("../config/firebase");
const { sendOTP } = require("../utils/email");

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

/* ================================
   SIGN UP (email, password, role)
================================ */
router.post("/signup", async (req, res) => {
  try {
    const { email, password, role,name } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: "email, password, role required",
      });
    }

    const user = await admin.auth().createUser({
      email,
      password,
      name,
    });

    await db.collection("users").doc(user.uid).set({
      name,
      uid: user.uid,
      email,
      role,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      uid: user.uid,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      message: err.message,
    });
  }
});

/* ================================
   LOGIN (email + password) ✅
================================ */
router.post("/login", async (req, res) => {
  try {
    const { idToken } = req.body;


    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: "idToken required",
      });
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    console.log(decoded.uid);

    const snap = await db.collection("users").doc(decoded.uid).get();
    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    res.json({
      success: true,
      user: snap.data(),
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
});

/* ================================
   SEND OTP (email)
================================ */
router.post("/send-otp", async (req, res) => {
  try {
    console.log(req.body);
    
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Check if user exists first
    try {
      await admin.auth().getUserByEmail(email);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: "User with this email does not exist",
      });
    }

    await sendOTP(email);

    res.json({
      success: true,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

/* ================================
   VERIFY OTP (email, otp)
================================ */
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    const otpDoc = await db.collection("otps").doc(email).get();

    if (!otpDoc.exists) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const otpData = otpDoc.data();

    if (otpData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    if (Date.now() > otpData.expiresAt) {
      return res.status(400).json({
        success: false,
        message: "OTP has expired",
      });
    }

    // OTP is valid, generate token
    const user = await admin.auth().getUserByEmail(email);
    const customToken = await admin.auth().createCustomToken(user.uid);

    // Delete used OTP
    await db.collection("otps").doc(email).delete();

    // Fetch user details
    const userSnap = await db.collection("users").doc(user.uid).get();

    if (!userSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "User profile not found in database",
      });
    }

    res.json({
      success: true,
      token: customToken,
      user: userSnap.data(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


/* ================================
   FETCH ALL ADMINS
================================ */
router.get("/admins", async (req, res) => {
  try {
    const snap = await db
      .collection("users")
      .where("role", "==", "admin")
      .orderBy("createdAt", "desc")
      .get();

    const admins = snap.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    res.json({
      success: true,
      count: admins.length,
      admins,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


/* ================================
   DELETE ADMIN BY UID
================================ */
router.delete("/adminDelete/:uid", async (req, res) => {
  try {
    const { uid } = req.params;

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "Admin UID required",
      });
    }

    // Delete from Firebase Auth
    await admin.auth().deleteUser(uid);

    // Delete from Firestore
    await db.collection("users").doc(uid).delete();

    res.json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});


/* ================================
   AUTH MIDDLEWARE
================================ */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = header.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}



/* ================================
   GET CURRENT USER
================================ */
router.get("/me", authenticate, async (req, res) => {
  const snap = await db.collection("users").doc(req.user.uid).get();
  res.json({ success: true, user: snap.data() });
});

module.exports = router;
