// CSS module declarations for TypeScript
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}

declare module 'katex/dist/katex.min.css';
