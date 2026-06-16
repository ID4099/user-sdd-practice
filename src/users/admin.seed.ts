import { Role, ADMIN_ROOT } from '../roles/role.entity';
import { User } from './user.entity';

/**
 * Idempotent seed: ensures the ADMIN_ROOT role and a default admin user both
 * exist in the database. Safe to run multiple times.
 *
 * Credentials are read from environment variables (see .env.example):
 *   ADMIN_SEED_EMAIL    – defaults to admin@example.com
 *   ADMIN_SEED_PASSWORD – defaults to ChangeMe1! (change in production)
 *
 * The password is assigned as plain text; the User entity's @BeforeInsert hook
 * (bcrypt, 10 rounds) hashes it automatically before the INSERT fires.
 * On subsequent runs the user already exists, so no hash operation occurs.
 *
 * Usage:
 *   npm run seed:admin
 */
async function seed(): Promise<void> {
  const { config } = await import('dotenv');
  config();

  const { AppDataSource } = await import('../database/data-source');
  await AppDataSource.initialize();

  const roleRepo = AppDataSource.getRepository(Role);
  const userRepo = AppDataSource.getRepository(User);

  // ── 1. Ensure ADMIN_ROOT role exists ──────────────────────────────────────
  let adminRole = await roleRepo.findOne({ where: { name: ADMIN_ROOT } });
  if (!adminRole) {
    adminRole = roleRepo.create({ name: ADMIN_ROOT });
    await roleRepo.save(adminRole);
    console.log(`Seeded role: ${ADMIN_ROOT}`);
  } else {
    console.log(`Role already exists: ${ADMIN_ROOT} (id=${adminRole.id})`);
  }

  // ── 2. Ensure admin user exists ────────────────────────────────────────────
  const email = process.env.ADMIN_SEED_EMAIL ?? 'admin@example.com';
  const password = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe1!';

  // withDeleted: true so we don't create a duplicate if the row is soft-deleted
  const existingUser = await userRepo.findOne({
    where: { email },
    withDeleted: true,
  });

  if (!existingUser) {
    // Plain-text password → entity @BeforeInsert hook hashes it before INSERT
    const user = userRepo.create({ email, password, role: adminRole });
    await userRepo.save(user);
    console.log(`Seeded admin user: ${email}`);
  } else {
    console.log(`Admin user already exists: ${email} (id=${existingUser.id})`);

    // Re-link role if somehow missing (soft-deleted user edge case)
    if (!existingUser.role || existingUser.role.id !== adminRole.id) {
      existingUser.role = adminRole;
      await userRepo.save(existingUser);
      console.log(`Linked ${ADMIN_ROOT} role to existing user: ${email}`);
    }
  }

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Admin seed failed:', err);
  process.exit(1);
});
