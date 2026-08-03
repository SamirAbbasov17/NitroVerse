// Netlify adapteri — məntiq server/api/auth.mjs-dədir (tək mənbə).
import { getStore } from '@netlify/blobs';
import { makeAuth } from '../../server/api/auth.mjs';

export default makeAuth((store) => getStore({ name: store, consistency: 'strong' }));

export const config = { path: '/api/auth' };
