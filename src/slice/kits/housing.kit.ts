// Housing, the default: stepped maisonette terraces with planted setbacks, lit rails and roof gardens.
import type { RegisteredKit } from './kit';
import { terraces } from './housing-parts';

const kit: RegisteredKit = {
  id: 'housing-terraces',
  intents: ['housing'],
  lot: ctx => terraces(ctx, false),
};

export default kit;
