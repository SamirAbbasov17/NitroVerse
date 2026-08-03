// Netlify adapteri — məntiq server/api/rooms.mjs-dədir (tək mənbə).
import { getStore } from '@netlify/blobs';
import { makeRooms } from '../../server/api/rooms.mjs';

export default makeRooms((store) => getStore({ name: store, consistency: 'strong' }));

export const config = { path: '/api/rooms' };
