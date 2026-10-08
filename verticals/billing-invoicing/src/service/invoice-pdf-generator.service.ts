/**
 * Invoice PDF Generator Service
 *
 * Generates PDF invoices for payers/clients.
 *
 * NOTE: this is explicitly scoped as a MINIMAL stub per ticket FC-AUDIT-BILLING.
 * Full invoice PDF formatting (logos, tax breakdowns, multi-page line items)
 * is fast-follow.
 */

import PDFDocument from 'pdfkit';
import { Invoice } from '../types/billing';

/**
 * Service for generating invoice PDFs
 */
export class InvoicePdfGeneratorService {
  /**
   * Generate a minimal PDF invoice from invoice data
   */
  async generateInvoicePDF(invoice: Invoice): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: 50,
        info: {
          Title: `Invoice - ${invoice.invoiceNumber}`,
          Subject: `Invoice for ${invoice.payerName}`,
          CreationDate: new Date(),
        },
      });

      const buffers: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      try {
        this.renderHeader(doc, invoice);
        doc.moveDown(1);

        this.renderPayerInfo(doc, invoice);
        doc.moveDown(1);

        this.renderLineItemsTable(doc, invoice);
        doc.moveDown(1);

        this.renderTotals(doc, invoice);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private renderHeader(doc: InstanceType<typeof PDFDocument>, invoice: Invoice): void {
    doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
    doc
      .fontSize(10)
      .font('Helvetica')
      .text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    doc.text(`Invoice Date: ${this.formatDate(invoice.invoiceDate)}`);
    doc.text(`Due Date: ${this.formatDate(invoice.dueDate)}`);
  }

  private renderPayerInfo(doc: InstanceType<typeof PDFDocument>, invoice: Invoice): void {
    doc.fontSize(10).font('Helvetica-Bold').text('Bill To', { underline: true });
    doc.fontSize(9).font('Helvetica');
    doc.text(invoice.payerName);
    if (invoice.clientName) {
      doc.text(`Client: ${invoice.clientName}`);
    }
  }

  private renderLineItemsTable(doc: InstanceType<typeof PDFDocument>, invoice: Invoice): void {
    doc.fontSize(12).font('Helvetica-Bold').text('Line Items', { underline: true });
    doc.moveDown(0.5);

    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    const headerY = doc.y;
    doc.text('Description', 50, headerY, { width: 220, continued: false });
    doc.text('Units', 270, headerY, { width: 60, align: 'right', continued: false });
    doc.text('Rate', 330, headerY, { width: 60, align: 'right', continued: false });
    doc.text('Total', 390, headerY, { width: 70, align: 'right', continued: false });

    doc.moveTo(50, doc.y + 2).lineTo(460, doc.y + 2).stroke();
    doc.moveDown(0.3);

    doc.font('Helvetica');
    for (const item of invoice.lineItems || []) {
      const rowY = doc.y;
      doc.text(item.serviceDescription, 50, rowY, { width: 220, continued: false });
      doc.text(String(item.units), 270, rowY, { width: 60, align: 'right', continued: false });
      doc.text(this.formatCurrency(item.unitRate), 330, rowY, { width: 60, align: 'right', continued: false });
      doc.text(this.formatCurrency(item.total), 390, rowY, { width: 70, align: 'right', continued: false });
      doc.moveDown(0.5);
    }

    doc.moveTo(50, doc.y).lineTo(460, doc.y).stroke();
  }

  private renderTotals(doc: InstanceType<typeof PDFDocument>, invoice: Invoice): void {
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold');

    const totalY = doc.y;
    doc.text('Total Amount:', 270, totalY, { width: 120, align: 'left' });
    doc.text(this.formatCurrency(invoice.totalAmount), 390, totalY, { width: 70, align: 'right' });
    doc.moveDown(0.5);

    const balanceY = doc.y;
    doc.text('Balance Due:', 270, balanceY, { width: 120, align: 'left' });
    doc.text(this.formatCurrency(invoice.balanceDue), 390, balanceY, { width: 70, align: 'right' });
  }

  private formatDate(date: Date): string {
    if (!date) return 'N/A';
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  }

  private formatCurrency(amount: number): string {
    return `$${Number(amount || 0).toFixed(2)}`;
  }
}
