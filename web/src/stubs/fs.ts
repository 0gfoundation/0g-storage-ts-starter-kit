// Stub for fs module — SDK imports it but browser code paths never call it
const noop = () => {};
export const existsSync = () => false;
export const mkdirSync = noop;
export const readFileSync = () => Buffer.alloc(0);
export const writeFileSync = noop;
export const appendFileSync = noop;
export const unlinkSync = noop;
export const statSync = () => ({ size: 0 });
export const createReadStream = noop;
export const createWriteStream = noop;
export default {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  unlinkSync,
  statSync,
  createReadStream,
  createWriteStream,
};
