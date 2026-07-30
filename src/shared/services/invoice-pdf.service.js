import puppeteer from 'puppeteer';
import PDFDocument from 'pdfkit';
import { Logger } from '../../config/logger.js';

const log = new Logger('InvoicePdfService');

const BRAND_COLOR = '#6E35AE';

let browserPromise = null;

function getPuppeteerLaunchOptions() {
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  return executablePath ? { headless: true, args, executablePath } : { headless: true, args };
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch(getPuppeteerLaunchOptions()).catch((err) => {
      browserPromise = null;
      throw err;
    });
  }
  return browserPromise;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(amount) {
  return `€${Number(amount || 0).toFixed(2)}`;
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function describeSession(callId) {
  const id = String(callId || '');
  if (id.startsWith('chat_')) return 'Chat consultation';
  if (id.includes('video') || id.includes('VIDEO')) return 'Video consultation';
  return 'Voice / video consultation';
}

function buildInvoiceHtml(data) {
  const {
    invoiceNumber,
    periodLabel,
    issueDate,
    consultantName,
    consultantEmail,
    kvkNumber,
    cityOfResidence,
    businessBankAccount,
    lineItems,
    totalGross,
    totalShare,
    totalPlatform,
  } = data;

  const rowsHtml = lineItems.map((item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${formatDate(item.date)}</td>
            <td>${escapeHtml(describeSession(item.callId))}</td>
            <td class="mono">${escapeHtml(item.callId?.slice(0, 24) || '—')}${item.callId?.length > 24 ? '…' : ''}</td>
            <td class="num">${item.minutes}</td>
            <td class="num">${formatMoney(item.grossAmount)}</td>
            <td class="num strong">${formatMoney(item.consultantShare)}</td>
        </tr>
    `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      color: #1f2937;
      font-size: 11px;
      line-height: 1.5;
      padding: 40px 48px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 3px solid #6E35AE;
    }
    .brand {
      font-size: 28px;
      font-weight: 700;
      color: #6E35AE;
      letter-spacing: -0.5px;
    }
    .brand-sub {
      font-size: 11px;
      color: #6b7280;
      margin-top: 4px;
    }
    .invoice-meta {
      text-align: right;
    }
    .invoice-title {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 8px;
    }
    .invoice-meta p { color: #4b5563; margin-bottom: 2px; }
    .invoice-meta strong { color: #111827; }
    .parties {
      display: flex;
      gap: 40px;
      margin-bottom: 28px;
    }
    .party {
      flex: 1;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
    }
    .party h3 {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6E35AE;
      margin-bottom: 8px;
      font-weight: 700;
    }
    .party p { margin-bottom: 3px; color: #374151; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    thead th {
      background: #6E35AE;
      color: #fff;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
    }
    thead th.num { text-align: right; }
    tbody td {
      padding: 9px 8px;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: top;
    }
    tbody tr:nth-child(even) { background: #fafafa; }
    td.num { text-align: right; }
    td.mono { font-family: 'Courier New', monospace; font-size: 9px; color: #6b7280; }
    td.strong { font-weight: 700; color: #6E35AE; }
    .totals {
      margin-left: auto;
      width: 280px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid #e5e7eb;
    }
    .totals-row:last-child {
      border-bottom: none;
      background: #6E35AE;
      color: #fff;
      font-weight: 700;
      font-size: 13px;
    }
    .footer {
      margin-top: 36px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 9px;
      color: #6b7280;
      line-height: 1.6;
    }
    .footer strong { color: #374151; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">Illorac</div>
      <div class="brand-sub"> Consultation Platform · illorac.nl</div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">Monthly Earnings Invoice</div>
      <p><strong>Invoice No:</strong> ${escapeHtml(invoiceNumber)}</p>
      <p><strong>Period:</strong> ${escapeHtml(periodLabel)}</p>
      <p><strong>Issue Date:</strong> ${escapeHtml(issueDate)}</p>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <h3>Platform</h3>
      <p><strong>Illorac</strong></p>
      <p>illorac.nl</p>
      <p>Netherlands</p>
    </div>
    <div class="party">
      <h3>Consultant</h3>
      <p><strong>${escapeHtml(consultantName)}</strong></p>
      <p>${escapeHtml(consultantEmail)}</p>
      ${kvkNumber ? `<p>KvK: ${escapeHtml(kvkNumber)}</p>` : ''}
      ${cityOfResidence ? `<p>${escapeHtml(cityOfResidence)}</p>` : ''}
      ${businessBankAccount ? `<p>IBAN: ${escapeHtml(businessBankAccount)}</p>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Date</th>
        <th>Service</th>
        <th>Reference</th>
        <th class="num">Min</th>
        <th class="num">Gross</th>
        <th class="num">Your Share</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Total Gross</span>
      <span>${formatMoney(totalGross)}</span>
    </div>
    <div class="totals-row">
      <span>Platform Fee</span>
      <span>${formatMoney(totalPlatform)}</span>
    </div>
    <div class="totals-row">
      <span>Total Consultant Earnings</span>
      <span>${formatMoney(totalShare)}</span>
    </div>
  </div>

  <div class="footer">
    <p><strong>Document purpose:</strong> This invoice summarizes your consultation earnings on the Illorac platform for <strong>${escapeHtml(periodLabel)}</strong>. The "Your Share" column reflects amounts credited to your consultant earnings balance after platform fees.</p>
    <p style="margin-top:8px;">Retain this document for your accounting and tax records. For questions, contact support via illorac.nl.</p>
    <p style="margin-top:8px;">Generated automatically by Illorac · ${escapeHtml(issueDate)}</p>
  </div>
</body>
</html>`;
}

async function generateWithPuppeteer(html) {
  let page;
  try {
    const browser = await getBrowser();
    page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' },
    });
    await page.close();
    return Buffer.from(pdfBuffer);
  } catch (err) {
    if (page) await page.close().catch(() => { });
    browserPromise = null;
    throw err;
  }
}

function generateWithPdfKit(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const {
      invoiceNumber,
      periodLabel,
      issueDate,
      consultantName,
      consultantEmail,
      kvkNumber,
      cityOfResidence,
      businessBankAccount,
      lineItems,
      totalGross,
      totalShare,
      totalPlatform,
    } = data;

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    doc.fillColor(BRAND_COLOR).fontSize(26).font('Helvetica-Bold').text('Illorac', { continued: false });
    doc.fillColor('#6b7280').fontSize(10).font('Helvetica').text('Consultation Platform · illorac.nl');

    doc.fillColor('#111827').fontSize(18).font('Helvetica-Bold')
      .text('Monthly Earnings Invoice', doc.page.margins.left, 48, { align: 'right', width: pageWidth });
    doc.fillColor('#4b5563').fontSize(10).font('Helvetica')
      .text(`Invoice No: ${invoiceNumber}`, { align: 'right', width: pageWidth })
      .text(`Period: ${periodLabel}`, { align: 'right', width: pageWidth })
      .text(`Issue Date: ${issueDate}`, { align: 'right', width: pageWidth });

    doc.moveDown(1.5);
    doc.strokeColor(BRAND_COLOR).lineWidth(3)
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .stroke();
    doc.moveDown(1);

    const partyY = doc.y;
    doc.fillColor(BRAND_COLOR).fontSize(9).font('Helvetica-Bold').text('PLATFORM', doc.page.margins.left, partyY);
    doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text('Illorac');
    doc.font('Helvetica').fillColor('#374151').text('illorac.nl').text('Netherlands');

    const consultantX = doc.page.margins.left + pageWidth / 2;
    doc.fillColor(BRAND_COLOR).fontSize(9).font('Helvetica-Bold').text('CONSULTANT', consultantX, partyY);
    doc.fillColor('#111827').fontSize(10).font('Helvetica-Bold').text(consultantName, consultantX);
    doc.font('Helvetica').fillColor('#374151').text(consultantEmail, consultantX);
    if (kvkNumber) doc.text(`KvK: ${kvkNumber}`, consultantX);
    if (cityOfResidence) doc.text(cityOfResidence, consultantX);
    if (businessBankAccount) doc.text(`IBAN: ${businessBankAccount}`, consultantX);

    doc.moveDown(2);

    const colWidths = [22, 58, 95, 95, 32, 52, 62];
    const headers = ['#', 'Date', 'Service', 'Reference', 'Min', 'Gross', 'Your Share'];
    const tableLeft = doc.page.margins.left;
    let tableTop = doc.y;

    doc.rect(tableLeft, tableTop, pageWidth, 20).fill(BRAND_COLOR);
    let x = tableLeft + 4;
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    headers.forEach((header, i) => {
      const align = i >= 4 ? 'right' : 'left';
      const w = colWidths[i] - 4;
      doc.text(header, x, tableTop + 6, { width: w, align });
      x += colWidths[i];
    });

    tableTop += 20;
    doc.font('Helvetica').fontSize(8).fillColor('#1f2937');

    lineItems.forEach((item, index) => {
      if (tableTop > doc.page.height - 120) {
        doc.addPage();
        tableTop = doc.page.margins.top;
      }

      if (index % 2 === 1) {
        doc.rect(tableLeft, tableTop, pageWidth, 18).fill('#fafafa');
        doc.fillColor('#1f2937');
      }

      const row = [
        String(index + 1),
        formatDate(item.date),
        describeSession(item.callId),
        String(item.callId || '—').slice(0, 18),
        String(item.minutes),
        formatMoney(item.grossAmount),
        formatMoney(item.consultantShare),
      ];

      x = tableLeft + 4;
      row.forEach((cell, i) => {
        const align = i >= 4 ? 'right' : 'left';
        const w = colWidths[i] - 4;
        doc.text(cell, x, tableTop + 5, { width: w, align });
        x += colWidths[i];
      });

      tableTop += 18;
      doc.moveTo(tableLeft, tableTop).lineTo(tableLeft + pageWidth, tableTop).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    });

    doc.y = tableTop + 16;
    const totalsX = doc.page.width - doc.page.margins.right - 220;
    const totals = [
      ['Total Gross', formatMoney(totalGross)],
      ['Platform Fee', formatMoney(totalPlatform)],
      ['Total Consultant Earnings', formatMoney(totalShare)],
    ];

    totals.forEach(([label, value], i) => {
      const isLast = i === totals.length - 1;
      if (isLast) {
        doc.rect(totalsX, doc.y, 220, 22).fill(BRAND_COLOR);
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(11);
      } else {
        doc.fillColor('#374151').font('Helvetica').fontSize(10);
      }
      doc.text(label, totalsX + 10, doc.y + 6, { width: 130, continued: false });
      doc.text(value, totalsX + 10, doc.y - (isLast ? 16 : 14), { width: 200, align: 'right' });
      if (!isLast) doc.moveDown(0.3);
    });

    doc.moveDown(2);
    doc.fillColor('#6b7280').fontSize(8).font('Helvetica')
      .text(
        `Document purpose: This invoice summarizes your consultation earnings on the Illorac platform for ${periodLabel}. `
        + 'The "Your Share" column reflects amounts credited to your consultant earnings balance after platform fees.',
        { align: 'left', width: pageWidth },
      )
      .moveDown(0.5)
      .text('Retain this document for your accounting and tax records. For questions, contact support via illorac.nl.')
      .moveDown(0.5)
      .text(`Generated automatically by Illorac · ${issueDate}`);

    doc.end();
  });
}

export async function generateConsultantInvoicePdf(invoiceData) {
  const html = buildInvoiceHtml(invoiceData);

  try {
    return await generateWithPuppeteer(html);
  } catch (puppeteerErr) {
    log.warn(`Puppeteer PDF failed, using PDFKit fallback: ${puppeteerErr.message}`);
    try {
      return await generateWithPdfKit(invoiceData);
    } catch (pdfKitErr) {
      log.error(`PDF generation failed: ${pdfKitErr.message}`);
      throw new Error('Unable to generate invoice PDF. Please try again later or contact support.');
    }
  }
}

export const invoicePdfService = {
  buildInvoiceHtml,
  generateConsultantInvoicePdf,
};
