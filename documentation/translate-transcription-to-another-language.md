[![](/logo.svg 'VocalStack')](https://www.vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/translate-transcription-to-another-language)

# Translate a Transcription

> Translate transcribed text to another language. This can be done for any transcription, including prerecorded transcriptions, live transcriptions or Polyglot session transcriptions.

## Table of Contents
  - [Async Method](#async-method)
  - [Fire and Forget Method](#fire-and-forget-method)
  - [Performance Caching](#performance-caching)

You can use the VocalStack API to translate any transcription, whether it is finished or still processing. If you have not yet started transcribing audio, you can do so with any of the following methods:

[Transcribe Audio from URL](transcribe-audio-from-url-to-text.md) - Transcribe speech from pre-recorded audio in a URL to plain text. Major file formats are supported, including MP3, WAV, FLAC, and OGG.


[Transcribe from a Microphone or LiveStream](transcribe-from-a-microphone-or-live-stream.md) - Transcribe live speech from a microphone or live stream. Integrate with Polyglot to create a public shareable link for the transcription which users can read in any language. 


[Transcribe and Present a Polyglot Session](transcribe-and-present-a-polyglot-session.md) - Create a session that can be used to broadcast a live transcription via a public shareable link. Users can read live transcriptions in their preferred language, and even past transcriptions when your session is inactive.




## Async Method

If you need to load your translations as soon as they become available then you will want to listen to the translation request asynchronously:

```js
import { Transcriptions } from '@vocalstack/js-sdk';

const sdk = new Transcriptions({ apiKey: 'YOUR-API-KEY' });

const translation = await sdk.addTranslationAsync({
  id: 'TRANSCRIPTION-ID',
  languages: ['de'],
});

translation.onData((response) => {
  // the translated timeline
  console.log(response.data?.timeline);
});

```



## Fire and Forget Method

This method for translating simply sends the translation request, but does not wait for a response. This method can be useful if:

  - You don't need the translation right now, but you want to cache it for quick access in the future. (see Performance Caching)

  - There is a transcription in a live Polyglot session that you're already monitoring in another process, and you simply want to add a new translation to this transcription.

```js
import { Transcriptions } from '@vocalstack/js-sdk';

const sdk = new Transcriptions({ apiKey: 'YOUR-API-KEY' });

// This is a synchronous request, so we cannot listen for the response
sdk.addTranslations({ id: 'TRANSCRIPTION-ID', languages: ['de', 'fr'] });

```



## Performance Caching

As translations execute on the backend, the persisted transcription data is updated to include the new translations. The persisted transcriptions get updated with each timeline segment translated, so API calls requesting transcription data will always return `timeline` objects with the most recent translations available.

This also means that you will only need to issue one translation request per language. (Additional requests will have no effect as the translations are already persisted.)




[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://www.vocalstack.com/documentation/translate-transcription-to-another-language)

