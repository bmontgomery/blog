import rss from '@astrojs/rss';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';
import { getPosts, withBase } from '../utils';

export async function GET(context) {
	const posts = await getPosts();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: new URL(withBase('/'), context.site),
		items: posts.map((post) => ({
			...post.data,
			link: withBase(`/${post.id}/`),
		})),
	});
}
