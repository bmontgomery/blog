import { getCollection } from 'astro:content';

// BASE_URL is "/" for a <user>.github.io repo, or "/<repo>" for a project repo.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix a site-relative path with the configured base path. */
export function withBase(path: string) {
	return base + (path.startsWith('/') ? path : `/${path}`);
}

/** Remove the configured base path from a pathname. */
export function stripBase(pathname: string) {
	return base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
}

/** Blog posts, newest first. Drafts are visible in `astro dev` but never built for production. */
export async function getPosts() {
	const posts = await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
	return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}
