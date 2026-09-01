// Verifies the auth rate limiter actually fires. Run with the server started
// WITHOUT DISABLE_RATE_LIMITS so the limits are active.
const BASE = 'http://127.0.0.1:5000/api';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const attempt = () =>
  fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password-here' }),
  });

const statuses = [];
for (let i = 0; i < 14; i += 1) statuses.push((await attempt()).status);

const firstRejected = statuses.indexOf(429);
check('repeated failed logins are eventually blocked', statuses.includes(429),
  statuses.join(','));
check('the limiter allows roughly 10 attempts before blocking',
  firstRejected >= 8 && firstRejected <= 11, `blocked at attempt ${firstRejected + 1}`);

const body = await (await attempt()).json();
check('the block response explains itself', /too many/i.test(body.message || ''), body.message);

// A different endpoint should still work — the auth limiter is scoped.
const health = await fetch(`${BASE}/health`);
check('unrelated endpoints stay available while auth is limited', health.status === 200);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
