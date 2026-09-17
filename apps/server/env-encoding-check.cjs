const fs = require('fs');
const path = '.env';
const bytes = fs.readFileSync(path);

let validUtf8 = true;
try {
  const dec = new TextDecoder('utf-8', { fatal: true });
  dec.decode(bytes);
} catch (e) {
  validUtf8 = false;
}
console.log('Valid UTF-8:', validUtf8);
console.log('File size:', bytes.length, 'bytes');
console.log('First 3 bytes (BOM check):', bytes.slice(0, 3).toString('hex'));
console.log('Has UTF-8 BOM:', bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf);

const utf8 = new TextDecoder('utf-8').decode(bytes);
const cp1251 = new TextDecoder('windows-1251').decode(bytes);
const utf8Lines = utf8.split(/\r?\n/);
const cp1251Lines = cp1251.split(/\r?\n/);

console.log('\n=== Comment lines decoded as UTF-8 ===');
utf8Lines.forEach((line, i) => {
  if (line.trimStart().startsWith('#')) console.log(`L${i + 1}: ${line}`);
});

console.log('\n=== Same comment lines decoded as CP1251 ===');
cp1251Lines.forEach((line, i) => {
  if (line.trimStart().startsWith('#')) console.log(`L${i + 1}: ${line}`);
});
