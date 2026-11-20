import crypto from 'crypto';

export const DOC_TYPES = [
  'Certificate of incorporation',
  'MOA and AOA',
  'PAN',
  'TAN',
  'GST registration certificate',
  'LUT',
  'Professional tax certificate',
  'Bank account details',
  'Board meeting minutes',
  'AGM minutes',
  'Financial statements and audit report',
  'Tax return acknowledgement',
  'Proof of filing or payment',
  'Sales invoice',
  'Agreement or contract',
  'Other',
];

export const MAX_BYTES = 5 * 1024 * 1024;

// Only PDFs and photos, checked by their actual content, not the file name.
function sniff(b) {
  if (b.length > 4 && b.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  return null;
}

const EXT = { 'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg' };

export function safeFilename(name, mime) {
  const base = String(name || 'document').replace(/\.[^.]*$/, '').replace(/[^\w\- ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document';
  return base + EXT[mime];
}

export async function readUpload(file) {
  if (!file || typeof file !== 'object' || typeof file.arrayBuffer !== 'function' || !file.size) return { error: 'Choose a file to upload.' };
  if (file.size > MAX_BYTES) return { error: 'That file is over 5 MB. Upload a smaller PDF or photo.' };
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) return { error: 'Upload a PDF, PNG or JPG file.' };
  return { bytes, mime, filename: safeFilename(file.name, mime), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
