// Housing for the efficient character: thin residential slabs with regular balcony bands and a cold lit crown.
import type { RegisteredKit } from './kit';
import { slabs } from './housing-parts';

const kit: RegisteredKit = {
  id: 'housing-dense',
  intents: ['housing'],
  characters: ['efficient'],
  lot: ctx => slabs(ctx),
};

export default kit;
