[![](/logo.svg 'VocalStack')](https://vocalstack.com)

[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://vocalstack.com/documentation/transcribe-audio-from-url-to-text)

# Transcribe Audio from URL

> Transcribe speech from pre-recorded audio in a URL to plain text. Major file formats are supported, including MP3, WAV, FLAC, and OGG.

## Table of Contents
  - [Quick Start](#quick-start)
  - [Request Options and Response Data](#request-options-and-response-data)
  - [Next Steps](#next-steps)

## Quick Start

Transcribe an audio file in a URL (such as an mp3) to text with just a few lines of code:

```js
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



## Request Options and Response Data

There are several request options available to customize transcription settings. Additionally, the response object provides different data at various stages of the transcription process.

[Transcription Request and Response](transcription-request-and-response.md) - Common request options and responses for all transcription operations. Use options to configure the transcription settings.


Now lets look at how we can use custom options to configure our transcription process:

```javascript
// Run "npm install @voca l-stack/js-sdk" to install the package
import { UrlTranscription } from '@vocalstack/js-sdk';

// Get your key here ⇢ https://www.vocalstack.com/dashboard/api-keys
const sdk = new UrlTranscription({ apiKey: 'YOUR-API-KEY' });

const transcription = await sdk.connect({
  // URL to the audio file
  url: 'http://example.com/files/audio.mp3',
  // Optional: language of the speech spoken
  // (this can be used to improve the transcription accuracy)
  language: 'en',
  // Optional: the maximum duration to transcribe, in seconds
  // (if not provided, the entire audio file will be transcribed)
  max_duration_s: 1800,
  // Optional: the actual duration of the audio file, in seconds
  // (the transcription starts only if the audio file matches this duration)
  duration_s: 3600,
});

// Start the transcription
transcription.start();

// Listen for transcription data
transcription.onData((response) => {
  const { status, data } = response;
  console.log(status); // 'waiting', 'processing', 'done', or 'error'
  if (data) {
    console.log(data.progress); // a value between 0 and 1
    console.log(data.timeline); // an object with the transcription timeline
  }
  if (status === 'done') {
    console.log(data.summary); // a summary of the transcription
    console.log(data.keywords); // an array of keywords
    console.log(data.paragraphs); // the entire transcription in paragraph form
  }
});

```



## Next Steps

Once you have transcribed the speech in your audio file, you may want to move on to one of the following:

[Get Transcription Data](get-transcription-data.md) - Get data from pending or completed transcriptions. This includes the transcription timeline, key words, summary, and paragraph segments.


[Translate a Transcription](translate-transcription-to-another-language.md) - Translate transcribed text to another language. This can be done for any transcription, including prerecorded transcriptions, live transcriptions or Polyglot session transcriptions.


[Transcription Sessions](transcription-sessions.md) - Monitor and manage transcription state with sessions. Using sessions you can reconnect to a previously created asynchronous connection.



[Back to Documentation Index](/README.md#documentation-index) | [Read on vocalstack.com](https://vocalstack.com/documentation/transcribe-audio-from-url-to-text)

