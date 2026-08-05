// 自動產生/讀取自簽 HTTPS 憑證，讓區網內存取（例如診所內電腦連 http://192.168.x.x）
// 也能改用 https://，瀏覽器連線會被加密（因非公開信任的憑證，仍會顯示一次性警告，屬正常現象）。
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const { BASE_DIR } = require('./paths');
const { localIPv4s } = require('./network');

const CERTS_DIR = path.join(BASE_DIR, 'data', 'certs');
const KEY_FILE = path.join(CERTS_DIR, 'key.pem');
const CERT_FILE = path.join(CERTS_DIR, 'cert.pem');

async function ensureCerts() {
  if (fs.existsSync(KEY_FILE) && fs.existsSync(CERT_FILE)) {
    return { key: fs.readFileSync(KEY_FILE), cert: fs.readFileSync(CERT_FILE) };
  }
  if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

  const ips = localIPv4s();
  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.map((ip) => ({ type: 7, ip })),
  ];
  const attrs = [{ name: 'commonName', value: ips[0] || 'localhost' }];
  const notBeforeDate = new Date();
  const notAfterDate = new Date(notBeforeDate);
  notAfterDate.setFullYear(notAfterDate.getFullYear() + 10);
  const pems = await selfsigned.generate(attrs, {
    keySize: 2048,
    notBeforeDate,
    notAfterDate,
    extensions: [{ name: 'subjectAltName', altNames }],
  });

  fs.writeFileSync(KEY_FILE, pems.private);
  fs.writeFileSync(CERT_FILE, pems.cert);
  console.log('已產生自簽 HTTPS 憑證：', CERT_FILE);
  return { key: pems.private, cert: pems.cert };
}

module.exports = { ensureCerts, localIPv4s };
