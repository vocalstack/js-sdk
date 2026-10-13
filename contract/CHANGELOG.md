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

### AI-assisted auto-fix (2026-10-07, still `1.0.0-alpha.0`)

- **Added**: `Word.llm` and `Word.recognized` (optional) on every word
  list (frames and transcript answers): the word was written by the AI
  auto-fix (`amend:llm`), and what the recognizer heard there.
- **Added**: `Settings.llmFix` / `SettingsPatch.llmFix` (boolean, default
  `true`; `PATCH /v1/recordings/{id}/settings` and the broadcast /
  transcription settings), `SessionOptions.llmFix` and `session.update`
  `llmFix`: AI-assisted auto-fix on or off; switched off mid-recording it
  stops new fixes from the next line on, fixes already made stay.

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
  and it was incomplete; `@vocalstack/sdk` is the client.

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
