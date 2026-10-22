# flix_webapp

With Flix API 2.2.2+, download-client inspection remains available in read-only
mode when import protection cannot be verified. The panel displays torrents and
an explicit warning, without claiming they are untracked. Removal, including
forced removal, stays disabled until a refresh verifies protection successfully.

## Download Origin

Downloads and history display the indexer next to each release, without expanding
its technical details. Source links remain available when supplied by the service.
Missing queue metadata is resolved through the exact Radarr/Sonarr download ID,
never by matching titles. If only a source URL is available, its hostname is shown;
otherwise the origin is marked unknown. Lookup failures do not block download
actions. No Flix API update is required; API and standalone modes are supported.

## Outings

Outings shows recent and upcoming releases, from 30 days ago through 90 days
ahead (calendar days), ordered by the displayed release date, oldest first.
Movies use TMDB Discover's regional theatrical dates (wide release, then limited
release); these are not promises of digital or download availability. Series use
their first-ever air date: new episodes of older series belong in Calendar, not
this discovery list. The selected content language and movie release region are
preserved, in both API and standalone modes.

TMDB pages are fetched with at most four simultaneous requests per media type,
assembled by page number, deduplicated by TMDB ID and sorted by date then ID.
Undated and out-of-window entries are excluded. A failed page fails the read
instead of displaying a misleading partial list. No Flix API update is required.

## Trailers

Film and series sheets offer a **Trailer** button when TMDB lists a YouTube
trailer. Flix prefers the content language (including the original language),
then English, and prioritizes official trailers within each language. Series
with only a TVDB identifier are resolved through TMDB without guessing titles.
This works with or without Flix API, using the existing `VITE_TMDB_*` settings.

Only trailer metadata is requested when a sheet opens. The YouTube player is
loaded on click, without autoplay, and removed when closed. **Open on YouTube**
is available if the publisher, browser or network prevents embedded playback.
No YouTube API key is needed. Playback contacts YouTube in privacy-enhanced mode.

## Invited Accounts

With Flix API 2.1.0 or newer, administrators can manage **Users** from the main
menu: invite by email, choose the invitation language, revoke invitations and
disable/re-enable guest access. Enable administrator authentication first and
configure Mailjet and `FLIX_PUBLIC_URL` on the API, following the API README.
No Mailjet secret belongs in the webapp build or its `VITE_*` variables.
In API mode, Vite also removes standalone `VITE_RADARR_*` and `VITE_SONARR_*`
configuration from the client bundle, even if old CI variables remain configured.

Invitations are single-use, expire after seven days and open `/join`. Invited
users create a name and password (at least twelve characters), then sign in with
their email as username. They receive a restricted account page, without access
to instances, administration, downloads or service credentials. Routes verify
the role server-side before mounting administrator pages.

With API 2.2.0 or newer, **Requests** lets guests find films/series, request selected
seasons or the whole series, follow an existing identical request, and track their
own requests. Administrators approve/refuse requests on the same page. Configure
`TMDB_API_KEY` on the API (in addition to any existing webapp TMDB configuration).
Approval chooses a server-provided instance, quality profile and folder; existing
library settings are preserved. Unknown service results require an explicit
read-only check before another approval. Availability checks are server-side and
the visible request list refreshes every 30 seconds/on focus without replaying
mutations. All new labels/errors are translated into English and French.

**Request notifications are not implemented yet**; Mailjet invitation delivery is
already supported. In-app/email request notifications are the next separate stage.

Standalone mode remains unchanged and does not expose these account pages.

## Manual Import Tracking

Manual Import lets you correct the quality and select multiple audio languages
before reviewing a file, including filenames Radarr or Sonarr cannot parse.
The review and explicit confirmation remain required; Flix does not rename the
file or start an import while you edit these values.

For files without an identified movie/series, Flix can suggest matching media
already in the library after removing recognized advertising prefixes (currently
`[OxTorrent.com]`, including spacing/case/`www` variants). Suggestions require an
explicit selection and never rename the file or infer its quality/languages.

Manual Import is available only after the service reports an automatic import
failure or rejection (`importFailed` or `importBlocked`). A completed download,
an `importPending` state or a warning alone does not enable manual import.
Flix also rereads the
selected service's queue and commands at opening and immediately before submission;
active, queued or unverifiable imports prevent a new command. This applies in API
and standalone modes, but remains a browser preflight rather than an atomic
cross-service lock. Imports already tracked in this tab reopen their status.

For Radarr's specific `AugmentingFailedException` / `Unable to parse movie info
from path` review error, a single selected movie file can continue with manual
information. A known movie, quality and non-empty known languages are required.
This opens an explicit confirmation warning that Radarr could not verify the
filename; it does not claim a successful review or rename the file. Changing the
selection requires another review. Other errors and Sonarr remain blocking, and
the requested import may still fail in Radarr.

Downloads confirms when Radarr or Sonarr accepts a manual import and shows its
command status after the import window is closed. Tracking survives navigation
and reloads in the same browser tab, in API and standalone modes. It is scoped to
the configured service; API keys and file paths are not stored in the tracking
history. Closing Flix does not cancel commands already accepted by the service.

Status checks are read-only and never resubmit an import. If the service is
unreachable, the last known state remains visible with a retry action. A completed
command is not proof that every file was imported: check any remaining download
messages in Radarr or Sonarr. Dismissing a finished entry only removes its local
tracking record, not the command or files.


**flix_webapp** is a flexible, *frontend-first* application built on Vue 3 and Vite, designed to unify the management of [Radarr](https://radarr.video/) and [Sonarr](https://sonarr.tv/) into a single interface. Whether you opt for a purely frontend approach or integrate an optional backend, flix_webapp aims to simplify the process of monitoring and controlling your movie and TV series libraries.

If you wish to enable the optional backend, you can retrieve it here: [flix_api](https://github.com/FlixLabs/flix_api).

---

## Features

### Media Sheet Updates

Open library movie and series sheets refresh their status, files, storage and
monitoring every 30 seconds and when returning to the browser tab. This applies
to Library, Dashboard, Outings and Downloads, with or without Flix API. Closing
the sheet stops refreshes. Non-library search results are not polled.
The current sheet, scroll position and unsaved quality/tag selections are kept.
Updates pause during edits, actions and nested confirmations; failures keep the
last snapshot with a retry message. Series episode details refresh with the sheet,
and history refreshes only if its section is already expanded.
Collection sheets use the same schedule. Collection membership and the Radarr
movie library are refreshed together, updating badges, counts and missing-film
actions without resetting the member page or scroll. Updates pause while a member
preview, download request or removal confirmation is open. No search or download
is started by an automatic refresh.

### Button Colors

Buttons use the same semantic colors in light and dark themes: the custom primary
color for constructive actions (Add, Save, Search, Download), error for removal
and its confirmation, and warning for potentially destructive import replacement.
Close, Cancel, refresh actions and navigation tools are neutral. Navigation
selectors use the primary color only for the active choice.

### Download Clients

Each completed torrent shows its indexer when a matching grab is available in
Radarr or Sonarr history. Matching uses the torrent hash, never the title. Missing
or unavailable history displays **Unknown** without blocking client inspection.

With Flix API 2.0.0+, configured instances expose **Download clients** in Downloads.
The panel loads automatically using your Flix session; no separate client token is
required. Sign in once in this browser: the session persists across reloads and
browser restarts for up to 30 days. Sign out revokes it on the API. Its browser
storage is scoped to the configured API URL. Use HTTPS and a trusted browser profile.

Completed torrents still tracked by Radarr/Sonarr require explicit **Force removal**
consent. Flix API 2.2.1+ blocks active/queued imports even when forcing removal;
the panel shows the reason and disables the action. Unknown import status also
blocks cleanup. Upgrade the API first: older APIs without protection metadata
show "Import status unavailable" and cannot remove torrents from this webapp.
Forcing does not clear the Radarr/Sonarr queue or remove media from the library.
Files are kept by default; deleting data remains a
separate opt-in allowed by server configuration. Incomplete torrents, unavailable
queue verification and uncertain writes remain protected. No automatic cleanup occurs.

After each accepted client removal the panel rereads the client list, including
newly completed torrents. It only confirms removal if the torrent is absent from
that response. A still-listed torrent or failed verification remains explicitly
uncertain, with refresh required and no automatic destructive retry. An empty
search result is distinct from a client with no completed torrents left.

The regular Downloads **Remove** action also rereads both configured service queues
and their import commands before its direct Radarr/Sonarr DELETE, in API and
standalone modes. Active/queued imports, missing download identities, incomplete
verification and configuration changes block the request. This is a browser-side
preflight, not server enforcement or an atomic filesystem lock; only configured
services can be checked, and a service can start work after verification.

Deploy API and webapp together. Existing Flix accounts require the one-time server
migration documented in the API README (AUTH_LEGACY_CRYPT_KEY). Without Flix
authentication, the API intentionally stays public: restrict it to a trusted network.
Standalone mode without Flix API is unchanged and does not expose client cleanup.

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

For movie releases rejected only with `Unable to parse release`, **Associate with
this movie** opens an explicit confirmation of the selected film and original
release. It uses Radarr's cached release GUID/indexer and explicit `movieId`,
without renaming the release or overriding quality/languages. Other download
prohibitions and Sonarr remain blocked. Requires a Radarr version supporting the
explicit movie association on `POST /api/v3/release`; cache expiry requires a new
search. Downloading may still fail and manual import may be needed afterwards.
This works with and without Flix API.

Downloads also show **Source page** when Radarr/Sonarr retain the release details
URL in their grab history, including downloads that need attention. Source lookups
use the download ID (never the title), are cached in memory for the current instance,
and do not block the queue. This works with or without Flix API. No link is shown
when the source is missing or invalid; torrent/NZB download URLs are never substituted.

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
TMDB search in the selected content language. At most three missing candidates per media
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
requires a valid library ID regardless of the movie/series release status, and
monitoring skips unknown states. Individual series sheets disable both search
actions until episodes are loaded, with an explanation if none are available.
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

**Download missing** lets you select missing and upcoming films and explicitly confirm
their requests. Released films are searched immediately. Upcoming films are added
with monitoring enabled and minimum availability set to Released, without an
immediate search. Existing upcoming films are monitored using their current settings. Existing films keep their current quality profile; new films use
the chosen profile and configured movie root folder. Each film is checked again
before a request, available/unknown films are excluded, and requests run
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

The interface declares its selected language in `html[lang]`. **Skip to content** bypasses
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

- `quality` runs on merge requests and stable `vX.Y.Z` tags.
  It runs tests, type checking and compilation in a dedicated Docker image,
  without production variables or registry authentication.
  The quality script temporarily applies its ignore file at the context root
  for compatibility with both BuildKit and the legacy Docker builder.
- `e2e` runs alongside `quality` as a separate blocking job on merge requests
  and release tags, in Docker on the Shell runner, with mocked services and no
  production secrets. Merge requests run affected scenarios on desktop; mobile
  keeps the cross-page safety net, selected accessibility/layout scenarios and
  every modified E2E spec. Shared/unmapped changes run all desktop scenarios with
  that same mobile policy. An unavailable MR diff runs the full desktop/mobile
  suite rather than skipping checks. Release tags run eight critical spec files
  on both desktop and mobile: session, login loading, dashboard actions, global
  navigation, regressions, import protection, download clients and media requests.
  Full desktop/mobile coverage runs in scheduled pipelines or when using
  **Build > Pipelines > New pipeline**. These validation-only pipelines cannot
  create releases, publish images, deploy or update mirrors, even when targeting a tag.
  Chromium and its Linux dependencies use the locked Playwright version in a
  separate Docker layer, reusable across application dependency/version changes
  on the same Docker daemon. The first build or a Playwright update still installs
  the browser. CI uses two workers, one retry and a coverage-scaled 15-45 minute
  test-run limit.
  HTML reports, failure screenshots/traces and GitLab JUnit results are retained
  for seven days, including on failure. Reports are copied out of the container,
  not bind-mounted through a possibly remote Docker daemon. No runner-side Node
  or browser installation and no extra CI variables are required.
- On the default branch, `create_release_tag` creates an
  annotated `vX.Y.Z` tag and triggers its pipeline. An existing release tag is
  never moved; bump `package.json` to release another version.
  Both `quality` and critical `e2e` must pass in the tag pipeline before building a release image.
  Release/build jobs wait for E2E without downloading the browser reports.
- Tag pipelines build the production image with the configured variables, publish
  it as `vX.Y.Z` and `latest`, then deploy the exact version using the `X-Deploy-Version` webhook header.
- Mirrors remain independent and run on the default branch and release tags.

To enable nightly full validation, create a schedule in **Build > Pipeline schedules**
targeting `master`, for example `0 3 * * *` with timezone `Europe/Paris`.
The repository defines the jobs, but a Maintainer must create/activate the schedule
in GitLab. No extra variables are needed. For local full validation, use
`yarn test:e2e`; to inspect or run the release selection, use
`FLIX_E2E_SCOPE=smoke node scripts/run-e2e-tests.mjs` (append `--list` to list only).

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

### Languages And Regional Preferences

Settings > Language and region provides independent, browser-persisted choices:
English/French interface, English/French/original media content, and release region.
First use detects the browser language and region. Changes apply without a page
reload, including navigation, confirmations, accessibility labels, errors, dates,
numbers, calendar labels and the first day of the week. No new CI variable or API
migration is required. Settings remain available without Flix API.

TMDB localizes displayed titles, synopses, collections and episode names where
available; missing translations retain original/native metadata. Library search
also accepts translated titles using a debounced, bounded TMDB supplement. Native
identities and action payloads remain unchanged. Release names, file paths, custom
profiles/tags, and unrecognized messages supplied by external services remain as
reported. Language choices never change Radarr/Sonarr download preferences.

Metadata requests are shared, cached for 30 minutes, limited to four concurrent
requests and cancelled when their views close. Episode translations share one
request per displayed season. Translations do not reorder library cards as they
arrive. Upcoming movie queries use the selected TMDB language and release region;
TV episode air dates remain those reported by Sonarr/TMDB, not fabricated local
release dates.

Translation catalogs live in `src/i18n/en.json` and `src/i18n/fr.json`.
`t()` uses readable English source messages as literal keys. Interpolation uses
named parameters, with Vue I18n handling plurals. `yarn test:i18n` checks matching
catalogs, interpolation parameters, referenced keys and untranslated static UI
text. It runs automatically as part of `yarn test`, including the quality job.
To add a language, add its catalog, register it in `src/i18n`, provide the matching
Vuetify locale and include it in the supported preference choices.

References: [Vue I18n](https://vue-i18n.intlify.dev/guide/essentials/started)
and [TMDB language support](https://developer.themoviedb.org/docs/languages).
