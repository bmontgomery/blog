# Blog

A personal blog built with [Astro](https://astro.build) (blog starter template), deployed to
GitHub Pages by GitHub Actions, with [swamp](https://swamp.club) behaviors and workflows for
setup, writing, and publishing.

## How it fits together

```
write (draft) ──► publish-post workflow ──► git push main ──► .github/workflows/deploy.yml ──► GitHub Pages
```

- `src/content/blog/` holds posts (Markdown or MDX). Posts with `draft: true` show up in
  `npm run dev` but are never built for production.
- `.github/workflows/deploy.yml` builds and deploys on every push to `main`. It sets `SITE_URL`
  and `BASE_PATH` from `actions/configure-pages`, so the site works whether the repo is
  `<user>.github.io` (served at `/`) or any other name (served at `/<repo>/`).
- `scripts/blog.mjs` does the actual work. The swamp behaviors in `models/` call it.
- `workflows/` chains the behaviors into multi-step swamp workflows.

## One-time setup

1. On github.com, create an **empty** repository (no README, license, or .gitignore). Name it
   `<your-username>.github.io` to serve the blog at `https://<your-username>.github.io/`; any
   other name serves it at `https://<your-username>.github.io/<repo>/`.
2. In that repo, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Run:

   ```sh
   swamp workflow run setup-github-pages --input repoUrl=https://github.com/<user>/<repo>.git
   ```

   It installs dependencies and builds the site, then pauses on a `manual_approval` step for
   steps 1–2. Approve and resume using the commands it prints:

   ```sh
   swamp workflow approve setup-github-pages enable-pages --run <run-id>
   swamp workflow resume setup-github-pages --run <run-id>
   ```

   It then commits, pushes `main`, and waits until the site is live.

Then make it yours: `src/consts.ts` (site title/description), `src/pages/about.astro`,
`src/pages/index.astro`, the social links in `src/components/Header.astro` and `Footer.astro`,
and delete the sample posts in `src/content/blog/`.

## Writing and publishing

| Step                         | Command                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Start a draft                | `swamp behavior run blog-new-post execute --input "title=My Post" --input "description=..."` |
| Preview (drafts included)    | `npm run dev` → http://localhost:4321                                                |
| List posts and their status  | `swamp behavior run blog-list-posts execute`                                         |
| Publish a draft              | `swamp workflow run publish-post --input slug=my-post`                               |
| Deploy other changes         | `swamp workflow run deploy-site --input "message=Update about page"`                  |

The home page lists published posts, and each post is served at `/<slug>/`.
`blog-new-post` also accepts `--input slug=...` to choose the URL (slugs that would collide with
other pages, such as `about`, are refused). `publish-post` sets
`draft: false` and `pubDate` to today, checks the build, commits and pushes, then waits until
`/<slug>/` is live. Running it again on an already-published post stamps `updatedDate`
instead.

### Swamp behaviors

All are `command/shell` behaviors with a single `execute` method:

| Behavior              | What it does                                                    |
| --------------------- | --------------------------------------------------------------- |
| `blog-install`        | `npm ci`                                                        |
| `blog-build`          | `npm run build` (catches frontmatter and template errors)       |
| `blog-new-post`       | Creates `src/content/blog/<slug>.md` as a draft                 |
| `blog-list-posts`     | Lists posts with draft/published status                         |
| `blog-publish-post`   | Flips a draft to published (or stamps `updatedDate`)            |
| `blog-ship`           | Commits all changes and pushes `main`                           |
| `blog-connect-github` | Sets `origin` and pushes the first commit                       |
| `blog-verify-live`    | Polls the GitHub Pages URL until it returns 200 (up to 10 min)  |

## Commands without swamp

| Command                     | Action                                       |
| :-------------------------- | :------------------------------------------- |
| `npm install`               | Install dependencies                         |
| `npm run dev`               | Local dev server at `localhost:4321`         |
| `npm run build`             | Build the production site to `./dist/`       |
| `npm run preview`           | Preview the build locally                    |
| `node scripts/blog.mjs ...` | The helper the behaviors call (see its header) |
