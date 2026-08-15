export {
  docText, docSpliceUpdate, foldDocUpdate, tryFoldDocUpdate, mergeDocUpdates,
  isDocValue, epochOf, onDocumentFault, documentFaults,
} from './docText';
export type { DocValue } from './docText';
export type { JsonUpdate } from './text';
export { computeSplice } from './computeSplice';
export { getActorId, getClientId } from './actorId';
export { lwwWrite, lwwReduce, defaultDisplay } from './lww';
export { setRead, setDisplay, setWrite, setReduce } from './set';
export type { ElementMeta, SetDoc } from './set';
