#!/usr/bin/env node
// Blog maintenance commands, used directly or through the swamp behaviors in models/.
//
// Inputs are read from environment variables so values containing quotes or spaces
// pass through swamp and the shell untouched:
//
//   node scripts/blog.mjs new        POST_TITLE, POST_DESCRIPTION, POST_SLUG (optional)
//   node scripts/blog.mjs publish    POST_SLUG
//   node scripts/blog.mjs list
//   node scripts/blog.mjs connect    REPO_URL
//   node scripts/blog.mjs ship       COMMIT_MESSAGE
//   node scripts/blog.mjs site-url
//   node scripts/blog.mjs verify     SITE_PATH (optional), VERIFY_TIMEOUT_SECONDS (optional)

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const POSTS_DIR = 'src/content/blog';

const commands = { new: newPost, publish, list, connect, ship, 'site-url': siteUrl, verify };

const [command] = process.argv.slice(2);
if (!commands[command]) {
	fail(`Usage: node scripts/blog.mjs <${Object.keys(commands).join('|')}>`);
}
try {
	await commands[command]();
} catch (err) {
	fail(err.message);
}

// --- posts -------------------------------------------------------------------

function newPost() {
	const title = requireEnv('POST_TITLE');
	const description = process.env.POST_DESCRIPTION?.trim() || title;
	const slug = slugify(process.env.POST_SLUG?.trim() || title);
	const file = join(POSTS_DIR, `${slug}.md`);
	if (existsSync(file)) fail(`${file} already exists`);

	const frontmatter = [
		'---',
		`title: ${JSON.stringify(title)}`,
		`description: ${JSON.stringify(description)}`,
		`pubDate: ${today()}`,
		'draft: true',
		'---',
	].join('\n');
	writeFileSync(file, `${frontmatter}\n\nWrite your post here.\n`);
	console.log(`Created draft ${file}`);
	console.log(`Preview: start the dev server (npm run dev) and open http://localhost:4321/blog/${slug}/`);
}

function publish() {
	const slug = slugify(requireEnv('POST_SLUG'));
	const file = findPost(slug);
	let source = readFileSync(file, 'utf8');
	const wasDraft = /^draft:\s*true\s*$/m.test(getFrontmatter(source));

	if (wasDraft) {
		// First publication: the post goes live today.
		source = setField(source, 'draft', 'false');
		source = setField(source, 'pubDate', today());
	} else {
		// Already live: record the update instead of moving the publish date.
		source = setField(source, 'updatedDate', today());
	}
	writeFileSync(file, source);
	console.log(`${wasDraft ? 'Published' : 'Updated'} ${file}`);
}

function list() {
	const rows = postFiles().map((name) => {
		const fm = getFrontmatter(readFileSync(join(POSTS_DIR, name), 'utf8'));
		const field = (key) => fm.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))?.[1].replace(/^['"]|['"]$/g, '') ?? '';
		return {
			slug: name.replace(/\.mdx?$/, ''),
			status: field('draft') === 'true' ? 'draft' : 'published',
			pubDate: field('pubDate'),
			title: field('title'),
		};
	});
	console.table(rows);
}

// --- git / GitHub ------------------------------------------------------------

function connect() {
	const repoUrl = requireEnv('REPO_URL');
	const remotes = git('remote').split('\n');
	git('remote', remotes.includes('origin') ? 'set-url' : 'add', 'origin', repoUrl);
	console.log(`origin -> ${repoUrl}`);

	if (!hasCommits() || hasChanges()) commitAll('Set up Astro blog with swamp behaviors');
	git('push', '-u', 'origin', 'HEAD:main', { stdio: 'inherit' });
	console.log(`Pushed. The site will deploy to ${pagesUrl()}`);
}

function ship() {
	const message = process.env.COMMIT_MESSAGE?.trim() || 'Update blog';
	if (hasChanges()) {
		commitAll(message);
	} else {
		console.log('No local changes to commit.');
	}
	git('push', 'origin', 'HEAD:main', { stdio: 'inherit' });
	console.log(`Pushed. GitHub Actions will deploy to ${pagesUrl()}`);
}

function siteUrl() {
	console.log(pagesUrl());
}

async function verify() {
	const path = (process.env.SITE_PATH || '/').replace(/^\/?/, '');
	const url = new URL(path, pagesUrl().replace(/\/?$/, '/')).href;
	const timeoutMs = Number(process.env.VERIFY_TIMEOUT_SECONDS || 600) * 1000;
	const deadline = Date.now() + timeoutMs;
	console.log(`Waiting for ${url} ...`);

	// A deploy takes a minute or two; poll until the page is live.
	while (Date.now() < deadline) {
		const status = await fetch(url, { cache: 'no-store' }).then((r) => r.status, () => 0);
		if (status === 200) {
			console.log(`Live: ${url}`);
			return;
		}
		await new Promise((r) => setTimeout(r, 15_000));
	}
	fail(`${url} was not live after ${timeoutMs / 1000}s. Check the Actions tab of your GitHub repo.`);
}

/** GitHub Pages URL derived from the origin remote: https://<owner>.github.io[/<repo>]/ */
function pagesUrl() {
	const origin = git('remote', 'get-url', 'origin');
	const match = origin.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/);
	if (!match) throw new Error(`origin (${origin}) is not a GitHub repository`);
	const [, owner, repo] = match;
	const userSite = repo.toLowerCase() === `${owner.toLowerCase()}.github.io`;
	return `https://${owner.toLowerCase()}.github.io/${userSite ? '' : `${repo}/`}`;
}

function git(...args) {
	const options = typeof args.at(-1) === 'object' ? args.pop() : {};
	return execFileSync('git', args, { encoding: 'utf8', ...options })?.trim() ?? '';
}

function hasCommits() {
	try {
		git('rev-parse', '--verify', 'HEAD', { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}

function hasChanges() {
	return git('status', '--porcelain') !== '';
}

function commitAll(message) {
	git('add', '-A');
	git('commit', '-m', message, { stdio: 'inherit' });
}

// --- helpers -----------------------------------------------------------------

function postFiles() {
	return readdirSync(POSTS_DIR).filter((name) => /\.mdx?$/.test(name));
}

function findPost(slug) {
	const name = postFiles().find((n) => n.replace(/\.mdx?$/, '') === slug);
	if (!name) fail(`No post named "${slug}" in ${POSTS_DIR}. Run \`node scripts/blog.mjs list\` to see posts.`);
	return join(POSTS_DIR, name);
}

function getFrontmatter(source) {
	const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) throw new Error('Post has no frontmatter');
	return match[1];
}

/** Set (or add) a top-level frontmatter field. */
function setField(source, key, value) {
	const fm = getFrontmatter(source);
	const line = new RegExp(`^${key}:.*$`, 'm');
	const updated = line.test(fm) ? fm.replace(line, `${key}: ${value}`) : `${fm}\n${key}: ${value}`;
	return source.replace(fm, () => updated);
}

function slugify(text) {
	const slug = text
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '') // strip accents
		.replace(/['’]/g, '') // "it's" -> "its"
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (!slug) fail(`Cannot make a slug from "${text}"`);
	return slug;
}

function today() {
	return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
}

function requireEnv(name) {
	const value = process.env[name]?.trim();
	if (!value) fail(`${name} is required`);
	return value;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
