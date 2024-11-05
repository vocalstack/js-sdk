[![](/logo.svg 'VocalStack')](https://vocalstack.com)

> VocalStack is a platform that can be used for building voice applications. See more at [https://vocalstack.com](vocalstack.com).

This repository contains the official VocalStack SDK for JavaScript. It provides a simple way
to interact with the [VocalStack API](https://vocalstack.com/api).
Most notably, it helps implement asynchronous bidirectional communication
such as live stream transcriptions in just a few lines of code.
This SDK will work in both Node.js and the browser.


# Installation

Before you start, install the VocalStack JavaScript SDK using your preferred Node package manager, such as npm:

```bash
npm install @vocalstack/js-sdk
```

Also make sure to have a [VocalStack account](https://vocalstack.com) and an API key, which you can generate
at https://vocalstack.com/dashboard/api-keys.
There is a free tier available, so you can start experimenting right away.


# Quick Example

Here is a quick example of how to use the SDK to transcribe a file from a URL:
```javascript
import { UrlTranscription } from '@vocalstack/js-sdk';

const sdk = new UrlTranscription({ apiKey: 'YOUR-API-KEY' });
const transcription = await sdk.connect({
  url: 'http://example.com/files/meaningless.mp3',
});

transcription.start();

// This will print the transcription data as it comes in
transcription.onData(console.log);

/*
{
  status: 'processing',
  data: {
    id: 'd1e7b3b0-7b3b-4b3b-8b3b-0b3b7b3b3b3b',
    operation: 'transcription-prerecorded',
    progress: 0.1,
    timeline: [
      {
        start: 0,
        end: 7.52,
        text: 'Meaningless, meaningless, says the teacher, utterly meaningless, everything is meaningless.',
        language: 'en',
        translations: { ... },
      },
      ...
    ]
  }
}
*/
```


# Documentation Index

- [Transcribe Audio from URL](https://github.com/vocalstack/js-sdk/blob/main/documentation/transcribe-audio-from-url-to-text.md): 
Transcribe speech from pre-recorded audio in a URL to plain text. Major file formats are supported, including MP3, WAV, FLAC, and OGG.

- [Transcribe from a Microphone or LiveStream](https://github.com/vocalstack/js-sdk/blob/main/documentation/transcribe-from-a-microphone-or-live-stream.md): 
Transcribe live speech from a microphone or live stream. Integrate with Polyglot to create a public shareable link for the transcription which users can read in any language. 

- [Transcribe and Present a Polyglot Session](https://github.com/vocalstack/js-sdk/blob/main/documentation/transcribe-and-present-a-polyglot-session.md): 
Create a session that can be used to broadcast a live transcription via a public shareable link. Users can read live transcriptions in their preferred language, and even past transcriptions when your session is inactive.

- [Translate a Transcription](https://github.com/vocalstack/js-sdk/blob/main/documentation/translate-transcription-to-another-language.md): 
Translate transcribed text to another language. This can be done for any transcription, including prerecorded transcriptions, live transcriptions or Polyglot session transcriptions.

- [Get Transcription Data](https://github.com/vocalstack/js-sdk/blob/main/documentation/get-transcription-data.md): 
Get data from pending or completed transcriptions. This includes the transcription timeline, key words, summary, and paragraph segments.

- [Client Side Authentication Tokens](https://github.com/vocalstack/js-sdk/blob/main/documentation/transcribe-on-the-front-end-with-auth-tokens.md): 
Create a temporary authentication token for client side requests. Safely implement API requests in web browsers without exposing your API keys.

- [Transcription Sessions](https://github.com/vocalstack/js-sdk/blob/main/documentation/transcription-sessions.md): 
Monitor and manage transcription state with sessions. Using sessions you can reconnect to a previously created asynchronous connection.

- [Transcription Request and Response](https://github.com/vocalstack/js-sdk/blob/main/documentation/transcription-request-and-response.md): 
Common request options and responses for all transcription operations. Use options to configure the transcription settings.

