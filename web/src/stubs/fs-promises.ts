// Stub for node:fs/promises — SDK's ZgFile imports { open } but browser uses Blob class instead
export const open = async () => {
  throw new Error('fs.open is not available in browser. Use Blob class for browser uploads.');
};
export const readFile = async () => Buffer.alloc(0);
export const writeFile = async () => {};
export const mkdir = async () => {};
export default { open, readFile, writeFile, mkdir };
