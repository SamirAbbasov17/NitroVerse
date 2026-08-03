// Netlify adapteri — məntiq server/api/report.mjs-dədir (tək mənbə).
import { getStore } from '@netlify/blobs';
import { makeReport } from '../../server/api/report.mjs';

export default makeReport((store) => getStore({ name: store, consistency: 'strong' }));

export const config = { path: '/api/report' };
