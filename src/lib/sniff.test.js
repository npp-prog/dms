import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffUpload } from './sniff.js';

const file = (bytes, name, type) => new File([new Uint8Array(bytes)], name, { type });
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

test('uploads: only real PDFs and pictures, whatever their name or reported type', async () => {
  assert.equal(await sniffUpload(file(ascii('%PDF-1.7\n'), 'a.pdf', 'application/pdf')), 'application/pdf');
  assert.equal(await sniffUpload(file([0xff, 0xd8, 0xff, 0xe0, 0, 0], 'p.jpg', '')), 'image/jpeg');
  assert.equal(await sniffUpload(file([0x89, ...ascii('PNG\r\n'), 0x1a, 0x0a], 'p.png', 'image/png')), 'image/png');
  assert.equal(await sniffUpload(file([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBPVP8 ')], 'p.webp', '')), 'image/webp');
  // A ZIP, even named and typed as a PDF (as a phone may hand it over): refused.
  assert.equal(await sniffUpload(file([0x50, 0x4b, 0x03, 0x04, 0, 0], 'invoice.pdf', 'application/pdf')), null);
  assert.equal(await sniffUpload(file([0x50, 0x4b, 0x03, 0x04], 'files.zip', 'application/zip')), null);
  assert.equal(await sniffUpload(file(ascii('MZ'), 'setup.exe', '')), null);
});
