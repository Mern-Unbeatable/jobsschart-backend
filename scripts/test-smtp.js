/**
 * Standalone SMTP connectivity + send test.
 * Usage (from server/):
 *   node scripts/test-smtp.js
 *   node scripts/test-smtp.js you@example.com
 */
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const from = process.env.SMTP_FROM || user;
const to = process.argv[2] || user;

function suggestHost(email = "") {
  const domain = String(email).split("@")[1]?.toLowerCase() || "";
  if (domain.includes("gmail")) return "smtp.gmail.com";
  if (
    domain.includes("hotmail") ||
    domain.includes("outlook") ||
    domain.includes("live") ||
    domain.includes("msn")
  ) {
    return "smtp.office365.com";
  }
  return null;
}

async function main() {
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("SMTP TEST");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("HOST :", host || "(missing)");
  console.log("PORT :", port);
  console.log("USER :", user || "(missing)");
  console.log("FROM :", from || "(missing)");
  console.log("TO   :", to || "(missing)");
  console.log("PASS :", pass ? `set (${pass.length} chars)` : "(missing)");

  if (!host || !user || !pass) {
    console.error("\n✗ Missing SMTP_HOST / SMTP_USER / SMTP_PASS in server/.env");
    process.exit(1);
  }

  const suggested = suggestHost(user);
  if (suggested && suggested !== host) {
    console.warn(
      `\n⚠ USER looks like ${user.split("@")[1]}, but SMTP_HOST is "${host}".`,
    );
    console.warn(`  Suggested host: "${suggested}"`);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  console.log("\n1) Verifying SMTP connection...");
  try {
    await transporter.verify();
    console.log("✓ SMTP verify OK");
  } catch (err) {
    console.error("✗ SMTP verify FAILED");
    console.error(" ", err.message);
    if (err.response) console.error("  response:", err.response);
    if (err.code) console.error("  code:", err.code);
    process.exit(1);
  }

  console.log("\n2) Sending test email...");
  try {
    const info = await transporter.sendMail({
      from: `"Illorac SMTP Test" <${from}>`,
      to,
      subject: `SMTP test OK — ${new Date().toISOString()}`,
      text: "This is a test email from scripts/test-smtp.js. SMTP is working.",
      html: "<p>This is a test email from <code>scripts/test-smtp.js</code>.</p><p><strong>SMTP is working.</strong></p>",
    });
    console.log("✓ Test email sent");
    console.log("  messageId:", info.messageId);
    console.log("  accepted:", info.accepted);
    console.log("  response:", info.response);
  } catch (err) {
    console.error("✗ Test email FAILED");
    console.error(" ", err.message);
    if (err.response) console.error("  response:", err.response);
    if (err.code) console.error("  code:", err.code);
    process.exit(1);
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("RESULT: SMTP working");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
