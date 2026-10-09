# flix_webapp

**flix_webapp** is a flexible, *frontend-first* application built on Vue 3 and Vite, designed to unify the management of [Radarr](https://radarr.video/) and [Sonarr](https://sonarr.tv/) into a single interface. Whether you opt for a purely frontend approach or integrate an optional backend, flix_webapp aims to simplify the process of monitoring and controlling your movie and TV series libraries.

If you wish to enable the optional backend, you can retrieve it here: [flix_api](https://github.com/FlixLabs/flix_api).

---

## Features

### Without the Optional Backend
- **Search, Add, and Remove** movies and TV series
- **Manage Libraries** for Radarr and Sonarr
- **Calendar** movie releases and TV episode schedules in a calendar
- **Track Upcoming** movie releases and TV episode schedules
- **Monitor Ongoing Downloads** for films and series
- **View System Information** for Radarr and Sonarr (host, system status, disk space, logs, and alerts)

### With the Optional Backend
- **Multi-Instance Management** for Radarr and Sonarr
- **Authentication** options for enhanced security
- **Color** options for enhanced UI

This project is developed entirely in my free time, and while it is already functional, improvements in **security** and **code factorization** are always welcome. Contributions and feedback are greatly appreciated!

---

## Recommended IDE Setup

[VSCode](https://code.visualstudio.com/) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

Use Node.js 24 LTS and Yarn Classic (1.x).

```sh
yarn
```

### Compile and Hot-Reload for Development

```sh
yarn dev
```

### Type-Check, Compile and Minify for Production

```sh
yarn build
```

### Lint with [ESLint](https://eslint.org/)

```sh
yarn lint
```

### Test Shared Media Actions

```sh
yarn test
```

### GitLab Releases

The version in `package.json` is the release source of truth. Each repository
has its own version; the webapp and API do not need matching versions.

- `quality` runs on merge requests, the default branch and stable `vX.Y.Z` tags.
  It runs tests, type checking and compilation in a dedicated Docker image,
  without production variables or registry authentication.
- After successful default-branch validation, `create_release_tag` creates an
  annotated `vX.Y.Z` tag and triggers its pipeline. An existing release tag is
  never moved; bump `package.json` to release another version.
- Tag pipelines build the production image with the configured variables, publish
  it as `vX.Y.Z` and `latest`, then deploy the exact version using the `X-Deploy-Version` webhook header.
- Mirrors remain independent and run on the default branch and release tags.

Before enabling automatic releases in GitLab:

1. In **Settings > CI/CD > Job token permissions**, enable **Allow Git push
   requests to the repository**. Job-token pushes do not automatically create
   pipelines, so the release script triggers the tag pipeline explicitly.
2. Protect `v*` tags and allow the pipeline user to create them. Keep production
   variables protected and available to release jobs (environment scope `*`).
   Merge-request quality checks do not need these variables.
3. Update `deploy-agent/deploy.sh` and `deploy-agent/hooks.json` on the server,
   then recreate the production deploy-agent to reload its hooks before merging.
   Keep the registry repository in `APP_IMAGE`; the agent overrides only its tag
   for the requested release. No Compose changes are required.

The release script uses the existing job token, not a new personal access token.
No tags need to be pushed manually. Test release scripts locally with:

```sh
yarn test:ci
```
