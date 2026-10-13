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
- **Integration Diagnostics** for Radarr and Sonarr, with service availability, versions, last valid response and individual retries

### With the Optional Backend
- **Multi-Instance Management** for Radarr and Sonarr
- **Authentication** options for enhanced security
- **Color** options for enhanced UI
- **API and Storage Agent Diagnostics**, distinguishing an unreachable agent from inaccessible storage volumes

In **System > Integrations**, checks run automatically every 60 seconds only
while the section is open. **Check All** and each service's **Retry** button
perform read-only requests. They never start searches, downloads or deployments.
Standalone mode checks Radarr and Sonarr directly without contacting Flix API.
Diagnostic messages do not display API keys or agent tokens. A degraded agent
is reachable but cannot provide measurements for one or more volumes; this is
different from an unavailable agent. Failed retries preserve the date of the
last valid response for the selected instance.

**System > Storage** distinguishes unreachable agents, inaccessible volumes,
missing measurements and unconfirmed capacity. Full or nearly full storage
produces a separate capacity alert using `VITE_SYSTEM_STORAGE_SPACE_TRESHOLD`.
After a failed refresh, old capacities are cleared and only the date of the
last valid measurement is retained. The Dashboard summarizes these same
diagnostics. Standalone mode still uses Radarr/Sonarr measurements; it never
substitutes the container disk for an unconfirmed media volume.

Detailed filesystem causes require the updated Flix API and a rebuilt storage
agent. Older versions remain usable with generic diagnostics. Storage checks
are read-only and never recreate containers, repair mounts or delete media.

This project is developed entirely in my free time, and while it is already functional, improvements in **security** and **code factorization** are always welcome. Contributions and feedback are greatly appreciated!

---

### Media File Details

Movie sheets in Library, Dashboard and Outings, and episode details in Library
and Outings, share the same file information layout: filename, size, quality,
resolution, video/audio codecs, scanned audio languages, subtitles and file-added
date. These values come from existing Radarr/Sonarr responses, with or without
the optional API; opening a movie sheet does not fetch extra metadata.

Missing scan information is shown as **Not provided**, not inferred from a release
title or language profile. **File added** is the file import date, not the date
the movie or series was added to the library. File sizes use decimal GB.

### Media Monitoring

Library, Dashboard and Outings sheets for existing media can enable or disable
movie/series monitoring. Series expose a compact **Season monitoring** panel,
including specials. Disabling the series preserves individual season choices;
enable the series before changing those choices.

Each change reads the current Radarr/Sonarr resource, updates only the requested
monitoring setting, then reads back the persisted state. Other settings and file
paths are preserved. These actions do not start a search, move files or delete
media, and work with or without Flix API. An unknown monitoring state is not
treated as disabled: use **Reload monitoring** to read it. After an uncertain
update, reload monitoring before making another change.

### Media Sheet Navigation

Existing media sheets provide **Share media** with a canonical Library URL and
the selected instance name (no service URLs or API keys). Clipboard copying is
available on supported secure origins; otherwise the link can be selected and
copied manually. Opening a Library card adds a browser-history entry; previous/
next media replace that sheet entry, and Back/Forward close/reopen the sheet
without resetting list filters or pagination. Direct links survive login and
report unavailable media/instances instead of opening another instance's ID.

The **Calendar** supports month/week/day navigation, **Today**, movie/series
toggles and All/Monitored/Missing/Available filters. Filters do not refetch data.
Available requires a service-reported file; Missing requires an explicit missing
file and a release date not in the future, excluding cinema-only events. Unknown
file/monitoring states are not guessed. Events and overflow lists link to the
media sheet in Library. Calendar date, view and filters persist when returning.
Desktop defaults to the month grid, with two-line events and highlighted today;
mobile defaults to a grouped agenda with full titles. Both layouts remain
selectable, and the agenda paginates seven event days at a time. Busy days show
four events with **Show all events** opening the complete day list.
Requests cover the displayed days, include unmonitored media and discard late
responses after period/instance changes. Standalone mode remains supported.

Existing media sheets have a lazy-loaded **Media settings** editor for quality
profiles and existing tags. Sonarr 3 language profiles are available only when
the service reports a compatible version; newer language preferences remain
configured in Radarr/Sonarr profiles and custom formats. Saving rereads the
resource, preserves unedited fields and verifies the persisted state. No search,
move or deletion is requested. Concurrent changes or uncertain saves require
**Reload settings** before retrying. Standalone mode is supported.

Existing media sheets also provide a collapsed **Media history** section.
Opening it loads ten events at a time from Radarr/Sonarr, newest first, with
release titles, quality, episode information and reported failure/deletion
reasons. Refresh and retry are read-only. History is service-reported, not a
complete audit of Flix actions, and supports standalone mode too.

Library, Outings and Dashboard sheets provide Previous/Next controls and a
position counter for the currently displayed page. Navigation follows the
filtered display order, does not wrap at the boundaries, and leaves search,
filters and pagination unchanged. Each new sheet starts at the top; series
episodes reload for the selected series. Controls are disabled while loading
details, modifying media or reviewing a release. This works with or without
the Flix API.

### Library Bulk Actions

Use **Select media** to choose individual cards or **Select page** to include the
current page. Selection is retained across pages, but cleared on filter, media
type or instance changes. **Selection actions** groups monitoring, unmonitoring,
search, clearing selection and removal. **Library tools** groups import/export.
The visible buttons retain their labels and positions during processing.
Removal requires confirmation and deletes the media files too.

Batches run sequentially with progress and **Stop after current item**. Failed
and ineligible media remain selected; successful media are deselected. Search
skips media that cannot yet be searched, and monitoring skips unknown states.
An instance/context change stops further writes. No batch runs automatically.
These actions also work without Flix API.

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
  The quality script temporarily applies its ignore file at the context root
  for compatibility with both BuildKit and the legacy Docker builder.
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
