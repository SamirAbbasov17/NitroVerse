// Netlify adapteri — məntiq server/api/social.mjs-dədir (tək mənbə).
import { getStore } from '@netlify/blobs';
import { makeSocial } from '../../server/api/social.mjs';

export default makeSocial((store) => getStore({ name: store, consistency: 'strong' }));

export const config = { path: '/api/social' };
