export function formatMessagePreview(body: string): string {
  const lineEnd = body.search(/[\r\n]/);
  return lineEnd < 0 ? body : `${body.slice(0, lineEnd)} ...`;
}
