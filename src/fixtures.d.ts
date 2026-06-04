// Vite/vitest `?raw` imports return the file's contents as a string.
declare module "*.html?raw" {
  const content: string;
  export default content;
}
