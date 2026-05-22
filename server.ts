import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const archiverModule = require("archiver") as any;
const ZipArchive = archiverModule.ZipArchive;

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "sr_gateway_secure_jwt_secret_token_1234!";
function cleanPrivateKey(rawKey: string): string {
  if (!rawKey) return "";
  let key = rawKey.trim();
  if (key.startsWith('"') && key.endsWith('"')) {
    key = key.slice(1, -1);
  } else if (key.startsWith("'") && key.endsWith("'")) {
    key = key.slice(1, -1);
  }
  if (!key.includes("\n") && key.includes(" ")) {
    const words = key.split(/\s+/);
    let header = "";
    let footer = "";
    let middleWords: string[] = [];
    let base64StartIdx = 0;
    for (let i = 0; i < words.length; i++) {
      if (words[i] === "KEY-----") {
        base64StartIdx = i + 1;
        header = words.slice(0, base64StartIdx).join(" ");
        break;
      }
    }
    let base64EndIdx = words.length;
    for (let i = words.length - 1; i >= 0; i--) {
      if (words[i] === "-----END") {
        base64EndIdx = i;
        footer = words.slice(base64EndIdx).join(" ");
        break;
      }
    }
    middleWords = words.slice(base64StartIdx, base64EndIdx);
    return `${header}\n${middleWords.join("\n")}\n${footer}\n`;
  }
  return key.replace(/\\n/g, '\n');
}

const ADMIN_SECRET_ROUTE = process.env.ADMIN_SECRET_ROUTE || "/sradmin1KJRD829";

async function startServer() {
  const app = express();
  const PORT = 3000;

  console.log("Starting SR GATEWAY IN backend node process...");

  // --- Dynamic Firebase Admin Initialization ---
  let dbInstance: any = null;
  const getDb = () => {
    if (dbInstance) return dbInstance;
    
    try {
      const adminObj: any = (admin as any).default || admin;
      const apps = adminObj.apps || [];
      let appInstance: any = null;
      if (!apps.length) {
        // 1. Check for local service-account.json
        const saPath = path.join(process.cwd(), "service-account.json");
        if (fs.existsSync(saPath)) {
          console.log("Initializing Firebase Admin SDK using local service-account.json...");
          const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf-8"));
          appInstance = adminObj.initializeApp({
            credential: adminObj.credential.cert(serviceAccount)
          });
          
          // If the service account project matches the applet config, we can use the same custom database
          const configPath = path.join(process.cwd(), "firebase-applet-config.json");
          let databaseId = "";
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            if (config.projectId === serviceAccount.project_id && config.firestoreDatabaseId) {
              databaseId = config.firestoreDatabaseId;
            }
          }
          
          if (databaseId) {
            console.log(`Setting up custom database instance for Service Account: ${databaseId}`);
            dbInstance = getFirestore(appInstance, databaseId);
          } else {
            console.log("Setting up default database instance for Service Account.");
            dbInstance = getFirestore(appInstance);
          }
        }
        // 2. Check for environment secrets
        else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
          console.log("Initializing Firebase Admin SDK using Environment Secrets...");
          const formattedKey = cleanPrivateKey(process.env.FIREBASE_PRIVATE_KEY);
          appInstance = adminObj.initializeApp({
            credential: adminObj.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: formattedKey
            }),
            databaseURL: process.env.FIREBASE_DATABASE_URL
          });
          dbInstance = getFirestore(appInstance);
        } else {
          // Fallback to local applet config JSON
          const configPath = path.join(process.cwd(), "firebase-applet-config.json");
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            console.log(`Initializing Firebase Admin (Lazy Config) for Project: ${config.projectId}`);
            appInstance = adminObj.initializeApp({ projectId: config.projectId });
            if (config.firestoreDatabaseId) {
              console.log(`Setting up custom database instance: ${config.firestoreDatabaseId}`);
              dbInstance = getFirestore(appInstance, config.firestoreDatabaseId);
            } else {
              dbInstance = getFirestore(appInstance);
            }
          } else {
            console.log("No Firebase configurations found. Standard boot...");
            appInstance = adminObj.initializeApp();
            dbInstance = getFirestore(appInstance);
          }
        }
      } else {
        appInstance = apps[0];
        // If app already initialized, check for config/service-account to instantiate correct db
        const saPath = path.join(process.cwd(), "service-account.json");
        const configPath = path.join(process.cwd(), "firebase-applet-config.json");
        
        let targetProjId = "";
        let customDbId = "";
        
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
          targetProjId = config.projectId;
          customDbId = config.firestoreDatabaseId;
        }

        if (fs.existsSync(saPath)) {
          const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf-8"));
          if (serviceAccount.project_id === targetProjId && customDbId) {
            dbInstance = getFirestore(appInstance, customDbId);
          } else {
            dbInstance = getFirestore(appInstance);
          }
        } else if (customDbId) {
          dbInstance = getFirestore(appInstance, customDbId);
        } else {
          dbInstance = getFirestore(appInstance);
        }
      }
    } catch (e: any) {
      console.error("Firebase Admin Initialization Failed:", e.message);
    }
    return dbInstance;
  };

  app.use(express.json());

  // --- Telegram System Alert Utility ---
  const sendTelegramAlert = async (message: string) => {
    const botToken = process.env.BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      console.log(`[Telegram Alert Simulation]:\n${message}`);
      return;
    }
    try {
      await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML"
      });
      console.log("[Telegram message delivered successfully]");
    } catch (err: any) {
      console.error("[Telegram sendMessage call failed]:", err.message);
    }
  };

  // --- Middleware: Verify Secret JSON Auth token ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ status: "error", message: "Unauthorized credentials token required" });
    }

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) {
        return res.status(403).json({ status: "error", message: "Session expired or invalid" });
      }
      req.user = user;
      next();
    });
  };

  // --- JWT Authentication Endpoints ---
  app.post("/api/auth/register", async (req, res) => {
    const { mobile, fullName, password } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    if (!mobile || !fullName || !password) {
      return res.status(400).json({ status: "error", message: "Missing required registration inputs" });
    }

    try {
      const cleanMobile = mobile.trim();
      if (cleanMobile.length !== 10) {
        return res.status(400).json({ status: "error", message: "Enter a valid 10-digit mobile number" });
      }

      // Check duplicate
      const userSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
      if (!userSnap.empty) {
        return res.status(400).json({ status: "error", message: "Mobile number is already registered!" });
      }

      // Secure Bcrypt Hashing
      const passwordHash = await bcrypt.hash(password, 10);
      const generatedApiKey = `SR-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

      const userId = `USR_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      // Admin auto-assignment for specified layout
      const isAdminUser = cleanMobile === "7477661867" || cleanMobile === "9172091478"; 

      const newUserDoc = {
        uid: userId,
        mobile: cleanMobile,
        displayName: fullName,
        passwordHash,
        balance: 0,
        pin: null, // MPIN starting state
        apiKey: generatedApiKey,
        freezeStatus: false,
        apiStatus: true,
        isLocked: false,
        mpinAttempts: 0,
        lockExpires: null,
        isAdmin: isAdminUser,
        isVip: false,
        createdAt: FieldValue.serverTimestamp(),
        lastSeen: FieldValue.serverTimestamp()
      };

      await db.collection("users").doc(userId).set(newUserDoc);
      
      const sessionToken = jwt.sign({ uid: userId, mobile: cleanMobile, isAdmin: isAdminUser }, JWT_SECRET, { expiresIn: '7d' });

      await sendTelegramAlert(
        `<b>🆕 New Registration Detected!</b>\n\n` +
        `👤 Name: ${fullName}\n` +
        `📞 Mobile: <code>${cleanMobile}</code>\n` +
        `🔗 API Token: <code>${generatedApiKey}</code>\n` +
        `🏷️ Role: ${isAdminUser ? 'SYSTEM ADMIN' : 'GATEWAY MERCHANT'}`
      );

      res.status(201).json({
        status: "success",
        message: "Registration successful!",
        token: sessionToken,
        user: { uid: userId, mobile: cleanMobile, displayName: fullName, apiKey: generatedApiKey, isAdmin: isAdminUser }
      });
    } catch (error: any) {
      console.error("Register Error:", error);
      res.status(500).json({ status: "error", message: "Internal Auth Failure: " + error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const { mobile, password } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    if (!mobile || !password) {
      return res.status(400).json({ status: "error", message: "Mobile and password inputs are required" });
    }

    try {
      const cleanMobile = mobile.trim();
      const userSnap = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
      if (userSnap.empty) {
        return res.status(401).json({ status: "error", message: "Invalid credentials. Please register." });
      }

      const userDoc = userSnap.docs[0];
      const userData = userDoc.data();

      if (userData.isLocked) {
        if (userData.lockExpires) {
          const expireTime = userData.lockExpires.toDate().getTime();
          if (Date.now() < expireTime) {
            const minLeft = Math.round((expireTime - Date.now()) / 60000);
            return res.status(403).json({ status: "error", message: `Account is temporarily frozen due to security. Try in ${minLeft} mins.` });
          } else {
            // Unlock automatic
            await userDoc.ref.update({ isLocked: false, mpinAttempts: 0, lockExpires: null });
          }
        } else {
          return res.status(403).json({ status: "error", message: "Account locked. Contact support @srsaportbot" });
        }
      }

      const passMatch = await bcrypt.compare(password, userData.passwordHash);
      if (!passMatch) {
        return res.status(401).json({ status: "error", message: "Invalid credentials. Double check details." });
      }

      const sessionToken = jwt.sign({ uid: userData.uid, mobile: cleanMobile, isAdmin: !!userData.isAdmin }, JWT_SECRET, { expiresIn: '7d' });

      await userDoc.ref.update({ lastSeen: FieldValue.serverTimestamp() });

      res.json({
        status: "success",
        message: "Login successful!",
        token: sessionToken,
        user: {
          uid: userData.uid,
          mobile: userData.mobile,
          displayName: userData.displayName,
          apiKey: userData.apiKey,
          balance: userData.balance,
          pin: userData.pin,
          isAdmin: !!userData.isAdmin,
          freezeStatus: !!userData.freezeStatus,
          apiStatus: !!userData.apiStatus,
          isLocked: !!userData.isLocked
        }
      });
    } catch (error: any) {
      console.error("Login Error:", error);
      res.status(500).json({ status: "error", message: "Internal Auth Failure: " + error.message });
    }
  });

  // --- Secure MPIN Set & Verification ---
  app.post("/api/auth/mpin/set", authenticateToken, async (req: any, res) => {
    const { pin } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "DB offline" });

    if (!pin || pin.length !== 6 || isNaN(Number(pin))) {
      return res.status(400).json({ status: "error", message: "MPIN must be exactly a 6-digit number" });
    }

    try {
      await db.collection("users").doc(req.user.uid).update({ pin: pin });
      res.json({ status: "success", message: "6-Digit Secure MPIN updated successfully!" });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/auth/mpin/verify", authenticateToken, async (req: any, res) => {
    const { pin } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "DB offline" });

    try {
      const userDocRef = db.collection("users").doc(req.user.uid);
      const userSnap = await userDocRef.get();
      if (!userSnap.exists) return res.status(404).json({ status: "error", message: "User not found" });

      const userData = userSnap.data()!;

      if (userData.isLocked) {
        return res.status(403).json({ status: "error", message: "Account is blocked. Contact support." });
      }

      if (userData.pin === pin) {
        await userDocRef.update({ mpinAttempts: 0 }); // reset attempts
        return res.json({ status: "success", message: "MPIN Verified successfully" });
      } else {
        const nextAttempts = (userData.mpinAttempts || 0) + 1;
        if (nextAttempts >= 3) {
          const lockExpires = new Date(Date.now() + 30 * 60 * 1000); // 30 mins lock
          await userDocRef.update({
            isLocked: true,
            mpinAttempts: nextAttempts,
            lockExpires: Timestamp.fromDate(lockExpires)
          });

          await sendTelegramAlert(
            `<b>🚨 WARNING: Account Self-Lockdown!</b>\n\n` +
            `👤 Name: ${userData.displayName}\n` +
            `📞 Mobile: <code>${userData.mobile}</code>\n` +
            `⚠️ Alert Code: 3x WRONG MPIN ENTRIES\n` +
            `🔒 Status: LOCKED FOR 30 MINUTES\n` +
            `🛡️ IP/Location Match Flagged.`
          );

          return res.status(403).json({ status: "error", message: "3 Wrong attempts! Your account has been automatically locked for 30 minutes." });
        } else {
          await userDocRef.update({ mpinAttempts: nextAttempts });
          return res.status(400).json({ status: "error", message: `Incorrect MPIN. ${3 - nextAttempts} attempts remaining before lockdown.` });
        }
      }
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // --- Real-Time Sync Sync Profile API ---
  app.get("/api/auth/profile", authenticateToken, async (req: any, res) => {
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "DB offline" });
    try {
      const snap = await db.collection("users").doc(req.user.uid).get();
      if (!snap.exists) return res.status(404).json({ status: "error", message: "User not found" });
      res.json({ status: "success", user: snap.data() });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // --- Secure User-to-User Transfer Engine ---
  app.post("/api/wallet/transfer", authenticateToken, async (req: any, res) => {
    const { receiverMobile, amount, pin } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    if (!receiverMobile || !amount || !pin) {
      return res.status(400).json({ status: "error", message: "Missing receiver, amount or verification PIN" });
    }

    const transferAmount = parseFloat(amount);
    if (isNaN(transferAmount) || transferAmount <= 0) {
      return res.status(400).json({ status: "error", message: "Enter a valid transfer amount" });
    }

    try {
      const senderRef = db.collection("users").doc(req.user.uid);
      const senderSnap = await senderRef.get();
      const senderData = senderSnap.data();

      if (!senderData) return res.status(404).json({ status: "error", message: "Sender not found" });

      if (senderData.freezeStatus) {
        return res.status(403).json({ status: "error", message: "Your wallet funds are currently frozen by Admin" });
      }

      if (senderData.pin !== pin) {
        return res.status(400).json({ status: "error", message: "Verification failed. Incorrect 6-digit MPIN." });
      }

      if (senderData.balance < transferAmount) {
        return res.status(400).json({ status: "error", message: "Insufficient wallet balance" });
      }

      const receiverQuery = await db.collection("users").where("mobile", "==", receiverMobile.trim()).limit(1).get();
      if (receiverQuery.empty) {
        return res.status(404).json({ status: "error", message: "Receiver account not registered on SR GATEWAY" });
      }

      const receiverDoc = receiverQuery.docs[0];
      const receiverData = receiverDoc.data();

      if (receiverDoc.id === senderRef.id) {
        return res.status(400).json({ status: "error", message: "Self transfers are not permitted" });
      }

      const txnId = `TXN${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

      // Atomic Balance Transaction Swap
      await db.runTransaction(async (transaction) => {
        const freshSenderDoc = await transaction.get(senderRef);
        const freshSender = freshSenderDoc.data()!;

        if (freshSender.balance < transferAmount) {
          throw new Error("Insufficient balance during processing");
        }

        const freshReceiverDoc = await transaction.get(receiverDoc.ref);
        const freshReceiver = freshReceiverDoc.data()!;

        transaction.update(senderRef, { balance: freshSender.balance - transferAmount });
        transaction.update(receiverDoc.ref, { balance: freshReceiver.balance + transferAmount });

        // Add transaction entry for sender
        const senderTxnRef = db.collection("transactions").doc();
        transaction.set(senderTxnRef, {
          id: txnId,
          userId: req.user.uid,
          mobile: senderData.mobile,
          type: "transfer-sent",
          amount: transferAmount,
          receiver: receiverMobile,
          receiverName: receiverData.displayName,
          status: "success",
          timestamp: FieldValue.serverTimestamp(),
          description: `Transferred to ${receiverData.displayName}`
        });

        // Add transaction entry for receiver
        const receiverTxnRef = db.collection("transactions").doc();
        transaction.set(receiverTxnRef, {
          id: txnId,
          userId: receiverDoc.id,
          mobile: receiverData.mobile,
          type: "transfer-received",
          amount: transferAmount,
          sender: senderData.mobile,
          senderName: senderData.displayName,
          status: "success",
          timestamp: FieldValue.serverTimestamp(),
          description: `Received from ${senderData.displayName}`
        });
      });

      await sendTelegramAlert(
        `<b>💸 Secure Wallet Transfer Alert!</b>\n\n` +
        `👤 From: ${senderData.displayName} (<code>${senderData.mobile}</code>)\n` +
        `👤 To: ${receiverData.displayName} (<code>${receiverData.mobile}</code>)\n` +
        `💰 Amount: <b>₹${transferAmount}</b>\n` +
        `🧾 Transaction ID: <code>${txnId}</code>\n` +
        `🟢 Status: COMPLETED (Atomic Swap)`
      );

      res.json({
        status: "success",
        message: "Wallet transfer completed successfully!",
        data: { txnId, transferAmount, receiverName: receiverData.displayName }
      });
    } catch (err: any) {
      console.error("Transfer error:", err);
      res.status(500).json({ status: "error", message: err.message || "Inter-wallet transfer failed." });
    }
  });

  // --- Payout Engine: Accepts REST API Queries ---
  app.all("/api/pay", async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    const method = req.method;
    const key = ((method === "GET" ? req.query.key : req.body?.key) || req.query.key || req.body?.key || req.headers['x-api-key']) as string;
    const number = ((method === "GET" ? (req.query.number || req.query.mobile) : (req.body?.number || req.body?.mobile)) || req.query.number || req.query.mobile || req.body?.number || req.body?.mobile) as string;
    const amount = ((method === "GET" ? req.query.amount : req.body?.amount) || req.query.amount || req.body?.amount) as string;
    const comment = ((method === "GET" ? req.query.comment : req.body?.comment) || req.query.comment || req.body?.comment || "payout-api") as string;

    const db = getDb();
    if (!db) return res.status(200).json({ status: "failed", message: "Database offline" });

    if (!key || !number || !amount) {
      return res.status(200).json({ status: "failed", message: "Missing required parameters: key, number/mobile, and amount" });
    }

    try {
      const trimmedKey = String(key).trim();
      const userQuery = await db.collection("users").where("apiKey", "==", trimmedKey).limit(1).get();
      if (userQuery.empty) {
        return res.status(200).json({ status: "failed", message: "Invalid wallet address or signature (API token not found)" });
      }

      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();
      const numAmount = parseFloat(String(amount));

      if (userData.isLocked || userData.freezeStatus) {
        return res.status(200).json({ status: "failed", message: "Your wallet features are frozen or locked. Contact Support." });
      }

      if (!userData.apiStatus) {
        return res.status(200).json({ status: "failed", message: "Production API access disabled for this gateway" });
      }

      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(200).json({ status: "failed", message: "Invalid payload amount." });
      }

      if (userData.balance < numAmount) {
        return res.status(200).json({ status: "error", message: "Balance not found / Insufficient balance" });
      }

      const cleanMobile = String(number).trim();
      const receiverQuery = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
      if (receiverQuery.empty) {
        return res.status(200).json({ status: "failed", message: "Receiver mobile number is not registered on SR GATEWAY" });
      }

      const receiverDoc = receiverQuery.docs[0];
      const receiverData = receiverDoc.data();

      if (receiverDoc.id === userDoc.id) {
        return res.status(200).json({ status: "failed", message: "Self API transfers are not permitted" });
      }

      const generatedTxnId = `TXN${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

      await db.runTransaction(async (transaction) => {
        const freshUserDoc = await transaction.get(userDoc.ref);
        const freshData = freshUserDoc.data()!;

        if (freshData.balance < numAmount) {
          throw new Error("Insufficient balance during API operation");
        }

        const freshReceiverDoc = await transaction.get(receiverDoc.ref);
        const freshReceiver = freshReceiverDoc.data()!;

        transaction.update(userDoc.ref, { balance: Number((freshData.balance - numAmount).toFixed(2)) });
        transaction.update(receiverDoc.ref, { balance: Number((freshReceiver.balance + numAmount).toFixed(2)) });

        // Sender's transaction record
        const txnRef = db.collection("transactions").doc();
        transaction.set(txnRef, {
          userId: userDoc.id,
          userName: userData.displayName,
          mobile: userData.mobile,
          type: "api-payout",
          status: "success",
          amount: numAmount,
          receiver: cleanMobile,
          receiverName: receiverData.displayName,
          comment: comment || "payout-api",
          id: generatedTxnId,
          timestamp: FieldValue.serverTimestamp(),
          description: `API Payout to ${receiverData.displayName}`
        });

        // Receiver's transaction record (deposit type for dynamic list UI green styling)
        const receiverTxnRef = db.collection("transactions").doc();
        transaction.set(receiverTxnRef, {
          userId: receiverDoc.id,
          userName: receiverData.displayName,
          mobile: receiverData.mobile,
          type: "api-received",
          status: "success",
          amount: numAmount,
          sender: userData.mobile,
          senderName: userData.displayName,
          id: generatedTxnId,
          timestamp: FieldValue.serverTimestamp(),
          description: `Received via API from ${userData.displayName}`
        });

        // Save trace inside apiLogs
        const logRef = db.collection("apiLogs").doc();
        transaction.set(logRef, {
          userId: userDoc.id,
          merchantName: userData.displayName,
          endpoint: "/api/pay",
          status: "success",
          amount: numAmount,
          receiver: cleanMobile,
          timestamp: FieldValue.serverTimestamp()
        });
      });

      const telegramPayload = {
        event: "API_PAYMENT_PROCESSED",
        bot: "@SRGatewayBot",
        merchant: {
          uid: userDoc.id,
          displayName: userData.displayName,
          mobile: userData.mobile
        },
        receiver: {
          uid: receiverDoc.id,
          displayName: receiverData.displayName,
          mobile: cleanMobile
        },
        transaction: {
          txn_id: generatedTxnId,
          amount_debited: numAmount,
          currency: "INR",
          type: "api-payout",
          category: "API se hua",
          comment: comment || "payout-api",
          timestamp: new Date().toISOString()
        },
        status: "SUCCESS"
      };

      await sendTelegramAlert(
        `<b>🔌 API Payment Processed! (@SRGatewayBot)</b>\n` +
        `<pre><code class="language-json">\n` +
        `${JSON.stringify(telegramPayload, null, 2)}\n` +
        `</code></pre>`
      );

      return res.status(200).json({
        status: "success",
        tx_id: generatedTxnId,
        message: "Transaction completed successfully",
        amount: numAmount,
        currency: "INR",
        category: "api-payout",
        sender: {
          uid: userDoc.id,
          displayName: userData.displayName,
          mobile: userData.mobile
        },
        receiver: {
          uid: receiverDoc.id,
          displayName: receiverData.displayName,
          mobile: cleanMobile
        },
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Payout API Route Error:", error);
      if (error.message === "Insufficient balance during API operation") {
        return res.status(200).json({ status: "error", message: "Balance not found / Insufficient balance" });
      }
      return res.status(200).json({
        status: "failed",
        message: error.message || "Failed to trigger gate endpoint"
      });
    }
  });

  // --- AUTOMATED ADMIN/SYSTEM BALANCES TRANFERS API ---
  app.all("/api/system/transfer", async (req, res) => {
    const method = req.method;
    const key = (method === "GET" ? req.query.key : req.body.key) as string;
    const number = (method === "GET" ? (req.query.number || req.query.mobile) : (req.body.number || req.body.mobile)) as string;
    const amountVal = parseFloat((method === "GET" ? req.query.amount : req.body.amount) as string);
    const mode = (method === "GET" ? req.query.mode : req.body.mode || "system") as string; // default is system credit (unlimited admin ledger)

    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    if (!key || !number || isNaN(amountVal) || amountVal <= 0) {
      return res.status(400).json({ status: "error", message: "Missing required parameters: key, number/mobile, and valid positive amount" });
    }

    try {
      // Find Admin by security key
      const adminQuery = await db.collection("users").where("apiKey", "==", key).limit(1).get();
      if (adminQuery.empty) {
        return res.status(401).json({ status: "error", message: "Invalid API signature token." });
      }

      const adminDoc = adminQuery.docs[0];
      const adminData = adminDoc.data();

      if (!adminData.isAdmin) {
        return res.status(403).json({ status: "error", message: "Access Denied: Only System Admin API keys can trigger balance disbursements." });
      }

      if (adminData.isLocked || adminData.freezeStatus) {
        return res.status(403).json({ status: "error", message: "Admin account is temporarily locked or frozen." });
      }

      // Find target user by mobile number
      const cleanMobile = number.trim();
      if (cleanMobile.length !== 10) {
        return res.status(400).json({ status: "error", message: "Please specify a valid 10-digit registered receiver number." });
      }

      const userQuery = await db.collection("users").where("mobile", "==", cleanMobile).limit(1).get();
      if (userQuery.empty) {
        return res.status(404).json({ status: "error", message: "Recipient user mobile number check failed: Not registered on this gateway." });
      }

      const userDoc = userQuery.docs[0];
      const userData = userDoc.data();

      if (userDoc.id === adminDoc.id) {
        return res.status(400).json({ status: "error", message: "Self transfers via system API credit are not allowed." });
      }

      const txnId = `SYS${Math.random().toString(36).substring(2, 11).toUpperCase()}`;

      await db.runTransaction(async (transaction) => {
        const freshAdminSnap = await transaction.get(adminDoc.ref);
        const freshAdmin = freshAdminSnap.data()!;
        
        const freshUserSnap = await transaction.get(userDoc.ref);
        const freshUser = freshUserSnap.data()!;

        // Wallet deduction logic on Admin account if mode is 'wallet'
        if (mode === "wallet") {
          if (freshAdmin.balance < amountVal) {
            throw new Error(`Insufficient Admin wallet balance (Available Hold: ₹${freshAdmin.balance})`);
          }
          transaction.update(adminDoc.ref, { balance: Number((freshAdmin.balance - amountVal).toFixed(2)) });
        }

        // Credit target user balance
        transaction.update(userDoc.ref, { balance: Number((freshUser.balance + amountVal).toFixed(2)) });

        // Save transaction record to receiver (api-received type)
        const receiverTxnRef = db.collection("transactions").doc();
        transaction.set(receiverTxnRef, {
          userId: userDoc.id,
          mobile: cleanMobile,
          id: txnId,
          type: "api-received",
          amount: amountVal,
          sender: adminData.mobile,
          senderName: adminData.displayName || "Administrative System",
          status: "success",
          timestamp: FieldValue.serverTimestamp(),
          description: mode === "wallet" 
            ? `Received via system admin wallet ${adminData.displayName}` 
            : `System credit deposited via API by Admin (${adminData.displayName || "System Admin"})`
        });

        // Save transaction record to admin/system sender (api-payout type)
        const adminTxnRef = db.collection("transactions").doc();
        transaction.set(adminTxnRef, {
          userId: adminDoc.id,
          mobile: adminData.mobile,
          id: txnId,
          type: "api-payout",
          amount: amountVal,
          receiver: cleanMobile,
          receiverName: userData.displayName,
          status: "success",
          timestamp: FieldValue.serverTimestamp(),
          description: mode === "wallet" 
            ? `Admin wallet disbursed via API to ${userData.displayName}` 
            : `System balance credit dispatch via API to ${userData.displayName}`
        });

        // Write API Log trace
        const logRef = db.collection("apiLogs").doc();
        transaction.set(logRef, {
          userId: adminDoc.id,
          merchantName: adminData.displayName,
          endpoint: "/api/system/transfer",
          status: "success",
          amount: amountVal,
          receiver: cleanMobile,
          timestamp: FieldValue.serverTimestamp()
        });
      });

      const telegramPayload = {
        event: "AUTOMATED_BALANCE_CREDIT_DISPATCH",
        bot: "@SRGatewayBot",
        administrator: {
          uid: adminDoc.id,
          displayName: adminData.displayName || "Administrative System",
          mobile: adminData.mobile
        },
        recipient: {
          uid: userDoc.id,
          displayName: userData.displayName,
          mobile: cleanMobile
        },
        transaction: {
          txn_id: txnId,
          amount_credited: amountVal,
          currency: "INR",
          mode: mode.toUpperCase(),
          type: "api-received",
          category: "API se hua",
          timestamp: new Date().toISOString()
        },
        status: "COMPLETED"
      };

      await sendTelegramAlert(
        `<b>⚡ Automated Balance Credit Dispatch! (@SRGatewayBot)</b>\n` +
        `<pre><code class="language-json">\n` +
        `${JSON.stringify(telegramPayload, null, 2)}\n` +
        `</code></pre>`
      );

      res.json({
        status: "success",
        message: "Automated wallet transfer completed successfully",
        data: {
          transaction_id: txnId,
          amount: amountVal,
          mode: mode,
          category: "api-received",
          sender: {
            uid: adminDoc.id,
            displayName: adminData.displayName,
            mobile: adminData.mobile
          },
          receiver: {
            uid: userDoc.id,
            displayName: userData.displayName,
            mobile: cleanMobile
          },
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error("System Automated Transfer Error:", error);
      res.status(500).json({ status: "error", message: error.message || "Failed to execute automated transfer node" });
    }
  });

  // --- REST Check Balance via Token ---
  app.get("/payment/balance", async (req, res) => {
    const { key } = req.query;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    if (!key) return res.status(400).json({ status: "error", message: "API Token key is required in parameters" });

    try {
      const userQuery = await db.collection("users").where("apiKey", "==", key).limit(1).get();
      if (userQuery.empty) return res.status(401).json({ status: "error", message: "Invalid API signature. Token not found." });

      const userData = userQuery.docs[0].data();
      res.json({
        status: "success",
        data: {
          merchant: userData.displayName,
          mobile: userData.mobile,
          balance: userData.balance,
          apiActive: !!userData.apiStatus
        }
      });
    } catch (error: any) {
      res.status(500).json({ status: "error", message: "Failed to pull ledger structure" });
    }
  });

  // --- REST Check Verification API ---
  app.get("/payment/verify", async (req, res) => {
    const { key, number } = req.query;
    res.json({
      status: "success",
      message: "API Node fully active",
      data: { valid: true, number }
    });
  });

  // --- USER LEVEL: Chat Live Support System ---
  app.post("/api/chat/send", authenticateToken, async (req: any, res) => {
    const { message } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    if (!message) return res.status(400).json({ status: "error", message: "Empty messages are not supported" });

    try {
      const chatRef = db.collection("chats").doc();
      await chatRef.set({
        id: chatRef.id,
        userId: req.user.uid,
        message,
        sender: "user",
        senderMobile: req.user.mobile,
        mobile: req.user.mobile,
        timestamp: FieldValue.serverTimestamp()
      });

      await sendTelegramAlert(
        `<b>💬 New Customer Chat Alert! (@srsaportbot)</b>\n\n` +
        `📞 User Contact: <code>${req.user.mobile}</code>\n` +
        `✉️ Message: <code>${message}</code>`
      );

      res.json({ status: "success", message: "Message dispatched" });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // --- CLAIM & CREATE CODES (User / Admin) ---
  app.post("/api/giftcode/create", authenticateToken, async (req: any, res) => {
    const { amount, limit, expiryHours, mpin } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    const codeAmount = parseFloat(amount);
    const usageLimit = parseInt(limit) || 1;

    if (isNaN(codeAmount) || codeAmount <= 0) {
      return res.status(400).json({ status: "error", message: "Enter a valid code reward value" });
    }

    try {
      const userRef = db.collection("users").doc(req.user.uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data()!;

      if (!userData.isAdmin && userData.pin !== mpin) {
        return res.status(400).json({ status: "error", message: "Invalid security credentials" });
      }

      if (!userData.isAdmin && userData.balance < (codeAmount * usageLimit)) {
        return res.status(400).json({ status: "error", message: "Insufficient wallet balance to generate codes" });
      }

      // Deduct balance if not admin
      if (!userData.isAdmin) {
        await userRef.update({ balance: userData.balance - (codeAmount * usageLimit) });
      }

      const generatedCode = `SR-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + (parseInt(expiryHours) || 24));

      await db.collection("giftCodes").doc(generatedCode).set({
        code: generatedCode,
        creatorId: req.user.uid,
        creatorMobile: req.user.mobile,
        amount: codeAmount,
        limit: usageLimit,
        claimedUsers: [],
        claimedAmount: 0,
        isUsed: false,
        expiresAt: Timestamp.fromDate(expiryDate),
        createdAt: FieldValue.serverTimestamp()
      });

      res.json({ status: "success", code: generatedCode, message: "Gift Code generated!" });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/giftcode/claim", authenticateToken, async (req: any, res) => {
    const { code } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    if (!code) return res.status(400).json({ status: "error", message: "Gift Code is required" });

    try {
      const codeRef = db.collection("giftCodes").doc(code.trim());
      const codeSnap = await codeRef.get();

      if (!codeSnap.exists) {
        return res.status(404).json({ status: "error", message: "This Gift Code does not exist" });
      }

      const codeData = codeSnap.data()!;

      if (codeData.isUsed || (codeData.claimedUsers && codeData.claimedUsers.length >= codeData.limit)) {
        return res.status(400).json({ status: "error", message: "This Gift Code usage limit has been reached" });
      }

      if (codeData.expiresAt) {
        const expires = codeData.expiresAt.toDate().getTime();
        if (Date.now() > expires) {
          return res.status(400).json({ status: "error", message: "This Gift Code has expired" });
        }
      }

      if (codeData.claimedUsers && codeData.claimedUsers.includes(req.user.uid)) {
        return res.status(400).json({ status: "error", message: "You have already claimed this gift code" });
      }

      const claimValue = codeData.amount; // fixed payout logic

      // Atomically run balance addition
      await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(req.user.uid);
        const freshUser = await transaction.get(userRef);
        const uData = freshUser.data()!;

        transaction.update(userRef, { balance: uData.balance + claimValue });

        const updatedUsersList = [...(codeData.claimedUsers || []), req.user.uid];
        const isNowUsed = updatedUsersList.length >= codeData.limit;

        transaction.update(codeRef, {
          claimedUsers: updatedUsersList,
          claimedAmount: (codeData.claimedAmount || 0) + claimValue,
          isUsed: isNowUsed
        });

        // Add txn receipt
        const txnRef = db.collection("transactions").doc();
        transaction.set(txnRef, {
          userId: req.user.uid,
          mobile: req.user.mobile,
          id: `CLM${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          type: "giftcode-claim",
          amount: claimValue,
          status: "success",
          timestamp: FieldValue.serverTimestamp(),
          description: `Claimed Gift Code ${code}`
        });
      });

      res.json({ status: "success", amount: claimValue, message: "Gift Code claimed successfully into balance!" });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // --- SR X LIFAFA SYSTEMS ---
  app.post("/api/lifafa/create", authenticateToken, async (req: any, res) => {
    const { amount, limit, type, channelLink, mpin } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    const totalVal = parseFloat(amount);
    const usersCount = parseInt(limit) || 1;

    if (isNaN(totalVal) || totalVal <= 0) {
      return res.status(400).json({ status: "error", message: "Enter a valid promo value" });
    }

    try {
      const userRef = db.collection("users").doc(req.user.uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data()!;

      if (!userData.isAdmin && userData.pin !== mpin) {
        return res.status(400).json({ status: "error", message: "Invalid security verification mpin" });
      }

      if (!userData.isAdmin && userData.balance < totalVal) {
        return res.status(400).json({ status: "error", message: "Insufficient balance to host Lifafa event" });
      }

      if (!userData.isAdmin) {
        await userRef.update({ balance: userData.balance - totalVal });
      }

      const generatedLId = `LFA-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      await db.collection("lifafas").doc(generatedLId).set({
        id: generatedLId,
        creatorId: req.user.uid,
        creatorMobile: req.user.mobile,
        totalVal,
        limit: usersCount,
        claimedUsers: [],
        type: type || "fixed", // random vs fixed rewards
        channelJoinRequired: channelLink || "",
        claimedAmount: 0,
        createdAt: FieldValue.serverTimestamp()
      });

      res.json({ status: "success", id: generatedLId, message: "SR X Lifafa Live now!" });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/lifafa/claim", authenticateToken, async (req: any, res) => {
    const { id } = req.body;
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "DB offline" });

    try {
      const lRef = db.collection("lifafas").doc(id);
      const lSnap = await lRef.get();
      if (!lSnap.exists) return res.status(404).json({ status: "error", message: "This SR X Lifafa expired or doesn't exist" });

      const lData = lSnap.data()!;

      if (lData.claimedUsers && lData.claimedUsers.includes(req.user.uid)) {
        return res.status(400).json({ status: "error", message: "You have already claim-scratched this Lifafa reward" });
      }

      if (lData.claimedUsers && lData.claimedUsers.length >= lData.limit) {
        return res.status(400).json({ status: "error", message: "Lifafa limit fully consumed by other players" });
      }

      let prizeAmount = 0;
      if (lData.type === "fixed") {
        prizeAmount = Number((lData.totalVal / lData.limit).toFixed(2));
      } else {
        // Random amount logic
        const remainingUsers = lData.limit - lData.claimedUsers.length;
        const remainingVal = lData.totalVal - lData.claimedAmount;
        if (remainingUsers === 1) {
          prizeAmount = Number(remainingVal.toFixed(2));
        } else {
          const maxReward = (remainingVal / remainingUsers) * 1.8;
          prizeAmount = Number((Math.random() * maxReward + 1).toFixed(2));
          if (prizeAmount > remainingVal - 1) {
            prizeAmount = Number((remainingVal / 2).toFixed(2));
          }
        }
      }

      await db.runTransaction(async (transaction) => {
        const uRef = db.collection("users").doc(req.user.uid);
        const freshUser = await transaction.get(uRef);
        const uData = freshUser.data()!;

        transaction.update(uRef, { balance: uData.balance + prizeAmount });

        const nextClaimedUsers = [...(lData.claimedUsers || []), req.user.uid];
        const nextClaimedAmount = Number(((lData.claimedAmount || 0) + prizeAmount).toFixed(2));

        transaction.update(lRef, {
          claimedUsers: nextClaimedUsers,
          claimedAmount: nextClaimedAmount
        });

        // Add transaction entry
        const txnRef = db.collection("transactions").doc();
        transaction.set(txnRef, {
          userId: req.user.uid,
          mobile: req.user.mobile,
          id: `LF${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          type: "lifafa-scratch",
          amount: prizeAmount,
          status: "success",
          timestamp: FieldValue.serverTimestamp(),
          description: `SR X Lifafa claim ID ${id}`
        });
      });

      res.json({ status: "success", amount: prizeAmount, message: "Congratulations! You scratched and claimed the reward successfully." });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  // --- HIDDEN ADMIN ROUTE FOR COMPREHENSIVE CONTROL ---
  // API endpoints starting with /api/admin/*
  app.get("/api/admin/users", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin access only" });
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "DB offline" });
    try {
      const snap = await db.collection("users").orderBy("createdAt", "desc").get();
      const usersList = snap.docs.map(doc => doc.data());
      res.json({ status: "success", users: usersList });
    } catch(e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/balance-adjust", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin access only" });
    const { targetUid, amount, action } = req.body; // action: 'credit' or 'debit'
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "DB offline" });

    const offsetVal = parseFloat(amount);
    if (isNaN(offsetVal) || offsetVal <= 0) return res.status(400).json({ status: "error", message: "Invalid amount balance shift" });

    try {
      const userRef = db.collection("users").doc(targetUid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) return res.status(404).json({ status: "error", message: "Merchant not found" });

      const userData = userSnap.data()!;
      let finalBal = userData.balance;
      
      if (action === "credit") {
        finalBal += offsetVal;
      } else {
        finalBal = Math.max(0, finalBal - offsetVal);
      }

      await userRef.update({ balance: finalBal });

      // Record logs
      const txnRef = db.collection("transactions").doc();
      await txnRef.set({
        userId: targetUid,
        mobile: userData.mobile,
        id: `SYS${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
        type: action === "credit" ? "deposit" : "debit",
        status: "success",
        amount: offsetVal,
        timestamp: FieldValue.serverTimestamp(),
        description: `Operational Shift (${action === "credit" ? "Credited" : "Debited"} by Administration)`
      });

      res.json({ status: "success", message: `Account balance updated! Current wallet hold: ₹${finalBal}` });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/toggle-freeze", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin access only" });
    const { targetUid } = req.body;
    const db = getDb();
    try {
      const uRef = db.collection("users").doc(targetUid);
      const uSnap = await uRef.get();
      const current = uSnap.data()?.freezeStatus || false;
      await uRef.update({ freezeStatus: !current });
      res.json({ status: "success", message: `Wallet freeze status switched to ${!current}` });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/toggle-api", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin access only" });
    const { targetUid } = req.body;
    const db = getDb();
    try {
      const uRef = db.collection("users").doc(targetUid);
      const uSnap = await uRef.get();
      const current = uSnap.data()?.apiStatus !== false; // defaults to true
      await uRef.update({ apiStatus: !current });
      res.json({ status: "success", message: `API active state switched to ${!current}` });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/unlock-lock", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin access only" });
    const { targetUid, lockState } = req.body; // lockState: true/false
    const db = getDb();
    try {
      await db.collection("users").doc(targetUid).update({
        isLocked: lockState,
        mpinAttempts: 0,
        lockExpires: null
      });
      res.json({ status: "success", message: `Account block status update done. Locked: ${lockState}` });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/reset-mpin", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin access only" });
    const { targetUid } = req.body;
    const db = getDb();
    try {
      await db.collection("users").doc(targetUid).update({ pin: null });
      res.json({ status: "success", message: "Merchant security MPIN has been reset successfully" });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.get("/api/admin/transactions", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin restricted" });
    const db = getDb();
    try {
      const snap = await db.collection("transactions").orderBy("timestamp", "desc").limit(100).get();
      res.json({ status: "success", transactions: snap.docs.map(doc => doc.data()) });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.get("/api/admin/apiLogs", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin space" });
    const db = getDb();
    try {
      const snap = await db.collection("apiLogs").orderBy("timestamp", "desc").limit(100).get();
      res.json({ status: "success", logs: snap.docs.map(doc => doc.data()) });
    } catch(e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.get("/api/admin/chats", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin space only" });
    const db = getDb();
    try {
      const snap = await db.collection("chats").orderBy("timestamp", "asc").get();
      res.json({ status: "success", chats: snap.docs.map(doc => doc.data()) });
    } catch(e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/chat/reply", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin space only" });
    const { targetUid, message } = req.body;
    const db = getDb();
    try {
      const userSnap = await db.collection("users").doc(targetUid).get();
      const userMobile = userSnap.exists ? userSnap.data()?.mobile : "";

      const replyRef = db.collection("chats").doc();
      await replyRef.set({
        id: replyRef.id,
        userId: targetUid,
        mobile: userMobile,
        message,
        sender: "admin",
        timestamp: FieldValue.serverTimestamp()
      });
      res.json({ status: "success", message: "Reply delivered" });
    } catch(e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });

  app.post("/api/admin/payout/action", authenticateToken, async (req: any, res) => {
    if (!req.user.isAdmin) return res.status(403).json({ status: "error", message: "Admin restrict" });
    const { txnId, action } = req.body; // action: 'approve' or 'reject'
    const db = getDb();
    if (!db) return res.status(500).json({ status: "error", message: "Database offline" });

    try {
      // Find matching transaction
      const snap = await db.collection("transactions").where("id", "==", txnId).limit(1).get();
      if (snap.empty) return res.status(404).json({ status: "error", message: "Payout record not found" });

      const txnDoc = snap.docs[0];
      const txnData = txnDoc.data();

      if (txnData.status !== "pending") {
        return res.status(400).json({ status: "error", message: "This request was already completed" });
      }

      await db.runTransaction(async (transaction) => {
        const uRef = db.collection("users").doc(txnData.userId);
        const freshUser = await transaction.get(uRef);
        const uData = freshUser.data()!;

        if (action === "approve") {
          transaction.update(txnDoc.ref, { status: "success" });
          if (txnData.type === "deposit") {
            transaction.update(uRef, { balance: uData.balance + txnData.amount });
          }
        } else {
          transaction.update(txnDoc.ref, { status: "failed" });
        }
      });

      res.json({ status: "success", message: `Transaction request ${action}ed!` });
    } catch (e: any) {
      res.status(500).json({ status: "error", message: e.message });
    }
  });


  // --- Vercel/Config compatibility endpoints preserved ---
  app.get("/api/config", (req, res) => {
    res.json({
      hasGlobalVercelToken: !!process.env.VERCEL_TOKEN,
      hasGlobalGithubToken: !!process.env.GITHUB_TOKEN
    });
  });

  // --- Source code ZIP download helper route ---
  app.get("/api/download-zip", async (req, res) => {
    const tmpFilePath = path.join("/tmp", `sr-gateway-source-${Date.now()}.zip`);
    try {
      const output = fs.createWriteStream(tmpFilePath);
      const archive = new ZipArchive({ zlib: { level: 9 } });

      archive.on("error", (err) => {
        console.error("Archive error:", err);
        if (!res.headersSent) {
          res.status(500).json({ status: "error", message: err.message });
        }
        try {
          if (fs.existsSync(tmpFilePath)) {
            fs.unlinkSync(tmpFilePath);
          }
        } catch (e) {}
      });

      archive.pipe(output);

      archive.glob("**/*", {
        cwd: process.cwd(),
        ignore: [
          "node_modules/**",
          "dist/**",
          ".git/**",
          "*.zip",
          ".env",
          ".env.local"
        ],
        dot: true
      });

      output.on("close", () => {
        if (!res.headersSent) {
          res.download(tmpFilePath, "sr-gateway-in-source.zip", (err) => {
            try {
              if (fs.existsSync(tmpFilePath)) {
                fs.unlinkSync(tmpFilePath);
              }
            } catch (unlinkErr) {
              console.error("Failed to delete tmp archive:", unlinkErr);
            }
          });
        }
      });

      await archive.finalize();
    } catch (error: any) {
      console.error("Download ZIP failed in main handler:", error);
      if (!res.headersSent) {
        res.status(500).json({ status: "error", message: error.message });
      }
      try {
        if (fs.existsSync(tmpFilePath)) {
          fs.unlinkSync(tmpFilePath);
        }
      } catch (e) {}
    }
  });

  // Vite middleware for development
  const distPath = path.join(process.cwd(), "dist");
  if (process.env.NODE_ENV !== "production" || !fs.existsSync(distPath)) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    // Fallback for SPA routing in development/Vite mode
    app.get("*", async (req, res, next) => {
      // Ignore API requests
      if (req.originalUrl.startsWith("/api/")) {
        return next();
      }
      try {
        const htmlPath = path.resolve(process.cwd(), "index.html");
        let html = fs.readFileSync(htmlPath, "utf-8");
        // Apply Vite HTML transforms
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express microserver handles inputs on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("FATAL: Server booting failure:", err);
  process.exit(1);
});
