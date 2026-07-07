const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const SERVER_ROOT = path.resolve(__dirname, '..');
const serverRequire = createRequire(path.join(SERVER_ROOT, 'package.json'));
const prismaCli = path.join(
  path.dirname(serverRequire.resolve('prisma/package.json')),
  'build',
  'index.js',
);
const MIGRATION_DIR = path.join(
  SERVER_ROOT,
  'prisma',
  'migrations',
  '20260707122000_init',
);
const MIGRATION_FILE = path.join(MIGRATION_DIR, 'migration.sql');
const SCHEMA_FILE = path.join(SERVER_ROOT, 'prisma', 'schema.prisma');

const PGVECTOR_HEADER = `-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

`;

function fail(message) {
  console.error(`regen-migration: ${message}`);
  process.exit(1);
}

function normalizeSql(sql) {
  return sql.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd() + '\n';
}

function ensurePgvectorHeader(sql) {
  if (/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+vector/i.test(sql)) {
    return sql;
  }
  return PGVECTOR_HEADER + sql;
}

function validateSql(sql) {
  const buf = Buffer.from(sql, 'utf8');
  if (buf.includes(0)) {
    fail('generated SQL contains null bytes');
  }
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    fail('generated SQL has UTF-8 BOM');
  }
  if (buf.includes(Buffer.from('\r\n')) || buf.includes(0x0d)) {
    fail('generated SQL must use LF line endings only');
  }
  if (!/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+vector/i.test(sql)) {
    fail('generated SQL is missing pgvector extension');
  }
  if (!/CREATE\s+TABLE/i.test(sql)) {
    fail('generated SQL looks empty or invalid');
  }
}

if (!fs.existsSync(SCHEMA_FILE)) {
  fail(`schema not found: ${SCHEMA_FILE}`);
}

const result = spawnSync(
  process.execPath,
  [
    prismaCli,
    'migrate',
    'diff',
    '--from-empty',
    '--to-schema-datamodel',
    SCHEMA_FILE,
    '--script',
  ],
  {
    cwd: SERVER_ROOT,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  },
);

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  fail('prisma migrate diff failed');
}

const sql = ensurePgvectorHeader(normalizeSql(result.stdout));
validateSql(sql);

fs.mkdirSync(MIGRATION_DIR, { recursive: true });
fs.writeFileSync(MIGRATION_FILE, sql, { encoding: 'utf8' });

console.log(`Wrote ${MIGRATION_FILE} (${Buffer.byteLength(sql, 'utf8')} bytes, UTF-8 LF)`);
