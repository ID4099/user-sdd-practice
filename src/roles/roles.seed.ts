import { DataSource } from 'typeorm';
import { Role, ADMIN_ROOT } from './role.entity';

/**
 * Idempotent seed: inserts the ADMIN_ROOT role if it does not already exist.
 * Safe to run multiple times.
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register src/roles/roles.seed.ts
 */
async function seed(): Promise<void> {
  // Inline DataSource for the seed script so it runs standalone
  const { config } = await import('dotenv');
  config();

  const { AppDataSource } = await import('../database/data-source');
  await AppDataSource.initialize();

  const roleRepo = AppDataSource.getRepository(Role);

  const existing = await roleRepo.findOne({ where: { name: ADMIN_ROOT } });
  if (!existing) {
    const role = roleRepo.create({ name: ADMIN_ROOT });
    await roleRepo.save(role);
    console.log(`Seeded role: ${ADMIN_ROOT}`);
  } else {
    console.log(`Role already exists: ${ADMIN_ROOT} (id=${existing.id})`);
  }

  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
