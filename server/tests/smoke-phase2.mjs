const BASE = 'http://127.0.0.1:5000/api';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const loginAs = async (email, password) =>
  (await call('/auth/login', { method: 'POST', body: { email, password } })).json.token;

const adminToken = await loginAs('admin@medconsult.local', 'Admin@12345');
const patientToken = await loginAs('karthik@example.com', 'Password@123');
const doctorToken = await loginAs('anitha.raman@medconsult.local', 'Password@123');

// ---- doctor discovery ---------------------------------------------------
// Counted from the admin view rather than hardcoded: verification state is
// changed by the UI during manual testing, so a fixed number would report a
// failure that is really just someone having approved a doctor by hand.
const approvedCount = (await call('/admin/doctors?status=approved', { token: adminToken }))
  .json.doctors.length;
const pendingCount = (await call('/admin/doctors?status=pending', { token: adminToken }))
  .json.doctors.length;

const all = await call('/doctors');
check('doctor list is public (no token needed)', all.status === 200);
check('exactly the approved doctors are listed',
  all.json.doctors.length === approvedCount,
  `${all.json.doctors.length} listed, ${approvedCount} approved, ${pendingCount} pending`);
check('no unverified doctor appears in search',
  all.json.doctors.length === approvedCount && pendingCount >= 0);
check('registration number is not exposed publicly',
  !JSON.stringify(all.json.doctors).includes('registrationNumber'));
check('email is not exposed publicly', !JSON.stringify(all.json.doctors).includes('@medconsult.local'));
check('specialty is joined into the result', !!all.json.doctors[0]?.specialty?.name,
  all.json.doctors[0]?.specialty?.name);
check('pagination metadata is returned', all.json.pagination?.total === approvedCount,
  JSON.stringify(all.json.pagination));

const cardioId = all.json.doctors.find((d) => d.specialty.name === 'Cardiology')?.specialty._id;
const bySpecialty = await call(`/doctors?specialty=${cardioId}`);
check('filtering by specialty works', bySpecialty.json.doctors.every((d) => d.specialty.name === 'Cardiology'),
  `${bySpecialty.json.doctors.length} cardiologists`);

const byName = await call('/doctors?q=meera');
check('free-text search matches the doctor name', byName.json.doctors.length === 1 &&
  byName.json.doctors[0].user.name.includes('Meera'));

const byBio = await call('/doctors?q=teledermatology');
check('free-text search also matches the bio', byBio.json.doctors.length === 1);

const byLang = await call('/doctors?language=ta');
check('filtering by spoken language works', byLang.json.doctors.length > 0 &&
  byLang.json.doctors.every((d) => d.languages.includes('ta')),
  `${byLang.json.doctors.length} speak Tamil`);

const regexInjection = await call('/doctors?q=' + encodeURIComponent('.*'));
check('regex metacharacters in search are escaped, not executed',
  regexInjection.json.doctors.length === 0, `${regexInjection.json.doctors.length} matched ".*"`);

const sorted = await call('/doctors?sort=experience');
const years = sorted.json.doctors.map((d) => d.experienceYears);
check('sorting by experience is descending', years.every((v, i) => i === 0 || years[i - 1] >= v),
  years.join(','));

const one = await call(`/doctors/${all.json.doctors[0].user._id}`);
check('single doctor profile loads', one.status === 200 && !!one.json.doctor);
check('single profile includes a completed-consultation count',
  typeof one.json.doctor.completedConsultations === 'number');

// Counts taken before this suite adds a doctor of its own, so the assertions
// below measure the change this suite causes rather than an absolute figure.
const statsBefore = (await call('/admin/stats', { token: adminToken })).json.stats;

// Register a throwaway doctor to exercise the verification lifecycle, so the
// suite does not consume the seeded pending doctor and can be re-run.
const orthoSpecialty = (await call('/specialties')).json.specialties
  .find((s) => s.name === 'Orthopaedics');
const tempEmail = `verify_${Date.now()}@example.com`;
const tempDoctor = await call('/auth/register/doctor', {
  method: 'POST',
  body: {
    name: 'Dr Temp Verify', email: tempEmail, password: 'ValidPass123',
    specialty: orthoSpecialty._id, registrationNumber: `TMP-${Date.now()}`,
    experienceYears: 4,
  },
});
check('a new doctor registers in the pending state', tempDoctor.status === 201 &&
  tempDoctor.json.profile.verificationStatus === 'pending');
const tempProfileId = tempDoctor.json.profile._id;
const tempUserId = tempDoctor.json.user.id;

const rahulPublic = await call(`/doctors/${tempUserId}`);
check('an unverified doctor cannot be fetched by direct URL', rahulPublic.status === 404);

// ---- admin ---------------------------------------------------------------
const statsAsPatient = await call('/admin/stats', { token: patientToken });
check('patient cannot read admin stats', statsAsPatient.status === 403);
const statsAsDoctor = await call('/admin/stats', { token: doctorToken });
check('doctor cannot read admin stats', statsAsDoctor.status === 403);

const stats = await call('/admin/stats', { token: adminToken });
check('admin stats load', stats.status === 200);
check('registering a doctor does not change the approved count',
  stats.json.stats.doctors.approved === statsBefore.doctors.approved,
  JSON.stringify(stats.json.stats.doctors));
check('registering a doctor increases the pending count by exactly one',
  stats.json.stats.doctors.pending === statsBefore.doctors.pending + 1,
  `${statsBefore.doctors.pending} -> ${stats.json.stats.doctors.pending}`);
check('the seeded pending doctor is in the queue',
  statsBefore.doctors.pending >= 1, `${statsBefore.doctors.pending} pending before this suite`);
check('stats totals are self-consistent',
  stats.json.stats.doctors.total ===
    stats.json.stats.doctors.approved + stats.json.stats.doctors.pending + stats.json.stats.doctors.rejected);

const queue = await call('/admin/doctors', { token: adminToken });
check('verification queue contains the newly registered doctor',
  queue.json.doctors.some((d) => d.user.email === tempEmail),
  `${queue.json.doctors.length} in queue`);

const baseline = (await call('/doctors')).json.pagination.total;

// approve, then confirm the doctor becomes publicly visible
const approve = await call(`/admin/doctors/${tempProfileId}/verify`, {
  method: 'POST', token: adminToken, body: { approve: true },
});
check('admin can approve a doctor', approve.status === 200 &&
  approve.json.profile.verificationStatus === 'approved');

const afterApprove = await call('/doctors');
check('approved doctor now appears in patient search',
  afterApprove.json.pagination.total === baseline + 1,
  `${baseline} -> ${afterApprove.json.pagination.total}`);

// reject requires a reason
const noReason = await call(`/admin/doctors/${tempProfileId}/verify`, {
  method: 'POST', token: adminToken, body: { approve: false },
});
check('rejecting without a reason is refused', noReason.status === 400, noReason.json?.message);

const reject = await call(`/admin/doctors/${tempProfileId}/verify`, {
  method: 'POST', token: adminToken, body: { approve: false, reason: 'Registration number could not be verified.' },
});
check('admin can reject with a reason', reject.status === 200 &&
  reject.json.profile.verificationStatus === 'rejected');

const afterReject = await call('/doctors');
check('rejected doctor disappears from patient search again',
  afterReject.json.pagination.total === baseline);

// Park the throwaway account so it does not clutter the admin queue.
await call(`/admin/users/${tempUserId}/active`, {
  method: 'PATCH', token: adminToken, body: { isActive: false },
});

// ---- user management -----------------------------------------------------
const users = await call('/admin/users?role=patient', { token: adminToken });
check('admin can list patients', users.status === 200 && users.json.users.length >= 3);
check('password hashes are stripped from the user list',
  !JSON.stringify(users.json.users).includes('passwordHash'));

// Filtered by role rather than scanning the first page: the list is paged
// and newest-first, so the administrator drops off page one as soon as
// enough accounts exist.
const self = await call('/admin/users?role=admin', { token: adminToken });
const adminUser = self.json.users.find((u) => u.role === 'admin');
check('the administrator account is findable by role filter', !!adminUser,
  `${self.json.users.length} admins`);
const selfDeactivate = await call(`/admin/users/${adminUser._id}/active`, {
  method: 'PATCH', token: adminToken, body: { isActive: false },
});
check('admin cannot deactivate their own account', selfDeactivate.status === 400,
  selfDeactivate.json?.message);

// Pick a known seeded account by email — the newest patient may be a
// leftover from an earlier smoke run, or an account created by hand during
// manual testing, either of which has a different password.
const target = (await call('/admin/users?q=ravi@example.com', { token: adminToken }))
  .json.users.find((u) => u.email === 'ravi@example.com');
const deactivate = await call(`/admin/users/${target._id}/active`, {
  method: 'PATCH', token: adminToken, body: { isActive: false },
});
check('admin can deactivate a patient', deactivate.status === 200 && deactivate.json.user.isActive === false);

const blockedLogin = await call('/auth/login', {
  method: 'POST', body: { email: target.email, password: 'Password@123' },
});
check('a deactivated user cannot log in', blockedLogin.status === 403, blockedLogin.json?.message);

await call(`/admin/users/${target._id}/active`, {
  method: 'PATCH', token: adminToken, body: { isActive: true },
});

// ---- doctor self-service -------------------------------------------------
const myProfile = await call('/doctors/me', { token: doctorToken });
check('doctor can read their own profile', myProfile.status === 200 &&
  !!myProfile.json.profile.registrationNumber);

const patientReadingDoctorMe = await call('/doctors/me', { token: patientToken });
check('a patient cannot read /doctors/me', patientReadingDoctorMe.status === 403);

const updated = await call('/doctors/me', {
  method: 'PATCH', token: doctorToken, body: { bio: 'Updated bio for the smoke test.', consultationFee: 350 },
});
check('doctor can update their own profile', updated.status === 200 &&
  updated.json.profile.consultationFee === 350);
check('updating the bio does not reset verification',
  updated.json.profile.verificationStatus === 'approved');

const regChange = await call('/doctors/me', {
  method: 'PATCH', token: doctorToken, body: { registrationNumber: 'TN-GP-99999' },
});
check('changing the registration number sends the doctor back to pending',
  regChange.json.profile.verificationStatus === 'pending',
  regChange.json.profile.verificationStatus);

// Restore this doctor so the script can be re-run against the same dataset.
await call('/doctors/me', {
  method: 'PATCH', token: doctorToken, body: { registrationNumber: 'TN-GP-48120', bio: 'General physician with over a decade of experience in primary care, diabetes management and preventive health.', consultationFee: 300 },
});
const myDocProfile = await call('/doctors/me', { token: doctorToken });
await call(`/admin/doctors/${myDocProfile.json.profile._id}/verify`, {
  method: 'POST', token: adminToken, body: { approve: true },
});

// ---- settings ------------------------------------------------------------
const settings = await call('/admin/settings', { token: adminToken });
check('settings load with defaults', settings.json.settings.ambulanceNumber === '108',
  settings.json.settings.ambulanceNumber);

const patched = await call('/admin/settings', {
  method: 'PATCH', token: adminToken, body: { ambulanceNumber: '102' },
});
check('admin can change the ambulance number', patched.json.settings.ambulanceNumber === '102');
await call('/admin/settings', { method: 'PATCH', token: adminToken, body: { ambulanceNumber: '108' } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
