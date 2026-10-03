// Bun imports these as text (`with { type: "text" }`) and embeds them in a
// compiled binary.
declare module "*.md" {
  const text: string;
  export default text;
}
