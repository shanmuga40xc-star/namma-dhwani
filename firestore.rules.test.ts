import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname || '.');

test('Security Rules Invariants & Dual-App Isolation Verification', () => {
  const rulesText = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf-8');

  // 1. Zero hardcoded personal emails anywhere in firestore.rules
  assert.equal(/@gmail\.com/i.test(rulesText), false, 'No hardcoded personal Gmail allowed in rules');

  // 2. Default deny safety net exists
  assert.match(rulesText, /match \/\{document=\*\*\}[\s\S]*allow read, write: if false;/);

  // 3. The Green Rule: officials can NEVER set CONFIRMED RESOLVED
  assert.match(rulesText, /incoming\(\)\.status != 'CONFIRMED RESOLVED'/);

  // 4. Neighbour confirmation 7-day rule & label enforced
  assert.match(rulesText, /confirmedByLabel == 'confirmed by neighbours'/);
  assert.match(rulesText, /604800000/);

  // 5. Serious concerns never publicly readable
  assert.match(rulesText, /match \/seriousConcerns\/\{concernId\}[\s\S]*reporterUid == request\.auth\.uid/);
  assert.doesNotMatch(rulesText, /match \/seriousConcerns\/\{concernId\}[\s\S]*allow get, list: if true;/);

  // 6. Karnataka state-wide service area bounds enforced inside rules
  assert.match(rulesText, /isInsideKarnatakaCoords/);

  // 6b. Public citizen leaderboard docs never allow email or phone PII fields
  assert.match(rulesText, /match \/publicCitizens\/\{userId\}/);
  assert.match(rulesText, /isValidPublicCitizen/);

  // 7. Citizen App never links to Admin App (/admin)
  const citizenFiles = [
    path.join(ROOT, 'citizen-app', 'src', 'App.tsx'),
    path.join(ROOT, 'citizen-app', 'src', 'components', 'ReportFlowModal.tsx'),
    path.join(ROOT, 'citizen-app', 'src', 'components', 'GuideBotWidget.tsx'),
  ];
  for (const file of citizenFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    assert.equal(/["'`]\/admin/.test(content), false, `Citizen app must not link to /admin (${file})`);
  }

  // 8. Notifications collection must enforce recipientUid isolation (never public)
  assert.match(rulesText, /match \/notifications\/\{notifId\}[\s\S]*recipientUid == request\.auth\.uid/);
  assert.doesNotMatch(rulesText, /match \/notifications\/\{notifId\}[\s\S]*allow get, list: if true;/);

  // 9. Admin app must NEVER render a leaderboard (Rule 7)
  const adminSrc = fs.readFileSync(path.join(ROOT, 'admin-app', 'src', 'App.tsx'), 'utf-8');
  assert.equal(/leaderboard/i.test(adminSrc), false, 'Admin app must never include a leaderboard');

  // 10. Benefit claims enforce citizenUid isolation, 50-point minimum, and official-only fulfillment
  assert.match(rulesText, /match \/benefitClaims\/\{claimId\}[\s\S]*citizenUid == request\.auth\.uid/);
  assert.match(rulesText, /data\.pointsSpent >= 50/);
  assert.doesNotMatch(rulesText, /match \/benefitClaims\/\{claimId\}[\s\S]*allow get, list: if true;/);
});
