// What the packed Add On carries as public/web.js (addons/luna/package.mjs). The Add On has no
// YouTube search, shelf or platter card: app.js gives a host page stand-ins and never calls these.
// Exports the same names as public/web.js; test/luna-addon.test.mjs checks they match.
const absent = (what) => () => { throw new Error(`The LUNA Add On has no ${what}`); };
export const createShelf = absent('shelf');
export const createShelfView = absent('shelf');
export const createPlatterCard = absent('platter card');
export const createSearch = absent('search');
export const artSrc = () => '';
