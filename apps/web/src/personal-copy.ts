export function personalCopy(text: string, name: string) {
  return text.replace(/\b[Dd]ads\b/g, `${name}s`).replace(/\b[Dd]ad\b/g, () => name);
}
