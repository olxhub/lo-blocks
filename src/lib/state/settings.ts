import { fields } from './redux';
import { scopes } from './scopes';

export const settingsFields = fields([
  { name: 'debug', event: 'SET_DEBUG', scope: scopes.system }
]);
