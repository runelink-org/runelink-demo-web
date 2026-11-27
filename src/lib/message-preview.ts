export function formatMessagePreview(body: string): string {
  const lineEnd = body.search(/[\r\n]/u);
  return lineEnd < 0 ? body : `${body.slice(0, lineEnd)} ...`;
}
