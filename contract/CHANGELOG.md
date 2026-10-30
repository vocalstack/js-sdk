# Changelog: @vocalstack/contract

Every change to `contract.json` (the one public document, `/v1`) gets an
entry here, in the same change. The rules are in `docs/api-lifecycle.md`;
`make contract-check` refuses a contract change with no entry.

Entries go under **Unreleased**, by kind:

- **Added**: new operations, new optional request fields, new response
  fields, new enum values in responses, new error codes.
- **Changed**: behaviour or documentation changes that keep the shape.
- **Deprecated**: still works; carries `Deprecation` and `Sunset` headers.
  Give the sunset date and the replacement.
- **Removed**: only in a new major version, or after a sunset date passed.
- **Breaking**: anything non-additive. Only allowed together with a new
  major path, never inside `/v1`.

One line per change, naming the operation (`METHOD /path`, its
`operationId`) or the schema, so the entry can be found from the diff.

## [Unreleased]

### Tags (2026-10-30, still `1.0.0-alpha.0`)

- **Added**: `GET /v1/tags` (`tags.list`), `POST /v1/tags` (`tags.create`), `PATCH /v1/tags/{id}` (`tags.update`), `DELETE /v1/tags/{id}` (`tags.delete`) and `POST /v1/tags/{id}/transcriptions` (`tags.tagTranscriptions`, `TagTranscriptions`: `add`, `remove`): the account's own labels for its transcriptions (`Tag`: `id`, `name`, `color` — `coral`, `amber`, `lime`, `green`, `teal`, `blue`, `violet` or `pink` — `createdAt`). The SDKs' `tags` group (Python `tags.tag_transcriptions`).
- **Added**: `Transcription.tags` (`TagRef`: `id`, `name`, `color`), the tags on it, and `Transcription.origin`, where it was made (`dashboard`, `api`, `extension`, `desktop_app`, `obs`, `wordpress`, `payload`, `strapi`, `sanity`, `contentful`, `mcp`, `batch_api`, `broadcast`, `unknown`; `sanity` is the Sanity plugin, known by its User-Agent `VocalStack-Sanity/<version>`).

### Loom share links (2026-10-30, still `1.0.0-alpha.0`)

- **Changed**: `transcriptions.probe` (`GET /v1/transcriptions/probe`) answers a public Loom share link (`loom.com/share/<id>`) with `kind: file`, `ok: true` (it was `ok: false`, `reason: site_not_fetched`, `siteName: Loom`); a private Loom video is `ok: false` with `reason: forbidden`, a Loom video longer than a file may be `too_long`. `POST /v1/transcriptions` (`transcriptions.create`) with such a `url` transcribes the video's audio. `ProbeReason.site_not_fetched`'s description no longer names Loom.

### Live streams on web pages (2026-10-30, still `1.0.0-alpha.0`)

- **Added**: `PageMedia.kind` (`live` | `file`, the `LinkKind` values) on each of `LinkProbe.media` (`GET /v1/transcriptions/probe`, `transcriptions.probe`): a web page's live streams are listed too (a station's Icecast mount with no extension, a live HLS playlist, an address the page carries in base64), the page's own player's stream first.
- **Changed**: `transcriptions.probe` answers a web page whose own player plays a live stream (a radio station's page) with `kind: live`, `ok: true` and no `reason`, `media` listing the streams; a stream answering with Icecast / Shoutcast headers is `live`.
- **Changed**: `POST /v1/transcriptions/live` (`transcriptions.createLive`), `POST /v1/broadcasts` (`broadcasts.create`) and `POST /v1/broadcasts/{id}/audio-sources` (`broadcasts.addAudioSource`) take a web page as a stream source's `url`: the first live stream on it becomes `source.url` (the address the server pulls). A page with none is `400 invalid_options` ("No live audio stream found on that page."); searching a page counts against the probe's hourly allowance of web pages (`rate_limited`), unless the probe searched that page in the last 10 minutes.

### Link check: refused sites, non-recordings, copy protection (2026-10-29, still `1.0.0-alpha.0`)

- **Added**: `LinkProbe.reason` (`GET /v1/transcriptions/probe`, `transcriptions.probe`), set whenever `ok` is `false`: `web_page`, `site_not_fetched`, `meeting`, `not_found`, `unreachable`, `forbidden`, `not_media`, `copy_protected`, `too_long`, `unknown`; and `LinkProbe.siteName` with `site_not_fetched` and `meeting` (Vimeo, Kick, Loom, Google Meet…).
- **Changed**: `transcriptions.probe` answers `ok: false` for a link that is plainly not a recording (a PDF, an image, a text file, an archive, a document), for a copy-protected (DRM) playlist, and for a YouTube video longer than 8 hours; kick.com and loom.com are sites never fetched. Every `problem` and job `error` is a sentence for people that says what is wrong, never one client's next step.
- **Changed**: `POST /v1/transcriptions` refuses a YouTube video longer than a file may be (8 hours) with `400 invalid_options` before anything is created.

### Share host (2026-10-28, still `1.0.0-alpha.0`)

- **Changed**: a share link's `url` documents the transcription share host: `{tx_share_base_url}/{code}` where the environment has one, else `{public_base_url}/t/{code}` as before. Same shape.

### Amended language (2026-10-25, still `1.0.0-alpha.0`)

- **Added**: the `transcript.amended` frame carries `language` when the amend read the segment again in another language (a hand-back from the English model to Whisper rewriting what it wrote); the stored segment's `language` follows. Absent when unchanged.

### Staff flag on me (2026-10-24, still `1.0.0-alpha.0`)

- **Added**: `POST /v1/recordings/{id}/retranscribe` (`corrections.retranscribe`) answers `language_unavailable` when lines of the transcription cannot be read again in another language (its engine has no second model), and 503 `unavailable` when a line could not be read just now; both were a 400 `invalid_options` carrying the engine's own text.

- **Added**: `GET /v1/me` (`me.get`) returns `staff` (boolean): whether the person behind the credential is VocalStack staff, also for a key a person owns. False for every customer. The desktop app shows its environment picker on it.

### Apps' version policy (2026-10-24, still `1.0.0-alpha.0`)

- **Added**: `GET /v1/clients/{client}` (`meta.clientPolicy`), no credential: a VocalStack app's version policy (`ClientPolicy`: `latest`, a `ClientRelease` with `version`, `url`, `bytes`, `sha256`, `signature`, `notes`, or `null`; `deprecatedBelow`; `unsupportedBelow`; `message`, `ClientMessages`). `client` is a `ClientApp`: `mac_app`. The SDKs' `meta.clientPolicy` (Python `meta.client_policy`).

### A lost engine is said (2026-10-23, still `1.0.0-alpha.0`)

- **Added**: the `ErrorCode` `engine_lost`: the engine serving an open realtime socket went away mid-stream and no other engine could carry the stream on. Sent as an `error` frame (`retryable: true`) just before the socket closes with 1011; the SDKs report a socket that closes with neither `session.done` nor an `error` frame the same way.

### Instant start (2026-10-22, still `1.0.0-alpha.0`)

- **Added**: the `transcript.languageStatus` frame (`expected`, `state`: `matches`, `mismatch`, `unknown` or `change_unsupported`, `detected`, `confidence`, `fromMediaS`, `message`): a stream pinned to a spoken language says whether the speech is that language; not an error, the stream goes on. Sent on the stream's socket and the host's subscription, never to listeners.
- **Added**: `Recording.languageMismatches` (`LanguageMismatch`: `fromMediaS`, `toMediaS`, `detected`, `confidence`): where a pinned recording's speech was another language. The owner's only.
- **Added**: the `transcript.retracted` frame (`seqs`, `fromMediaS`): committed rows taken back because the speech there was another language than the engine that wrote them could read; another engine transcribes it again and its rows follow. Drop them wherever they are shown.
- **Added**: `transcript.languageStatus.state` `change_unsupported` is sent when a stream can't take a change of its spoken language.
- **Added**: the `transcript.held` frame (`held`, `fromMediaS`, `language`, `outcome`): from `fromMediaS` the speech may be another language than the engine reads, and its rows wait until that is known; show a placeholder there. `held: false` ends it: the rows went out after all (`released`), another engine writes that span again and its rows follow (`moved`), or it is read again once the recording ends (`untranscribed`).
- **Added**: `POST /v1/realtime/warm` (`realtime.warm`), body `WarmRequest` (`clientKind`, `canStart`, `spokenLanguage`): a client says a person is using a screen that can start a live transcription, so the one they start next is ready at once; 204, nothing billed.

### Minimum per file of a batch (2026-10-21, still `1.0.0-alpha.0`)

- **Added**: `Rates.batchFileMinimumSeconds` (`GET /v1/billing` `billing.get`, `rates` and `pendingChange.rates`; `GET /v1/billing/plans` `billing.plans`): each file of a batch is billed at least this much audio (Pay as you go and Premium 60, Enterprise 0), the batch as a whole still at least `minimumSeconds`, topped up once when the batch closes.
- **Changed**: `POST /v1/batches/{id}/start` (`batches.start`) needs credit for the larger of the batch's minimum and a minute for each of its files.
- **Changed**: `BatchSettings.spokenLanguage` documents that a named language lets each file skip its language detection and start sooner.
- **Changed**: the API overview and `insufficient_credit` describe the minimum per file of a batch (`rates.batchFileMinimumSeconds`) next to `rates.minimumSeconds`.

### Batches of files (2026-10-20, still `1.0.0-alpha.0`)

- **Added**: `POST /v1/batches` (`batches.create`), `GET /v1/batches` (`batches.list`), `GET /v1/batches/{id}` (`batches.get`), `DELETE /v1/batches/{id}` (`batches.delete`, an unstarted batch only), `POST /v1/batches/{id}/files` (`batches.addFile`), `POST /v1/batches/{id}/start` (`batches.start`), `POST /v1/batches/{id}/stop` (`batches.stop`); schemas `Batch`, `BatchPage`, `BatchSettings`, `BatchCounts`, `CreateBatch`. A batch is one create against `creates_per_hour` and pays one minimum between its files; its files run longest first on the account's free concurrency, with no summary, title, share link or voices.
- **Added**: `GET /v1/batches/{id}/export` (`batches.export`): every finished file's transcript in one `format`, as one zip; `invalid_state` while none is finished.
- **Added**: `Batch.filesPerBatch`: the plan's files per batch on the batch itself (absent: no limit), named as `Limits.filesPerBatch`.
- **Changed**: `GET /v1/recordings/{id}/summary` and `POST .../summarize` answer `not_requested` for a batch's file too: batch files are never summarised.
- **Changed**: a batch's file refuses a share link (`transcriptions.createShareLink`), a settings patch that turns on `summary`, `title`, `summaryTranslations` or `voice` (`transcriptions.update`, `recordings.settings`) and a recording (`transcriptions.startRecording`): `invalid_state`.
- **Added**: `Transcription.batchId`: the batch a file was sent in. `GET /v1/transcriptions` (`transcriptions.list`) lists no batch's files; `batches.get` does.
- **Added**: `Limits.filesPerBatch` (`GET /v1/billing/plans`, the account's plan): Pay as you go 100, Premium 1,000, Enterprise no limit (`null`).
- **Changed**: `POST /v1/transcriptions/{id}/recordings/upload` (`transcriptions.uploadRecording`) holds a transcription to the plan's `filesPerBatch` uploaded recordings (they share its one minimum, as a batch's files do), and refuses a batch's file (`invalid_state`).

### Opt-in features and short clips (2026-10-20, still `1.0.0-alpha.0`)

- **Added**: `Settings.summary`, `Settings.title`, `Settings.summaryTranslations` (and the same in `SettingsPatch`), on broadcasts, transcriptions and recordings: the language model's summary, its title, and the summary's translations into the audience's languages. Off unless asked for; the dashboard asks.
- **Changed**: `Settings.voice` (spoken translations) is off unless asked for (was on); `POST /v1/transcriptions` (`transcriptions.create`) makes its default share link only with `shareLink: true` (was on unless `false`). Everything made before keeps what it had.
- **Changed**: a recording shorter than a minute (as trimmed) never gets speaker labels, a summary, a title or voices, whatever its settings say.
- **Added**: `SummaryStatus.state` `not_requested` (`GET /v1/recordings/{id}/summary`, `recordings.summary`): the recording was made without `summary`, or is a clip under a minute; `POST /v1/recordings/{id}/summarize` (`recordings.summarize`) turns `summary` and `title` on for it, except on a short clip, which stays `not_requested`.
- **Changed**: `GET /v1/recordings/{id}/summary` answers `ready` once a summary exists, with the recording's name as `title` when it has no model title; translated (`lang`) only for a recording made with `summaryTranslations`.

### Source video and plan retention (2026-10-20, still `1.0.0-alpha.0`)

- **Added**: `Job.hasVideo` (on `GET /v1/transcriptions/{id}` and the job frames): the source's video is stored beside its audio, on a plan that keeps source video.
- **Added**: `GET /v1/recordings/{id}/audio` (`recordings.audio`) takes `kind=video`: the stored video as it came, for the owner or a share link that allows downloads, like `kind=source`; `404` once its retention ended.
- **Added**: `Limits.retentionVideoDays` (`GET /v1/billing/plans`, the account's plan): days the source video is kept; `0` is not stored (only its audio), `null` unlimited.
- **Changed**: plan figures from the pricing page of 2026-10-20 (data, not shape): Pay as you go keeps source audio and voices 30 days and transcriptions for good; Enterprise has no minimum per transcription (`rates.minimumSeconds` 0).

### App stream keys (2026-10-20, still `1.0.0-alpha.0`)

- **Added**: `POST /v1/rtmp/keys` (`rtmp.createKey`): an RTMP stream key of an app's own (`CreateAppStreamKey` → `201 CreatedAppStreamKey`, the key in full in this answer only), beside the account's key; it works while the API key that made it does, at most 20 per account (`409 conflict`).
- **Added**: `GET /v1/rtmp/keys` (`rtmp.listKeys`): the account's app stream keys (`{ keys: AppStreamKey[] }`), masked, each with `live` and `audio`; an `own`-reach key lists the keys it made.
- **Added**: `DELETE /v1/rtmp/keys/{id}` (`rtmp.deleteKey`): `204`; an encoder on the key is dropped within seconds.
- **Changed**: `live` and `audio` on `GET /v1/rtmp` (`rtmp.status`) cover the account's app keys too, not only the account's key.

### API key reach (2026-10-19, still `1.0.0-alpha.0`)

- **Added**: `reach` on `GET /v1/me` (`me.get`): `own` for an API key that reaches only what it created (its transcriptions and broadcasts, and everything in them), `account` otherwise.
- **Added**: `reach` on `POST /v1/connect/token`'s answer (`connect.token`): what the connected app's key reaches; the connect link takes `reach=own` (the default) or `reach=account`.
- **Changed**: an API key whose reach is `own` gets `404 not_found` for the account's other transcriptions, broadcasts, recordings, scripts and share links, lists and searches only its own, and sees only its own usage on `GET /v1/billing/usage`, `GET /v1/billing/usage/charges` and `GET /v1/billing/charges`. Keys made before reach keep `account`.

### Release 2's order (2026-10-19, still `1.0.0-alpha.0`)

- **Added**: error code `terms_acceptance_required` (403, not retryable): the signed-in person, or the account an API key belongs to, has not accepted the Terms of Service and Privacy Policy of the billing update; every API key call, and every call that starts paid work or commits the account (transcriptions, live recordings, realtime sessions, checkouts, auto top-up on, interval switches, the yearly opt-in), answer it until someone accepts in the Dashboard; cancelling, auto top-up off, the portal, refund requests and account deletion never do. `data.details` carries `termsVersion`, `privacyVersion` and `acceptUrl`.
- **Added**: every response carries `x-vocalstack-compat-epoch`, the `/v1` compatibility epoch (it changes only with a breaking `/v1` change).

### Terms and docs: one name per concept (2026-10-19, still `1.0.0-alpha.0`; no client outside this repository yet)

- **Changed**: renamed on `GET /v1/billing` (`billing.get`): `inGrace` → `inBelowZero`; on `GET /v1/billing/plans` (`billing.plans`): `PlanListing.graceOnZero` → `belowZeroLimitOn` and `PlanList.downgradeGraceDays` → `downgradeKeepDays` (the limit below zero and the days data is kept after a downgrade; "grace" named both).
- **Added**: `BillingView.belowZeroLimitOn` (the plan, or a limit held after a change, runs below zero; never how far), `belowZeroLimitChangesAt` (when a held limit below zero stops), `downgradeKeepDays` (`DowngradeKeepDays { days, lowering }`: the account's own days and a lowering it was told of), `AutoTopUpView.autoTopupMaxPerDay` and `autoTopupMaxPerDayLowering` (`SettingLowering { to, appliesAt, afterDate, renewalOn, refundDeadline, refundWindowOpen }`), `SubscriptionView.returnPlan` (the plan the account returns to when the subscription ends), and `AutoTopUpChoices.autoTopupMaxPerDay` on `GET /v1/billing/plans`.
- **Changed**: `PlanListing.features.emailSupport` is always `true` (email support is on every plan, Terms §19). The API description no longer quotes a minimum: it is the plan's `rates.minimumSeconds`.

### Notices and ends by our choice (2026-10-19, still `1.0.0-alpha.0`)

- **Added**: `PendingChange.afterDate` (pay as you go: "after DATE (UTC)"), `renewalOn` and `cancelBefore` (a subscription: the renewal on or about that date, and the cancel cut-off `YYYY-MM-DD 00:00 UTC`), `changes` (every field that changes, the limit below zero only as changing), `price` (`PriceChange { interval, from, to }`, the price agreed at a switch counted as what is paid now), `belowZeroLimitChanges`, `refundDeadline` and `refundWindowOpen` (the last day, until 23:59 UTC, to ask for unused paid top-up credit back because of the change) on `GET /v1/billing` (`billing.get`).
- **Added**: `SubscriptionView.scheduledEnd` (`ScheduledEnd { at, reason, returnPlan, unusedPeriodRefunded }`: an end by us, `our_choice`, with at least 30 days' notice, or a Terms section 22 request, `section_22`) and `BillingView.accountClosing` (`AccountClosing { at, unspentPaidCreditRefunded }`: the account is closed by us on that date).
- **Changed**: a notice's dates (a change's date, its refund deadline, the date a held limit below zero changes, an end by us) count from when its email is handed to the email provider, never earlier than first stated, so `pendingChange.appliesAt`, `afterDate` and `refundDeadline` may move later until that email goes out.

### Refunds (2026-10-19, still `1.0.0-alpha.0`)

- **Added**: `LedgerEntry.kind` values `refund_reversal` and `promo_clawback_reversal` (a refund that failed at the payment partner, given back), `owed_refund_restored`, `manual_refund` (a refund paid by bank transfer), `chargeback_reversal` (a dispute decided in our favour), `dispute_fee` and `free_credit_removal` (`GET /v1/billing/ledger`, `billing.ledger`).
- **Added**: `Payment.status` values `fee` and `removed`, and `Payment.kind` values `credit_restored` and `dispute` (`GET /v1/billing/payments`, `billing.payments`).

### Price changes at a subscriber's renewal (2026-10-19, still `1.0.0-alpha.0`)

- **Breaking** (pre-launch, no external clients; docs/api-lifecycle.md §4): `POST /v1/billing/subscription/interval` (`billing.setInterval`) needs `acceptTerms: true` and `noNewWithdrawalPeriodShown: true` (`SetInterval`; `422 invalid_body` without them) and records the consent; its optional `expectedPrice` (the price shown) answers `409 invalid_state` once it changed. A switch to an interval the plan does not offer, or to `month` while monthly billing is withdrawn, is `409 invalid_state`; `503 unavailable` when the payment provider did not take or confirm it.
- **Breaking** (pre-launch): `PendingInterval.appliesAt` is nullable: set only once the payment provider holds the switch, and null when the subscription ends at that renewal or the renewal is held to its yearly reminder's price.
- **Added**: `POST /v1/billing/subscription/yearly-opt-in` (`billing.optInYearly`, schema `YearlyOptIn` with `acceptTerms`, `noNewWithdrawalPeriodShown`, `expectedPrice`): when a plan change withdraws monthly billing the subscription is never moved onto a yearly charge by itself; it ends at the renewal the change applies at unless the customer opts in to yearly here.
- **Added**: `SubscriptionView.cancelReason` (`customer` or `interval_withdrawn`), `SubscriptionView.yearlyOptIn`, `SubscriptionView.switchPrices` (`SwitchPrices { month, year }`, what a switch to each interval charges), `NextPayment.cancelBefore` and `PendingInterval.cancelBefore` (`YYYY-MM-DD 00:00 UTC`: the renewal is on or about its date, the payment provider may renew up to a day early).
- **Changed**: `SubscriptionView.nextPayment` is the price of what the subscription renews on (the product scheduled at the payment provider, capped by the price agreed at a switch and by its yearly reminder's quote), null while it ends; `POST /v1/billing/subscription/uncancel` (`billing.uncancelSubscription`) is `409 invalid_state` while `yearlyOptIn` is true.

### Stop a file transcription (2026-10-19, still `1.0.0-alpha.0`)

- **Changed**: `POST /v1/recordings/{id}/stop` (`recordings.stop`) also stops a file transcription's recording, at any point before its job is done (it answered `invalid_state` before): the job ends in the new state `stopped` (not `failed`) with `errorCode` `stopped` (new value of `TranscriptionJob.errorCode`), what was transcribed before the stop is kept and billed, and a job stopped before it started transcribing is billed nothing. `POST /v1/recordings/{id}/job/retry` refuses a job stopped part way whose audio was billed.
- **Added**: `TranscriptionJob.state` value `stopped`: a job its owner stopped before it was done. Terminal, like `done` and `failed`; `POST /v1/recordings/{id}/job/retry` (`recordings.job.retry`) takes a `stopped` job as it takes a `failed` one. Both SDKs' wait-for-transcription calls return on it.

### One-click Connect (2026-10-17, still `1.0.0-alpha.0`)

- **Added**: `POST /v1/connect/token` (`connect.token`, new tag `connect`): an app's server redeems the code the dashboard's `/connect` consent screen sent to its `redirect_uri` for an API key, OAuth 2.0 authorization code + PKCE (S256) with the key as the access token. Form-encoded `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`; answers `{ access_token, token_type: "api_key", key_id, scope, account: { name } }` (`no-store`), or `400 { error, error_description }` with `invalid_request`, `invalid_grant` or `unsupported_grant_type`. No credential; refused from a web page. The code is single use and lives two minutes.

### Files wait their turn (2026-10-17, still `1.0.0-alpha.0`)

- **Added**: `TranscriptionJob.queue` (`JobQueue { reason, position }`, new schemas `JobQueue` and `QueueReason`): present while a `queued` job waits its turn behind the account's other transcriptions — the plan's `concurrentTranscriptions` are running — and absent otherwise. `reason` is `concurrency`; `position` 1 is the next of the account's jobs to start. The job starts by itself when one ends, the account's jobs in the order they were queued (made, started from the trim step, or retried). On `GET /v1/recordings/{id}/job` (`jobs.get`), `Transcription.job`, and the MCP `TranscriptionStatus`.
- **Changed**: `POST /v1/transcriptions` (`transcriptions.create`), `POST /v1/recordings/{id}/job/start` (`jobs.start`) and `POST /v1/recordings/{id}/job/retry` (`jobs.retry`) are no longer refused `402 quota_exceeded` past the plan's transcriptions at once: the transcription is created (201) and its job waits `queued` with `queue`. `quota_exceeded` leaves their `x-errors`; credit (`insufficient_credit`) and the creation rate (`rate_limited`) still apply. A file job's charge now opens when the job starts, not when it is created, so a job waiting its turn holds no credit.
- **Changed**: `quota_exceeded` is now only a start that cannot wait — a live recording (`POST /v1/broadcasts/{id}/recordings`, `POST /v1/transcriptions/{id}/recordings`), a realtime session, a streamed upload (`POST /v1/transcriptions/{id}/recordings/upload`) — and counts only those: a running file job never refuses one. `BillingView.startBlock` is never `concurrency` any more; `startBlockLive` is, when live transcriptions and realtime sessions fill the plan. `LimitsUsage.running` does not count a job waiting its turn.

### A web page's recordings (2026-10-16, still `1.0.0-alpha.0`)

- **Added**: `LinkProbe.media` (`GET /v1/transcriptions/probe`, `transcriptions.probe`): when the link is a web page (`ok: false`), the recordings found on it — media files, playlists, YouTube videos, each `PageMedia { url, title? }` opened as a link of its own would be. Absent when the link is not a page or carries none. New schema `PageMedia`.
- **Changed**: `GET /v1/transcriptions/probe`: searching a web page counts against an hourly allowance by account (20 with a plan, 10 pay as you go, 2 on credit never paid for); past it, `rate_limited` with `retryAfterS`.

### Correction passes are the engine's own (2026-10-16, still `1.0.0-alpha.0`)

- **Breaking** (pre-release, nothing published): `llmFix` removed from `Settings` / `SettingsPatch` (`PATCH /v1/recordings/{id}/settings` and the broadcast / transcription settings), `SessionOptions` and `session.update`; a request that sends it is refused as an unknown field. `Word.llm` removed from every word list; `Word.recognized` is now set only on words the script wrote (`Word.script`).

### A listener exports an ended recording (2026-10-16, still `1.0.0-alpha.0`)

- **Changed**: `GET /v1/recordings/{id}/export` (`recordings.export`): a listener of the recording's broadcast (`listenerToken`) may export it once the recording has ended, as the owner and a share link that allows export already could. The listener's Export tab.

### The usage report's charges (2026-10-16, still `1.0.0-alpha.0`)

- **Added**: `GET /v1/billing/usage/charges` (`billing.usageCharges`, `?startDate&endDate&tz&kind&source&cursor&limit`, schemas `UsageChargePage` and `UsageCharge`): the charges behind `GET /v1/billing/usage`, one by one, newest first, with the transcription's name, kind, source, seconds billed, rate and cost; `count` and `total` cover every charge matching the filters. The Dashboard's Billing → Usage transactions.

### API key usage caps (2026-10-15, still `1.0.0-alpha.0`)

- **Added**: error code `usage_cap_reached` (HTTP 402, `ErrorCode`): the API key reached the usage cap its account set when making it (in total, or per month, week or day, UTC). `details` carries `apiKeyId`, `cap`, `period`, `used`, `resetsAt` and, for a file whose cost would pass the cap, `required`. Listed in the `x-errors` of every creation point (`POST /v1/transcriptions` `transcriptions.create`, `POST /v1/realtime/sessions` `realtime.createSession`, and the other routes that list `insufficient_credit`). A realtime socket closes with it when the key reaches its cap mid-session.
- **Changed**: `Job.errorCode` documents its values: `insufficient_credit` and, new, `usage_cap_reached` (the file cost more than its key had left of its cap). The old text named `quota_exceeded`, which no job has carried since billing replaced the minute quotas.

### `waiveWithdrawal` is deprecated and ignored (2026-10-14, still `1.0.0-alpha.0`)

- **Deprecated**: `CreateCheckout.waiveWithdrawal` (`POST /v1/billing/checkouts`, `billing.createCheckout`): accepted and ignored, whatever its value; marked `deprecated: true`. No withdrawal waiver is asked: `acceptTerms: true` is the one consent, the Terms and the customer's request that the purchase start now. Stop sending it; no sunset date while the contract is `1.0.0-alpha.0`. The SDKs still accept it and no longer show it in their examples.

### Business purchases (2026-10-14, still `1.0.0-alpha.0`)

- **Added**: `Payment.businessPurchase` and `Payment.taxId` (`GET /v1/billing/payments` `billing.payments`): whether the purchase was made with a tax ID (VAT or other: the one on the paid order, else the invoice details' when it was recorded) and that tax ID; `false` and null for a consumer purchase and for a line that is not a purchase (credit, refund, a pending checkout). The EU/UK right of withdrawal is for consumers only (Terms section 13).

### New rate card and a minimum per transcription (2026-10-13, still `1.0.0-alpha.0`)

- **Added**: `Rates.minimumSeconds` (`GET /v1/billing` `billing.get`, `rates` and `pendingChange.rates`; `GET /v1/billing/plans` `billing.plans`): the audio seconds a transcription is billed at least, once per transcription however many recordings it has, and per realtime session; 300 on the published plans, 0 for none. The published plans' rates are now $0.20 an hour for files and $0.60 live (were $0.15 and $0.50); every account is on them at once (no deferral for this change).
- **Added**: `BillingView.canStartLive` and `startBlockLive` (`GET /v1/billing` `billing.get`): whether a new live transcription or realtime session would start now and what would refuse it, with `no_credit` at or below a live transcription's minimum ($0.05 on the published plans). `canStart` / `startBlock` answer for a new file transcription (`no_credit` at or below a file's minimum, $0.016667), so a balance between the two read "can start" while a live start was refused 402.
- **Added**: `RecordingCharge.audioSeconds`, `minimumApplied` and `coveredSeconds` (`GET /v1/billing/charges` `billing.charges`): the audio heard, whether the minimum raised the charge, and the audio the transcription's minimum already paid for. `secondsBilled` is the billed figure.
- **Changed**: a creation that starts a new transcription (`POST /v1/transcriptions` `transcriptions.create`, `POST /v1/broadcasts/{id}/recordings`, the first recording of a transcription through `POST /v1/transcriptions/{id}/recordings` or `/recordings/upload`, `POST /v1/realtime/sessions` `realtime.createSession`) answers `402 insufficient_credit` with `details.required` when the balance does not exceed what the minimum costs; it needed only a positive balance. The message reads "this transcription would cost …".
- **Changed**: the minimum is paid by a transcription's first recording that hears audio: a recording of a transcription whose only earlier ones heard nothing carries it (and needs the credit for it at creation), and a purged recording's audio still counts toward its transcription's minimum (`RecordingCharge.minimumApplied`, `coveredSeconds`).
- **Changed**: descriptions only: `ErrorCode` `insufficient_credit` (the 402 also refuses a balance at or below a new transcription's minimum, with `required`), `PlanListing.graceOnZero`, `UsageRow.seconds` (seconds billed, the minimum included).

### A checkout no longer needs the withdrawal waiver (2026-10-13, still `1.0.0-alpha.0`)

- **Changed**: `POST /v1/billing/checkouts` (`billing.createCheckout`) needs only `acceptTerms: true`; `waiveWithdrawal` (`CreateCheckout`) is optional and recorded as sent, no longer `422 invalid_body` when false or absent. The app's checkout no longer shows the waiver box.

### VoiceTrack's per-line maps are optional, as served (2026-10-13, still `1.0.0-alpha.0`)

- **Changed**: `VoiceTrack` (`GET /v1/recordings/{id}/voice`, `recordings.voice`; `POST /v1/recordings/{id}/voice`, `recordings.renderVoice`) no longer lists `wordTimes`, `clipRev`, `clipDur` and `clipParts` as required: the server leaves each out while it is empty (a track with no spoken line yet), and a validating client (the Python SDK) refused that answer. An absent map means empty.

### Retry-After on every 429 that knows its wait (2026-10-13, still `1.0.0-alpha.0`)

- **Changed**: a `429 rate_limited` whose `details` carry `retryAfterS` (the plan's creation rate `creates_per_hour` on the create operations, the dashboard assistant's daily limits, the promo-code and contact limits) now sends the same seconds as `Retry-After`; it sent only the body field. The `RateLimited` response's description says so.

### Response headers in the document (2026-10-12, still `1.0.0-alpha.0`)

- **Added**: `components.headers` `X-Request-Id`, `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `Retry-After`, the headers the API already sends. Every response of every operation declares `X-Request-Id`; the responses of every rate-limited operation (all but `GET /v1/health` `meta.health`, `GET /v1/openapi.json` `meta.openapi`, `GET /v1/languages` `languages.list`, `GET /v1/realtime/capabilities` `realtime.capabilities` and `GET /v1/billing/plans` `billing.plans`) declare `RateLimit-*`.
- **Added**: `components.responses` `RateLimited` (`429 rate_limited`, with `Retry-After` and `RateLimit-*`) on every rate-limited operation, and `Unavailable` (`503 unavailable`, with `Retry-After`) on every operation but `meta.health`, `meta.openapi`, `languages.list` and `realtime.capabilities`, which never read the database. Both, with `ApiErrorBody`, were already answered; only the document is new.
- **Changed**: `info.description` gains a Headers section linking the errors-and-limits guide.

### A payment provider's refusal is no longer "did not answer" (2026-10-12, still `1.0.0-alpha.0`)

- **Changed**: billing calls that reach the payment provider (`POST /v1/billing/checkouts` `billing.createCheckout`, the subscription, interval, payment-method, portal and payment-document operations) answer `409 invalid_state` with the provider's reason when it refuses the call (400/409/422: an address it takes no mail at, a tax ID it rejects), where they answered `503 unavailable` "did not answer; try again". `503 unavailable` is now only for a provider that could not be reached, failed or was busy; a refusal of our own call is `500 internal`.
- **Added**: `invalid_state` in the errors of `billing.paymentDocument`, `billing.paymentMethods`, `billing.deletePaymentMethod`, `billing.managePaymentMethods` and `billing.portal`.

### Paged lists: transcriptions, recordings, corrections, the event log (2026-10-12, still `1.0.0-alpha.0`)

The lists that answered everything (up to 500 transcriptions of each
lifecycle, 1,000 recordings or corrections, 20,000 events) answer a page at
a time, with the billing lists' `cursor` / `limit` / `nextCursor` (absent on
the last page). A cursor is the last item's sort key, never an offset.

- **Breaking** (pre-release, nothing published): `GET /v1/transcriptions`
  (`transcriptions.list`) answers `TranscriptionPage`: at most `limit`
  (default 100, at most 200) transcriptions, newest first by `createdAt`
  (it was by `updatedAt`), and `nextCursor`. `lifecycle=all` is one list
  of both, no longer up to 500 of each.
- **Breaking**: `GET /v1/broadcasts/{id}/recordings` and
  `GET /v1/transcriptions/{id}/recordings` (`broadcasts.listRecordings`,
  `transcriptions.listRecordings`) answer `RecordingPage`: default 100, at
  most 200, newest first, with `nextCursor`.
- **Breaking**: `GET /v1/recordings/{id}/corrections` (`corrections.list`)
  answers `CorrectionPage`: default 100, at most 200, newest first, with
  `nextCursor`. `POST` on the same path still answers `{ corrections }`.
- **Breaking**: `GET /v1/recordings/{id}/events` (`recordings.events`):
  `limit` defaults to 500 and is at most 1,000 (it was 5,000 and 20,000).
- **Added**: `RecordingEvents.nextCursor` and the `cursor` query parameter
  of `recordings.events` (the last event's `seq`; `after` with a `seq` still
  works, not together with `cursor`).
- **Added**: `cursor` and `limit` on the three lists above; a cursor the list
  did not give out is `400 invalid_options`.

### RTMP stream keys: RTMPS, hashed keys, revocable links (still `1.0.0-alpha.0`)

`docs/security-reviews/rtmp.md` RT-2 and RT-3, 2026-10-12.

- **Changed** (a shape change inside the alpha): `RtmpStatus.streamKey`
  (`GET /v1/rtmp`, `rtmp.status`) is no longer required. The key is stored
  only as a hash, so the full key is in the one answer that made it (an
  account's first `GET /v1/rtmp`, or a reset in the VocalStack app) and is
  absent afterwards.
- **Added**: `RtmpStatus.maskedStreamKey` (`GET /v1/rtmp`, `rtmp.status`):
  the key's prefix and last four characters (`vs_rtmp_…k7xq`), in every
  answer.
- **Changed**: `RtmpStatus.serverUrl` is the RTMPS URL
  (`rtmps://<ingest>:1936/live`) where the server has TLS on its ingest; the
  plain `rtmp://<ingest>/live` still takes encoders, and a live transcription
  accepts either as `source.url`.
- **Changed**: `RtmpStatus.monitorUrl` (and the engine's pull link) is
  revoked by a key reset: a link issued before it answers 403, and one held
  open stops within seconds.

### Billing: the review of 2026-10-12 (still `1.0.0-alpha.0`)

`docs/security-reviews/billing.md`, "Review of 2026-10-12".

- **Added**: `AutoTopUpView.offered` (`GET /v1/billing`, `billing.get`;
  `PUT /v1/billing/auto-top-up`; `POST /v1/billing/auto-top-up/retry`):
  whether the server takes automatic charges at all; `available` is now
  false while it does not.
- **Added**: ledger kind `promo_clawback` (`LedgerEntry.kind`,
  `GET /v1/billing/ledger`): a promo code's bonus taken back with a refund
  or chargeback of its order.
- **Changed**: `PUT /v1/billing/auto-top-up` (`billing.setAutoTopUp`)
  answers `409 invalid_state` when enabling while automatic charges are not
  offered; `POST /v1/billing/auto-top-up/retry` (`billing.retryAutoTopUp`)
  too, and while another charge for the account is in progress.
- **Changed**: `POST /v1/billing/checkouts` (`billing.createCheckout`) with a
  `promoCode` counts against the promo check's hourly limit
  (`429 rate_limited`).
- **Changed**: `GET /v1/realtime/capabilities`: `limits.recordingMaxDurationS`
  is the caller's plan's longest live recording (the default plan's without a
  credential), no longer the server's bound for everyone.
- **Changed**: `GET /v1/billing/payment-methods` (`billing.paymentMethods`)
  and `POST /v1/billing/promo-codes/check` (`billing.checkPromoCode`) take an
  organization's owner or admin (`403 forbidden` for a member).
- **Changed**: `GET /v1/billing/payments/{id}/document`
  (`billing.paymentDocument`) takes a signed-in person, for an organization
  its owner or admin (`403 forbidden` for a member or an API key): the
  first ask makes the document at the provider with the invoice details as
  they stand.

### The engine behind a voice is not on the wire (2026-10-11, still `1.0.0-alpha.0`)

Which speech model speaks a voice is an implementation detail; a client
needs the voice's id, not the engine that renders it.

- **Breaking** (pre-release, nothing published): `model` removed from the
  `transcript.voice` realtime frame; `voice` (the catalogue id, or
  `clone:<id>`) identifies what spoke. `engine` removed from `VoiceOption`
  (`GET /v1/voices/available`, `voices.available`).
- **Changed**: the `transcript.voice.voice`, `transcript.voice.cloned`,
  `Decoder` and `CommittedSegment.decoder` descriptions no longer name the
  models behind them.

### Billing: the Dashboard's Billing screen (2026-10-11, still `1.0.0-alpha.0`)

`docs/billing.md` §13. The grace amount (a plan's debt cap) is the admin's
and is no longer on `/v1`: the wire says whether running work goes on
below zero, never how far.

- **Breaking** (pre-release, nothing published): `debtCap` removed from
  `BillingView` (`GET /v1/billing`, `billing.get`) and from `PlanListing`
  (`GET /v1/billing/plans`, `billing.plans`). Read `PlanListing.graceOnZero`
  and `BillingView.inGrace` instead.
- **Added**: `BillingView` gains `inGrace`, `canStart`, `startBlock`
  (`no_credit` | `concurrency` | `hourly_limit` | null), `period` and
  `previousPeriod` (`DateRange {start, end}`, inclusive days),
  `accountCreated`, `monthlyCredit` (`MonthlyCreditView {granted, used,
  remaining, grantedAt, renewsAt}`), `limitsUsage` (`LimitsUsage {running,
  concurrentLimit, createdLastHour, createLimit, resetsAt}`),
  `lowBalanceAlert` (`LowBalanceAlertView {enabled, threshold}`),
  `pendingPayment` (`PendingPayment {amount, kind, since}`) and `card`
  (`CardView {brand, last4, expMonth, expYear, declined}`).
- **Added**: `SubscriptionView` gains `currentPeriodStart`, `nextPayment`
  (`NextPayment {at, amount}`), `pendingInterval` (`PendingInterval
  {interval, appliesAt}`) and `pastDueSince`; `AutoTopUpView` gains `last`
  (`AutoTopUpAttempt {at, amount, outcome: paid | declined | pending}`).
- **Added**: `PlanList` gains `topUpRange`, `lowBalanceAlert`
  (`LowBalanceAlertChoices {presets, range, default}`) and
  `downgradeGraceDays`; `AutoTopUpChoices` gains `thresholdRange` and
  `amountRange` (`MoneyRange {min, max}`); `PlanListing` gains
  `graceOnZero`.
- **Changed**: `POST /v1/billing/checkouts` (`billing.createCheckout`) takes
  any whole-cent top-up `amount` inside `topUpRange` (not only the
  presets), and `promoCode` (`404 promo_code_invalid` when it does not
  apply); a subscribe checkout's view carries `amount` (the first payment
  before tax, less a code's discount). `PUT /v1/billing/auto-top-up`
  (`billing.setAutoTopUp`) takes any whole-cent `threshold` and `amount`
  inside the ranges, and is available once a card is saved (not only after
  a payment).
- **Added**: `GET /v1/billing/usage` (`billing.usage`, `?startDate&endDate&tz`)
  → `UsageReport {startDate, endDate, tz, sources[], rows[], total}`;
  `400 range_too_long` past 92 days.
- **Changed** (pre-release): a `UsageRow`'s `kind` is `file` or `live`, as
  the charges name it (it said `files` in the first cut).
- **Added**: `GET /v1/billing/payments` (`billing.payments`) → `PaymentPage`;
  `GET /v1/billing/payments/:id/document` (`billing.paymentDocument`) →
  `PaymentDocument` (`200 {url}` or `202 {pending: true}`;
  `409 billing_details_required`).
- **Added**: `GET /v1/billing/payment-methods` (`billing.paymentMethods`) →
  `PaymentMethodList`; `DELETE /v1/billing/payment-methods/:id`
  (`billing.deletePaymentMethod`, `204`; `409 payment_method_in_use`);
  `POST /v1/billing/payment-methods/manage` (`billing.managePaymentMethods`)
  → `PortalLink`.
- **Added**: `GET` / `PUT /v1/billing/details` (`billing.details`,
  `billing.setDetails`) → `BillingDetails`; `422 invalid_body` with
  `details.field`.
- **Added**: `PUT /v1/billing/low-balance-alert` (`billing.setLowBalanceAlert`,
  `LowBalanceAlertSettings` → `LowBalanceAlertView`);
  `POST /v1/billing/auto-top-up/retry` (`billing.retryAutoTopUp`,
  `409 auto_top_up_off`, `429 rate_limited` at the day's cap);
  `POST` / `DELETE /v1/billing/subscription/interval` (`billing.setInterval`,
  `billing.unsetInterval`, `SetInterval`); `POST
  /v1/billing/promo-codes/check` (`billing.checkPromoCode`, `CheckPromoCode`
  → `PromoCodeView`).
- **Added**: error codes `range_too_long` (400), `payment_method_in_use`,
  `billing_details_required`, `auto_top_up_off` (409), `promo_code_invalid`
  (404).

### Billing: security review fixes (2026-10-09, still `1.0.0-alpha.0`)

The billing security review (`docs/security-reviews/billing.md`) closed on
the wire (shapes unchanged):

- **Changed**: `POST /v1/billing/checkouts` (`billing.createCheckout`) is
  rate-limited in the `costly` class (120/min per account, 60/min per
  address) and an account may hold at most 3 open checkouts from the last
  hour: a fourth for something else answers `409 invalid_state`; a call for
  the same kind, amount, plan and interval answers `201` with the newest
  open one. Open checkouts nobody paid expire after 24 hours
  (`status: expired`).
- **Changed**: `POST /v1/billing/subscription/cancel` and `/uncancel`
  (`billing.cancelSubscription`, `billing.uncancelSubscription`) are in the
  `costly` class.
- **Changed**: a file transcription whose cost does not fit the credit left
  (the account's other running files counted) fails with
  `errorCode: insufficient_credit` as soon as its length is known, and a
  file job of an account that runs past its plan's debt cap is failed by the
  meter with the same `errorCode` (`GET /v1/recordings/:id/job`).
- **Changed**: a `/v1` realtime session reaching an engine that cannot
  meter it closes with `engine_unavailable` (retry); a session that never
  reported audio is billed its wall time between its start and the earlier
  of its end and its longest allowed run.

### Billing: payments through the provider (2026-10-09, still `1.0.0-alpha.0`)

Stage 2 of `docs/billing.md` (§5, §7): checkouts at the merchant of record,
the subscription's cancel and uncancel, auto top-up and the customer portal.
A signed-in person only (for an organization, its owner or admin); an API
key is refused `403 forbidden`.

- **Added**: `POST /v1/billing/checkouts` (`billing.createCheckout`):
  `{kind: "topup", amount}` or `{kind: "subscribe", planId, interval}` with
  `acceptTerms: true` and `waiveWithdrawal: true` (else `422 invalid_body`)
  → `201` `CheckoutView` (`checkoutId`, `url`, `expiresAt`, `status`);
  `409 invalid_state` with an active subscription or a plan billed by hand.
  Idempotent with `Idempotency-Key`. Schemas `CreateCheckout`, `CheckoutView`.
- **Added**: `GET /v1/billing/checkouts/{id}` (`billing.getCheckout`): the
  status, by the checkout's id or the provider's.
- **Added**: `POST /v1/billing/subscription/cancel` and `/uncancel`
  (`billing.cancelSubscription`, `billing.uncancelSubscription`) →
  `SubscriptionView` (`interval`, `status`, `currentPeriodEnd`,
  `cancelAtPeriodEnd`).
- **Added**: `PUT /v1/billing/auto-top-up` (`billing.setAutoTopUp`):
  `{enabled, threshold, amount}` → `AutoTopUpView`. Schema `AutoTopUpSettings`.
- **Added**: `GET /v1/billing/portal` (`billing.portal`) → `PortalLink {url}`.
- **Added**: error code `payment_method_required` (409, not retryable): auto
  top-up and the portal need a payment first.
- **Added**: `LedgerEntry.providerOrderId` (the provider's order behind a
  top-up, an auto top-up, a monthly credit or a refund).
- The SDKs gain `billing.createCheckout` / `getCheckout` /
  `cancelSubscription` / `uncancelSubscription` / `setAutoTopUp` / `portal`
  (TypeScript) and `create_checkout` / `get_checkout` /
  `cancel_subscription` / `uncancel_subscription` / `set_auto_top_up` /
  `portal` (Python).

### Billing: plans and credit replace tiers and minute quotas (2026-10-09, still `1.0.0-alpha.0`)

Owner decisions of 2026-10-09 (`docs/billing.md`): every account has a credit
balance in dollars, every transcription spends it per second of audio at the
rate of the account's plan, and every route is open to every plan. The tier
gate and the monthly and daily minute quotas go. Pre-release and unpublished,
so the removals ride in `/v1`.

- **Added**: `GET /v1/billing` (`billing.get`): the account's plan, rates
  (`filePerHour`, `livePerHour`, dollars an hour of audio), `balance`,
  `debtCap`, `subscription`, `autoTopUp`, `pendingChange`, `retentionDeadline`,
  `limits` (`concurrentTranscriptions`, `createsPerHour`,
  `createsPerHourUnpaid`, `maxFileBytes`, `maxLiveSeconds`, the retention days,
  `requestsPerMin`), `hasPaid`, `topUpUrl`; `enabled: false` on a server that
  does not bill. Schema `BillingView`.
- **Added**: `GET /v1/billing/plans` (`billing.plans`, public): the visible
  plans' current versions with rates, prices, included credit, limits and
  features, plus `topUpAmounts`, `autoTopUp` and `signupCredit`. Schema `PlanList`.
- **Added**: `GET /v1/billing/ledger` (`billing.ledger`) and
  `GET /v1/billing/charges` (`billing.charges`): the credit movements and the
  per-recording charges, newest first, with `cursor` and `limit` (1 to 200)
  and `nextCursor`. Schemas `LedgerPage`, `LedgerEntry`, `ChargePage`,
  `RecordingCharge`. Amounts are decimal dollars (JSON numbers, at most six
  decimals), never micro-dollars.
- **Added**: error code `insufficient_credit` (402, not retryable) on every
  creation point (`transcriptions.create`, `transcriptions.startRecording`,
  `broadcasts.startRecording`, `transcriptions.uploadRecording`, `jobs.retry`,
  `jobs.start`, `corrections.retranscribe`, `realtime.createSession`) and as
  a job's `errorCode` and a realtime session's closing `error` frame:
  `details.balance`, `currency`, `plan`, `topUpUrl`, and `required` when the
  cost is known up front.
- **Changed**: `quota_exceeded` (402) keeps its shape for the one counted
  limit left, `concurrent_transcriptions`; `details.plan` and `details.topUpUrl`
  replace `tier` and `upgradeUrl`. `rate_limited` (429) at a creation point
  may carry `details.metric: "creates_per_hour"` with `limit`, `retryAfterS`
  and `resetsAt`.
- **Removed**: `GET /v1/me/usage` (`me.usage`) and schemas `UsageSummary`,
  `TierRef`: read `GET /v1/billing`. The SDKs' `me.usage()` is `billing.get()`.
- **Removed**: error code `tier_required`: no route needs a plan. The
  `x-vocalstack-tier` operation extension is gone with it (every operation
  was `free`); `x-vocalstack-auth` and `x-vocalstack-scopes` stay.

### Developer access for every account (2026-10-09, still `1.0.0-alpha.0`)

Owner decision of 2026-10-09, reversing A1 (2026-10-07): developer access is
no longer gated. Every account creates and uses API keys, uses `POST /v1/mcp`,
downloads the SDK builds and signs in on the docs page; the allowlist, its
admin grant and the server switch are removed, not switched off. The two
contract items below were one day old, pre-release and unpublished.

- **Removed**: error code `developer_access_required` (403). No route answers
  it any more; a 403 is `forbidden`, `key_from_browser` or `suspended`.
- **Removed**: `developerAccess` from the response of `GET /v1/me` (`me.get`):
  there is nothing to report, every account has it.

### The OpenAPI document is public again (2026-10-08, still `1.0.0-alpha.0`)

- **Changed**: `GET /v1/openapi.json` (`meta.openapi`) is `public` again, as are `/llms.txt`, `/llms-full.txt` and `/docs/guides/*` (the gating in the entry below lasted one day and never reached production): documentation is public; acting on `/v1` takes a key as before.

### The OpenAPI document is read with a credential (2026-10-08, still `1.0.0-alpha.0`)

- **Changed**: `GET /v1/openapi.json` (`meta.openapi`) is `userOrKey`: send an API key (from a server or an agent) or a signed-in person's token; anonymous reads are 401. The docs content beside it (`/llms.txt`, `/llms-full.txt`, `/docs/guides/*`) is gated the same way; the API reference at `/` takes a key and exchanges it (`POST /docs/key-exchange`).

### Which API key created a transcription (2026-10-08, still `1.0.0-alpha.0`)

- **Added**: `Transcription.createdByApiKeyId` (optional): the API key a transcription was created with, absent when it was created by a signed-in person or with a browser token (and once that key is deleted); on every `Transcription` answer (`transcriptions.list`, `transcriptions.get`, `transcriptions.create`, `transcriptions.createLive`, …).

### Script fixes say what was heard (2026-10-08, still `1.0.0-alpha.0`)

- **Changed**: `Word.recognized` is also set on a word the script wrote (`script: true`), with what the recognizer heard in its place; shape unchanged.

### Frame descriptions (2026-10-08, still `1.0.0-alpha.0`)

- **Changed**: `ServerFrame` `session.loading`, `session.ready`, `transcript.committed`, `transcript.draft` (a full replacement of the live tail, never appended) and `transcript.words` gain descriptions; shapes unchanged.

### Latency to the final line (2026-10-08, still `1.0.0-alpha.0`)

- **Added**: `ServerFrame` `transcript.latency` (`seq`, `latencyS`): a
  delivered segment's latency measured again when the engine's correction
  passes release it — `CommittedSegment.latencyS` plus the hold (a doubted
  word's re-decode, the language model's reading), so it is how far behind
  the speaker the line was final. Replaces the segment's `latencyS`
  (`SegmentView.latencyS`, `Recording.peakLatencyS` follow). Sent only for a
  line a hold was on, on live input (a realtime session, never a file).
### A database that is waking (2026-10-08, still `1.0.0-alpha.0`)

- **Added**: error code `unavailable` (`ErrorCode`, HTTP 503, `retryable:
  true`, with `Retry-After: 2`) on any operation: the service is starting
  up or briefly cannot reach its database (connection lost, still
  starting, schema being applied). These used to answer `500 internal`.
  Send the request again after `Retry-After` seconds.

### Developer access by invitation (2026-10-07, still `1.0.0-alpha.0`)

- **Added**: error code `developer_access_required` (403, not retryable, no
  `upgradeUrl`): where the server admits invited accounts only
  (`DEVELOPER_ACCESS=allowlist`, owner decision A1), an account without
  developer access is refused on creating or rotating API keys, on every
  call made with an API key or a browser token, on `POST /v1/mcp` and on
  the docs page's sign-in. A person's own session is not affected.
- **Added**: `developerAccess` (boolean, always present) in the response of
  `GET /v1/me` (`me.get`): whether the account reaches API keys, MCP and
  the docs sign-in.

### One kind of API key (2026-10-07, still `1.0.0-alpha.0`)

- **Changed**: the document's description (Authentication): an API key is
  `vs_key_…`, the one kind of key. The `vs_live_` / `vs_test_` split and
  test mode are gone (owner decision 2026-10-07): every key is held to the
  tier gate and the quotas; the API's own docs page is refused a key like
  every other page and tries calls with its sign-in's browser token. RTMP
  stream keys (`GET /v1/rtmp`, `streamKey`) start with `vs_rtmp_`.

### Script follow-along from main (2026-10-06, still `1.0.0-alpha.0`)

- **Added**: `CommittedSegment.scriptFrom` (integer, optional) on the
  `transcript.committed` frame and `SegmentView.scriptFrom` in the
  transcript answers: the first script word the segment read, so
  `scriptFrom..scriptPos` is the stretch of script it covers.
- **Added**: `ServerFrame` `transcript.amended` `tail` (`AmendTail`:
  `replaced`, `words`): when the amend rewrote the segment's last words,
  they replace its last `replaced` words; new fix kind `amend:script`.
- **Added**: `Word.script` (boolean, optional): the word was corrected from
  the recording's script.

### Speech only from transcription (2026-10-05, still `1.0.0-alpha.0`)

The owner's rule: VocalStack never speaks text a caller provides
(docs/api-architecture.md, "Speech only from transcription").

- **Added**: `Correction.voiced` (boolean, on a word or line correction that
  stands: that correction's own verdict, decided when it was applied) and
  `Correction.notVoicedReason` (`NotVoicedReason`: `rewrite`), in the answers
  of `POST /v1/recordings/{id}/corrections` (`corrections.apply`),
  `GET /v1/recordings/{id}/corrections` (`corrections.list`) and
  `POST /v1/recordings/{id}/retranscribe` (`corrections.retranscribe`).
- **Added**: `CommittedSegment.recognizedText` (string, optional) on the
  `transcript.committed` frame: when the recording follows a script
  (`StartRecording.scriptText`) and the teleprompter wrote words into the
  segment, what the recognizer heard before it did.
- **Changed**: the voice may only say what was said. A corrected line is
  voiced as corrected only when every word it says is a word of the
  recognizer's text (punctuation, case, Latin/Greek/Cyrillic accents outside
  Vietnamese, format characters and number formatting aside) or of a fresh
  reading of the line's audio, taken automatically when the recognizer's
  text is not enough (a respelling counts only if the fresh reading has it),
  and it drops no negation the audio has. Any other correction is saved and
  shown in reading and export, but `GET /v1/recordings/{id}/voice/{sentence}`
  (`recordings.voiceClip`) and the voice tracks of `POST /v1/recordings/{id}/voice`
  (`recordings.renderVoice`) speak what the recognizer heard, and a translated
  voice its translation. The same holds for a line the teleprompter script
  wrote words into, live voice included. `corrections.apply` says so in its
  description.
- **Changed**: a line spanning several segments, in `corrections.apply`
  (`lines`) and `POST /v1/recordings/{id}/retranscribe`
  (`corrections.retranscribe`, `RetranscribeLine.seqs`), must list
  neighbouring segments (every one from the first to the last); anything
  else is `400 invalid_options`. A re-read gives each segment only the words
  said in its own stretch.

### Public surface review and naming phase 7 (2026-10-05, still `1.0.0-alpha.0`)

docs/public-surface-review.md; docs/naming-audit.md section 8, phase 7.
Pre-launch, so these leave `/v1` rather than being deprecated.

- **Breaking**: the scheduled scripts (design 53) leave the public API; they
  are the web app's planning screen, first-party under `/app/.../scripts`.
  Removed: `GET`/`POST /v1/broadcasts/{id}/plans`
  (`broadcasts.listPlans`, `broadcasts.createPlan`), `GET`/`POST
  /v1/transcriptions/{id}/plans` (`transcriptions.listPlans`,
  `transcriptions.createPlan`), `GET`/`PATCH`/`DELETE /v1/plans/{id}`
  (`plans.get`, `plans.update`, `plans.delete`), the `plans` tag and the
  schemas `Plan`, `CreatePlan`, `UpdatePlan`. A recording is still given
  words to follow with its start (`StartRecording.scriptText`).
- **Breaking**: `StartRecording.planId` -> `scriptId`, `StartRecording.script`
  -> `scriptText`; `Recording.planId` -> `scriptId`, `Recording.script` ->
  `scriptText` (the recording's own copy of the words it follows).
- **Breaking**: the listener pages' and the host's link routes leave the
  public API (first-party, `/app`): `POST /v1/broadcasts/resolve`
  (`broadcasts.resolve`), `GET /v1/broadcasts/code-check`
  (`broadcasts.checkCode`; create and update answer 409 `conflict` for a
  taken link), `GET /v1/shared/{code}` (`shareLinks.open`; a share link's
  code still reads the `/v1` listener routes as `shareCode=`), and the
  schemas `ResolveRequest`, `ResolvedBroadcast`, `CodeCheck`,
  `SharedTranscript`.
- **Changed**: `info.description` says how a listener authenticates without
  naming the first-party resolve.

### Operation titles (2026-10-05, still `1.0.0-alpha.0`)

- **Changed**: operation summaries shortened; details moved to description.
  Every operation's `summary` is now a short title (at most 50 characters,
  sentence case, no markdown: "Start a recording", "List broadcasts"), and
  the text it held is its `description`; no operation, path or schema
  changed.
- **Added**: the document's `tags` list, one per resource tag, each with a
  display name (`x-displayName`: `share-links` is "Share links", `me` is
  "Account") and a one-line `description`.

### Naming phase 6 (2026-10-05, still `1.0.0-alpha.0`)

docs/naming-audit.md section 8, phase 6.

- **Breaking**: `Capabilities.speakerLabels` (a bool) -> `speakerLabelModes`
  (`SpeakerLabels[]`: the speaker-label positions the server offers, empty
  when it offers none), as `latencyModes` lists the latency modes
  (`GET /v1/realtime/capabilities`, `realtime.capabilities`).

### Naming phase 5: one name per concept, the last pairs (2026-10-05, still `1.0.0-alpha.0`)

docs/naming-audit.md section 8, phase 5.  Pre-launch, so renames in place;
the old `/v2` paths keep the old names until their date (`http::legacy`).

- **Breaking**: `SessionOptions.language` -> `spokenLanguage`,
  `SessionOptions.diarization` (`DiarizationMode`: `live|off`) ->
  `speakerLabels` (`SpeakerLabels`: `auto|on|off`, default `off`),
  `SessionOptions.transcriptionMethod` -> `latencyMode` (`LatencyMode`;
  `TranscriptionMethod` is gone), and the same three fields on the
  `session.update` client frame (`POST /v1/realtime/sessions`,
  `WS /v1/realtime/sessions/{token}/socket`).
- **Breaking**: `Capabilities.diarization` -> `speakerLabels`,
  `Capabilities.transcriptionMethods` -> `latencyModes`
  (`GET /v1/realtime/capabilities`).
- **Breaking**: `Settings.speakerLabels` holds the switch (`SpeakerLabels`:
  `auto|on|off`); the bool it was and `Settings.speakerLabelsMode`
  (`SpeakerLabelsMode`) are gone; `Settings.latencyMode` is a `LatencyMode`.
  Same on `SettingsPatch`.
- **Breaking**: the recording in flight is `currentRecording`
  (`CurrentRecording`, with `transcriptionId` on a broadcast's) on
  `Broadcast` (was `onAir`, schema `OnAir` gone), `Transcription` and
  `ResolvedBroadcast` (were `current`).
- **Breaking**: `Broadcast.lastUsedAt` -> `lastRecordedAt`, as on
  `Transcription` and `TranscriptionRef`.
- **Breaking**: the stream URL a realtime session or a publish grant hands
  out is always `/v1/realtime/sessions/{token}/socket`; the old socket path
  `/v1/sessions/{token}/stream` is gone (phase 8b).
- **Breaking**: MCP `transcribe_url` / `transcribe_file` take
  `spokenLanguage` (was `language`), like the settings field.

### Naming phase 2: the public wire, the SDKs and MCP (2026-10-05, still `1.0.0-alpha.0`)

One concept, one name on the wire (docs/naming-audit.md sections 7 and 8,
Q9, Q13, Q20, Q23, Q24).  Pre-launch, so these are renames in place; the
old `/v2` paths keep the old names until their date (`http::legacy`).

- **Breaking**: `x-websocket.containerEvents` is two entries,
  `broadcastEvents` (`WS /v1/broadcasts/{id}/events`) and
  `transcriptionEvents` (`WS /v1/transcriptions/{id}/events`), with the
  same frames.
- **Breaking**: `Transcription.transcription` → `Transcription.job` and
  `SharedTranscript.transcription` → `SharedTranscript.job` (the file or
  link job, a `TranscriptionJob`).
- **Breaking**: frame `transcription.progress` → `job.progress` (the
  broadcast and transcription events sockets, the subscribe socket).
- **Breaking**: schemas `StartTranscription` → `StartJob` (body of
  `POST /v1/recordings/{id}/job/start`, `jobs.start`) and
  `TranscriptionProgress` → `JobProgress` (`TranscriptionJob.progress`).
- **Breaking**: `Broadcast.state` and `Transcription.state` →
  `lifecycle`; `Recording.archived` (bool) → `Recording.lifecycle`
  (`Lifecycle`: `active`, `archived`).  The list filter `?state=` →
  `?lifecycle=` on `GET /v1/broadcasts` (`broadcasts.list`),
  `GET /v1/transcriptions` (`transcriptions.list`) and both
  `GET /v1/{broadcasts,transcriptions}/{id}/recordings`
  (`*.listRecordings`).  `state` is now always a state machine.
- **Breaking**: query parameters `token` → `listenerToken`, `share` →
  `shareCode` (every listener-side read: `recordings.get`,
  `recordings.transcript`, `recordings.translation`, `recordings.summary`,
  `recordings.export`, `recordings.audio`, `recordings.clip`,
  `recordings.voice`, `recordings.voiceClip`, the subscribe and events
  sockets, `voices.available`, `voices.clonePreview`), and `tokens` →
  `listenerTokens` on `GET /v1/search` (`search.query`).  The header
  `x-listener-token` and the body field `listenerToken` are unchanged.
- **Breaking**: `GET /v1/recordings/{id}/audio/clip` (`recordings.clip`)
  takes `startS` and `endS` (were `from` and `to`), as the job window does.
- **Changed**: the descriptions say tier for billing (`me.usage`,
  `TranscriptionJob.errorCode`, the overview), never plan; a plan is only a
  planned recording.
- **Changed**: guardrail test: no `container`, billing `plan`, `streamId`
  or retired name on the wire, and the old query spellings never return.

### Naming phase 1: database and Rust (2026-10-05, still `1.0.0-alpha.0`)

The database and the Rust code now say broadcast and transcription (two
tables, two types) instead of one "session" row with a kind
(docs/naming-audit.md, section 8).  Where the wire carried a name only
because of the old shape, it changed with it; the rest of the wire renames
are the next phase's.

- **Breaking**: `Broadcast` and `Transcription` are two schemas of their
  own fields, no longer one shape emitted twice: `Broadcast` drops `live`,
  `broadcasts`, `transcription`, `current` and `lastRecordedAt` (never
  present on a broadcast); `Transcription` drops `sources`,
  `audioSources`, `onAir`, `listenersNow`, `lastUsedAt` (never present on a
  transcription) and `access` (always `private`: a transcription is shared
  through its share links).
- **Breaking**: `Broadcast.sources` → `Broadcast.transcriptions`, schema
  `SourceRef` → `TranscriptionRef` (the live transcriptions attached to a
  broadcast; `Transcription.broadcasts` is the other side).
- **Breaking**: `PublishGrant.streamId` → `PublishGrant.sessionId` (it is
  the realtime session `streamUrl` opens, as `CreateSessionResponse.sessionId`).
- **Breaking**: `StreamIngest.broadcastStartedAt` → `streamStartedAt` (the
  start of the stream a YouTube link plays, not a broadcast of ours).
- **Breaking**: the billing tier: `UsageSummary.plan` → `UsageSummary.tier`,
  schema `PlanRef` → `TierRef`, error code `plan_required` →
  `tier_required` (its details `plan`/`currentPlan` → `tier`/`currentTier`;
  `quota_exceeded` details `plan` → `tier`).  "Plan" is a planned
  recording (`/v1/plans`) only.
- **Breaking**: quota metrics are named as their limit keys in both places
  of `GET /v1/me/usage` (and in `quota_exceeded` details):
  `Quota.metric` `monthlyAudioMinutes` → `monthly_audio_minutes`,
  `dailyAudioMinutes` → `daily_audio_minutes`, `concurrentTranscriptions` →
  `concurrent_engines` (limit key `concurrent_transcriptions` →
  `concurrent_engines`: it counts realtime sessions, live recordings and
  running jobs, each holding an engine).
- **Changed**: `broadcasts.startRecording` / `transcriptions.startRecording`
  describe the grant as a realtime session (`streamUrl`, `sessionId`).

### Pre-launch wire rename (2026-10-04, still `1.0.0-alpha.0`)

`/v1` is not launched, so this one rename is breaking inside `/v1`, once,
before anyone depends on it (docs/api-surface-proposal.md deviations
70 to 74). "Session" on the wire now means a realtime session and nothing
else. The old paths (`http::legacy`, until 2026-11-02) keep the old names
for the web builds made before.

- **Breaking**: schemas `Session` → `Broadcast` and `Transcription` (two
  schemas, each with `kind` fixed: `"broadcast"` / `"transcription"`; a
  broadcast's `kind` was `"live"`); `UpdateSession` → `UpdateBroadcast`
  and `UpdateTranscription` (without `code`, `access`, `password`, which a
  transcription never took); `CreateSession` → `CreateBroadcast` (without
  `kind`); `ResolvedSession` → `ResolvedBroadcast`; `SessionSettings` →
  `Settings`; `SessionSource` → `CaptureSource`; `SessionLifecycle` →
  `Lifecycle`; `SessionKind` removed.
- **Breaking**: parent ids: `Recording.sessionId`,
  `TranscriptionJob.sessionId`, `OnAir.sessionId`,
  `LastRecording.sessionId` → `transcriptionId`;
  `ResolvedBroadcast.sessionId` → `broadcastId`; `Plan.sessionId`,
  `ShareLink.sessionId`, `SharedTranscript.sessionId` → `broadcastId` or
  `transcriptionId` (exactly one set); `SearchHit.sessionId`,
  `sessionCode`, `sessionName` → `transcriptionId`, `linkCode`, `linkName`.
- **Breaking**: list keys: `GET /v1/broadcasts` (`broadcasts.list`)
  answers `{ broadcasts }`, `GET /v1/transcriptions`
  (`transcriptions.list`) `{ transcriptions }` (both were `sessions`).
- **Breaking**: query parameters: `GET /v1/broadcasts/code-check`
  (`broadcasts.checkCode`) takes `broadcast` (was `session`);
  `GET /v1/search` (`search.query`) takes `broadcasts` (was `sessions`),
  and documents `tokens`.
- **Breaking**: error code `session_archived` → `broadcast_archived`
  (`POST /v1/broadcasts/resolve`).
- **Breaking**: sockets: `x-websocket.containerEvents` frames
  `session.went_live` → `recording.started`, `session.recording_ended` →
  `recording.ended`; their `sessionId`, and that of `transcription.progress`
  and `stream.ingest`, → `transcriptionId` (on a broadcast's socket: the
  live transcription the recording is made in, no longer the broadcast's
  own id); `x-websocket.accountEvents` `sessions.changed` → `lists.changed`.
- **Removed**: `POST /v1/broadcasts/{id}/recordings/upload`
  (`broadcasts.uploadRecording`): every recording is made in a
  transcription; use `POST /v1/transcriptions` or
  `transcriptions.uploadRecording`.
- **Added**: `GET /v1/voices/available` (`voices.available`) documents
  `recording`, `token`, `share` and `access_token`;
  `GET /v1/voices/{id}/preview` (`voices.clonePreview`) documents
  `recording`, `token` and `share`.
- **Added**: summaries for `GET /v1/broadcasts/{id}` (`broadcasts.get`),
  `GET /v1/transcriptions/{id}` (`transcriptions.get`) and
  `GET /v1/plans/{id}` (`plans.get`).
- **Changed**: descriptions no longer send an integrator to first-party
  routes (`ErrorCode` `key_from_browser`, `RtmpStatus.streamKey`), and use
  "session" only for a realtime session.
- **Removed**: the generated oRPC contract (`src/contract.ts`, the
  `contract` export and the `@orpc/contract` dependency): nothing used it
  and it was incomplete; `@vocalstack/js-sdk` is the client.

## [1.0.0-alpha.0] - 2026-10-03: first public surface

The contract starts over at one public version. Before launch the server
had two documents, a realtime one (`contract.json`) and a resource one
under another version prefix; they are now one document, `contract.json`,
served at `GET /v1/openapi.json`. No external client existed. The entries
before this one are in git history. The mapping from every old path to its
new one is docs/api-surface-proposal.md section 1.3, and the server
rewrites the old paths until 2026-11-02 (`http::legacy`).

- **Changed**: one document, `contractVersion` `"1"`, `info.version`
  `1.0.0-alpha.0`; the package is `@vocalstack/contract` `1.0.0-alpha.0`
  with a single export (`.`).
- **Changed**: one resource per `operationId` namespace and tag:
  `meta`, `realtime`, `me`, `languages`, `voices`, `broadcasts`,
  `transcriptions`, `recordings`, `jobs`, `plans`, `shareLinks`,
  `corrections`, `rtmp`, `search`.
- **Changed**: realtime: `POST /v1/realtime/sessions` is
  `realtime.createSession` (was `sessions.create`), `GET
  /v1/realtime/capabilities` is `realtime.capabilities`; `GET /v1/health`
  and `GET /v1/openapi.json` are `meta.health`, `meta.openapi`. A realtime
  session is the only thing the document calls a session.
- **Changed**: broadcasts: `/v1/broadcasts/**` operations are
  `broadcasts.*` (`list`, `create`, `resolve`, `checkCode`, `get`,
  `update`, `archive`, `restore`, `purge`, `listRecordings`,
  `startRecording`, `uploadRecording`, `listPlans`, `createPlan`,
  `listShareLinks`, `createShareLink`, `addAudioSource`,
  `removeAudioSource`, `checkAudioSource`); they answer with the
  `Broadcast` schema. `GET /v1/broadcasts` lists broadcasts only (no
  `kind` parameter).
- **Changed**: transcriptions: `/v1/transcriptions/**` operations are
  `transcriptions.*` (the same container operations, plus `create`,
  `createLive`, `probe`, `attachBroadcast`, `detachBroadcast`); they
  answer with the `Transcription` schema.
- **Added**: schemas `Broadcast` and `Transcription`, each the `Session`
  shape for now (docs/api-surface-proposal.md section 2.6).
- **Changed**: `GET /v1/me` and `GET /v1/me/usage` are `me.get`,
  `me.usage`; `GET /v1/languages` is `languages.list`; `GET
  /v1/shared/{code}` is `shareLinks.open`; `PUT
  /v1/recordings/{id}/speakers/{idx}` is `recordings.nameSpeaker`.
- **Changed**: `x-websocket` has one entry per socket: `realtimeSession`,
  `subscribe`, `containerEvents` (the broadcast and transcription event
  socket) and `accountEvents`.
- **Changed**: every operation carries `security` where it takes a bearer
  token, including `POST /v1/realtime/sessions`; `bearerAuth` is the one
  security scheme.
