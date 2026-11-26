// Housing for the green character: the terraces with deeper steps, creepers, balcony planters and a tree on the roof.
import type { RegisteredKit } from './kit';
import { terraces } from './housing-parts';

const kit: RegisteredKit = {
  id: 'housing-green',
  intents: ['housing'],
  characters: ['green'],
  lot: ctx => terraces(ctx, true),
};

export default kit;
