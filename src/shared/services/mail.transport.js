import nodemailer from 'nodemailer';
import { config } from '../../config/config.js';
import { Logger } from '../../config/logger.js';

class MailTransport {
  constructor() {
    this.log = new Logger('MailTransport');
    this.transporter = null;
    this._initTransporter();
  }

  _initTransporter() {
    try {

      if (config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS) {
        this.transporter = nodemailer.createTransport({
          host: config.SMTP_HOST,
          port: Number(config.SMTP_PORT) || 587,
          secure: Number(config.SMTP_PORT) === 465,
          auth: {
            user: config.SMTP_USER,
            pass: config.SMTP_PASS,
          },

          tls: { rejectUnauthorized: false },
        });
        this.senderEmail = config.SMTP_USER;
        this.senderName = config.SMTP_FROM_NAME || 'Casagen';
        this.log.info(`Mail transporter initialised via SMTP: ${config.SMTP_HOST}:${config.SMTP_PORT}`);
        return;
      }

      if (config.SENDER_EMAIL && config.SENDER_EMAIL_PASSWORD) {
        this.transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: config.SENDER_EMAIL,
            pass: config.SENDER_EMAIL_PASSWORD,
          },
        });
        this.senderEmail = config.SENDER_EMAIL;
        this.senderName = 'Casagen';
        this.log.info(`Mail transporter initialised via Gmail: ${config.SENDER_EMAIL}`);
        return;
      }

      // ── No config found ───────────────────────────────────────────────
      this.log.warn(
        'No mail transport configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS ' +
        'or SENDER_EMAIL/SENDER_EMAIL_PASSWORD in your .env'
      );
    } catch (error) {
      this.log.error(`Failed to initialise mail transporter: ${error.message}`);
    }
  }

  async verify() {
    if (!this.transporter) {
      this.log.warn('Mail verify skipped — no transporter configured.');
      return false;
    }
    try {
      await this.transporter.verify();
      this.log.info('SMTP connection verified successfully ✓');
      return true;
    } catch (err) {
      // Log the RAW nodemailer error so you can see exactly what is wrong
      this.log.error(`SMTP verify failed: ${err.message}`);
      return false;
    }
  }

  async _sendMail({ to, subject, html }) {
    if (!this.transporter) {
      const msg = 'Email not sent — no transporter configured. Check your .env SMTP settings.';
      this.log.warn(msg);
      throw new Error(msg);
    }

    const mailOptions = {
      from: `"${this.senderName}" <${this.senderEmail}>`,
      to,
      subject,
      html,
      text: html.replace(/<[^>]*>/g, ''),
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      this.log.info(`Email sent: "${subject}" → ${to} [${info.messageId}]`);
      return info;
    } catch (error) {
      this.log.error(`sendMail failed to ${to}: [${error.code}] ${error.message}`);
      throw error;
    }
  }

  async sendOtpEmail(email, otp, name, purpose = 'verify') {
    const displayName = name || 'there';

    let purposeText = '';
    let title = '';

    switch (purpose) {
      case 'login':
        purposeText = 'sign in to';
        title = 'Your Login Verification Code';
        break;
      case 'password_reset':
        purposeText = 'reset your password for';
        title = 'Password Reset Verification Code';
        break;
      default:
        purposeText = 'verify your email for';
        title = 'Verify Your Email';
    }

    const subject =
      purpose === 'password_reset'
        ? `${otp} is your Casagen password reset code`
        : `${otp} is your Casagen verification code`;

    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <style>
      body { margin:0; padding:0; background:#f4f4f5; font-family:Arial,sans-serif; }
      .wrapper { max-width:560px; margin:40px auto; background:#fff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(0,0,0,.08); }
      .header { background:#18181b; padding:32px 40px; text-align:center; }
      .header h1 { color:#fff; margin:0; font-size:24px; letter-spacing:-0.5px; }
      .body { padding:40px; color:#3f3f46; }
      .body h2 { font-size:20px; color:#18181b; margin-top:0; }
      .body p { font-size:15px; line-height:1.6; margin:0 0 16px; }
      .otp-box { text-align:center; margin:32px 0; }
      .otp-code { display:inline-block; background:#f4f4f5; border:2px dashed #d4d4d8; border-radius:10px; padding:20px 40px; font-size:42px; font-weight:800; letter-spacing:12px; color:#18181b; font-family:'Courier New',monospace; }
      .expire-note { text-align:center; font-size:13px; color:#71717a; margin-top:-16px; }
      .warning { background:#fef3c7; border-left:4px solid #f59e0b; padding:12px 16px; border-radius:4px; font-size:13px; color:#78350f; margin-top:24px; }
      .footer { padding:24px 40px; text-align:center; font-size:13px; color:#a1a1aa; border-top:1px solid #f4f4f5; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header"><h1>Casagen</h1></div>
      <div class="body">
        <h2>${title}</h2>
        <p>Hi ${displayName},</p>
        <p>Use the code below to ${purposeText} your Casagen account. This code expires in <strong>10 minutes</strong>.</p>
        <div class="otp-box">
          <div class="otp-code">${otp}</div>
        </div>
        <p class="expire-note">Expires in 10 minutes</p>
        <div class="warning">⚠️ Never share this code with anyone. Casagen will never ask for it.</div>
        <p style="margin-top:24px;font-size:13px;color:#71717a;">If you didn't request this code, you can safely ignore this email.</p>
      </div>
      <div class="footer">&copy; ${new Date().getFullYear()} Casagen. All rights reserved.</div>
    </div>
  </body>
</html>`;

    return this._sendMail({ to: email, subject, html });
  }


  async sendPasswordResetEmail(email, resetUrl, name) {
    const displayName = name || 'there';
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <style>
      body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;}
      .wrapper{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);}
      .header{background:#18181b;padding:32px 40px;text-align:center;}
      .header h1{color:#fff;margin:0;font-size:24px;}
      .body{padding:40px;color:#3f3f46;}
      .body h2{font-size:20px;color:#18181b;margin-top:0;}
      .body p{font-size:15px;line-height:1.6;}
      .btn-wrap{text-align:center;margin:32px 0;}
      .btn{display:inline-block;background:#18181b;color:#fff!important;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;}
      .url-box{background:#f4f4f5;border-radius:4px;padding:12px 16px;font-size:13px;word-break:break-all;color:#71717a;}
      .footer{padding:24px 40px;text-align:center;font-size:13px;color:#a1a1aa;border-top:1px solid #f4f4f5;}
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header"><h1>Casagen</h1></div>
      <div class="body">
        <h2>Reset your password</h2>
        <p>Hi ${displayName},</p>
        <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <div class="btn-wrap"><a href="${resetUrl}" class="btn">Reset Password</a></div>
        <p style="font-size:13px;color:#71717a;">If the button doesn't work, copy this link:</p>
        <div class="url-box">${resetUrl}</div>
        <p style="margin-top:24px;font-size:13px;color:#71717a;">If you didn't request this, ignore this email.</p>
      </div>
      <div class="footer">&copy; ${new Date().getFullYear()} Casagen. All rights reserved.</div>
    </div>
  </body>
</html>`;
    return this._sendMail({ to: email, subject: 'Reset your Casagen password', html });
  }

  async sendWelcomeEmail(email, name) {
    const displayName = name || 'there';
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8"/>
    <style>
      body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;}
      .wrapper{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);}
      .header{background:#18181b;padding:32px 40px;text-align:center;}
      .header h1{color:#fff;margin:0;font-size:24px;}
      .body{padding:40px;color:#3f3f46;}
      .body h2{font-size:20px;color:#18181b;margin-top:0;}
      .body p{font-size:15px;line-height:1.6;}
      .footer{padding:24px 40px;text-align:center;font-size:13px;color:#a1a1aa;border-top:1px solid #f4f4f5;}
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header"><h1>Casagen</h1></div>
      <div class="body">
        <h2>Welcome, ${displayName}! 🎉</h2>
        <p>Your Casagen account is verified and ready. You have <strong>1 free credit</strong> to get started.</p>
        <p>If you have any questions, just reply to this email.</p>
      </div>
      <div class="footer">&copy; ${new Date().getFullYear()} Casagen. All rights reserved.</div>
    </div>
  </body>
</html>`;
    return this._sendMail({ to: email, subject: 'Welcome to Casagen!', html });
  }

  // ─── Password Changed Notification ─────────────────────────────────────────

  async sendPasswordChangedEmail(email, name) {
    const displayName = name || 'there';
    const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8"/>
    <style>
      body{margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;}
      .wrapper{max-width:600px;margin:40px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);}
      .header{background:#18181b;padding:32px 40px;text-align:center;}
      .header h1{color:#fff;margin:0;font-size:24px;}
      .body{padding:40px;color:#3f3f46;}
      .body h2{font-size:20px;color:#18181b;margin-top:0;}
      .body p{font-size:15px;line-height:1.6;}
      .footer{padding:24px 40px;text-align:center;font-size:13px;color:#a1a1aa;border-top:1px solid #f4f4f5;}
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header"><h1>Casagen</h1></div>
      <div class="body">
        <h2>Password changed</h2>
        <p>Hi ${displayName},</p>
        <p>Your Casagen password was successfully changed. If you didn't do this, contact us immediately.</p>
      </div>
      <div class="footer">&copy; ${new Date().getFullYear()} Casagen. All rights reserved.</div>
    </div>
  </body>
</html>`;
    return this._sendMail({ to: email, subject: 'Your Casagen password has been changed', html });
  }
}

export const mailTransport = new MailTransport();