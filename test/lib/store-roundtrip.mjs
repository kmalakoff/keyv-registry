// Child process for location.test.ts: opens the store URI in argv[2] and round-trips one value.
import createStore from 'keyv-registry';

const store = await createStore(process.argv[2]);
await store.set('key', 'value');
if ((await store.get('key')) !== 'value') throw new Error('round trip failed');
await store.disconnect();
