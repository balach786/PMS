export function slugify(input: string, fallback = 'pump'): string {
  const slug = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, 48)
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

export async function uniqueSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string> {
  let candidate = base;
  let i = 1;
  while (await isTaken(candidate)) {
    i += 1;
    candidate = `${base}-${i}`;
  }
  return candidate;
}
