// The kit registry. Kits are discovered, never listed: to add one, create `src/slice/kits/<name>.kit.ts`
// that default-exports a `RegisteredKit` (kit.ts). Nobody edits this file.
//
//   import type { RegisteredKit } from './kit';
//   const kit: RegisteredKit = {
//     id: 'housing-terraces',          // unique; also the preview's ?kit=<id>
//     intents: ['housing'],            // game intents it dresses; [] = preview only
//     characters: ['green'],           // optional: only for these characters
//     lots: 2,                         // optional constant
//     lot(ctx) { ... },
//   };
//   export default kit;
//
// `kitFor(intent, character)` returns the kit whose `intents` include the intent. A kit that also
// names the character beats one that does not; remaining ties go to the lower id (alphabetical), so
// the choice is the same on every machine. The choice depends on intent and character only, never
// on level: a district keeps its kit as it grows.
import type { Character } from '../city';
import type { RegisteredKit } from './kit';

const modules = import.meta.glob<{ default?: RegisteredKit }>('./*.kit.ts', { eager: true });

const kits: RegisteredKit[] = [];
for (const [path, mod] of Object.entries(modules)) {
  const kit = mod.default;
  if (!kit || typeof kit.lot !== 'function' || !kit.id || !Array.isArray(kit.intents)) throw new Error(`${path}: a kit file must default-export a RegisteredKit (id, intents, lot)`);
  if (kits.some(k => k.id === kit.id)) throw new Error(`${path}: duplicate kit id "${kit.id}"`);
  kits.push(kit);
}
kits.sort((a, b) => (a.id < b.id ? -1 : 1));

/** Every registered kit, by id. */
export const allKits: readonly RegisteredKit[] = kits;

export const kitById = (id: string): RegisteredKit | undefined => kits.find(k => k.id === id);

/** The kit that dresses this kind of district, or undefined for plain towers. */
export function kitFor(intent: string, character: Character): RegisteredKit | undefined {
  const fits = kits.filter(k => k.intents.includes(intent) && (!k.characters || k.characters.includes(character)));
  return fits.find(k => k.characters) ?? fits[0];
}
