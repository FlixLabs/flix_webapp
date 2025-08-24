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
