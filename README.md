# flix_webapp

## Codex Session

Resume the development session:

```sh
codex resume 019d0252-50ae-7110-935a-753841d46961
```

**flix_webapp** is a flexible, *frontend-first* application built on Vue 3 and Vite, designed to unify the management of [Radarr](https://radarr.video/) and [Sonarr](https://sonarr.tv/) into a single interface. Whether you opt for a purely frontend approach or integrate an optional backend, flix_webapp aims to simplify the process of monitoring and controlling your movie and TV series libraries.

If you wish to enable the optional backend, you can retrieve it here: [flix_api](https://github.com/FlixLabs/flix_api).

---

## Features

### Removing Movies From a Collection

The collection sheet's **Remove movies** action offers a checklist of library
members, including films without a local file. Absent films are never selected.
Files are kept by default; **Also delete movie files from disk** must be explicitly
enabled before confirmation. Collection membership and each movie's Radarr/TMDB
identity are read again before any sequential deletion. No collection, list or
monitoring settings are changed, and those settings may add films again later.
An uncertain delete stops the remaining requests and is never automatically
retried. Results remain visible; library and collection counters are refreshed.
This works with or without Flix API. Collection member cards use the same inline
component as movie cards: file availability (**Existing** in green, **Missing**
in red, or **Unknown** in neutral) and movie status (**Released**, **Announced**,
etc. in blue, or **Unknown** in neutral). Library membership is used to
determine eligible actions, not displayed as an extra badge. A film can be in
the library yet have a missing file. Labels, colors and rendering are centralized
for Library, Outings and Collections, including collection totals.

### Download Media Sheets

Downloads use a compact desktop table and mobile cards backed by the same
Vuetify table, filters and pagination. Queue responses include the service's
movie/series so confirmed media titles appear before release names without
per-row requests. Release names remain searchable and available in Details.
Progress and remaining time stay visible; dates, clients, sizes and technical
messages are collapsible. Import warnings remain visible without expanding
Details. Missing metadata never causes a guessed title or progress value.

Queue and history titles open the associated movie or series sheet in place,
using the service's movie/series ID, never a queue ID or a parsed release name.
The sheet is read-only and preserves Downloads filters, pagination and scroll.
Closing returns keyboard focus to the title. Missing IDs remain plain text;
unavailable media show an error and can be retried without reloading the page.
This works with or without Flix API. The raw queue status is shown only when
it differs from the interpreted badge; import warnings remain visible.

### Dashboard Media Search

Search preserves Radarr/Sonarr results and supplements translated titles with
TMDB search in the browser's language. At most three missing candidates per media
type and query are resolved through the service. Movies use TMDB IDs; series use
TMDB external IDs to obtain a confirmed TVDB ID, then a Sonarr lookup. Series
without a confirmed TVDB mapping are skipped. TMDB results are never added directly.
Translated titles contribute to ranking without replacing the service title.
The supplement has a 2.5-second time budget and is cancelled when the query or
instance changes. If TMDB is unavailable, native service results remain usable.
Identifier searches are unchanged. This works with or
without Flix API, using the existing TMDB configuration.

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

### Automatic Movie Collections

**Library > Collections** groups movie sagas reported by Radarr. Only collections
connected to the selected movie library are shown. Collection metadata is loaded
with the library to populate the counter; the collection view remains lazy-loaded.
Requests are bounded and retriable, and work with or without the Flix API.
Media counters show `(...)` until their totals are known, then the actual number
(including zero). Switching between library views reuses collection metadata.

Each saga shows its films in release-year order (unknown years last). **Available**
means the matching TMDB movie has a local file according to the library response;
an added movie without a file is still **Missing**. Unreleased films are marked
**Upcoming**, and incomplete availability metadata stays **Unknown**. Counts do
not use Radarr's `isExisting` or `missingMovies` as file availability.

Films in the library open their existing media sheet; other films have a read-only
preview. The collection link on a library movie sheet opens its saga. No films are
automatically added, monitored or downloaded. Custom and series collections are
not included. Radarr must support `/api/v3/collection`.

**Download missing** lets you select released missing films and explicitly confirm
their searches. Existing films keep their current quality profile; new films use
the chosen profile and configured movie root folder. Each film is checked again
before a request, available/future/unknown films are excluded, and requests run
sequentially without automatic write retries. A requested search does not guarantee
that Radarr will find a release or start a download. This works with or without
the Flix API and requires no API or storage-agent changes.

Movies, Series and Collections share the library navigation controls. Collection
posters keep their portrait proportions, and collection/media sheets share their
Close button, overflow handling and fading backdrop blur. Empty detail sections
never create a scroll hint; real overflow remains scrollable.

Galleries use the same media card (poster, two-line title, subtitle, status area
and hover/focus effects). Film, series and collection sheets share their frame,
poster/metadata summary and footer. Known collection counts appear in their view
button, like movie/series counts. Saga members show at most two rows per page:
four on mobile, six on tablets and eight on desktop.

### Network Recovery

Read requests use a 15-second deadline, cancel obsolete work and discard late
responses after navigation, instance/configuration changes or unmounting.
Failures remain visible with a **Retry** action instead of requiring a hard
refresh. An unavailable read is not presented as a successful empty list or a
healthy service. The existing Calendar and storage-agent diagnostics keep their
own bounded read and refresh controls.

Library and Downloads may retain last successful data only for the same context;
failed refreshes label it as stale and block changes until a read succeeds.
Dashboard and Outings also require verified library membership and profiles
before changing media. Series identity and episode reads can be retried from
the sheet. **Reload instances** beside the instance selector reads updated API
configuration, including changed service URLs or credentials.

Polling does not replace an already pending read. Connectivity events are hints,
not proof that every service is reachable, and never replay mutations.
If a settings write cannot be confirmed, **Retry** reads the current settings;
it does not resend the change. Reloading those settings never triggers a write
through the form switches. Standalone mode uses the same read recovery without
requesting Flix API configuration.

### Keyboard Accessibility

The interface declares English as its language. **Skip to content** bypasses
the header when navigating with a keyboard. Library and Outings cards open with
Enter or Space; selection mode uses the individual checkboxes instead of adding
a second card tab stop.

Media, release, import, quality, sharing and calendar dialogs have accessible
names. Vuetify traps focus and returns it to the captured opener; destructive
confirmations initially focus **Cancel**. Escape closes non-persistent dialogs;
in-progress operations keep their existing close restrictions.

Focus indicators cover fields and teleported dialogs using the surface text
color, independently of custom accents. Reduced-motion preferences shorten
dialog transitions. Loading messages are announced politely, and notifications
have a keyboard-accessible dismissal button. These checks are not a complete
WCAG conformance audit.

### Loading Performance

Pages are loaded on first navigation using Vue Router dynamic imports. Visiting
one page does not download the JavaScript for every other page.

Concurrent authentication bootstrap and library-membership reads share one
request per exact URL, including service credentials. Each consumer receives
independent data. Results and errors are discarded when the request finishes;
subsequent reads remain fresh, and mutation readbacks are never shared.
Library matching uses an external-ID index and skips empty search results.
Responses from an old search, instance or unmounted page cannot enrich the
current results. These changes also support standalone Radarr/Sonarr mode.

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
