declare module '*.png' { const url: string; export default url }
declare module '*.jpg' { const url: string; export default url }
interface ImportMeta {
  glob(pattern: string, options: { eager: true; query: string; import: string }): Record<string, unknown>
}
