// The editor uses Markdown, but phone keyboards sometimes paste headings as
// "##Heading" without the required space. Treat these as headings too while
// keeping plain text and strings of hash characters as normal paragraphs.
export function parseArticleHeading(line) {
  return String(line || '').match(/^(#{1,3})(?:[ \t]+|(?=[^\s#]))(.+)$/)
}
