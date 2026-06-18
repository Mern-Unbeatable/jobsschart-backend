const nodemailer = require('nodemailer');
const { config } = require('winston');

const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    auth: { user: config.email.user, pass: config.email.pass },
});

const sendEmail = async ({ to, subject, html }) => {
    await transporter.sendMail({
        from: `"Netwerkmediums" <${config.email.from}>`,
        to, subject, html,
    });
};

const sendWelcomeEmail = (user) =>
    sendEmail({
        to: user.email,
        subject: 'Welkom bij Netwerkmediums!',
        html: `<h1>Welkom ${user.username}!</h1><p>Bedankt voor je registratie.</p>`,
    });

const sendPasswordResetEmail = (user, token) =>
    sendEmail({
        to: user.email,
        subject: 'Wachtwoord opnieuw instellen',
        html: `<p>Reset link: ${config.clientUrl}/reset-password?token=${token}</p><p>Verloopt na 1 uur.</p>`,
    });

const sendConsultationSummaryEmail = (user, call) => {
    const mins = Math.ceil((call.durationSeconds || 0) / 60);
    return sendEmail({
        to: user.email,
        subject: 'Samenvatting van uw consultatie',
        html: `<h2>Consultatie Samenvatting</h2>
      <ul>
        <li>Type: ${call.callType}</li>
        <li>Duur: ${mins} minuten</li>
        <li>Kosten: €${call.totalCost}</li>
      </ul>`,
    });
};

module.exports = { sendEmail, sendWelcomeEmail, sendPasswordResetEmail, sendConsultationSummaryEmail };