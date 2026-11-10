/**
 * Relational, fictional seed data for the Phase 1 mock backend.
 * Only `services/mock` and tests may import from here (enforced by ESLint).
 */
export * from './accounts';
export * from './fixtures';
export { carIllustration } from './illustrations';
export { createRng, type Rng } from './prng';
export { buildSeed, type SeedData } from './seed';
