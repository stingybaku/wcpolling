/**
 * CLI wrapper for the demo seeder. The actual logic lives in `lib/seed-demo.ts`
 * so it can be shared with the guarded /api/admin/seed-demo route.
 *
 * Usage: npm run seed:demo   (loads .env for DATABASE_URL)
 */
import { seedDemo, DEMO_DOMAIN, DEMO_PASSWORD } from "../lib/seed-demo";

seedDemo()
  .then((s) => {
    console.log(`Cleared ${s.cleared} previous demo users (and their cascaded data).`);
    console.log("\n✅ Demo seed complete for:", s.tournament);
    console.log(`   Users:            ${s.users}`);
    console.log(`   Groups:           ${s.groups} (${s.groupNames.join(", ")})`);
    console.log(`   Qual predictions: ${s.qualPredictions} (scored)`);
    console.log(`   R32 predictions:  ${s.r32Predictions} (submitted, awaiting results)`);
    console.log(`   Trivia questions: ${s.triviaQuestions} (today → ${s.triviaQuestions - 1} days back)`);
    console.log(`\n   Demo login: any of demo1..demo${s.users}@${DEMO_DOMAIN} / password "${DEMO_PASSWORD}"`);
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
