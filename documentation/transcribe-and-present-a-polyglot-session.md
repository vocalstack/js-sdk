[![](/logo.svg 'VocalStack')](https://www.vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcribe-and-present-a-polyglot-session)

# Transcribe and Present a Polyglot Session

> Create a session that can be used to broadcast a live transcription via a public shareable link. Users can read live transcriptions in their preferred language, and even past transcriptions when your session is inactive.

## Table of Contents
  - [Manage Sessions (CRUD)](#manage-sessions-crud)
  - [Listening to a Polyglot Session ](#listening-to-a-polyglot-session)
  - [Adding a Translation](#adding-a-translation)

A Polyglot session has a unique `polyglot_id`, which when provided to live transcription API requests gives the following benefits:

  - Users can read your transcription in real time using a public shareable link.

  - Users can choose the language in which to read the transcription in real time.

  - Users can read your transcription at a later time, and all other transcriptions integrated with your particular Polyglot session.

[Transcribe from a Microphone or LiveStream](transcribe-from-a-microphone-or-live-stream.md) - Transcribe live speech from a microphone or live stream. Integrate with Polyglot to create a public shareable link for the transcription which users can read in any language. 




You are welcome to use the VocalStack API and implement your own white labelled UI instead of using the one provided by VocalStack. We would love to hear about it if you do, so we can learn about how to make our product better! 

Learn more about how Polyglot works at vocalstack.com/polyglot.



## Manage Sessions (CRUD)

Polyglot sessions are most easily created and managed using the Dashboard. However they can also be managed programatically: 

```js
import { Polyglot } from '@vocalstack/js-sdk';

const polyglot = new Polyglot({ apiKey: 'YOUR-API-KEY' });

const session = {
  // the name of the session
  name: 'My Presentation',
  // specifies the custom link for the session: https://polyglot.vocalstack.com/a-custom-url
  link: 'a-custom-url',
  // Optional: language of the speech spoken
  // (this can be used to improve the transcription accuracy)
  language: 'en',
  // Optional: must be a valid HLS streaming protocol
  livestream_url: 'https://.../stream.m3u8',
  // Optional: Stop the stream after this many seconds of inactivity
  timeout_period_s: 60,
  // Optional: Hard stop the stream after this many seconds
  max_duration_s: 300,
  // Optional: a custom password for the session if you want to restrict access to the public shareable link
  password: 'password',
};

// CREATE
const response = await polyglot.createSession(session);
const polyglot_id = response.data?.id;

// READ
await polyglot.getSession({ id: polyglot_id });

// UPDATE
await polyglot.updateSession({ id: polyglot_id, ...session });

// DELETE
await polyglot.deleteSession({ id: polyglot_id });

// LIST ALL SESSIONS
await polyglot.getAllSessions();

```



## Listening to a Polyglot Session 

If a Polyglot session with the link "my-url" has been created then this would be available publicly at https://polyglot.vocalstack.com/my-url. 

However, we can also listen to to the transcription progress programatically: 

```js
import { Polyglot } from '@vocalstack/js-sdk';

const polyglot = new Polyglot({ apiKey: 'YOUR-API-KEY' });

const stream = await polyglot.getLiveSessionStream({
  link: 'a-custom-url',
  password: 'password', // include only if the session has a password
});

// Listen to any live transcriptions that are associated
// with the polyglot session.
stream.onData((response) => {
  const { data } = response;

  // The entire transcription object of the current transcription
  const transcription = data.activeTranscription;

  // An object with the transcription timeline
  console.log(transcription.timeline);
});

```



## Adding a Translation

Translations to Polyglot transcriptions can be added by anyone with access to the public session url. However, these can also be added programatically:

[Translate a Transcription](translate-transcription-to-another-language.md) - Translate transcribed text to another language. This can be done for any transcription, including prerecorded transcriptions, live transcriptions or Polyglot session transcriptions.



[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/transcribe-and-present-a-polyglot-session)

