/**
 * CLI wrapper for the demo seeder. The actual logic lives in `lib/seed-demo.ts`
 * so it can be shared with the guarded /api/admin/seed-demo route.
 *
 * Usage: npm run seed:demo   (loads .env for DATABASE_URL)
 */
import { seedDemo, DEMO_DOMAIN, DEMO_PASSWORD, DEMO_ADMIN_EMAIL } from "../lib/seed-demo";

seedDemo()
  .then((s) => {
    const numberedUsers = s.users - 1; // minus the admin account
    console.log(`Cleared ${s.cleared} previous demo users (and their cascaded data).`);
    console.log("\n✅ Demo seed complete for:", s.tournament);
    console.log(`   Users:            ${s.users} (${numberedUsers} members + 1 admin)`);
    console.log(`   Groups:           ${s.groups} (${s.groupNames.join(", ")})`);
    console.log(`   Qualifiers:       ${s.qualifierCount}${s.qualifiersSeeded ? " (seeded now → stage SCORED)" : " (already present)"}`);
    console.log(`   Qual predictions: ${s.qualPredictions} (scored)`);
    console.log(`   R32 bracket:      ${s.r32Matches} matches${s.r32Opened ? " (stage OPEN for live picks)" : ""}`);
    console.log(`   R32 predictions:  ${s.r32Predictions} (submitted; owners left open to demo live picks)`);
    console.log(`   Trivia questions: ${s.triviaQuestions} (today → ${s.triviaQuestions - 1} days back)`);
    console.log(`   Stages:           ${s.stages.map((st) => `${st.name} [${st.status}]`).join(", ")}`);
    console.log(`\n   Member login: any of demo1..demo${numberedUsers}@${DEMO_DOMAIN} / password "${DEMO_PASSWORD}"`);
    console.log(`   Admin login:  ${DEMO_ADMIN_EMAIL} / password "${DEMO_PASSWORD}"`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
