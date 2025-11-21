/**
 * PDF Invoice Generator for PawnFlow Loans
 * Creates professional, colored invoices with all loan details
 */

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generate professional loan invoice PDF
 * @param {object} loan - Loan object from database
 * @returns {Promise<Buffer>} - PDF buffer
 */
async function generateLoanPDF(loan) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        bufferPages: true,
        margin: 30,
        size: 'A4',
      });

      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ===== HEADER SECTION =====
      drawHeader(doc, loan);

      // ===== LOAN DETAILS SECTION =====
      doc.moveDown(0.5);
      drawLoanDetailsSection(doc, loan);

      // ===== CUSTOMER INFORMATION SECTION =====
      doc.moveDown(1);
      drawCustomerInfoSection(doc, loan);

      // ===== LOAN FINANCIAL DETAILS =====
      doc.moveDown(1);
      drawFinancialDetailsTable(doc, loan);

      // ===== TERMS & CONDITIONS =====
      doc.moveDown(1);
      drawTermsSection(doc, loan);

      // ===== FOOTER =====
      doc.moveDown(1);
      drawFooter(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Draw professional header with company info and transaction number
 */
function drawHeader(doc, loan) {
  // Header background bar
  doc.rect(0, 0, doc.page.width, 100).fill('#2C3E50');

  // Company Name
  doc.fillColor('#FFFFFF');
  doc.fontSize(28);
  doc.font('Helvetica-Bold');
  doc.text('PAWNFLOW', 50, 20);

  // Subtitle
  doc.fontSize(10);
  doc.fillColor('#ECF0F1');
  doc.font('Helvetica');
  doc.text('Pawn Shop Management System', 50, 50);

  // Transaction Number - Right side
  doc.fillColor('#FFFFFF');
  doc.fontSize(12);
  doc.font('Helvetica-Bold');
  const txnX = doc.page.width - 200;
  doc.text('TRANSACTION #', txnX, 20);
  
  doc.fontSize(16);
  doc.fillColor('#F39C12');
  doc.text(loan.transaction_number || 'N/A', txnX, 35, { width: 150, align: 'center' });

  // Loan ID - Right side
  doc.fontSize(10);
  doc.fillColor('#ECF0F1');
  doc.font('Helvetica');
  doc.text(`Loan ID: ${loan.id}`, txnX, 55, { width: 150, align: 'center' });

  doc.fillColor('#000000');
}

/**
 * Draw loan details section with status and dates
 */
function drawLoanDetailsSection(doc, loan) {
  doc.fontSize(12);
  doc.font('Helvetica-Bold');
  doc.fillColor('#2C3E50');
  doc.text('LOAN INFORMATION', 50, doc.y);

  doc.moveDown(0.3);
  
  // Create details boxes
  const boxY = doc.y;
  const boxHeight = 60;
  const columnWidth = (doc.page.width - 100) / 3;

  // Status Box
  drawDetailBox(doc, 50, boxY, columnWidth - 10, boxHeight, 'Status', loan.status, getStatusColor(loan.status));

  // Issued Date Box
  drawDetailBox(
    doc,
    50 + columnWidth,
    boxY,
    columnWidth - 10,
    boxHeight,
    'Issued Date',
    formatDate(loan.loan_issued_date),
    '#3498DB'
  );

  // Due Date Box
  drawDetailBox(
    doc,
    50 + columnWidth * 2,
    boxY,
    columnWidth - 10,
    boxHeight,
    'Due Date',
    formatDate(loan.due_date),
    '#E74C3C'
  );

  doc.y = boxY + boxHeight + 10;
}

/**
 * Draw customer information section
 */
function drawCustomerInfoSection(doc, loan) {
  doc.fontSize(12);
  doc.font('Helvetica-Bold');
  doc.fillColor('#2C3E50');
  doc.text('CUSTOMER INFORMATION', 50, doc.y);

  doc.moveDown(0.5);
  
  const startY = doc.y;
  const col1X = 50;
  const col2X = doc.page.width / 2;
  const lineHeight = 18;

  // Column 1
  doc.fontSize(10);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  
  doc.text('Full Name:', col1X, doc.y);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(`${loan.first_name} ${loan.last_name}`, col1X + 100, startY);

  doc.fontSize(10);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Email:', col1X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.email || 'N/A', col1X + 100, doc.y);

  doc.fontSize(10);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Mobile Phone:', col1X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.mobile_phone || 'N/A', col1X + 100, doc.y);

  doc.fontSize(10);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Home Phone:', col1X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.home_phone || 'N/A', col1X + 100, doc.y);

  // Column 2 - Address info
  doc.fontSize(10);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Address:', col2X, startY);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  const addressY = startY;
  doc.text(`${loan.street_address || 'N/A'}`, col2X + 80, addressY);
  doc.text(`${loan.city || ''}, ${loan.state || ''} ${loan.zipcode || ''}`, col2X + 80, doc.y);

  doc.fontSize(10);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Date of Birth:', col2X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.birthdate ? formatDate(loan.birthdate) : 'N/A', col2X + 80, doc.y);

  doc.fontSize(10);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('ID Info:', col2X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.identification_info || 'N/A', col2X + 80, doc.y);

  doc.moveDown(1.5);
}

/**
 * Draw financial details table with colored rows
 */
function drawFinancialDetailsTable(doc, loan) {
  doc.fontSize(12);
  doc.font('Helvetica-Bold');
  doc.fillColor('#2C3E50');
  doc.text('FINANCIAL DETAILS', 50, doc.y);

  doc.moveDown(0.5);

  const tableTop = doc.y;
  const col1 = 50;
  const col2 = doc.page.width - 150;
  const rowHeight = 25;
  const cellPadding = 8;

  // Table header
  doc.rect(col1, tableTop, doc.page.width - 100, rowHeight).fill('#34495E');
  doc.fillColor('#FFFFFF');
  doc.fontSize(11);
  doc.font('Helvetica-Bold');
  doc.text('Description', col1 + cellPadding, tableTop + cellPadding);
  doc.text('Amount', col2 + cellPadding, tableTop + cellPadding);

  let currentY = tableTop + rowHeight;
  let alternateRow = false;

  // Loan Amount
  doc.rect(col1, currentY, doc.page.width - 100, rowHeight).fill(alternateRow ? '#ECF0F1' : '#FFFFFF');
  doc.fillColor('#2C3E50');
  doc.fontSize(10);
  doc.font('Helvetica');
  doc.text('Loan Amount', col1 + cellPadding, currentY + cellPadding);
  doc.text(`$${parseFloat(loan.loan_amount).toFixed(2)}`, col2 + cellPadding, currentY + cellPadding);
  currentY += rowHeight;
  alternateRow = !alternateRow;

  // Interest Rate
  doc.rect(col1, currentY, doc.page.width - 100, rowHeight).fill(alternateRow ? '#ECF0F1' : '#FFFFFF');
  doc.fillColor('#2C3E50');
  doc.text('Interest Rate', col1 + cellPadding, currentY + cellPadding);
  doc.text(`${parseFloat(loan.interest_rate).toFixed(2)}%`, col2 + cellPadding, currentY + cellPadding);
  currentY += rowHeight;
  alternateRow = !alternateRow;

  // Interest Amount
  doc.rect(col1, currentY, doc.page.width - 100, rowHeight).fill(alternateRow ? '#ECF0F1' : '#FFFFFF');
  doc.fillColor('#2C3E50');
  doc.text('Interest Amount', col1 + cellPadding, currentY + cellPadding);
  doc.text(`$${parseFloat(loan.interest_amount || 0).toFixed(2)}`, col2 + cellPadding, currentY + cellPadding);
  currentY += rowHeight;
  alternateRow = !alternateRow;

  // Total Payable Amount (Highlighted)
  doc.rect(col1, currentY, doc.page.width - 100, rowHeight).fill('#F39C12');
  doc.fillColor('#FFFFFF');
  doc.font('Helvetica-Bold');
  doc.text('Total Payable Amount', col1 + cellPadding, currentY + cellPadding);
  doc.text(`$${parseFloat(loan.total_payable_amount || 0).toFixed(2)}`, col2 + cellPadding, currentY + cellPadding);
  currentY += rowHeight;

  // Remaining Balance (Highlighted)
  doc.rect(col1, currentY, doc.page.width - 100, rowHeight).fill('#27AE60');
  doc.fillColor('#FFFFFF');
  doc.font('Helvetica-Bold');
  doc.text('Remaining Balance', col1 + cellPadding, currentY + cellPadding);
  doc.text(`$${parseFloat(loan.remaining_balance || 0).toFixed(2)}`, col2 + cellPadding, currentY + cellPadding);

  doc.y = currentY + rowHeight + 10;
}

/**
 * Draw terms and additional details section
 */
function drawTermsSection(doc, loan) {
  doc.fontSize(12);
  doc.font('Helvetica-Bold');
  doc.fillColor('#2C3E50');
  doc.text('LOAN TERMS & DETAILS', 50, doc.y);

  doc.moveDown(0.5);

  const startY = doc.y;
  const col1X = 50;
  const col2X = doc.page.width / 2;
  const lineHeight = 16;

  // Column 1
  doc.fontSize(9);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Loan Term (Days):', col1X, doc.y);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(`${loan.loan_term}`, col1X + 130, startY);

  doc.fontSize(9);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Collateral:', col1X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.collateral_description || 'N/A', col1X + 130, doc.y);

  doc.fontSize(9);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Customer Number:', col1X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.customer_number || 'N/A', col1X + 130, doc.y);

  // Column 2
  doc.fontSize(9);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Referral:', col2X, startY);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.referral || 'N/A', col2X + 80, startY);

  doc.fontSize(9);
  doc.font('Helvetica-Bold');
  doc.fillColor('#34495E');
  doc.text('Notes:', col2X, doc.y + lineHeight);
  doc.font('Helvetica');
  doc.fillColor('#2C3E50');
  doc.text(loan.customer_note || 'None', col2X + 80, doc.y);

  doc.moveDown(1);
}

/**
 * Draw footer with company info and date
 */
function drawFooter(doc) {
  const footerY = doc.page.height - 60;

  // Footer background
  doc.rect(0, footerY - 10, doc.page.width, 70).fill('#34495E');

  // Footer text
  doc.fontSize(9);
  doc.fillColor('#ECF0F1');
  doc.font('Helvetica');

  const centerX = doc.page.width / 2;
  doc.text('PawnFlow - Professional Pawn Shop Management', centerX - 100, footerY, { align: 'center', width: 200 });
  doc.text(`Generated: ${new Date().toLocaleString()}`, centerX - 100, footerY + 15, { align: 'center', width: 200 });
  doc.text('This is an official loan document. Please retain for your records.', centerX - 150, footerY + 30, { align: 'center', width: 300 });
}

/**
 * Helper: Draw a detail box with title and value
 */
function drawDetailBox(doc, x, y, width, height, title, value, color) {
  // Box background
  doc.rect(x, y, width, height).fill(color);

  // Title
  doc.fontSize(9);
  doc.fillColor('#FFFFFF');
  doc.font('Helvetica-Bold');
  doc.text(title, x + 10, y + 8);

  // Value
  doc.fontSize(14);
  doc.fillColor('#FFFFFF');
  doc.font('Helvetica-Bold');
  doc.text(value, x + 10, y + 25);
}

/**
 * Helper: Get color based on loan status
 */
function getStatusColor(status) {
  switch (status.toLowerCase()) {
    case 'active':
      return '#27AE60'; // Green
    case 'overdue':
      return '#E74C3C'; // Red
    case 'redeemed':
      return '#3498DB'; // Blue
    case 'forfeited':
      return '#95A5A6'; // Gray
    default:
      return '#2C3E50'; // Dark blue
  }
}

/**
 * Helper: Format date as MM/DD/YYYY
 */
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Save PDF to file system (optional - useful for debugging)
 */
async function savePDFToFile(loan, outputDir = './pdfs') {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const buffer = await generateLoanPDF(loan);
  const filename = `loan_${loan.id}_${loan.transaction_number}.pdf`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, buffer);
  return filepath;
}

module.exports = {
  generateLoanPDF,
  savePDFToFile,
};
