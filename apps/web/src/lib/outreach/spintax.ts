/**
 * Resolves {option1|option2|option3} spintax by randomly picking one variant.
 * {{variables}} are protected so they are never corrupted.
 * Safe to import on both client and server.
 */
export function resolveSpintax(text: string): string {
  const stash: string[] = [];
  const protected_ = text.replace(/\{\{[^{}]+\}\}/g, (m) => {
    stash.push(m);
    return `\x00${stash.length - 1}\x00`;
  });

  let result = protected_;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/\{([^{}]+)\}/g, (_, inner: string) => {
      const options = inner.split("|");
      return options[Math.floor(Math.random() * options.length)];
    });
  } while (result !== prev);

  return result.replace(/\x00(\d+)\x00/g, (_, i) => stash[parseInt(i)]);
}
