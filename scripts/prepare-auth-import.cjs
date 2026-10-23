#!/usr/bin/env node
// Select only allowlisted users from a Firebase CLI auth:export JSON file.
// Usage: node scripts/prepare-auth-import.cjs source-export.json allowlist.json import-users.json
const fs = require('node:fs');
const [source, allowlistPath, output] = process.argv.slice(2);
if (!source || !allowlistPath || !output) throw Error('Usage: node scripts/prepare-auth-import.cjs <source-export.json> <allowlist.json> <import-users.json>');
if (fs.existsSync(output)) throw Error(`Output already exists: ${output}. Refusing to overwrite.`);
const data = JSON.parse(fs.readFileSync(source, 'utf8'));
const users = Array.isArray(data) ? data : data.users;
if (!Array.isArray(users)) throw Error('Expected Firebase CLI auth export JSON array or {users: [...]}');
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
if (!Array.isArray(allowlist) || !allowlist.length) throw Error('Allowlist must be a nonempty array of {email, role} objects');
const normalized = allowlist.map(u => ({email: String(u.email || '').trim().toLowerCase(),role:u.role}));
if (normalized.some(u=>!u.email || !['admin','editor','viewer'].includes(u.role))) throw Error('Every allowlist entry needs an email and admin/editor/viewer role');
if (new Set(normalized.map(u=>u.email)).size !== normalized.length) throw Error('Duplicate allowlist emails');
const byEmail = new Map(users.filter(u=>u.email).map(u=>[u.email.toLowerCase(),u]));
const missing = normalized.filter(u=>!byEmail.has(u.email));
if (missing.length) throw Error(`Not in source export: ${missing.map(u=>u.email).join(', ')}`);
const selected = normalized.map(u=>byEmail.get(u.email));
if (selected.some(u=>!u.passwordHash || !u.salt)) throw Error('One or more selected accounts have no exported password hash/salt; inspect provider type and source export permissions.');
fs.writeFileSync(output,JSON.stringify({users:selected},null,2),{mode:0o600,flag:'wx'});
console.log(`Prepared ${selected.length} selected accounts. Output contains password hashes: KEEP PRIVATE.\n${selected.map(u=>`- ${u.email} (${u.localId})`).join('\n')}`);
