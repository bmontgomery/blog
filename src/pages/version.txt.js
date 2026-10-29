// The commit this site was built from. `node scripts/blog.mjs verify` polls it to tell
// when a push has actually been deployed. GITHUB_SHA is set by GitHub Actions.
export function GET() {
	return new Response(process.env.GITHUB_SHA || 'local');
}
