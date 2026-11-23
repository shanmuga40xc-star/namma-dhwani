# NAGRIK Step 1 Security & Rules Specification

## 1. Non-Negotiable Security Invariants
1. **Strict Role Separation (Zero Citizen/Admin Mixing)**:
   - Admin accounts live exclusively in `/admins/{uid}` and are provisioned only by `super_admin` (plus one-time `appConfig/bootstrap` lock for the first `SUPER_ADMIN_EMAIL`).
   - Citizens live in `/citizens/{uid}` (`role: 'citizen'`) and can NEVER create `/admins/{uid}` or read `/auditLogs`, `/admins` (other than checking their own existence to block admin sign-in on Citizen App), or `/seriousConcerns` of others.
2. **The Green Rule (Enforced in `firestore.rules`)**:
   - Officials (`mla_owner`, `mla_member`, `cm_office`, `super_admin`) can NEVER set `complaints/{id}.status == 'CONFIRMED RESOLVED'`.
   - Only a verified citizen who is either:
     - the original non-anonymous `reporterUid` transitioning from `'Fixed, awaiting confirmation'` -> `'CONFIRMED RESOLVED'` (`confirmedByLabel == 'reporter'`), OR
     - a different verified citizen confirming an `'isAnonymous == true'` complaint or one whose `'fixedAtMs'` is at least 7 days (`604800000` ms) old (`confirmedByLabel == 'confirmed by neighbours'`).
3. **Constituency Isolation**:
   - MLA Office (`mla_owner`, `mla_member`) can only update complaints (`constituencyId`) and read private `seriousConcerns` matching their assigned `constituencyId`.
   - CM Office (`cm_office`) only accesses complaints where `escalatedToCm == true` or `seriousConcerns` where `directToCm == true` or `status == 'Escalated to CM Office'`.
4. **Serious Concerns Privacy**:
   - `/seriousConcerns/{id}` is NEVER publicly readable (`allow get, list` requires authenticated `reporterUid == request.auth.uid`, matching constituency MLA staff when `!directToCm`, CM staff when `directToCm || status == 'Escalated to CM Office'`, or `super_admin`).
5. **Immutable Audit Logs & No Hardcoded Credentials**:
   - `/auditLogs/{id}` is append-only (`allow update, delete: if false;`).
   - Zero hardcoded emails or passwords appear anywhere in `firestore.rules`, client code, or server code.
6. **Karnataka Service Area Bounds**:
   - Complaints & serious concerns enforce entire Karnataka coordinate bounds (`latitude` in `11.50..18.55`, `longitude` in `74.00..78.65`) inside `firestore.rules`.
7. **DPDP Data Minimisation, Non-PII Leaderboard & Delete-My-Data**:
   - Zero Aadhaar numbers or OTP records stored anywhere.
   - Citizen phone/email live in `/citizens/{uid}/private/{docId}` readable only by owner (and owning MLA staff ONLY when citizen granted `shareContactConsent == true` on a complaint).
   - Public leaderboard profiles live in `/publicCitizens/{uid}` with strict schema allowlists (`uid`, `displayName`, `reportsCount`, `confirmedCount`, `supportsCount`, `neighbourConfirmsCount`, `createdAt`, `updatedAt`) containing zero PII.
   - Citizens can delete their own `/citizens/{uid}`, `/publicCitizens/{uid}`, and `/citizens/{uid}/private/{docId}` records anytime.

## 2. Step 1 Adversarial & Acceptance Payloads (All Violations Must Return PERMISSION_DENIED)
1. Unauthenticated write to `/complaints/c1` or `/seriousConcerns/s1` -> `PERMISSION_DENIED`.
2. Unverified email citizen attempting to write `/complaints/c1` -> `PERMISSION_DENIED`.
3. Official (`mla_owner`) attempting to set `complaints/c1.status = 'CONFIRMED RESOLVED'` -> `PERMISSION_DENIED` (**Green Rule**).
4. MLA Office for constituency A attempting to update a complaint in constituency B -> `PERMISSION_DENIED`.
5. Public / anonymous / non-owning user attempting to read `/seriousConcerns/s1` -> `PERMISSION_DENIED`.
6. Non-super-admin citizen attempting to create `/admins/{uid}` -> `PERMISSION_DENIED`.
7. Coordinate outside Karnataka (`latitude: 19.07, longitude: 72.87`) in `/complaints/c1` -> `PERMISSION_DENIED`.
8. Non-reporter citizen confirming `'CONFIRMED RESOLVED'` before 7 days when `!isAnonymous` -> `PERMISSION_DENIED`.
9. Updating or deleting `/auditLogs/{id}` -> `PERMISSION_DENIED`.
10. Citizen inflating `upvoteCount` by +5 in a single write -> `PERMISSION_DENIED`.
