const BASE = 'http://127.0.0.1:5000/api';
let pass = 0, fail = 0;

const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

const health = await call('/health');
check('GET /health returns ok', health.status === 200 && health.json?.status === 'ok');
check('database is connected', health.json?.database === 'connected', health.json?.database);

const cfg = await call('/config');
check('GET /config reports a video provider', !!cfg.json?.videoProvider, cfg.json?.videoProvider);
check('config falls back to jitsi without Agora keys', cfg.json?.videoProvider === 'jitsi');

// --- login ---------------------------------------------------------------
const badLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: 'karthik@example.com', password: 'wrong-password' },
});
check('wrong password is rejected with 401', badLogin.status === 401, badLogin.json?.message);

const unknown = await call('/auth/login', {
  method: 'POST',
  body: { email: 'nobody@example.com', password: 'whatever123' },
});
check(
  'unknown email gives the same message as a wrong password (no user enumeration)',
  unknown.json?.message === badLogin.json?.message,
  `${unknown.json?.message}`
);

const patientLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: 'karthik@example.com', password: 'Password@123' },
});
check('patient can log in', patientLogin.status === 200 && !!patientLogin.json?.token);
check('login returns the patient profile', !!patientLogin.json?.profile?.bloodGroup,
  patientLogin.json?.profile?.bloodGroup);
check('password hash is never returned', !JSON.stringify(patientLogin.json).includes('passwordHash'));
const patientToken = patientLogin.json?.token;

const adminLogin = await call('/auth/login', {
  method: 'POST',
  body: { email: 'admin@medconsult.local', password: 'Admin@12345' },
});
check('admin can log in', adminLogin.status === 200 && adminLogin.json?.user?.role === 'admin');

const pendingDoctor = await call('/auth/login', {
  method: 'POST',
  body: { email: 'rahul.menon@medconsult.local', password: 'Password@123' },
});
check('unverified doctor can still log in', pendingDoctor.status === 200);
check('unverified doctor is reported as pending',
  pendingDoctor.json?.profile?.verificationStatus === 'pending',
  pendingDoctor.json?.profile?.verificationStatus);

// --- protected routes ----------------------------------------------------
const noToken = await call('/auth/me');
check('GET /me without a token is 401', noToken.status === 401);

const badToken = await call('/auth/me', { token: 'not-a-real-token' });
check('GET /me with a malformed token is 401', badToken.status === 401);

const me = await call('/auth/me', { token: patientToken });
check('GET /me with a valid token works', me.status === 200 && me.json?.user?.email === 'karthik@example.com');

// --- registration validation --------------------------------------------
const shortPw = await call('/auth/register/patient', {
  method: 'POST',
  body: { name: 'Test User', email: 'newbie@example.com', password: 'short' },
});
check('short password is rejected with a field error', shortPw.status === 400 && !!shortPw.json?.details?.password,
  shortPw.json?.details?.password);

const badEmail = await call('/auth/register/patient', {
  method: 'POST',
  body: { name: 'Test User', email: 'not-an-email', password: 'ValidPass123' },
});
check('invalid email is rejected', badEmail.status === 400 && !!badEmail.json?.details?.email);

const dupe = await call('/auth/register/patient', {
  method: 'POST',
  body: { name: 'Impostor', email: 'karthik@example.com', password: 'ValidPass123' },
});
check('duplicate email is rejected with 409', dupe.status === 409, dupe.json?.message);

const unique = `smoke_${Date.now()}@example.com`;
const created = await call('/auth/register/patient', {
  method: 'POST',
  body: { name: 'Smoke Test', email: unique, password: 'ValidPass123', preferredLanguage: 'ta' },
});
check('new patient registration succeeds', created.status === 201 && !!created.json?.token);
check('registration creates the patient profile', created.json?.profile !== null);

const doctorNoSpecialty = await call('/auth/register/doctor', {
  method: 'POST',
  body: {
    name: 'Dr Fake', email: `doc_${Date.now()}@example.com`, password: 'ValidPass123',
    specialty: '000000000000000000000000', registrationNumber: 'XX-1234',
  },
});
check('doctor registration with an unknown specialty is rejected', doctorNoSpecialty.status === 400,
  doctorNoSpecialty.json?.message);

// --- role guard ----------------------------------------------------------
const changePw = await call('/auth/change-password', {
  method: 'POST',
  token: patientToken,
  body: { currentPassword: 'Password@123', newPassword: 'Password@123' },
});
check('change-password accepts the correct current password', changePw.status === 200);

const wrongCurrent = await call('/auth/change-password', {
  method: 'POST',
  token: patientToken,
  body: { currentPassword: 'nope-not-it', newPassword: 'Whatever@1234' },
});
check('change-password rejects a wrong current password', wrongCurrent.status === 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
