// Eager surface (8.1 F2): the container + key. The dialogs (`./Persistence`) load on demand; import them directly
// (tests, /design), never re-export them here.
export { PersistenceContainer, isSaveMenuKey, wantsPersistenceDialogs } from './PersistenceContainer';
